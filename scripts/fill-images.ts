// Finds a Pexels stock photo for every menu item that has no photo of its own
// (items[id].image_url is null in data/menu.json) and saves it, with the
// photographer credit Pexels asks for, to data/fallback-images.json.
// menu.json itself is never modified, so re-running the extractor is safe.
//
// Usage: npm run fill-images                     fill items that have no entry yet
//        npm run fill-images -- --force          refetch every entry
//        npm run fill-images -- --query <id>=<text>  refetch one item with your own search
// Needs PEXELS_API_KEY in .env.

import { readFile, writeFile } from "node:fs/promises"

import type { FallbackImage, Menu } from "../lib/menu"

const MENU_PATH = new URL("../data/menu.json", import.meta.url)
const OUTPUT_PATH = new URL("../data/fallback-images.json", import.meta.url)

type PexelsPhoto = {
  id: number
  width: number
  height: number
  url: string
  alt: string
  avg_color: string | null
  photographer: string
  photographer_url: string
  src: { landscape: string }
}

// Pexels' "landscape" size is a 1200x627 crop.
const LANDSCAPE = { width: 1200, height: 627 }

const apiKey = process.env.PEXELS_API_KEY
if (!apiKey) {
  console.error("PEXELS_API_KEY is not set. Add it to .env.")
  process.exit(1)
}

const args = process.argv.slice(2)
const force = args.includes("--force")
const queryOverrides = new Map(
  args
    .flatMap((arg, i) => (args[i - 1] === "--query" ? [arg] : []))
    .map((pair) => [
      pair.slice(0, pair.indexOf("=")),
      pair.slice(pair.indexOf("=") + 1),
    ])
)
const menu: Menu = JSON.parse(await readFile(MENU_PATH, "utf8"))
const existing = await readExisting()
const today = new Date().toISOString().slice(0, 10)
const images: Record<string, FallbackImage> = {}

for (const category of menu.categories) {
  for (const id of category.item_ids) {
    const item = menu.items[id]
    if (item.image_url) continue

    const override = queryOverrides.get(id)
    if (existing[id] && !force && !override) {
      images[id] = existing[id]
      continue
    }

    // Names that don't say what the item is get the category as context
    // ("Pepsi" alone finds a Pepsi billboard, "Pepsi Beverages" a can), while
    // "Xiu Mai Banh Mi" searches best as is. Broader queries are fallbacks.
    const categoryWords = category.name
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
    const nameSaysWhatItIs = categoryWords.some((w) =>
      item.name.toLowerCase().includes(w)
    )
    const queries = override
      ? [override]
      : [
          nameSaysWhatItIs ? item.name : `${item.name} ${category.name}`,
          item.name,
          `${menu.restaurant.cuisine ?? ""} food`.trim(),
        ]
    const found = await firstPhoto(queries)
    if (!found) {
      console.warn(`no photo found for ${item.name} (${id})`)
      continue
    }

    const { query, photo } = found
    images[id] = {
      query,
      url: photo.src.landscape,
      ...LANDSCAPE,
      alt: photo.alt || null,
      avg_color: photo.avg_color,
      photographer: photo.photographer,
      photographer_url: photo.photographer_url,
      pexels_url: photo.url,
      fetched_on: today,
    }
    console.log(
      `${item.name}: "${query}" -> ${photo.url} (by ${photo.photographer})`
    )
  }
}

await writeFile(
  OUTPUT_PATH,
  JSON.stringify(
    {
      _about:
        "Pexels stock photos for menu items whose image_url is null in menu.json, keyed by item id. Written by scripts/fill-images.ts. Show the photographer credit wherever a photo is used.",
      items: images,
    },
    null,
    2
  ) + "\n"
)
console.log(
  `Wrote ${Object.keys(images).length} photo(s) to data/fallback-images.json`
)

async function readExisting(): Promise<Record<string, FallbackImage>> {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf8")).items ?? {}
  } catch {
    return {}
  }
}

async function firstPhoto(queries: string[]) {
  for (const query of queries) {
    const url = new URL("https://api.pexels.com/v1/search")
    url.searchParams.set("query", query)
    url.searchParams.set("orientation", "landscape")
    url.searchParams.set("per_page", "1")

    const response = await fetch(url, { headers: { Authorization: apiKey! } })
    if (!response.ok) {
      throw new Error(
        `Pexels search "${query}" failed: ${response.status} ${await response.text()}`
      )
    }
    const { photos } = (await response.json()) as { photos: PexelsPhoto[] }
    if (photos.length > 0) return { query, photo: photos[0] }
  }
  return null
}
