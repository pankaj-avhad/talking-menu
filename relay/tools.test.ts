import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"

// The store reads DATA_DIR when it loads, so set it before importing.
const dataDir = await mkdtemp(path.join(tmpdir(), "talking-menu-test-"))
process.env.DATA_DIR = dataDir
const { OrderingTools } = await import("./tools")
const { getOrder } = await import("@/lib/store")

after(() => rm(dataDir, { recursive: true, force: true }))

function newCall(callSid: string) {
  return new OrderingTools({
    callSid,
    callerPhone: null,
    appUrl: "http://localhost:3000",
    deliveryFeeCents: 0,
    timeZone: "America/Los_Angeles",
    paymentLink: "screen",
  })
}

const call = async (
  tools: InstanceType<typeof OrderingTools>,
  name: string,
  args: object = {}
) => (await tools.run(name, JSON.stringify(args))).output as Record<string, never>

test("a first call orders, and a second call can repeat it", async () => {
  const first = newCall("web_first")
  assert.equal((await call(first, "identify_customer", { name: "priya" })).status, "new")

  const added = await call(first, "add_to_cart", { itemId: "hue-rolls", quantity: 2 })
  assert.equal(added.added, "two Hue Rolls")
  assert.equal((added.suggestion as { name: string }).name, "Vietnamese Iced Coffee")
  first.agentSpoke()
  const coffee = await call(first, "add_to_cart", { itemId: "Vietnamese Iced Coffee", quantity: 1 })
  assert.equal(coffee.suggestion, undefined)

  const early = await call(first, "place_order", { address: "180 Spear St" })
  assert.match(early.error, /Read the order back/, "the cart is read back first")
  assert.match(early.read_aloud, /Total thirty-seven dollars/)
  await call(first, "add_to_cart", { itemId: "pepsi", quantity: 1 })
  await call(first, "remove_from_cart", { lineId: "L3" })
  const cart = await call(first, "view_cart")
  assert.equal(cart.total, "$37.00")
  assert.match(cart.read_aloud, /two Hue Rolls, thirty-one dollars and fifty cents/)

  const placed = await call(first, "place_order", { address: "180 Spear St, San Francisco" })
  assert.equal(placed.order_number, 1001)
  assert.equal(placed.payment_link, "shown on their screen")

  const order = await getOrder(first.state.order!.id)
  assert.equal(order?.totalCents, 3700)
  assert.equal(order?.customerName, "Priya")

  const second = newCall("web_second")
  const back = await call(second, "identify_customer", { name: "Priya" })
  assert.equal(back.status, "returning")
  assert.equal(
    (back.last_order as { items: string }).items,
    "two Hue Rolls and one Vietnamese Iced Coffee"
  )
  const repeated = await call(second, "repeat_last_order")
  assert.deepEqual(repeated.cart, ["two Hue Rolls", "one Vietnamese Iced Coffee"])
})

test("a close spelling is the same caller, unless they say it isn't", async () => {
  const tools = newCall("web_close")
  const result = await call(tools, "identify_customer", { name: "Priyaa" })
  assert.equal(result.status, "returning")
  assert.equal(result.name, "Priya")
  assert.match(result.next, /isNew true/)
  const isNew = await call(tools, "identify_customer", { name: "Priyaa", isNew: true, confirmed: true })
  assert.equal(isNew.status, "new")
  assert.equal(tools.state.customer?.name, "Priyaa")
})

test("the transcript's spelling of a name wins over the model's", async () => {
  const heard = (text: string) =>
    new OrderingTools({
      callSid: "web_heard",
      callerPhone: null,
      appUrl: "http://localhost:3000",
      deliveryFeeCents: 0,
      timeZone: "America/Los_Angeles",
      paymentLink: "screen",
      callerSpeech: async () => text,
    })
  const misheard = await call(heard("Hi, this is Dana."), "identify_customer", { name: "Tana" })
  assert.equal(misheard.name, "Dana")
  assert.match(misheard.next, /Their name is Dana/)
  const split = await call(heard("It's Pun Cudge."), "identify_customer", { name: "Pankaj" })
  assert.equal(split.name, "Pankaj")
  const noise = await call(heard("泰纳"), "identify_customer", { name: "Dana" })
  assert.equal(noise.name, "Dana")
})

test("a declined suggestion stops further upsells", async () => {
  const tools = newCall("web_decline")
  await call(tools, "identify_customer", { name: "Sam" })
  const first = await call(tools, "add_to_cart", { itemId: "grilled-pork-banh-mi", quantity: 1 })
  assert.ok(first.suggestion)
  // Until the agent speaks, the same suggestion comes back.
  const again = await call(tools, "add_to_cart", { itemId: "pepsi", quantity: 1 })
  assert.equal(again.suggestion, undefined, "dropped once the caller orders a drink")
  await call(tools, "remove_from_cart", { lineId: "L2" })
  const offered = await call(tools, "add_to_cart", { itemId: "xiu-mai-banh-mi", quantity: 1 })
  assert.ok(offered.suggestion)
  tools.agentSpoke()
  // The caller says no to it and orders another sandwich.
  const second = await call(tools, "add_to_cart", { itemId: "combo-banh-mi", quantity: 1 })
  assert.equal(second.suggestion, undefined)
  assert.equal((await call(tools, "view_cart")).suggestion, undefined)
})

test("add-ons go on the line, and an add-on suggestion can be taken", async () => {
  const tools = newCall("web_addons")
  await call(tools, "identify_customer", { name: "Kim" })
  await call(tools, "add_to_cart", { itemId: "thai-iced-tea", quantity: 1 })
  tools.agentSpoke()
  const plate = await call(tools, "add_to_cart", { itemId: "5-spice-chicken", quantity: 1 })
  const suggestion = plate.suggestion as { type: string; line_id: string; add_ons: string[] }
  assert.equal(suggestion.type, "add_on")
  assert.deepEqual(suggestion.add_ons, ["Add Fried Egg", "Brown Rice"])
  assert.match(plate.next, /update_cart_item with lineId L2/)
  tools.agentSpoke()
  const taken = await call(tools, "update_cart_item", { lineId: "L2", addOns: suggestion.add_ons })
  assert.equal(taken.updated, "one 5-Spice Chicken with fried egg and brown rice")
  assert.equal(tools.state.cart.lines[1].lineTotalCents, 1680 + 300 + 100)

  const bun = await call(tools, "add_to_cart", {
    itemId: "bun-thit-nuong",
    quantity: 1,
    addOns: ["grilled shrimp"],
  })
  assert.equal(bun.added, "one Bun Thit Nuong with grilled shrimp")
  assert.equal((bun.line as { each: string }).each, "$21.85")
  const wrong = await call(tools, "add_to_cart", { itemId: "hue-rolls", quantity: 1, addOns: ["fried egg"] })
  assert.match(wrong.error, /has no add-on "fried egg"/)
})

test("unknown and ambiguous dishes come back as errors to ask about", async () => {
  const tools = newCall("web_errors")
  assert.match((await call(tools, "add_to_cart", { itemId: "pizza", quantity: 1 })).error, /isn't on the menu/)
  const vague = await call(tools, "add_to_cart", { itemId: "chicken", quantity: 1 })
  assert.match(vague.error, /Ask the caller/)
  assert.ok((vague.candidates as unknown[]).length > 1)
  assert.match(
    (await call(tools, "add_to_cart", { itemId: "pepsi", quantity: 25 })).error,
    /transfer/
  )
})

test("hand-off and hang-up are flagged for after the agent's next line", async () => {
  const tools = newCall("web_after")
  const transfer = await tools.run(
    "transfer_to_human",
    JSON.stringify({ reason: "off_menu_request", summary: "Sam wants a birthday cake" })
  )
  assert.equal(transfer.after, "transfer")
  assert.deepEqual(tools.state.transfer, {
    reason: "off_menu_request",
    summary: "Sam wants a birthday cake",
  })
  assert.equal((await tools.run("end_call", "{}")).after, "hangup")
})
