// The cart for one call. Each line copies the item's price when it's added,
// so an order keeps the prices the caller heard even if the menu changes.

import { spokenAddOn, type AddOn, type CatalogItem } from "@/lib/catalog"
import { numberToWords } from "@/lib/money"
import { normalizeText } from "@/lib/text"

export type CartLine = {
  /** "L1", "L2"... what the agent uses to change or remove a line. */
  lineId: string
  /** DoorDash's item id, the key in menu.json. */
  itemId: string
  /** The readable id from lib/catalog.ts. */
  ref: string
  name: string
  quantity: number
  /** Extras from the dish's popup, e.g. Add Fried Egg; their prices are in unitPriceCents. */
  addOns: AddOn[]
  /** A special request such as "no cilantro". */
  note: string | null
  /** The dish plus its add-ons, for one. */
  unitPriceCents: number
  lineTotalCents: number
}

export type Cart = {
  lines: CartLine[]
  nextLineNumber: number
}

/** More than this on one line is catering, which goes to a person. */
export const MAX_QUANTITY = 20

export function emptyCart(): Cart {
  return { lines: [], nextLineNumber: 1 }
}

export function cleanNote(note: string | null | undefined) {
  const text = note?.trim().replace(/\s+/g, " ").slice(0, 140)
  return text ? text : null
}

const addOnIds = (addOns: AddOn[]) =>
  addOns
    .map((a) => a.id)
    .sort()
    .join()

/** The line that the same dish, add-ons and note would merge into. */
export function sameLine(
  cart: Cart,
  item: CatalogItem,
  note: string | null,
  addOns: AddOn[]
) {
  return cart.lines.find(
    (line) =>
      line.itemId === item.id &&
      line.note === note &&
      addOnIds(line.addOns) === addOnIds(addOns)
  )
}

/** Adds a line, or raises the quantity of a line with the same dish, add-ons and note. */
export function addToCart(
  cart: Cart,
  item: CatalogItem,
  quantity: number,
  note: string | null,
  addOns: AddOn[] = []
): CartLine {
  const existing = sameLine(cart, item, note, addOns)
  if (existing) {
    existing.quantity += quantity
    existing.lineTotalCents = existing.quantity * existing.unitPriceCents
    return existing
  }
  const unitPriceCents = item.priceCents + addOns.reduce((sum, a) => sum + a.priceCents, 0)
  const line: CartLine = {
    lineId: `L${cart.nextLineNumber++}`,
    itemId: item.id,
    ref: item.ref,
    name: item.name,
    quantity,
    addOns,
    note,
    unitPriceCents,
    lineTotalCents: quantity * unitPriceCents,
  }
  cart.lines.push(line)
  return line
}

/** Replaces a line's add-ons and re-prices it. */
export function setLineAddOns(line: CartLine, item: CatalogItem, addOns: AddOn[]) {
  line.addOns = addOns
  line.unitPriceCents = item.priceCents + addOns.reduce((sum, a) => sum + a.priceCents, 0)
  line.lineTotalCents = line.quantity * line.unitPriceCents
}

/** Finds a line by its id ("L2", "l2", "2") or by the item's id or name. */
export function findLine(cart: Cart, key: string): CartLine | undefined {
  const trimmed = key.trim()
  const asId = /^l?\d+$/i.test(trimmed)
    ? `L${trimmed.replace(/^l/i, "")}`
    : null
  const byId = asId && cart.lines.find((line) => line.lineId === asId)
  if (byId) return byId
  const wanted = normalizeText(trimmed.replace(/[-_]/g, " "))
  return cart.lines.find(
    (line) =>
      line.ref === trimmed.toLowerCase() || normalizeText(line.name) === wanted
  )
}

export function setLineQuantity(cart: Cart, line: CartLine, quantity: number) {
  if (quantity <= 0) {
    cart.lines = cart.lines.filter((l) => l !== line)
    return
  }
  line.quantity = quantity
  line.lineTotalCents = quantity * line.unitPriceCents
}

export function cartTotals(lines: CartLine[], deliveryFeeCents: number) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)
  return {
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotalCents,
    deliveryFeeCents: lines.length > 0 ? deliveryFeeCents : 0,
    totalCents: subtotalCents + (lines.length > 0 ? deliveryFeeCents : 0),
  }
}

type SpokenLine = Pick<CartLine, "quantity" | "name" | "note"> & { addOns?: AddOn[] }

/** "two 5-Spice Chicken with fried egg and brown rice (no cilantro)" */
export function spokenLine(line: SpokenLine) {
  const extras = (line.addOns ?? []).map((a) => spokenAddOn(a.name))
  const withExtras =
    extras.length === 0
      ? ""
      : ` with ${extras.length === 1 ? extras[0] : `${extras.slice(0, -1).join(", ")} and ${extras.at(-1)}`}`
  const note = line.note ? ` (${line.note})` : ""
  return `${numberToWords(line.quantity)} ${line.name}${withExtras}${note}`
}

/**
 * "two Hue Rolls, one Thai Iced Tea and 2 more": at most `max` lines are
 * named, the rest are counted.
 */
export function summarizeLines(lines: SpokenLine[], max = 4) {
  const named = lines.slice(0, max).map((l) => spokenLine({ ...l, note: null }))
  const more = lines.length - named.length
  if (more > 0) return `${named.join(", ")} and ${more} more`
  if (named.length <= 1) return named.join("")
  return `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`
}
