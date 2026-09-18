import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addToCart,
  cartTotals,
  emptyCart,
  findLine,
  setLineQuantity,
  spokenLine,
  summarizeLines,
} from "@/lib/cart"
import { findItem } from "@/lib/catalog"

const hueRolls = findItem("hue-rolls")!
const tea = findItem("thai-iced-tea")!

test("same item and note merge into one line; a different note is a new line", () => {
  const cart = emptyCart()
  addToCart(cart, hueRolls, 1, null)
  addToCart(cart, hueRolls, 2, null)
  addToCart(cart, hueRolls, 1, "no cilantro")
  assert.equal(cart.lines.length, 2)
  assert.equal(cart.lines[0].quantity, 3)
  assert.equal(cart.lines[0].lineTotalCents, 3 * 1575)
  assert.equal(cart.lines[1].lineId, "L2")
})

test("totals add the delivery fee only when there is something to deliver", () => {
  const cart = emptyCart()
  assert.equal(cartTotals(cart.lines, 299).totalCents, 0)
  addToCart(cart, hueRolls, 2, null)
  addToCart(cart, tea, 1, null)
  assert.deepEqual(cartTotals(cart.lines, 299), {
    itemCount: 3,
    subtotalCents: 2 * 1575 + 550,
    deliveryFeeCents: 299,
    totalCents: 2 * 1575 + 550 + 299,
  })
})

test("lines can be found by id in any spelling, or by item", () => {
  const cart = emptyCart()
  addToCart(cart, hueRolls, 1, null)
  addToCart(cart, tea, 1, null)
  assert.equal(findLine(cart, "L2")?.name, "Thai Iced Tea")
  assert.equal(findLine(cart, "l2")?.name, "Thai Iced Tea")
  assert.equal(findLine(cart, "2")?.name, "Thai Iced Tea")
  assert.equal(findLine(cart, "hue-rolls")?.lineId, "L1")
  assert.equal(findLine(cart, "Hue Rolls")?.lineId, "L1")
  setLineQuantity(cart, cart.lines[0], 0)
  assert.equal(cart.lines.length, 1)
})

test("add-ons are priced into the line and keep lines apart", async () => {
  const { resolveAddOns } = await import("@/lib/catalog")
  const plate = findItem("5-spice-chicken")!
  const egg = resolveAddOns(plate, ["fried egg"])
  assert.ok("addOns" in egg)
  const cart = emptyCart()
  const withEgg = addToCart(cart, plate, 2, null, egg.addOns)
  addToCart(cart, plate, 1, null)
  assert.equal(withEgg.unitPriceCents, 1680 + 300)
  assert.equal(withEgg.lineTotalCents, 2 * 1980)
  assert.equal(cart.lines.length, 2)
  assert.equal(spokenLine(withEgg), "two 5-Spice Chicken with fried egg")
})

test("order summaries name at most four lines", () => {
  const line = (name: string, quantity = 1) => ({ name, quantity, note: null })
  assert.equal(summarizeLines([line("Hue Rolls", 2)]), "two Hue Rolls")
  assert.equal(
    summarizeLines([line("Hue Rolls", 2), line("Thai Iced Tea")]),
    "two Hue Rolls and one Thai Iced Tea"
  )
  assert.equal(
    summarizeLines(["A", "B", "C", "D", "E", "F"].map((n) => line(n))),
    "one A, one B, one C, one D and 2 more"
  )
})
