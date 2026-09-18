// Typed access to data/menu.json. The file's `_guide` section explains every
// field; the types below mirror it. Missing values are null, never "".
//
// No Next.js-only imports here, so the phone relay can reuse this module.

import fallbackImagesJson from "@/data/fallback-images.json"
import itemOptionsJson from "@/data/item-options.json"
import menuJson from "@/data/menu.json"

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

/** Ranges look like "11 AM - 2:15 PM"; an empty array means closed that day. */
export type WeeklyHours = Record<Weekday, string[]>

export type Price = {
  /** Integer in the smallest currency unit (1575 = 15.75). Use it for math. */
  amount_cents: number
  currency: string | null
  /** The price text exactly as DoorDash showed it. */
  display: string | null
}

export type ItemRating = {
  /** Share of raters who liked the item. */
  like_percent: number
  count: number
  display: string
}

export type MenuItem = {
  id: string
  name: string
  description: string | null
  category_id: string
  price: Price
  /** null when DoorDash has no photo; see data/fallback-images.json. */
  image_url: string | null
  rating: ItemRating | null
  /** DoorDash labels such as "#1 Most liked". */
  badges: string[]
  /**
   * false = the popup has add-on groups (all optional at this store). Popup
   * choices are in data/item-options.json.
   */
  quick_add_eligible: boolean
}

export type Category = {
  id: string
  name: string
  /** Often lists what comes with every item in the category. */
  description: string | null
  item_ids: string[]
}

/** Highlight rows (most_ordered, featured, most_liked), item ids in rank order. */
export type Collection = {
  id: string
  name: string
  description: string | null
  source: string
  item_ids: string[]
}

export type Review = {
  reviewer: string | null
  stars: number | null
  reviewed_at: string | null
  reaction: string | null
  text: string | null
  /** Phrases in `text` that name an item; in_this_menu=false means the id is not in `items`. */
  mentioned_items: { item_id: string; text: string; in_this_menu: boolean }[]
}

export type Restaurant = {
  id: string
  name: string
  cuisine: string | null
  tags: string[]
  price_range: string | null
  phone: string | null
  timezone: string | null
  currency: string | null
  address: {
    display: string | null
    street: string | null
    city: string | null
    state: string | null
    country: string | null
    lat: number
    lng: number
  }
  rating: {
    average: number
    count: number
    stars_breakdown: Partial<Record<"1" | "2" | "3" | "4" | "5", number>>
  }
  hours: {
    /** The restaurant's own hours. */
    store: WeeklyHours
    /** When DoorDash accepts orders. */
    doordash_ordering: WeeklyHours
  }
  services: Record<string, boolean | null>
  images: {
    cover: string | null
    cover_square: string | null
    header: string | null
    gallery: (string | null)[]
  }
  disclaimers: (string | null)[]
}

export type Menu = {
  source: {
    platform: string
    store_url: string | null
    saved_file: string
    extracted_on: string
    menu_extracted: { id: string; name: string | null }
    listings_seen: number
    unique_items: number
  }
  restaurant: Restaurant
  /** Every menu the store has; only the one with extracted=true has its items here. */
  menus: {
    id: string
    name: string | null
    hours: string | null
    extracted: boolean
  }[]
  categories: Category[]
  items: Record<string, MenuItem>
  collections: Collection[]
  reviews: Review[]
}

/** A Pexels stock photo for an item without a photo, from scripts/fill-images.ts. */
export type FallbackImage = {
  query: string
  url: string
  width: number
  height: number
  alt: string | null
  avg_color: string | null
  photographer: string
  photographer_url: string
  pexels_url: string
  fetched_on: string
}

/** One choice in an item popup group. Prices are pickup prices, as in menu.json. */
export type ItemOption = {
  id: string
  /** Set on upsell options: the menu item this option adds. */
  item_id: string | null
  name: string
  price: Price
  /** The option opens its own choices; for an upsell, itemOptions[item_id]. */
  has_sub_options: boolean
}

export type ItemOptionGroup = {
  id: string
  name: string
  /** add_on = extras for this dish; upsell = other menu items ("Recommended Beverages"). */
  kind: "add_on" | "upsell"
  /** 0 = optional. Each option can be picked at most once. */
  min_choices: number
  max_choices: number
  /** The popup's wording, e.g. "Select up to 3"; null when it shows none. */
  rule_text: string | null
  options: ItemOption[]
}

/** DoorDash's "Your recommended options": add-ons other customers ordered together. */
export type PopularCombination = {
  label: string
  /** Options in the same item's groups. */
  option_ids: string[]
  /** The item plus these options. */
  price: Price
}

/** An item's popup choices; see data/item-options.json `_about`. */
export type ItemOptions = {
  name: string
  /** In popup order. */
  groups: ItemOptionGroup[]
  popular_combinations: PopularCombination[]
  /** The popup's free-text field; null when it has none. */
  special_instructions: { max_length: number } | null
}

export const menu: Menu = checkReferences(menuJson)

/** Keyed by item id. */
export const fallbackImages: Record<string, FallbackImage> =
  fallbackImagesJson.items

/**
 * Keyed by item id. An item that is not here has unknown options, not none
 * (for example an item added to menu.json since the popups were captured).
 */
export const itemOptions: Record<string, ItemOptions> = checkItemOptions(
  // JSON imports widen `kind` to string; checkItemOptions verifies it.
  itemOptionsJson.items as Record<string, ItemOptions>
)

/**
 * Enforces the `_guide` rules the pages rely on, so a bad regeneration of
 * menu.json fails the build instead of rendering a broken menu.
 */
function checkReferences(data: Menu): Menu {
  const problems: string[] = []
  const homeCategory = new Map<string, string>()

  for (const category of data.categories) {
    for (const id of category.item_ids) {
      const item = data.items[id]
      if (!item) {
        problems.push(`category "${category.name}" lists unknown item ${id}`)
      } else if (item.category_id !== category.id) {
        problems.push(
          `item ${id} is in "${category.name}" but has category_id ${item.category_id}`
        )
      }
      if (homeCategory.has(id)) {
        problems.push(`item ${id} is in more than one category`)
      }
      homeCategory.set(id, category.id)
    }
  }
  for (const [id, item] of Object.entries(data.items)) {
    if (item.id !== id) problems.push(`items["${id}"] has id ${item.id}`)
    if (!homeCategory.has(id))
      problems.push(`item ${id} (${item.name}) is in no category`)
  }
  for (const collection of data.collections) {
    for (const id of collection.item_ids) {
      if (!data.items[id])
        problems.push(`collection "${collection.id}" lists unknown item ${id}`)
    }
  }
  for (const review of data.reviews) {
    for (const mention of review.mentioned_items) {
      if (mention.in_this_menu !== mention.item_id in data.items) {
        problems.push(
          `review mention ${mention.item_id} has a wrong in_this_menu flag`
        )
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `data/menu.json is inconsistent:\n- ${problems.join("\n- ")}`
    )
  }
  return data
}

/**
 * item-options.json comes from a separate capture, so it can drift from
 * menu.json: every item id it names must be in menu.json under the same name,
 * and every combination must point at the item's own options.
 */
function checkItemOptions(
  data: Record<string, ItemOptions>
): Record<string, ItemOptions> {
  const problems: string[] = []
  const checkId = (id: string, name: string, where: string) => {
    const item = menu.items[id]
    if (!item) problems.push(`${where}: unknown item ${id} (${name})`)
    else if (item.name !== name)
      problems.push(`${where}: item ${id} is "${item.name}", not "${name}"`)
  }

  for (const [id, entry] of Object.entries(data)) {
    checkId(id, entry.name, `items["${id}"]`)
    const optionIds = new Set<string>()
    for (const group of entry.groups) {
      const where = `${entry.name} / ${group.name}`
      if (group.kind !== "add_on" && group.kind !== "upsell")
        problems.push(`${where}: unknown kind "${group.kind}"`)
      if (group.max_choices < group.min_choices)
        problems.push(`${where}: max_choices is below min_choices`)
      for (const option of group.options) {
        optionIds.add(option.id)
        if (group.kind === "upsell") {
          if (option.item_id === null)
            problems.push(`${where}: upsell ${option.name} has no item_id`)
          else checkId(option.item_id, option.name, where)
        }
      }
    }
    for (const combo of entry.popular_combinations) {
      const unknown = combo.option_ids.filter((o) => !optionIds.has(o))
      if (unknown.length > 0)
        problems.push(
          `${entry.name} / ${combo.label}: unknown options ${unknown.join(", ")}`
        )
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `data/item-options.json is inconsistent:\n- ${problems.join("\n- ")}`
    )
  }
  return data
}
