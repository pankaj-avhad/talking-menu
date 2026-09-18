// The menu as the voice agent sees it: readable item ids, a search that
// tolerates speech-to-text slips, each dish's add-ons, and suggestions backed
// only by the data: the "Recommended ..." rows and popular add-on sets from
// the item popups (data/item-options.json), and popularity labels.
//
// No Next.js-only imports, so the relay can use it.

import {
  itemOptions,
  menu,
  type Category,
  type ItemOption,
  type ItemOptionGroup,
} from "@/lib/menu"
import { formatUsd } from "@/lib/money"
import { editDistance, normalizeText } from "@/lib/text"

/** What a dish is for, read from its category's name. */
export type ItemRole = "main" | "starter" | "side" | "dessert" | "drink"

export type CatalogItem = {
  /** Readable id the agent passes to tools, e.g. "hue-rolls". */
  ref: string
  /** DoorDash's item id, the key in menu.json. */
  id: string
  name: string
  description: string | null
  priceCents: number
  category: Category
  role: ItemRole
  /** Badges plus Most Ordered rank, e.g. "#1 Most liked", "#2 most ordered". */
  labels: string[]
  /** 0-based position in DoorDash's Most Ordered row, or null. */
  orderedRank: number | null
  likePercent: number | null
  ratingCount: number
}

/** An extra on one dish, e.g. "Add Fried Egg" for $3.00. */
export type AddOn = { id: string; name: string; priceCents: number }

/** What the agent may offer: another dish, or add-ons for a dish in the cart. */
export type Suggestion =
  | {
      type: "dish"
      id: string
      name: string
      price: string
      /** Taken from the data, ready to say ("it's recommended with the Bun Thit Nuong"). */
      reason: string
    }
  | {
      type: "add_on"
      /** The cart line the add-ons are for. */
      line_id: string
      add_ons: string[]
      price: string
      reason: string
    }

const mostOrdered =
  menu.collections.find((c) => c.id === "most_ordered")?.item_ids ?? []

function roleOf(category: Category): ItemRole {
  const name = category.name.toLowerCase()
  if (/beverage|drink/.test(name)) return "drink"
  if (/dessert|sweet/.test(name)) return "dessert"
  if (/\bsides?\b/.test(name)) return "side"
  if (/roll|salad|appetizer|starter/.test(name)) return "starter"
  return "main"
}

function slugify(text: string) {
  return normalizeText(text).replace(/ /g, "-")
}

/** Every item, in menu order. */
export const catalog: CatalogItem[] = []
const byRef = new Map<string, CatalogItem>()
const byId = new Map<string, CatalogItem>()
const byName = new Map<string, CatalogItem>()

for (const category of menu.categories) {
  for (const id of category.item_ids) {
    const item = menu.items[id]
    const base = slugify(item.name)
    let ref = base
    for (let n = 2; byRef.has(ref); n++) ref = `${base}-${n}`

    const rank = mostOrdered.indexOf(id)
    const entry: CatalogItem = {
      ref,
      id,
      name: item.name,
      description: item.description,
      priceCents: item.price.amount_cents,
      category,
      role: roleOf(category),
      labels: [...item.badges, ...(rank >= 0 ? [`#${rank + 1} most ordered`] : [])],
      orderedRank: rank >= 0 ? rank : null,
      likePercent: item.rating?.like_percent ?? null,
      ratingCount: item.rating?.count ?? 0,
    }
    catalog.push(entry)
    byRef.set(ref, entry)
    byId.set(id, entry)
    byName.set(normalizeText(item.name), entry)
  }
}

/** Exact lookup by readable id, DoorDash id or full name. */
export function findItem(key: string): CatalogItem | null {
  const trimmed = key.trim()
  return (
    byRef.get(trimmed.toLowerCase()) ??
    byId.get(trimmed) ??
    byName.get(normalizeText(trimmed.replace(/[-_]/g, " "))) ??
    null
  )
}

/**
 * Finds the item a tool call means. Exact ids and names win; otherwise the
 * search must have one clear winner, or the caller has to be asked.
 */
export function resolveItem(
  key: string
): { item: CatalogItem } | { candidates: CatalogItem[] } {
  const exact = findItem(key)
  if (exact) return { item: exact }
  const results = searchMenu(key.replace(/[-_]/g, " "), { limit: 3 })
  const [first, second] = results
  if (first && first.score >= 2.5 && (!second || first.score >= second.score * 1.5)) {
    return { item: first.item }
  }
  return { candidates: results.map((r) => r.item) }
}

// ---------------------------------------------------------------- add-ons

/** The dish's add-on groups from its popup, e.g. "Rice plate additions". All optional here. */
export function addOnGroups(item: CatalogItem): ItemOptionGroup[] {
  return itemOptions[item.id]?.groups.filter((g) => g.kind === "add_on") ?? []
}

function toAddOn(option: ItemOption): AddOn {
  return { id: option.id, name: option.name, priceCents: option.price.amount_cents ?? 0 }
}

/** "Add Veg Cha gio" -> "vegetarian cha gio", so spoken names can match. */
function addOnKey(name: string) {
  return normalizeText(name).replace(/^add /, "").replace(/\bveg\b/g, "vegetarian")
}

/**
 * Matches add-ons as the caller or model named them ("fried egg",
 * "Add Grilled Shrimp", or an option id) to the dish's add-ons, and checks
 * each group's limit.
 */
export function resolveAddOns(
  item: CatalogItem,
  requested: string[]
): { addOns: AddOn[] } | { error: string } {
  const groups = addOnGroups(item)
  const choices = groups.flatMap((group) =>
    group.options.map((option) => ({ group, option, key: addOnKey(option.name) }))
  )
  const picked: typeof choices = []
  for (const raw of requested) {
    const key = addOnKey(raw)
    if (!key) continue
    const exact = choices.find((c) => c.key === key || c.option.id === raw.trim())
    // Otherwise the closest name that contains the words, or is contained in them.
    const partial = choices
      .filter((c) => c.key.includes(key) || key.includes(c.key))
      .sort((a, b) => Math.abs(a.key.length - key.length) - Math.abs(b.key.length - key.length))[0]
    const match = exact ?? partial
    if (!match) {
      const names = choices.map((c) => c.option.name).join(", ")
      return {
        error: names
          ? `${item.name} has no add-on "${raw}". Its add-ons are: ${names}.`
          : `${item.name} has no add-ons. Put the request in the note instead.`,
      }
    }
    if (!picked.includes(match)) picked.push(match)
  }
  for (const group of groups) {
    const count = picked.filter((p) => p.group === group).length
    if (count > group.max_choices) {
      return { error: `${group.name}: at most ${group.max_choices} for ${item.name}.` }
    }
  }
  return { addOns: picked.map((p) => toAddOn(p.option)) }
}

/** Dishes the popup recommends with this one ("Recommended Beverages" and so on), in its order. */
export function recommendedWith(item: CatalogItem): CatalogItem[] {
  const found: CatalogItem[] = []
  for (const group of itemOptions[item.id]?.groups ?? []) {
    if (group.kind !== "upsell") continue
    for (const option of group.options) {
      const linked = option.item_id ? byId.get(option.item_id) : undefined
      if (linked && linked !== item && !found.includes(linked)) found.push(linked)
    }
  }
  return found
}

/** Add-on sets other customers ordered with this dish ("#1 • Ordered recently by 10+ others"). */
export function popularAddOns(item: CatalogItem) {
  const options = new Map(
    addOnGroups(item).flatMap((g) => g.options.map((o) => [o.id, o] as const))
  )
  return (itemOptions[item.id]?.popular_combinations ?? [])
    .map((combo) => ({
      label: combo.label,
      addOns: combo.option_ids
        .map((id) => options.get(id))
        .filter((o): o is ItemOption => o !== undefined)
        .map(toAddOn),
    }))
    .filter((combo) => combo.addOns.length > 0)
}

// ---------------------------------------------------------------- search

const STOP_WORDS = new Set(
  (
    "a an the and or with some of one ones i im id like want wanted please can " +
    "could get have has order ordering to for me my that this those these it " +
    "its thing things what whats do does you your any also just get got give " +
    "is are there their them they we our us"
  ).split(" ")
)

// Everyday words callers use for things the menu names differently.
const SYNONYMS: Record<string, string[]> = {
  sandwich: ["banh mi"],
  sub: ["banh mi"],
  noodle: ["vermicelli", "bun"],
  bowl: ["bun", "vermicelli"],
  beef: ["ribeye"],
  steak: ["ribeye"],
  fish: ["catfish"],
  prawn: ["shrimp"],
  veggie: ["vegetarian", "tofu"],
  vegan: ["vegetarian", "tofu"],
  spicy: ["chili", "jalapenos"],
  hot: ["chili"],
  drink: ["beverages"],
  soda: ["pepsi"],
  coke: ["pepsi"],
  cola: ["pepsi"],
  eggroll: ["cha gio"],
  appetizer: ["rolls", "salads"],
  starter: ["rolls", "salads"],
  sweet: ["dessert"],
  cake: ["dessert"],
}

function stem(token: string) {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
    ? token.slice(0, -1)
    : token
}

function tokenize(text: string) {
  return normalizeText(text).split(" ").filter(Boolean).map(stem)
}

type Field = { tokens: string[]; weight: number }

const searchIndex = catalog.map((item) => ({
  item,
  nameKey: normalizeText(item.name),
  fields: [
    { tokens: tokenize(item.name), weight: 3 },
    { tokens: tokenize(item.category.name), weight: 1.5 },
    {
      tokens: tokenize(
        `${item.description ?? ""} ${item.category.description ?? ""}`
      ),
      weight: 0.8,
    },
    { tokens: tokenize(item.labels.join(" ")), weight: 0.5 },
  ] satisfies Field[],
}))

function similarity(query: string, token: string) {
  if (query === token) return 1
  if (query.length >= 3 && token.startsWith(query)) return 0.8
  if (token.length >= 4 && query.startsWith(token)) return 0.7
  const shorter = Math.min(query.length, token.length)
  if (shorter >= 4) {
    const distance = editDistance(query, token)
    if (distance === 1) return 0.7
    if (distance === 2 && shorter >= 7) return 0.5
  }
  return 0
}

/** Each spoken word with its synonyms, e.g. "drinks" also tries "beverages". */
function expand(words: string[]) {
  return words.map((word) => [
    { token: word, weight: 1 },
    ...(SYNONYMS[word] ?? []).flatMap((s) =>
      tokenize(s).map((token) => ({ token, weight: 0.85 }))
    ),
  ])
}

function bestMatch(group: { token: string; weight: number }[], tokens: string[]) {
  let best = 0
  for (const { token, weight } of group) {
    for (const t of tokens) best = Math.max(best, similarity(token, t) * weight)
  }
  return best
}

function matchCategory(name: string): Category | null {
  const groups = expand(tokenize(name))
  let best: { category: Category; score: number } | null = null
  for (const category of menu.categories) {
    const tokens = tokenize(category.name)
    const score = groups.reduce((sum, group) => sum + bestMatch(group, tokens), 0)
    if (score > (best?.score ?? 0.6)) best = { category, score }
  }
  return best?.category ?? null
}

/**
 * Keyword search with fuzzy matching, e.g. "the spicy chicken one" finds
 * Chili-Lemongrass Chicken. Names count most, then category, then
 * description. Ties go to the more popular item.
 */
export function searchMenu(
  query: string,
  { category, limit = 5 }: { category?: string; limit?: number } = {}
) {
  const words = tokenize(query).filter((t) => !STOP_WORDS.has(t))
  const onlyCategory = category ? matchCategory(category) : null
  if (words.length === 0 && !onlyCategory) return []

  const groups = expand(words)
  const queryKey = normalizeText(query)

  const results: { item: CatalogItem; score: number }[] = []
  for (const doc of searchIndex) {
    if (onlyCategory && doc.item.category.id !== onlyCategory.id) continue
    let score = 0
    for (const group of groups) {
      let best = 0
      for (const field of doc.fields) {
        best = Math.max(best, bestMatch(group, field.tokens) * field.weight)
      }
      score += best
    }
    if (queryKey.includes(doc.nameKey)) score += 3
    else if (queryKey.length >= 4 && doc.nameKey.includes(queryKey)) score += 2
    // Name words the caller didn't say count a little against the item, so
    // "a coke" prefers Pepsi to Diet Pepsi.
    const [nameField] = doc.fields
    const unsaid = nameField.tokens.filter(
      (t) => !groups.some((group) => bestMatch(group, [t]) > 0)
    ).length
    score -= 0.1 * unsaid
    // A category filter with no other words lists the whole category.
    if (words.length === 0) score = 1
    if (score >= 0.8) results.push({ item: doc.item, score })
  }
  return results
    .sort(
      (a, b) => b.score - a.score || popularity(a.item) - popularity(b.item)
    )
    .slice(0, limit)
}

// ---------------------------------------------------------------- prompt

/**
 * One line per item, grouped by category in menu order. It goes into the
 * agent's instructions so it can answer "what do you have?" without a tool.
 */
export function menuForPrompt() {
  const lines: string[] = []
  for (const category of menu.categories) {
    lines.push(
      category.description
        ? `\n${category.name} (every item ${category.description})`
        : `\n${category.name}`
    )
    for (const id of category.item_ids) {
      const item = byId.get(id)!
      const addOns = addOnGroups(item)
        .flatMap((g) => g.options)
        .map((o) => `${o.name} ${o.price.display ?? "free"}`)
        .join(", ")
      lines.push(
        [
          `- ${item.ref}`,
          item.name,
          formatUsd(item.priceCents),
          item.description,
          item.labels.join(", "),
          addOns && `add-ons: ${addOns}`,
        ]
          .filter(Boolean)
          .join(" | ")
      )
    }
  }
  return lines.join("\n").trim()
}

// ---------------------------------------------------------------- suggestions

/** Lower is more popular: Most Ordered rank first, then like rate. */
function popularity(item: CatalogItem) {
  if (item.orderedRank !== null) return item.orderedRank
  return 100 + (100 - (item.likePercent ?? 0))
}

/** A reason to suggest the item, only from the data; null when there's none worth saying. */
function reasonFor(item: CatalogItem): string | null {
  const noun =
    item.role === "drink" ? "drink" : item.role === "dessert" ? "dessert" : "dish"
  const liked = item.labels.find((l) => /^#\d+ most liked$/i.test(l))
  if (liked) return `it's our ${liked.split(" ")[0]} most-liked ${noun}`
  if (item.orderedRank !== null) {
    return item.orderedRank < 3
      ? `it's our #${item.orderedRank + 1} most-ordered ${noun}`
      : `it's one of our most-ordered ${noun}s`
  }
  if (item.likePercent !== null && item.likePercent >= 90 && item.ratingCount >= 10) {
    return `${item.likePercent}% of the ${item.ratingCount} customers who rated it liked it`
  }
  return null
}

/** A suggestion before it's worded: a dish, or add-ons for one in the cart. */
export type SuggestionPick =
  | { kind: "dish"; item: CatalogItem; reason: string }
  | { kind: "add_on"; item: CatalogItem; addOns: AddOn[]; reason: string }

/** How a pick is remembered, so it's never offered twice. */
export function pickKey(pick: SuggestionPick) {
  return pick.kind === "dish" ? pick.item.id : `add-ons:${pick.item.id}`
}

/** "Add Fried Egg" -> "fried egg" */
export function spokenAddOn(name: string) {
  return name.replace(/^add\s+/i, "").toLowerCase()
}

function spokenList(words: string[]) {
  return words.length <= 1
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
}

/** "#1 • Ordered recently by 10+ others" -> "10+ other customers recently ordered it with ..." */
function comboReason(label: string, addOns: AddOn[]) {
  const who = label.match(/by ([\d+]+) others/i)?.[1]
  const names = spokenList(addOns.map((a) => spokenAddOn(a.name)))
  return who
    ? `${who} other customers recently ordered it with ${names}`
    : `customers often order it with ${names}`
}

function dishReason(item: CatalogItem, recommendedFor?: CatalogItem) {
  const popular = reasonFor(item)
  if (!recommendedFor) return popular
  const recommended = `it's recommended with the ${recommendedFor.name}`
  return popular ? `${recommended}, and ${popular}` : recommended
}

export function toSuggestion(pick: SuggestionPick, lineId?: string): Suggestion {
  if (pick.kind === "dish") {
    return {
      type: "dish",
      id: pick.item.ref,
      name: pick.item.name,
      price: formatUsd(pick.item.priceCents),
      reason: pick.reason,
    }
  }
  return {
    type: "add_on",
    line_id: lineId ?? "",
    add_ons: pick.addOns.map((a) => a.name),
    price: `+${formatUsd(pick.addOns.reduce((sum, a) => sum + a.priceCents, 0))}`,
    reason: pick.reason,
  }
}

export type SuggestionContext = "after_add" | "before_checkout"

/**
 * The one upsell worth making now, or null. Picks come from the dish's own
 * "Recommended ..." rows first, then from popularity.
 * After a main or starter is added: a drink if there's none yet, then the
 * add-ons other customers most often order with it, then a starter.
 * Before checkout: a drink, a dessert or a starter, whichever is missing.
 */
export function pickSuggestion({
  context,
  cart,
  exclude,
  added,
}: {
  context: SuggestionContext
  cart: { itemId: string; addOns?: AddOn[] }[]
  /** pickKey()s already offered. */
  exclude: Set<string>
  added?: CatalogItem
}): SuggestionPick | null {
  const cartIds = new Set(cart.map((line) => line.itemId))
  const cartHas = (role: ItemRole) =>
    catalog.some((item) => item.role === role && cartIds.has(item.id))
  const offerable = (item: CatalogItem) =>
    !cartIds.has(item.id) && !exclude.has(item.id)

  const dish = (role: ItemRole, from: CatalogItem[]): SuggestionPick | null => {
    for (const source of from) {
      const item = recommendedWith(source).find((r) => r.role === role && offerable(r))
      if (item) return { kind: "dish", item, reason: dishReason(item, source)! }
    }
    const best = catalog
      .filter((item) => item.role === role && offerable(item) && reasonFor(item))
      .sort((a, b) => popularity(a) - popularity(b))[0]
    return best ? { kind: "dish", item: best, reason: reasonFor(best)! } : null
  }

  if (context === "after_add") {
    if (!added || (added.role !== "main" && added.role !== "starter")) return null
    if (!cartHas("drink")) {
      const drink = dish("drink", [added])
      if (drink) return drink
    }
    const combo = popularAddOns(added)[0]
    const line = cart.find((l) => l.itemId === added.id)
    if (combo && line && !line.addOns?.length && !exclude.has(`add-ons:${added.id}`)) {
      return {
        kind: "add_on",
        item: added,
        addOns: combo.addOns,
        reason: comboReason(combo.label, combo.addOns),
      }
    }
    return added.role === "main" && !cartHas("starter") ? dish("starter", [added]) : null
  }

  const inCart = catalog.filter((item) => cartIds.has(item.id))
  for (const role of ["drink", "dessert", "starter"] as const) {
    if (!cartHas(role)) {
      const pick = dish(role, inCart)
      if (pick) return pick
    }
  }
  return null
}

/** For "what do you recommend?": the most popular dishes not in the cart. */
export function popularPicks(cartItemIds: Set<string>, count = 3): SuggestionPick[] {
  return catalog
    .filter((item) => !cartItemIds.has(item.id) && reasonFor(item) !== null)
    .sort((a, b) => popularity(a) - popularity(b))
    .slice(0, count)
    .map((item) => ({ kind: "dish", item, reason: reasonFor(item)! }))
}
