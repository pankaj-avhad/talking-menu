// What the /calls dashboard shows: every saved call, who made it, what was
// said and what the host kept (cart, address, suggestions, order, hand-off).
// Read-only; the relay writes these records through lib/store.ts.

import type { CallEndReason } from "@/lib/call-protocol"
import { cartTotals, type CartLine } from "@/lib/cart"
import { menu } from "@/lib/menu"
import { formatUsd } from "@/lib/money"
import {
  getCall,
  getCustomer,
  getOrder,
  listCalls,
  listCustomers,
  type CallRecord,
  type Customer,
  type Order,
  type Speaker,
} from "@/lib/store"

const timeZone = menu.restaurant.timezone ?? "America/Los_Angeles"

const STALE_AFTER_MS = 20 * 60_000

export type CallStatus = "live" | "ordered" | "transferred" | "abandoned"

export type CallSummary = {
  callSid: string
  channel: CallRecord["channel"]
  caller: string
  initials: string
  customerId: string | null
  /** The caller had called before this call. */
  returning: boolean
  startedAt: string
  started: string
  /** "2:41"; null while the call is live. */
  duration: string | null
  status: CallStatus
  order: { id: string; number: number; total: string; paid: boolean } | null
  /**
   * A one-line preview: the hand-off summary, else what's in the cart, else
   * the caller's first words beyond their name. `quote` marks the caller's words.
   */
  snippet: { text: string; quote: boolean } | null
}

export type CallerSummary = {
  id: string
  name: string
  initials: string
  phone: string | null
  calls: number
  orders: number
  lastCall: string | null
  lastAddress: string | null
}

const END_REASON: Record<CallEndReason, string> = {
  agent_hangup: "The host said goodbye and hung up",
  caller_hangup: "The caller hung up",
  transferred: "Handed to staff",
  idle: "The line went quiet",
  max_duration: "Reached the time limit",
  error: "The connection failed",
}

const TRANSFER_REASON: Record<string, string> = {
  cannot_understand: "Couldn't understand the caller",
  off_menu_request: "Asked for something off the menu",
  catering_or_large_order: "Catering or a large order",
  allergy_question: "Allergy question",
  complaint_or_refund: "Complaint or refund",
  change_existing_order: "Change to an existing order",
  asked_for_person: "Asked for a person",
  other: "Other",
}

const SPEAKER: Record<Speaker, string> = {
  customer: "Caller",
  agent: "Host",
  staff: "Staff",
}

// ---------------------------------------------------------------- list

export async function getCallsDashboard(callerId?: string) {
  const [calls, customers] = await Promise.all([listCalls(), listCustomers()])
  const orders = await loadOrders(calls)
  const now = new Date()

  // Oldest first, so "returning" means an earlier call from the same caller.
  const seen = new Set<string>()
  const returning = new Set<string>()
  for (const call of [...calls].reverse()) {
    if (!call.customerId) continue
    if (seen.has(call.customerId)) returning.add(call.callSid)
    seen.add(call.customerId)
  }

  const summaries = calls.map((call) =>
    toSummary(call, orders, returning.has(call.callSid), now)
  )
  const placed = summaries.filter((c) => c.order)
  const orderCents = calls.reduce(
    (sum, c) =>
      sum + (c.orderId ? (orders.get(c.orderId)?.totalCents ?? 0) : 0),
    0
  )

  const callers: CallerSummary[] = customers.map((customer) => {
    const theirs = calls.filter((c) => c.customerId === customer.id)
    return {
      id: customer.id,
      name: customer.name,
      initials: initials(customer.name),
      phone: customer.phone,
      calls: theirs.length,
      orders: theirs.filter((c) => c.orderId).length,
      lastCall: theirs[0] ? formatWhen(theirs[0].startedAt, now) : null,
      lastAddress: customer.lastAddress,
    }
  })

  const selected = callerId
    ? (callers.find((c) => c.id === callerId) ?? null)
    : null

  return {
    stats: {
      calls: calls.length,
      orders: placed.length,
      orderValue: formatUsd(orderCents),
      transferred: summaries.filter((c) => c.status === "transferred").length,
    },
    callers,
    selected,
    calls: selected
      ? summaries.filter((c) => c.customerId === selected.id)
      : summaries,
    hasLive: summaries.some((c) => c.status === "live"),
  }
}

// ---------------------------------------------------------------- one call

export async function getCallDetail(callSid: string) {
  const call = await getCall(callSid)
  if (!call) return null
  const now = new Date()

  const [customer, order, allCalls] = await Promise.all([
    call.customerId ? getCustomer(call.customerId) : null,
    call.orderId ? getOrder(call.orderId) : null,
    listCalls(),
  ])
  const theirCalls = call.customerId
    ? allCalls.filter((c) => c.customerId === call.customerId)
    : []
  const earlier = theirCalls.filter((c) => c.startedAt < call.startedAt)
  const orders = await loadOrders(theirCalls.length ? theirCalls : [call])
  const cart = cartView(call.cart)

  return {
    summary: toSummary(call, orders, earlier.length > 0, now),
    transcript: call.transcript.map((line) => ({
      id: line.id,
      time: clock(line.t),
      speaker: line.speaker,
      speakerLabel: SPEAKER[line.speaker],
      text: line.text,
      interrupted: line.interrupted ?? false,
      viaPhone: line.source === "twilio",
    })),
    context: {
      channel: call.channel === "phone" ? "Phone" : "Browser",
      callerPhone: call.callerPhone,
      endReason: call.endReason
        ? (END_REASON[call.endReason as CallEndReason] ?? call.endReason)
        : null,
      transfer: call.transferReason
        ? {
            reason: TRANSFER_REASON[call.transferReason] ?? call.transferReason,
            summary: call.transferSummary,
          }
        : null,
      address: call.address,
      offered: call.offeredItemIds.map(
        (id) => menu.items[id]?.name ?? `Item ${id}`
      ),
      cart,
      order: order && {
        id: order.id,
        number: order.number,
        status: order.status === "paid" ? "Paid" : "Awaiting payment",
        paid: order.status === "paid",
        total: formatUsd(order.totalCents),
        placed: formatWhen(order.createdAt, now),
      },
    },
    customer: customer && customerView(customer, theirCalls, orders, now),
    otherCalls: theirCalls
      .filter((c) => c.callSid !== call.callSid)
      .map((c) =>
        toSummary(
          c,
          orders,
          theirCalls.some((o) => o.startedAt < c.startedAt),
          now
        )
      ),
    raw: JSON.stringify(call, null, 2),
  }
}

export type CallDetail = NonNullable<Awaited<ReturnType<typeof getCallDetail>>>

// ---------------------------------------------------------------- helpers

async function loadOrders(calls: CallRecord[]) {
  const ids = [
    ...new Set(calls.map((c) => c.orderId).filter((id) => id !== null)),
  ]
  const found = await Promise.all(ids.map((id) => getOrder(id)))
  return new Map(
    found.filter((o): o is Order => o !== null).map((o) => [o.id, o])
  )
}

function toSummary(
  call: CallRecord,
  orders: Map<string, Order>,
  returning: boolean,
  now: Date
): CallSummary {
  const order = call.orderId ? orders.get(call.orderId) : undefined
  // The relay ends calls after MAX_CALL_MINUTES (15 by default). One still
  // open long after that lost its relay, so it isn't shown as live.
  const live =
    !call.endedAt && now.getTime() - Date.parse(call.startedAt) < STALE_AFTER_MS
  const status: CallStatus = live
    ? "live"
    : (call.outcome ?? (order ? "ordered" : "abandoned"))
  const caller = call.customerName ?? call.callerPhone ?? "No name given"
  const said = call.transcript.filter((l) => l.speaker === "customer")
  // The first line is usually just a name ("Kim."), so prefer a longer one.
  const firstWords =
    said.find((l) => l.text.split(/\s+/).length > 3)?.text ?? said[0]?.text
  return {
    callSid: call.callSid,
    channel: call.channel,
    caller,
    initials: call.customerName ? initials(call.customerName) : "?",
    customerId: call.customerId,
    returning,
    startedAt: call.startedAt,
    started: formatWhen(call.startedAt, now),
    duration: call.endedAt
      ? clock(Date.parse(call.endedAt) - Date.parse(call.startedAt))
      : null,
    status,
    order: order
      ? {
          id: order.id,
          number: order.number,
          total: formatUsd(order.totalCents),
          paid: order.status === "paid",
        }
      : null,
    snippet: call.transferSummary
      ? { text: call.transferSummary, quote: false }
      : call.cart.length > 0
        ? { text: cartSummary(call.cart), quote: false }
        : firstWords
          ? { text: firstWords, quote: true }
          : null,
  }
}

function customerView(
  customer: Customer,
  calls: CallRecord[],
  orders: Map<string, Order>,
  now: Date
) {
  const lastOrder = customer.lastOrderId
    ? orders.get(customer.lastOrderId)
    : undefined
  return {
    id: customer.id,
    name: customer.name,
    nameKey: customer.nameKey,
    phone: customer.phone,
    firstSeen: formatWhen(customer.createdAt, now),
    lastAddress: customer.lastAddress,
    calls: calls.length,
    lastOrder: lastOrder
      ? `#${lastOrder.number}, ${formatUsd(lastOrder.totalCents)}`
      : null,
  }
}

function cartView(lines: CartLine[]) {
  const totals = cartTotals(lines, 0)
  return {
    lines: lines.map((line) => ({
      id: line.lineId,
      quantity: line.quantity,
      name: line.name,
      // Calls saved before add-ons existed have none.
      addOns: (line.addOns ?? []).map((a) => a.name.replace(/^Add\s+/i, "")),
      note: line.note,
      total: formatUsd(line.lineTotalCents),
    })),
    itemCount: totals.itemCount,
    subtotal: formatUsd(totals.subtotalCents),
  }
}

/** "2× Hue Rolls, 1× 5-Spice Chicken Banh Mi and 1 more" */
function cartSummary(lines: CartLine[]) {
  const named = lines.slice(0, 2).map((l) => `${l.quantity}× ${l.name}`)
  const more = lines.length - named.length
  return more > 0 ? `${named.join(", ")} and ${more} more` : named.join(", ")
}

/** 161000 -> "2:41" */
function clock(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone })
const time = new Intl.DateTimeFormat("en-US", { timeZone, timeStyle: "short" })
const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/** "Today, 12:31 PM", "Yesterday, 11:12 AM" or "Sep 16, 11:12 AM", in the restaurant's time zone. */
function formatWhen(iso: string, now: Date) {
  const date = new Date(iso)
  const day = dayKey.format(date)
  if (day === dayKey.format(now)) return `Today, ${time.format(date)}`
  if (day === dayKey.format(new Date(now.getTime() - 86_400_000))) {
    return `Yesterday, ${time.format(date)}`
  }
  return dateTime.format(date)
}
