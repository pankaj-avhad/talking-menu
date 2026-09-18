// Shapes menu.json into what the /menu page renders. Everything here is plain,
// serializable data, so client components can receive it as props.

import { formatRange, groupWeeklyHours } from "@/lib/hours"
import {
  fallbackImages,
  itemOptions,
  menu,
  type MenuItem,
  type Price,
  type Review,
} from "@/lib/menu"

export type PhotoCredit = {
  photographer: string
  photographerUrl: string
  photoUrl: string
}

export type ItemPhoto = { src: string; alt: string; credit: PhotoCredit | null }

export type MenuItemView = {
  id: string
  name: string
  description: string | null
  price: string
  rating: { likePercent: number; count: number } | null
  badges: string[]
  photo: ItemPhoto | null
  /** Extras from the item's popup (data/item-options.json), all optional here. */
  addOnGroups: AddOnGroupView[]
  /** Other menu items the popup recommends with this one, in its order. */
  goesWith: string[]
  /** Add-on sets other customers ordered recently ("Ordered recently by 10+ others"). */
  popularCombos: { label: string; addOns: string[]; price: string | null }[]
  /** The popup takes a free-text request, e.g. "no cilantro". */
  takesNote: boolean
  categoryId: string
  /** Highlight rows that include the item, with its rank in ranked rows. */
  highlights: { name: string; rank: number | null }[]
}

export type AddOnGroupView = {
  id: string
  name: string
  /** "Optional", "Optional, up to 3". */
  rule: string
  options: { id: string; name: string; price: string | null }[]
}

export type CategoryView = {
  id: string
  name: string
  description: string | null
  /** The part after "served with", when the description is a list of sides. */
  comesWith: string | null
  itemIds: string[]
}

export type HighlightView = {
  id: string
  name: string
  itemIds: string[]
  /** Ranked rows show #1, #2... on their cards. */
  ranked: boolean
}

export type ReviewView = {
  key: string
  reviewer: string
  initials: string
  stars: number | null
  reaction: string | null
  date: string | null
  dateTime: string | null
  /** The review text, with phrases that name an item on this menu split out. */
  parts: { text: string; itemId?: string }[]
}

// most_ordered keeps DoorDash's rank and most_liked is ordered by the
// "#N Most liked" badges; featured is display order only.
const RANKED_HIGHLIGHTS = new Set(["most_ordered", "most_liked"])

export function getMenuPage() {
  const { restaurant, source } = menu
  const timeZone = restaurant.timezone
  const extractedMenu = menu.menus.find((m) => m.extracted)

  const items: Record<string, MenuItemView> = {}
  for (const item of Object.values(menu.items)) {
    items[item.id] = toItemView(item)
  }

  const breakdown = ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    count: restaurant.rating.stars_breakdown[`${stars}`] ?? 0,
  }))

  const credits = new Map<string, PhotoCredit>()
  for (const item of Object.values(items)) {
    if (item.photo?.credit)
      credits.set(item.photo.credit.photographerUrl, item.photo.credit)
  }

  return {
    restaurant: {
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      priceRange: restaurant.price_range,
      tags: restaurant.tags,
      address: restaurant.address.display,
      mapsUrl: restaurant.address.display
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address.display)}`
        : null,
      phone: restaurant.phone
        ? {
            display: formatPhone(restaurant.phone),
            href: `tel:${restaurant.phone}`,
          }
        : null,
      timeZone,
      timeZoneName: timeZone ? timeZoneName(timeZone) : null,
      storeHours: restaurant.hours.store,
      hoursByDay: groupWeeklyHours(restaurant.hours.store).map((group) => ({
        days: plainDash(group.days),
        ranges: group.ranges.map(plainDash),
      })),
      rating: {
        average: restaurant.rating.average,
        count: restaurant.rating.count,
        breakdown,
      },
      headerImage: restaurant.images.header,
      logo: restaurant.images.cover_square,
      disclaimers: restaurant.disclaimers.filter(
        (d): d is string => d !== null
      ),
    },
    menuName: extractedMenu?.name ?? source.menu_extracted.name ?? "Menu",
    menuHours: extractedMenu?.hours
      ? plainDash(formatRange(extractedMenu.hours))
      : null,
    otherMenus: menu.menus
      .filter((m) => !m.extracted && m.name)
      .map((m) => m.name as string),
    categories: menu.categories.map((c): CategoryView => ({
      id: c.id,
      name: c.name,
      description: c.description && capitalize(c.description),
      comesWith: c.description?.match(/^served with (.+)$/i)?.[1] ?? null,
      itemIds: c.item_ids,
    })),
    highlights: menu.collections
      .filter((c) => c.item_ids.length > 0)
      .map((c): HighlightView => ({
        id: c.id,
        name: c.name,
        itemIds: c.item_ids,
        ranked: RANKED_HIGHLIGHTS.has(c.id),
      })),
    items,
    reviews: menu.reviews
      .filter((r) => r.text)
      .toSorted((a, b) =>
        (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? "")
      )
      .map((r, i) => toReviewView(r, i, timeZone)),
    photoCredits: [...credits.values()],
    source: {
      platform: source.platform,
      storeUrl: source.store_url,
      extractedOn: formatDate(`${source.extracted_on}T12:00:00Z`, "UTC"),
    },
  }
}

export type MenuPage = ReturnType<typeof getMenuPage>

function toItemView(item: MenuItem): MenuItemView {
  const fallback = fallbackImages[item.id]
  const photo: ItemPhoto | null = item.image_url
    ? { src: item.image_url, alt: item.name, credit: null }
    : fallback
      ? {
          src: fallback.url,
          alt: fallback.alt ?? item.name,
          credit: {
            photographer: fallback.photographer,
            photographerUrl: fallback.photographer_url,
            photoUrl: fallback.pexels_url,
          },
        }
      : null

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price:
      item.price.display ??
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: item.price.currency ?? menu.restaurant.currency ?? "USD",
      }).format(item.price.amount_cents / 100),
    rating: item.rating && {
      likePercent: item.rating.like_percent,
      count: item.rating.count,
    },
    badges: item.badges,
    photo,
    ...optionsView(item),
    categoryId: item.category_id,
    highlights: menu.collections.flatMap((c) => {
      const index = c.item_ids.indexOf(item.id)
      if (index < 0) return []
      return [
        { name: c.name, rank: RANKED_HIGHLIGHTS.has(c.id) ? index + 1 : null },
      ]
    }),
  }
}

/** The item's popup choices, from data/item-options.json. */
function optionsView(item: MenuItem) {
  const options = itemOptions[item.id]
  const groups = options?.groups ?? []
  const addOnGroups = groups
    .filter((g) => g.kind === "add_on")
    .map((g): AddOnGroupView => ({
      id: g.id,
      name: g.name,
      rule:
        g.min_choices > 0
          ? `Pick ${g.min_choices}${g.max_choices > g.min_choices ? ` to ${g.max_choices}` : ""}`
          : g.max_choices > 1
            ? `Optional, up to ${g.max_choices}`
            : "Optional",
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name.replace(/^Add\s+/i, ""),
        price: priceText(o.price),
      })),
    }))
  const goesWith = [
    ...new Set(
      groups
        .filter((g) => g.kind === "upsell")
        .flatMap((g) => g.options.map((o) => o.item_id))
        .filter(
          (id): id is string => !!id && id !== item.id && id in menu.items
        )
    ),
  ]
  const optionNames = new Map(
    groups.flatMap((g) =>
      g.options.map((o) => [o.id, o.name.replace(/^Add\s+/i, "")] as const)
    )
  )
  const popularCombos = (options?.popular_combinations ?? []).map((combo) => ({
    // "#1 • Ordered recently by 10+ others" -> "Ordered recently by 10+ others"
    label: combo.label.replace(/^#\d+\s*•\s*/, ""),
    addOns: combo.option_ids
      .map((id) => optionNames.get(id))
      .filter((n): n is string => !!n),
    price: combo.price.display,
  }))
  return {
    addOnGroups,
    goesWith,
    popularCombos: popularCombos.filter((c) => c.addOns.length > 0),
    takesNote: options?.special_instructions != null,
  }
}

/** "+$3.00"; null for free options. */
function priceText(price: Price) {
  if (!price.amount_cents) return null
  return price.display ?? `+$${(price.amount_cents / 100).toFixed(2)}`
}

/** Pages show ranges as "11 AM - 2:15 PM", with a plain hyphen. */
function plainDash(text: string) {
  return text.replace(/\s*–\s*/g, " - ")
}

function toReviewView(
  review: Review,
  index: number,
  timeZone: string | null
): ReviewView {
  const reviewer = review.reviewer ?? "DoorDash customer"
  return {
    key: `${review.reviewed_at ?? ""}-${index}`,
    reviewer,
    initials: reviewer
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    stars: review.stars,
    reaction: review.reaction,
    date: review.reviewed_at
      ? formatDate(review.reviewed_at, timeZone ?? "UTC")
      : null,
    dateTime: review.reviewed_at,
    parts: splitMentions(review.text ?? "", review.mentioned_items),
  }
}

/** Splits out the phrases that name an item on this menu, so they can link to it. */
function splitMentions(text: string, mentions: Review["mentioned_items"]) {
  const linkable = mentions.filter((m) => m.in_this_menu && m.text)
  if (linkable.length === 0) return [{ text }]

  const escaped = linkable.map((m) =>
    m.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  )
  const parts: ReviewView["parts"] = []
  let last = 0
  for (const match of text.matchAll(new RegExp(escaped.join("|"), "gi"))) {
    const mention = linkable.find(
      (m) => m.text.toLowerCase() === match[0].toLowerCase()
    )
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: match[0], itemId: mention?.item_id })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/** "+14159348889" -> "(415) 934-8889"; other formats are shown as stored. */
function formatPhone(phone: string) {
  const us = phone.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : phone
}

function formatDate(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone,
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/** "US/Pacific" -> "Pacific Time" */
function timeZoneName(timeZone: string) {
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "longGeneric",
      })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? null
    )
  } catch {
    return null
  }
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
