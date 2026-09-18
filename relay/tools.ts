// The agent's tools (Boson `function` tools). Every price, cart change and
// customer lookup goes through here, so the check can't drift from what was
// said. Results are small JSON objects; a "next" field tells the model what
// to say, an "error" field what went wrong and how to recover.

import {
  addOnGroups,
  findItem,
  pickKey,
  pickSuggestion,
  popularAddOns,
  popularPicks,
  recommendedWith,
  resolveAddOns,
  resolveItem,
  searchMenu,
  spokenAddOn,
  toSuggestion,
  type CatalogItem,
  type Suggestion,
  type SuggestionContext,
  type SuggestionPick,
} from "@/lib/catalog"
import {
  addToCart,
  cartTotals,
  cleanNote,
  emptyCart,
  findLine,
  MAX_QUANTITY,
  sameLine,
  setLineAddOns,
  setLineQuantity,
  spokenLine,
  summarizeLines,
  type Cart,
  type CartLine,
} from "@/lib/cart"
import type { CartView } from "@/lib/call-protocol"
import { formatUsd, mentionsAmount, spokenUsd } from "@/lib/money"
import { matchName, nameFromSpeech, nameKey, sameName } from "@/lib/names"
import { editDistance } from "@/lib/text"
import {
  getOrder,
  listCustomers,
  newId,
  nextOrderNumber,
  saveCustomer,
  saveOrder,
  type Customer,
  type Order,
} from "@/lib/store"

type JsonSchema = Record<string, unknown>

function tool(
  name: string,
  description: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = []
) {
  return {
    type: "function" as const,
    name,
    description,
    parameters: { type: "object", properties, required },
  }
}

export const TRANSFER_REASONS = [
  "cannot_understand",
  "off_menu_request",
  "catering_or_large_order",
  "allergy_question",
  "complaint_or_refund",
  "change_existing_order",
  "asked_for_person",
  "other",
] as const

export const TOOLS = [
  tool(
    "identify_customer",
    "Look up the caller by name. Call it as soon as they tell you their name.",
    {
      name: { type: "string", description: "The caller's name as they said it." },
      isNew: {
        type: "boolean",
        description:
          "True only after the caller said a suggested stored name is not them.",
      },
      confirmed: {
        type: "boolean",
        description: "True when the caller has just spelled or corrected their name.",
      },
    },
    ["name"]
  ),
  tool(
    "repeat_last_order",
    "Put the caller's previous order in the cart, once they've agreed to have the same again."
  ),
  tool(
    "search_menu",
    "Find dishes from the caller's words, e.g. 'spicy chicken' or 'something vegetarian'. Returns up to 5 matches.",
    {
      query: { type: "string" },
      category: {
        type: "string",
        description: "Optional category name to search within, e.g. Beverages.",
      },
    },
    ["query"]
  ),
  tool(
    "get_item",
    "Full details for one dish: description, what it comes with, its add-ons and prices, what goes well with it.",
    { itemId: { type: "string", description: "Menu id, e.g. hue-rolls." } },
    ["itemId"]
  ),
  tool(
    "add_to_cart",
    "Add a dish to the cart. One call per dish.",
    {
      itemId: { type: "string", description: "Menu id, e.g. hue-rolls." },
      quantity: { type: "integer", minimum: 1 },
      addOns: {
        type: "array",
        items: { type: "string" },
        description:
          "Add-ons from the dish's add-ons in the menu, e.g. [\"Add Fried Egg\"]. Leave out if none.",
      },
      note: {
        type: "string",
        description: "Special request that isn't an add-on, e.g. 'no cilantro'. Leave out if none.",
      },
    },
    ["itemId", "quantity"]
  ),
  tool(
    "update_cart_item",
    "Change the quantity or note of a cart line. Quantity 0 removes the line.",
    {
      lineId: { type: "string", description: "Line id from the cart, e.g. L2." },
      quantity: { type: "integer", minimum: 0 },
      addOns: {
        type: "array",
        items: { type: "string" },
        description: "The line's add-ons from now on; an empty list removes them.",
      },
      note: { type: "string", description: "New note; empty string clears it." },
    },
    ["lineId"]
  ),
  tool(
    "remove_from_cart",
    "Remove a line from the cart.",
    { lineId: { type: "string", description: "Line id from the cart, e.g. L2." } },
    ["lineId"]
  ),
  tool(
    "view_cart",
    "Call before reading the order back: the exact lines and total, with a read_aloud version to say."
  ),
  tool(
    "get_recommendations",
    "Dishes to suggest. Use caller_asked when the caller asks what's good.",
    {
      context: {
        type: "string",
        enum: ["caller_asked", "after_add", "before_checkout"],
      },
    },
    ["context"]
  ),
  tool(
    "set_delivery_address",
    "Save the delivery address the caller gave.",
    {
      address: {
        type: "string",
        description: "Full street address with any apartment or suite, and city.",
      },
    },
    ["address"]
  ),
  tool(
    "place_order",
    "Save the order and send the payment link, once the caller has confirmed the cart and the delivery address.",
    {
      address: {
        type: "string",
        description: "The confirmed delivery address, if not already saved.",
      },
    }
  ),
  tool(
    "transfer_to_human",
    "Hand the call to restaurant staff.",
    {
      reason: { type: "string", enum: [...TRANSFER_REASONS] },
      summary: {
        type: "string",
        description:
          "One line for staff: caller's name, what they want, what's in the cart.",
      },
    },
    ["reason", "summary"]
  ),
  tool(
    "end_call",
    "Hang up once you've said goodbye. Call it when the caller has nothing else."
  ),
]

export type ToolContext = {
  callSid: string
  callerPhone: string | null
  appUrl: string
  deliveryFeeCents: number
  timeZone: string
  /** How the caller receives the payment link on this channel. */
  paymentLink: "sms" | "screen"
  /**
   * The caller's last words as the speech-to-text transcript has them. The
   * model sometimes mishears names that the transcript gets right.
   */
  callerSpeech?: () => Promise<string>
}

/** Everything the tools know about one call. */
export type CallState = {
  customer: Customer | null
  cart: Cart
  address: string | null
  /** Item ids suggested so far (DoorDash ids). */
  offeredItemIds: string[]
  order: Order | null
  transfer: { reason: string; summary: string } | null
  /** view_cart was called since the cart last changed. */
  readBack: boolean
}

export type ToolResult = {
  output: Record<string, unknown>
  /** Short note for the call page, e.g. "Added 2 × Hue Rolls". */
  label: string
  /** What the relay does once the agent's next line has played. */
  after?: "hangup" | "transfer"
  changed?: ("cart" | "customer" | "order")[]
}

const MAX_SUGGESTIONS = 2

export function newCallState(): CallState {
  return {
    customer: null,
    cart: emptyCart(),
    address: null,
    offeredItemIds: [],
    order: null,
    transfer: null,
    readBack: false,
  }
}

function fail(error: string, label = "Tool error"): ToolResult {
  return { output: { error }, label }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

/** A list of strings from a tool argument, tolerating a single string. */
function stringList(value: unknown) {
  if (typeof value === "string") return value.trim() ? [value] : []
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

/** What the model should do with a suggestion. */
function offerInstruction(suggestion: Suggestion, before = "") {
  if (suggestion.type === "dish") {
    return `${before}offer the ${suggestion.name} (${suggestion.price}) in one short sentence, saying ${suggestion.reason}. If they want it, call add_to_cart.`
  }
  const names = suggestion.add_ons.map(spokenAddOn).join(" and ")
  return `${before}offer adding ${names} (${suggestion.price}) in one short sentence, saying ${suggestion.reason}. If they want it, call update_cart_item with lineId ${suggestion.line_id} and addOns ${JSON.stringify(suggestion.add_ons)}.`
}

/** "priya sharma" -> "Priya Sharma"; the rest of each word is kept as said. */
function titleCase(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export class OrderingTools {
  private lastAdded: CatalogItem | null = null
  /** A suggestion handed to the model that it hasn't had a chance to say yet. */
  private unspoken: { pick: SuggestionPick; suggestion: Suggestion } | null = null

  constructor(
    private readonly ctx: ToolContext,
    readonly state: CallState = newCallState()
  ) {}

  async run(name: string, argsJson: string): Promise<ToolResult> {
    let args: Record<string, unknown>
    try {
      args = argsJson ? JSON.parse(argsJson) : {}
    } catch {
      return fail("The arguments weren't valid JSON. Try the call again.")
    }
    switch (name) {
      case "identify_customer":
        return this.identifyCustomer(args)
      case "repeat_last_order":
        return this.repeatLastOrder()
      case "search_menu":
        return this.search(args)
      case "get_item":
        return this.getItem(args)
      case "add_to_cart":
        return this.addToCart(args)
      case "update_cart_item":
        return this.updateCartItem(args)
      case "remove_from_cart":
        return this.removeFromCart(args)
      case "view_cart":
        return this.viewCart()
      case "get_recommendations":
        return this.recommendations(args)
      case "set_delivery_address":
        return this.setAddress(args)
      case "place_order":
        return this.placeOrder(args)
      case "transfer_to_human":
        return this.transfer(args)
      case "end_call":
        return {
          output: {
            ok: true,
            next: "Say a short, warm goodbye. The line closes when you finish.",
          },
          label: "Ending the call",
          after: "hangup",
        }
      default:
        return fail(`There is no tool called ${name}.`)
    }
  }

  cartView(): CartView {
    const totals = cartTotals(this.state.cart.lines, this.ctx.deliveryFeeCents)
    return {
      lines: this.state.cart.lines.map((line) => ({ ...line })),
      ...totals,
      address: this.state.address,
    }
  }

  // ------------------------------------------------------------ customers

  private async identifyCustomer(args: Record<string, unknown>) {
    const spoken = text(args.name)
    if (!spoken) return fail("No name given. Ask for the caller's name.")

    // The model mishears names more often than the speech transcript does,
    // so a clear "this is Priya" in the transcript wins over the model's
    // version unless the caller has spelled or confirmed it.
    let name = spoken
    if (args.confirmed !== true && this.ctx.callerSpeech) {
      const heard = nameFromSpeech(await this.ctx.callerSpeech())
      // Speech-to-text sometimes turns noise into Chinese characters; only a
      // name in Latin letters can overrule the model on this US line.
      const transcribed = heard && /^[\p{Script=Latin}\s'-]+$/u.test(heard) ? heard : null
      // Keep the model's version only when the transcript split a name into
      // sound-alike words ("Pun Cudge" for "Pankaj").
      const splitName =
        transcribed &&
        sameName(transcribed, spoken) &&
        editDistance(nameKey(transcribed), nameKey(spoken)) > 2
      if (transcribed && !splitName) name = titleCase(transcribed)
    }
    const corrected = name !== spoken ? `Their name is ${name}; use that, not "${spoken}". ` : ""

    if (args.isNew !== true) {
      // Over the phone "Priya" and "Priyaa" sound the same, so a close match
      // is welcomed back straight away; the caller can still say it's not them.
      const match = matchName(name, await listCustomers())
      if (match) return this.welcomeBack(match.customer, corrected, match.kind === "close")
    }

    const now = new Date().toISOString()
    const customer: Customer = {
      id: newId(),
      name: titleCase(name),
      nameKey: nameKey(name),
      phone: this.ctx.callerPhone,
      lastAddress: null,
      lastOrderId: null,
      createdAt: now,
      updatedAt: now,
    }
    await saveCustomer(customer)
    this.state.customer = customer
    return {
      output: {
        status: "new",
        name: customer.name,
        next: `${corrected}Say: "I see this is your first time with us. What would you like?"`.trim(),
      },
      label: `New caller: ${customer.name}`,
      changed: ["customer"],
    } satisfies ToolResult
  }

  private async welcomeBack(
    customer: Customer,
    corrected = "",
    close = false
  ): Promise<ToolResult> {
    this.state.customer = customer
    const notThem = close
      ? ` If they say that's not them, call identify_customer with their name, isNew true and confirmed true.`
      : ""
    const last = customer.lastOrderId ? await getOrder(customer.lastOrderId) : null
    if (!last) {
      return {
        output: {
          status: "new",
          name: customer.name,
          next: `${corrected}Say: "I see this is your first order with us. What would you like?"${notThem}`.trim(),
        },
        label: `Caller: ${customer.name}`,
        changed: ["customer"],
      }
    }
    const date = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      timeZone: this.ctx.timeZone,
    }).format(new Date(last.createdAt))
    const items = summarizeLines(last.lines)
    return {
      output: {
        status: "returning",
        name: customer.name,
        last_order: {
          date,
          items,
          total: formatUsd(last.totalCents),
          address: last.address,
        },
        next: `${corrected}Welcome them back by name, say that last time, on ${date}, they had ${items}, and ask if they'd like the same again. If yes, call repeat_last_order.${notThem}`.trim(),
      },
      label: `Returning caller: ${customer.name}`,
      changed: ["customer"],
    }
  }

  private async repeatLastOrder(): Promise<ToolResult> {
    const customer = this.state.customer
    if (!customer) return fail("Get the caller's name first with identify_customer.")
    const last = customer.lastOrderId ? await getOrder(customer.lastOrderId) : null
    if (!last) return fail("This caller has no earlier order. Ask what they'd like.")

    this.state.cart = emptyCart()
    this.cartChanged()
    const unavailable: string[] = []
    for (const line of last.lines) {
      const item = findItem(line.itemId)
      if (!item) {
        unavailable.push(line.name)
        continue
      }
      // Add-ons are re-read from today's menu, so prices are current.
      const extras = resolveAddOns(item, (line.addOns ?? []).map((a) => a.id))
      if ("error" in extras) unavailable.push(`the add-ons on the ${item.name}`)
      const addOns = "addOns" in extras ? extras.addOns : []
      addToCart(this.state.cart, item, line.quantity, line.note, addOns)
    }
    const totals = cartTotals(this.state.cart.lines, this.ctx.deliveryFeeCents)
    return {
      output: {
        cart: this.state.cart.lines.map((l) => spokenLine(l)),
        subtotal: formatUsd(totals.subtotalCents),
        last_address: last.address,
        ...(unavailable.length > 0 && { no_longer_on_menu: unavailable }),
        next:
          unavailable.length > 0
            ? "Tell the caller which dishes are no longer on the menu, then ask if they'd like anything else."
            : "Confirm their usual order is in and ask if they'd like anything else.",
      },
      label: "Repeated the last order",
      changed: ["cart"],
    }
  }

  // ------------------------------------------------------------ menu

  private search(args: Record<string, unknown>): ToolResult {
    const query = text(args.query)
    const category = text(args.category) || undefined
    const results = searchMenu(query, { category })
    if (results.length === 0) {
      return {
        output: {
          results: [],
          next: "Nothing on the menu matches. Tell the caller, and offer the closest dish if there is one.",
        },
        label: `Searched the menu for "${query}": no match`,
      }
    }
    return {
      output: {
        results: results.map(({ item }) => ({
          id: item.ref,
          name: item.name,
          price: formatUsd(item.priceCents),
          description: item.description,
          labels: item.labels,
        })),
      },
      label: `Searched the menu for "${query}"`,
    }
  }

  private getItem(args: Record<string, unknown>): ToolResult {
    const found = this.resolve(text(args.itemId))
    if ("error" in found) return found.error
    const { item } = found
    return {
      output: {
        id: item.ref,
        name: item.name,
        price: formatUsd(item.priceCents),
        category: item.category.name,
        description: item.description,
        comes_with: item.category.description,
        labels: item.labels,
        rating:
          item.likePercent !== null
            ? `${item.likePercent}% of ${item.ratingCount} customers who rated it liked it`
            : null,
        add_ons: addOnGroups(item).map((group) => ({
          group: group.name,
          choose: group.max_choices > 1 ? `up to ${group.max_choices}` : "one",
          options: group.options.map(
            (o) => `${o.name} (${o.price.display ?? "no charge"})`
          ),
        })),
        popular_add_ons: popularAddOns(item)
          .slice(0, 2)
          .map((combo) => `${combo.label}: ${combo.addOns.map((a) => a.name).join(" + ")}`),
        goes_well_with: recommendedWith(item)
          .slice(0, 5)
          .map((r) => `${r.name} (${formatUsd(r.priceCents)})`),
        special_requests: "Anything else, like 'no cilantro', goes in the add_to_cart note.",
      },
      label: `Looked up ${item.name}`,
    }
  }

  private resolve(key: string): { item: CatalogItem } | { error: ToolResult } {
    if (!key) return { error: fail("No itemId given.") }
    const found = resolveItem(key)
    if ("item" in found) return found
    if (found.candidates.length === 0) {
      return {
        error: fail(
          `Nothing on the menu matches "${key}". Tell the caller it isn't on the menu.`
        ),
      }
    }
    return {
      error: {
        output: {
          error: `Not sure which dish "${key}" means. Ask the caller.`,
          candidates: found.candidates.map((c) => ({ id: c.ref, name: c.name })),
        },
        label: `Which dish is "${key}"?`,
      },
    }
  }

  // ------------------------------------------------------------ cart

  private cartSummary() {
    const totals = cartTotals(this.state.cart.lines, this.ctx.deliveryFeeCents)
    return { items: totals.itemCount, subtotal: formatUsd(totals.subtotalCents) }
  }

  private addToCart(args: Record<string, unknown>): ToolResult {
    const found = this.resolve(text(args.itemId))
    if ("error" in found) return found.error
    const { item } = found

    const quantity = args.quantity === undefined ? 1 : Number(args.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail("Quantity must be a whole number, at least 1.")
    }
    const note = cleanNote(text(args.note))
    const extras = resolveAddOns(item, stringList(args.addOns))
    if ("error" in extras) return fail(`${extras.error} Ask the caller which they'd like.`)
    const { addOns } = extras
    const already = sameLine(this.state.cart, item, note, addOns)?.quantity ?? 0
    if (already + quantity > MAX_QUANTITY) {
      return fail(
        `That's more than ${MAX_QUANTITY} of one dish. Large and catering orders go to our staff: offer to transfer the call.`
      )
    }

    const line = addToCart(this.state.cart, item, quantity, note, addOns)
    this.cartChanged()
    this.lastAdded = item
    const suggestion = this.nextSuggestion("after_add", item)
    return {
      output: {
        added: spokenLine({ quantity, name: item.name, note, addOns }),
        line: {
          lineId: line.lineId,
          quantity: line.quantity,
          each: formatUsd(line.unitPriceCents),
          line_total: formatUsd(line.lineTotalCents),
        },
        cart: this.cartSummary(),
        ...(suggestion && { suggestion, next: offerInstruction(suggestion, "After confirming what you added, ") }),
      },
      label: `Added ${quantity} × ${item.name}${addOns.length ? ` with ${addOns.map((a) => spokenAddOn(a.name)).join(", ")}` : ""}`,
      changed: ["cart"],
    }
  }

  private findLineOrFail(
    args: Record<string, unknown>
  ): { line: CartLine } | { error: ToolResult } {
    const key = text(args.lineId)
    const line = key ? findLine(this.state.cart, key) : undefined
    return line
      ? { line }
      : {
          error: fail(
            `There's no cart line "${key}". Call view_cart to see the line ids.`
          ),
        }
  }

  private updateCartItem(args: Record<string, unknown>): ToolResult {
    const found = this.findLineOrFail(args)
    if ("error" in found) return found.error
    const { line } = found

    if (args.note !== undefined) line.note = cleanNote(text(args.note))
    if (args.addOns !== undefined) {
      const item = findItem(line.itemId)
      const extras = item ? resolveAddOns(item, stringList(args.addOns)) : null
      if (!item || !extras) return fail(`${line.name} is no longer on the menu.`)
      if ("error" in extras) return fail(`${extras.error} Ask the caller which they'd like.`)
      setLineAddOns(line, item, extras.addOns)
    }
    if (args.quantity !== undefined) {
      const quantity = Number(args.quantity)
      if (!Number.isInteger(quantity) || quantity < 0) {
        return fail("Quantity must be a whole number, 0 or more.")
      }
      if (quantity > MAX_QUANTITY) {
        return fail(
          `That's more than ${MAX_QUANTITY} of one dish. Offer to transfer the call to staff for large orders.`
        )
      }
      setLineQuantity(this.state.cart, line, quantity)
    }
    this.cartChanged()
    const removed = !this.state.cart.lines.includes(line)
    return {
      output: {
        [removed ? "removed" : "updated"]: spokenLine(line),
        cart: this.cartSummary(),
      },
      label: removed ? `Removed ${line.name}` : `Changed ${line.name}`,
      changed: ["cart"],
    }
  }

  private removeFromCart(args: Record<string, unknown>): ToolResult {
    const found = this.findLineOrFail(args)
    if ("error" in found) return found.error
    setLineQuantity(this.state.cart, found.line, 0)
    this.cartChanged()
    return {
      output: { removed: spokenLine(found.line), cart: this.cartSummary() },
      label: `Removed ${found.line.name}`,
      changed: ["cart"],
    }
  }

  private viewCart(): ToolResult {
    const { lines } = this.state.cart
    if (lines.length === 0) {
      return {
        output: { empty: true, next: "The cart is empty. Ask what they'd like." },
        label: "Checked the cart: empty",
      }
    }
    const totals = cartTotals(lines, this.ctx.deliveryFeeCents)
    const readAloud = this.readAloud()
    this.state.readBack = true
    const suggestion = this.nextSuggestion("before_checkout")
    return {
      output: {
        lines: lines.map((l) => ({
          lineId: l.lineId,
          quantity: l.quantity,
          name: l.name,
          add_ons: (l.addOns ?? []).map((a) => a.name),
          note: l.note,
          line_total: formatUsd(l.lineTotalCents),
        })),
        subtotal: formatUsd(totals.subtotalCents),
        delivery_fee: formatUsd(totals.deliveryFeeCents),
        total: formatUsd(totals.totalCents),
        read_aloud: readAloud,
        ...(suggestion && { suggestion, next: offerInstruction(suggestion, "Read back read_aloud, then ") }),
      },
      label: `Read back the cart: ${formatUsd(totals.totalCents)}`,
    }
  }

  /** The cart in words: "two Hue Rolls, thirty-one dollars and fifty cents; ... Total ..." */
  private readAloud() {
    const { lines } = this.state.cart
    const totals = cartTotals(lines, this.ctx.deliveryFeeCents)
    const items = lines
      .map((l) => `${spokenLine(l)}, ${spokenUsd(l.lineTotalCents)}`)
      .join("; ")
    return totals.deliveryFeeCents > 0
      ? `${items}. Subtotal ${spokenUsd(totals.subtotalCents)}, delivery ${spokenUsd(totals.deliveryFeeCents)}, total ${spokenUsd(totals.totalCents)}.`
      : `${items}. Total ${spokenUsd(totals.totalCents)}.`
  }

  /**
   * The next upsell, if one is allowed: at most two per call, none after a
   * declined one, never the same thing twice.
   */
  private nextSuggestion(
    context: SuggestionContext,
    added?: CatalogItem
  ): Suggestion | undefined {
    // Several tools can run before the agent speaks; keep offering the same
    // suggestion until it has had the chance to say it, unless the cart has
    // meanwhile made it pointless (the caller ordered a drink, say).
    if (this.unspoken) {
      if (!this.madePointless(this.unspoken.pick)) return this.unspoken.suggestion
      this.unspoken = null
    }
    const offered = this.state.offeredItemIds
    if (offered.length >= MAX_SUGGESTIONS || offered.some((key) => this.declined(key))) {
      return undefined
    }
    const pick = pickSuggestion({
      context,
      cart: this.state.cart.lines,
      exclude: new Set(offered),
      added,
    })
    if (!pick) return undefined
    const line =
      pick.kind === "add_on"
        ? this.state.cart.lines.find((l) => l.itemId === pick.item.id)
        : undefined
    this.unspoken = { pick, suggestion: toSuggestion(pick, line?.lineId) }
    return this.unspoken.suggestion
  }

  private madePointless(pick: SuggestionPick) {
    const lines = this.state.cart.lines
    if (pick.kind === "add_on") {
      return !lines.some((l) => l.itemId === pick.item.id && !(l.addOns ?? []).length)
    }
    return lines.some((l) => findItem(l.itemId)?.role === pick.item.role)
  }

  /** An offer the caller didn't take: the dish isn't in the cart, or the add-ons aren't on it. */
  private declined(key: string) {
    const lines = this.state.cart.lines
    if (key.startsWith("add-ons:")) {
      const itemId = key.slice("add-ons:".length)
      return !lines.some((l) => l.itemId === itemId && (l.addOns ?? []).length > 0)
    }
    return !lines.some((l) => l.itemId === key)
  }

  /** The agent said this line: if it included the cart total, the order has been read back. */
  agentSaid(text: string) {
    const { lines } = this.state.cart
    if (this.state.readBack || lines.length === 0) return
    const { totalCents } = cartTotals(lines, this.ctx.deliveryFeeCents)
    if (mentionsAmount(text, totalCents)) this.state.readBack = true
  }

  /** The agent has spoken: any suggestion it was given now counts as offered. */
  agentSpoke() {
    if (!this.unspoken) return
    this.state.offeredItemIds.push(pickKey(this.unspoken.pick))
    this.unspoken = null
  }

  private cartChanged() {
    this.state.readBack = false
  }

  private recommendations(args: Record<string, unknown>): ToolResult {
    const context = text(args.context)
    if (context === "after_add" || context === "before_checkout") {
      const suggestion = this.nextSuggestion(
        context,
        this.lastAdded ?? undefined
      )
      return {
        output: suggestion
          ? { suggestions: [suggestion], next: offerInstruction(suggestion) }
          : { suggestions: [], next: "No suggestion right now; carry on." },
        label: suggestion ? "Made a suggestion" : "No suggestion",
      }
    }
    // The caller asked, so this answers a question and isn't an upsell.
    const picks = popularPicks(new Set(this.state.cart.lines.map((l) => l.itemId)))
    return {
      output: {
        suggestions: picks.map((pick) => toSuggestion(pick)),
      },
      label: "Recommended popular dishes",
    }
  }

  // ------------------------------------------------------------ checkout

  private setAddress(args: Record<string, unknown>): ToolResult {
    const address = text(args.address).replace(/\s+/g, " ").slice(0, 200)
    if (address.length < 5) {
      return fail("That address is too short. Ask for the full street address.")
    }
    this.state.address = address
    return {
      output: {
        address,
        next: /\d/.test(address)
          ? "Read the address back to confirm it."
          : "There's no street number. Ask for it, then save the address again.",
      },
      label: `Delivery to ${address}`,
      changed: ["cart"],
    }
  }

  private async placeOrder(args: Record<string, unknown>): Promise<ToolResult> {
    if (text(args.address)) {
      const saved = this.setAddress(args)
      if ("error" in saved.output) return saved
    }
    const { customer, cart, address } = this.state
    if (!customer) return fail("Get the caller's name first with identify_customer.")
    if (cart.lines.length === 0) return fail("The cart is empty. Ask what they'd like.")
    if (!address) {
      return fail("No delivery address yet. Ask for it, then call place_order with it.")
    }
    if (!this.state.readBack) {
      // The model tends to read the order back from memory; hand it the
      // exact wording once, and accept the next place_order.
      this.state.readBack = true
      return {
        output: {
          error: "Read the order back before placing it.",
          read_aloud: this.readAloud(),
          next: "Say read_aloud to the caller and ask if it's right. If they say yes, call place_order again.",
        },
        label: "Reading the order back first",
      }
    }
    const totals = cartTotals(cart.lines, this.ctx.deliveryFeeCents)
    const now = new Date().toISOString()
    // Placing again (say the caller added a drink) updates the same order.
    const order: Order = {
      ...(this.state.order ?? {
        id: newId(),
        number: await nextOrderNumber(),
        createdAt: now,
        status: "awaiting_payment" as const,
        paidAt: null,
      }),
      callSid: this.ctx.callSid,
      customerId: customer.id,
      customerName: customer.name,
      lines: cart.lines.map((line) => ({ ...line })),
      subtotalCents: totals.subtotalCents,
      deliveryFeeCents: totals.deliveryFeeCents,
      totalCents: totals.totalCents,
      address,
      updatedAt: now,
    }
    await saveOrder(order)
    this.state.order = order

    const updated: Customer = {
      ...customer,
      phone: customer.phone ?? this.ctx.callerPhone,
      lastAddress: address,
      lastOrderId: order.id,
      updatedAt: now,
    }
    await saveCustomer(updated)
    this.state.customer = updated

    const where =
      this.ctx.paymentLink === "sms"
        ? "texted to their phone"
        : "shown on their screen"
    return {
      output: {
        order_number: order.number,
        total: formatUsd(order.totalCents),
        payment_link: where,
        next: `Tell the caller their order number is ${order.number} and the payment link is ${where}. Then ask if there's anything else.`,
      },
      label: `Order #${order.number} placed`,
      changed: ["order", "customer"],
    }
  }

  orderUrl() {
    return this.state.order ? `${this.ctx.appUrl}/orders/${this.state.order.id}` : null
  }

  private transfer(args: Record<string, unknown>): ToolResult {
    const reason = TRANSFER_REASONS.includes(text(args.reason) as never)
      ? text(args.reason)
      : "other"
    const summary = text(args.summary).slice(0, 300)
    this.state.transfer = { reason, summary }
    return {
      output: {
        ok: true,
        next: 'Say exactly: "Let me connect you to one of our team, one moment." Nothing else.',
      },
      label: "Handing off to staff",
      after: "transfer",
    }
  }
}
