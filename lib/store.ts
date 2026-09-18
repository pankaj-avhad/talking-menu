// Customers, calls and orders. For now each record is a JSON file under
// .data/ (gitignored), written atomically, so the relay and the Next.js dev
// server can share them on one machine. Vercel's file system is read-only,
// so a deployed site needs a database behind these same functions (the PRD
// picks Upstash Redis or Neon from the Vercel Marketplace).
//
// No Next.js-only imports, so the relay can use it.

import { randomBytes } from "node:crypto"
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import type { CartLine } from "@/lib/cart"

export type Customer = {
  id: string
  name: string
  /** Lower case, no accents: what name lookups compare. */
  nameKey: string
  /** Caller ID from the phone line, kept for reference only. */
  phone: string | null
  lastAddress: string | null
  lastOrderId: string | null
  createdAt: string
  updatedAt: string
}

export type Speaker = "customer" | "agent" | "staff"

export type TranscriptLine = {
  id: string
  /** Milliseconds from the start of the call. */
  t: number
  speaker: Speaker
  text: string
  source: "boson" | "twilio"
  /** The caller talked over the agent; `text` is the part that was heard. */
  interrupted?: boolean
}

export type CallOutcome = "ordered" | "transferred" | "abandoned"

export type CallRecord = {
  /** Twilio's CallSid, or "web_…" for calls from the browser. */
  callSid: string
  channel: "browser" | "phone"
  callerPhone: string | null
  customerId: string | null
  customerName: string | null
  startedAt: string
  endedAt: string | null
  outcome: CallOutcome | null
  /** How the line closed, e.g. "agent_hangup", "caller_hangup", "idle". */
  endReason: string | null
  transferReason: string | null
  transferSummary: string | null
  orderId: string | null
  cart: CartLine[]
  address: string | null
  /** Items the agent suggested, so a declined one is never offered again. */
  offeredItemIds: string[]
  transcript: TranscriptLine[]
}

export type OrderStatus = "awaiting_payment" | "paid"

export type Order = {
  id: string
  /** Short number read out to the caller, e.g. 1004. */
  number: number
  callSid: string
  customerId: string
  customerName: string
  lines: CartLine[]
  subtotalCents: number
  deliveryFeeCents: number
  totalCents: number
  address: string
  status: OrderStatus
  createdAt: string
  updatedAt: string
  paidAt: string | null
}

type Kind = "customers" | "calls" | "orders"

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data")

// Ids reach this module from URLs, so anything that isn't a plain token is
// treated as missing rather than joined into a path.
const SAFE_ID = /^[\w-]{1,64}$/

// Runtime data, not source: the ignore comments stop Next's file tracing
// from bundling the whole project because of these dynamic paths.
function fileFor(kind: Kind, id: string) {
  return path.join(/*turbopackIgnore: true*/ DATA_DIR, kind, `${id}.json`)
}

function isNotFound(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT"
}

async function read<T>(kind: Kind, id: string): Promise<T | null> {
  if (!SAFE_ID.test(id)) return null
  try {
    return JSON.parse(await readFile(fileFor(kind, id), "utf8")) as T
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function write(kind: Kind, id: string, value: unknown) {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid ${kind} id: ${id}`)
  const file = fileFor(kind, id)
  await mkdir(path.dirname(file), { recursive: true })
  // Write then rename, so a reader never sees half a file.
  const temp = `${file}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temp, file)
}

async function ids(kind: Kind) {
  try {
    const names = await readdir(path.join(/*turbopackIgnore: true*/ DATA_DIR, kind))
    return names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5))
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
}

async function list<T>(kind: Kind) {
  const records = await Promise.all((await ids(kind)).map((id) => read<T>(kind, id)))
  return records.filter((r): r is Awaited<T> => r !== null)
}

/** A random URL-safe id, e.g. "q3ZkP0aB". */
export function newId(bytes = 6) {
  return randomBytes(bytes).toString("base64url")
}

export const getCustomer = (id: string) => read<Customer>("customers", id)
export const saveCustomer = (customer: Customer) =>
  write("customers", customer.id, customer)

/** Most recently active first. */
export async function listCustomers() {
  const customers = await list<Customer>("customers")
  return customers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const getCall = (callSid: string) => read<CallRecord>("calls", callSid)
export const saveCall = (call: CallRecord) => write("calls", call.callSid, call)

/** Newest first. */
export async function listCalls() {
  const calls = await list<CallRecord>("calls")
  return calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export const getOrder = (id: string) => read<Order>("orders", id)
export const saveOrder = (order: Order) => write("orders", order.id, order)

/** Order numbers count up from 1001. */
export async function nextOrderNumber() {
  return 1001 + (await ids("orders")).length
}
