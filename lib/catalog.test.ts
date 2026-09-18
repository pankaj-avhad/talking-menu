import assert from "node:assert/strict"
import { test } from "node:test"

import {
  catalog,
  menuForPrompt,
  pickSuggestion,
  recommendedWith,
  resolveAddOns,
  resolveItem,
  searchMenu,
} from "@/lib/catalog"

const names = (results: { item: { name: string } }[]) =>
  results.map((r) => r.item.name)

test("every item gets a unique readable id", () => {
  const refs = catalog.map((item) => item.ref)
  assert.equal(new Set(refs).size, refs.length)
  for (const ref of refs) assert.match(ref, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  assert.ok(refs.includes("hue-rolls"))
})

test("search finds dishes from loose spoken phrases", () => {
  assert.equal(names(searchMenu("hue roll"))[0], "Hue Rolls")
  assert.ok(
    names(searchMenu("the spicy chicken one")).includes("Chili-Lemongrass Chicken")
  )
  assert.equal(names(searchMenu("a coke"))[0], "Pepsi")
  assert.ok(names(searchMenu("something vegetarian")).includes("Vegetarian Bun"))
  assert.equal(names(searchMenu("thai iced tee"))[0], "Thai Iced Tea")
})

test("search returns nothing for dishes the menu doesn't have", () => {
  assert.deepEqual(searchMenu("pho"), [])
  assert.deepEqual(searchMenu("pizza"), [])
})

test("a category filter alone lists that category", () => {
  const drinks = names(searchMenu("", { category: "drinks" }))
  assert.deepEqual(drinks.toSorted(), [
    "Diet Pepsi",
    "Pepsi",
    "Thai Iced Tea",
    "Vietnamese Iced Coffee",
  ])
})

test("resolveItem takes ids and names, and asks when it's ambiguous", () => {
  const byName = resolveItem("Hue Rolls")
  assert.ok("item" in byName && byName.item.ref === "hue-rolls")
  const rice = resolveItem("5-Spice Chicken")
  assert.ok("item" in rice && rice.item.category.name === "Rice Plates")
  const vague = resolveItem("chicken")
  assert.ok("candidates" in vague && vague.candidates.length > 1)
})

test("after a main, the first suggestion is the drink recommended with it", () => {
  const main = catalog.find((item) => item.ref === "5-spice-chicken-banh-mi")!
  const pick = pickSuggestion({
    context: "after_add",
    cart: [{ itemId: main.id }],
    exclude: new Set(),
    added: main,
  })
  assert.equal(pick?.kind, "dish")
  assert.equal(pick?.item.name, "Vietnamese Iced Coffee")
  assert.match(pick!.reason, /recommended with the 5-Spice Chicken Banh Mi/)
})

test("with a drink in the cart, the next suggestion is a popular add-on set", () => {
  const plate = catalog.find((item) => item.ref === "5-spice-chicken")!
  const drink = catalog.find((item) => item.ref === "thai-iced-tea")!
  const pick = pickSuggestion({
    context: "after_add",
    cart: [{ itemId: drink.id }, { itemId: plate.id, addOns: [] }],
    exclude: new Set(),
    added: plate,
  })
  assert.equal(pick?.kind, "add_on")
  assert.deepEqual(
    pick?.kind === "add_on" && pick.addOns.map((a) => a.name),
    ["Add Fried Egg", "Brown Rice"]
  )
  assert.match(pick!.reason, /10\+ other customers recently ordered it with fried egg and brown rice/)
})

test("no suggestion after adding a drink", () => {
  const drink = catalog.find((item) => item.role === "drink")!
  const pick = pickSuggestion({
    context: "after_add",
    cart: [{ itemId: drink.id }],
    exclude: new Set(),
    added: drink,
  })
  assert.equal(pick, null)
})

test("add-ons are matched from spoken names and priced", () => {
  const plate = catalog.find((item) => item.ref === "5-spice-chicken")!
  const found = resolveAddOns(plate, ["fried egg", "veg cha gio", "Brown Rice"])
  assert.ok("addOns" in found)
  assert.deepEqual(
    found.addOns.map((a) => [a.name, a.priceCents]),
    [["Add Fried Egg", 300], ["Add Veg Cha gio", 350], ["Brown Rice", 100]]
  )
  const missing = resolveAddOns(plate, ["avocado"])
  assert.ok("error" in missing && /Add Fried Egg/.test(missing.error))
  const banhMi = catalog.find((item) => item.ref === "5-spice-chicken-banh-mi")!
  const none = resolveAddOns(banhMi, ["fried egg"])
  assert.ok("error" in none && /no add-ons/.test(none.error))
})

test("the restaurant's recommended pairings come from the item popup", () => {
  const bun = catalog.find((item) => item.ref === "bun-thit-nuong")!
  const names = recommendedWith(bun).map((item) => item.name)
  assert.equal(names[0], "Vietnamese Iced Coffee")
  assert.ok(names.includes("Hue Rolls") && names.includes("Vietnamese Banana Cake"))
})

test("the prompt menu lists every item with its id and price", () => {
  const text = menuForPrompt()
  for (const item of catalog) assert.ok(text.includes(`- ${item.ref} | ${item.name} | $`))
  assert.match(text, /- 5-spice-chicken \| .*add-ons: Add Fried Egg \+\$3\.00/)
})
