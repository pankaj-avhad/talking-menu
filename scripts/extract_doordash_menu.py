#!/usr/bin/env python3
"""Extract a clean, deduplicated menu JSON from a saved DoorDash store page.

Usage:
    python3 scripts/extract_doordash_menu.py <saved_page.html> [output.json]

DoorDash renders only a few menu cards into the DOM (the list is virtualized),
so the visible HTML is incomplete. The full store data lives in the Next.js
React Server Components payload (`self.__next_f.push([1, "..."])` scripts) as an
Apollo cache entry named `storepageFeed`. This script decodes that payload,
cross-checks it against the schema.org JSON-LD menu, and writes one JSON file
where every item is stored once and every list refers to items by id.
"""

import json
import re
import sys
from datetime import date
from html import unescape

DOORDASH_ORIGIN = "https://www.doordash.com"


# ---------------------------------------------------------------- decoding ---

def read_rsc_rows(html):
    """Join the RSC chunks and split them into {row_id: value} rows."""
    chunks = re.findall(r'self\.__next_f\.push\(\[1,(".*?")\]\)</script>', html, re.S)
    payload = "".join(json.loads(c) for c in chunks).encode("utf-8")
    rows, i = {}, 0
    while i < len(payload):
        m = re.match(rb"([0-9a-f]*):", payload[i:i + 20])
        if not m:
            break
        key = m.group(1).decode()
        i += m.end()
        if payload[i:i + 1] == b"T":  # text row: T<hex byte length>,<text>
            comma = payload.index(b",", i)
            length = int(payload[i + 1:comma], 16)
            rows[key] = ("text", payload[comma + 1:comma + 1 + length].decode("utf-8", "replace"))
            i = comma + 1 + length
        else:  # JSON row, newline terminated
            end = payload.index(b"\n", i)
            rows[key] = ("json", payload[i:end].decode("utf-8"))
            i = end + 1
    return rows


def find_key(obj, key):
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        children = obj.values()
    elif isinstance(obj, list):
        children = obj
    else:
        return None
    for child in children:
        found = find_key(child, key)
        if found is not None:
            return found
    return None


def load_store_feed(html):
    rows = read_rsc_rows(html)
    for kind, value in rows.values():
        if kind == "json" and '"storepageFeed"' in value:
            return find_key(json.loads(value), "storepageFeed"), rows
    sys.exit("storepageFeed not found: is this a saved DoorDash store page?")


def load_json_ld(html):
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    return {d.get("@type"): d for d in (json.loads(b) for b in blocks) if isinstance(d, dict)}


def rsc_string(value, rows):
    """Undo RSC string encoding: '$$x' -> '$x', '$<row>' -> that text row."""
    if not isinstance(value, str):
        return value
    if value == "$undefined":
        return None
    if value.startswith("$$"):
        return value[1:]
    ref = re.fullmatch(r"\$([0-9a-f]+)", value)
    if ref and rows.get(ref.group(1), ("",))[0] == "text":
        # DoorDash pads some text rows with empty markdown links between letters.
        return re.sub(r"\[\]\(https://doordash\.com\)", "", rows[ref.group(1)][1])
    return value


def clean(value, rows):
    """RSC-decode, normalize whitespace, and turn empty strings into None."""
    value = rsc_string(value, rows)
    if not isinstance(value, str):
        return value
    value = unescape(value).replace(" ", " ").replace("​", "").strip()
    return value or None


# ------------------------------------------------------------------ fields ---

def parse_item_rating(display):
    """'96% (75)' -> {'like_percent': 96, 'count': 75, 'display': '96% (75)'}."""
    m = re.fullmatch(r"(\d+)% \((\d+)\)", display or "")
    if not m:
        return None
    return {"like_percent": int(m.group(1)), "count": int(m.group(2)), "display": display}


def logging_fields(item):
    return {k: v["stringValue"] for k, v in item.get("logging", {}).get("fieldsMap", [])}


def schedule(info):
    return {d["dayOfWeek"].lower(): d.get("timeSlotList") or [] for d in info["operationSchedule"]}


STAR_KEYS = {"ONE": "1", "TWO": "2", "THREE": "3", "FOUR": "4", "FIVE": "5"}


# ------------------------------------------------------------------- build ---

def build(html_path):
    html = open(html_path, encoding="utf-8").read()
    feed, rows = load_store_feed(html)
    ld = load_json_ld(html)
    c = lambda v: clean(v, rows)

    header, mx, book = feed["storeHeader"], feed["mxInfo"], feed["menuBook"]
    currency = header.get("currency")

    # Items: one entry per DoorDash item id, however many lists show it.
    items, listings = {}, 0
    for item_list in feed["itemLists"]:
        for it in item_list["items"]:
            listings += 1
            if it["id"] in items:
                continue
            price = it["quickAddContext"]["price"]
            badges = [c(b["badge"]["text"]) for b in it.get("badges") or []]
            items[it["id"]] = {
                "id": it["id"],
                "name": c(it["name"]),
                "description": c(it["description"]),
                "category_id": logging_fields(it).get("category_id"),
                "price": {
                    "amount_cents": price["unitAmount"],
                    "currency": price.get("currency") or currency,
                    "display": c(it["displayPrice"]),
                },
                "image_url": c(it.get("imageUrl")),
                "rating": parse_item_rating(c(it.get("ratingDisplayString"))),
                "badges": badges,
                "quick_add_eligible": it["quickAddContext"]["isEligible"],
            }

    # Real categories (the item's home category); "Most Ordered" is a collection.
    categories = []
    for item_list in feed["itemLists"]:
        cat_id = item_list["id"].removeprefix("category-")
        if cat_id == "popular-items":
            continue
        categories.append({
            "id": cat_id,
            "name": c(item_list["name"]),
            "description": c(item_list.get("description")),
            "item_ids": [it["id"] for it in item_list["items"]],
        })

    most_ordered = next(l for l in feed["itemLists"] if l["id"] == "popular-items")
    collections = [{
        "id": "most_ordered",
        "name": c(most_ordered["name"]),
        "description": c(most_ordered.get("description")),
        "source": "DoorDash 'Most Ordered' section, in DoorDash's rank order",
        "item_ids": [it["id"] for it in most_ordered["items"]],
    }]
    for carousel in feed.get("carousels") or []:
        collections.append({
            "id": "featured" if carousel["id"] == "recommended_items_for_you" else carousel["id"],
            "name": c(carousel["name"]),
            "description": c(carousel.get("description")),
            "source": f"DoorDash '{c(carousel['name'])}' carousel ({carousel['id']}), in display order",
            "item_ids": [it["id"] for it in carousel["items"] if it["id"] in items],
        })
        listings += len(carousel["items"])
    ranked = sorted(
        (int(m.group(1)), item_id)
        for item_id, item in items.items() for b in item["badges"]
        if (m := re.fullmatch(r"#(\d+) Most liked", b))
    )
    if ranked:
        collections.append({
            "id": "most_liked",
            "name": "Most Liked",
            "description": None,
            "source": "Derived from the '#N Most liked' item badges, ordered by N",
            "item_ids": [item_id for _, item_id in ranked],
        })

    # Reviews: tagged item mentions become item-id cross-references.
    review_data = (feed.get("reviewPreview") or {}).get("consumerReviewData") or {}
    reviews = []
    for r in review_data.get("consumerReviews") or []:
        marked = r.get("markedUpReviewText") or ""
        mentions = [
            {"item_id": item_id, "text": text, "in_this_menu": item_id in items}
            for item_id, text in re.findall(r"<<taggedItemId=(\d+)>>(.*?)<</taggedItemId>>", marked)
        ]
        reviews.append({
            "reviewer": c(r.get("reviewerDisplayName")),
            "stars": r.get("starRating"),
            "reviewed_at": r.get("reviewedAt"),
            "reaction": c((r.get("ratingTag") or {}).get("ratingTitle")),
            "text": c(r.get("reviewText")),
            "mentioned_items": mentions,
        })

    breadcrumb = ld.get("BreadcrumbList", {}).get("itemListElement", [])
    store_path = breadcrumb[-1]["item"] if breadcrumb else None
    ops = mx["operationInfo"]
    address = header["address"]

    restaurant = {
        "id": header["id"],
        "name": c(header["name"]),
        "cuisine": c(header.get("description")),
        "tags": [c(t["name"]) for t in header.get("businessTags") or []],
        "price_range": c(header.get("priceRangeDisplayString")),
        "phone": mx.get("phoneno"),
        "timezone": header.get("timezone"),
        "currency": currency,
        "address": {
            "display": c(address.get("displayAddress")),
            "street": c(address.get("street")),
            "city": c(address.get("city")),
            "state": c(address.get("state")),
            "country": c(address.get("countryShortname")),
            "lat": float(address["lat"]),
            "lng": float(address["lng"]),
        },
        "rating": {
            "average": header["ratings"]["averageRating"],
            "count": header["ratings"]["numRatings"],
            "stars_breakdown": {
                STAR_KEYS[s["starsRating"].split("_")[0]]: s["ratingCount"]
                for s in review_data.get("starsRatingCount") or []
            },
        },
        "hours": {
            "store": schedule(ops["storeOperationHourInfo"]),
            "doordash_ordering": schedule(ops["doordashOperationHourInfo"]),
        },
        "services": {
            "delivery": header.get("offersDelivery"),
            "pickup": header.get("offersPickup"),
            "group_order": header.get("offersGroupOrder"),
            "scheduling": header.get("offersScheduling"),
            "dashpass": header.get("isDashpassPartner"),
        },
        "images": {
            "cover": c(header.get("coverImgUrl")),
            "cover_square": c(header.get("coverSquareImgUrl")),
            "header": c(header.get("businessHeaderImgUrl")),
            "gallery": [c(i["url"]) for i in header.get("additionalHeaderImages") or []],
        },
        "disclaimers": [c(d["text"]) for d in feed.get("disclaimersList") or []],
    }

    menus = [{
        "id": m["id"],
        "name": c(m["name"]),
        "hours": c(m.get("displayOpenHours")),
        "extracted": m["id"] == book["id"],
    } for m in book.get("menuList") or [{"id": book["id"], "name": book["name"],
                                         "displayOpenHours": book.get("displayOpenHours")}]]

    source = {
        "platform": "DoorDash",
        "store_url": DOORDASH_ORIGIN + store_path if store_path else None,
        "saved_file": html_path.rsplit("/", 1)[-1],
        "extracted_on": date.today().isoformat(),
        "menu_extracted": {"id": book["id"], "name": c(book["name"])},
        "listings_seen": listings,
        "unique_items": len(items),
    }

    check_against_json_ld(ld, items)
    check_references(items, categories, collections)

    return {
        "_guide": GUIDE,
        "source": source,
        "restaurant": restaurant,
        "menus": menus,
        "categories": categories,
        "items": items,
        "collections": collections,
        "reviews": reviews,
    }


def check_against_json_ld(ld, items):
    """The page's schema.org menu must agree with the decoded data on name and price."""
    sections = ld.get("Restaurant", {}).get("hasMenu", {}).get("hasMenuSection", [])
    flat = [s for group in sections for s in (group if isinstance(group, list) else [group])]
    by_name = {i["name"]: i for i in items.values()}
    for section in flat:
        for entry in section["hasMenuItem"]:
            item = by_name.get(entry["name"].strip())
            assert item, f"JSON-LD item missing from decoded data: {entry['name']!r}"
            assert item["price"]["display"] == entry["offers"]["price"], (entry["name"], entry["offers"]["price"])


def check_references(items, categories, collections):
    for group in categories + collections:
        missing = [i for i in group["item_ids"] if i not in items]
        assert not missing, f"{group['id']} references unknown items {missing}"
    homed = {i for cat in categories for i in cat["item_ids"]}
    assert homed == set(items), "every item must belong to exactly one category"
    for item in items.values():
        assert item["id"] in next(c["item_ids"] for c in categories if c["id"] == item["category_id"])


# ------------------------------------------------------------------- guide ---

GUIDE = {
    "what_this_is": (
        "Menu data for one restaurant, extracted from a saved DoorDash store page. Each menu item "
        "is stored exactly once in `items`; every other section refers to items by id."
    ),
    "how_to_read": [
        "Look up any item with items[<item_id>]. Item ids are DoorDash's ids, always strings.",
        "Build the menu page: loop over `categories` in array order, and for each id in "
        "category.item_ids read items[id]. That order matches DoorDash's menu.",
        "Each item lives in exactly one category (item.category_id). Categories do not overlap.",
        "Highlight rows (Most Ordered, Featured, Most Liked) are in `collections`. They reuse the "
        "same item ids as the categories, so the same item appears in several collections "
        "without being copied.",
        "Find where an item appears: check category_id plus every collection whose item_ids "
        "contains the id.",
    ],
    "sections": {
        "source": "Where and when the data came from, and dedupe stats (listings_seen vs unique_items).",
        "restaurant": "Store details: name, cuisine, tags, address with lat/lng, phone, rating with "
                      "a 1-5 star breakdown, weekly hours, services offered, images, disclaimers.",
        "menus": "Every menu the store has. extracted=true marks the one whose items are in this "
                 "file. The others were not loaded on the saved page, so their items are missing.",
        "categories": "Ordered array of {id, name, description, item_ids}. The category description "
                      "often lists what comes with every item in it (e.g. banh mi toppings).",
        "items": "Object keyed by item id: {id, name, description, category_id, price, image_url, "
                 "rating, badges, quick_add_eligible}.",
        "collections": "Ordered array of {id, name, description, source, item_ids}, rank order kept. "
                       "ids: most_ordered, featured, most_liked.",
        "reviews": "Public customer reviews shown on the page. mentioned_items links a phrase in the "
                   "review to an item id. in_this_menu=false means the id is not in `items` "
                   "(probably an item from another menu or an old version of the item).",
    },
    "field_notes": {
        "price.amount_cents": "Integer in the smallest currency unit (1575 = 15.75). Use it for math.",
        "price.display": "The price text exactly as DoorDash showed it.",
        "image_url": "null when DoorDash has no photo for the item.",
        "rating": "null when the item has no ratings. like_percent = share of raters who liked it; "
                  "count = number of ratings. display is DoorDash's original text.",
        "badges": "DoorDash labels such as '#1 Most liked'. Empty array when none.",
        "quick_add_eligible": "DoorDash's flag for adding the item to the cart in one tap. false means the "
                              "item popup has add-on groups (for example Add Fried Egg, Brown Rice, "
                              "Vegetarian); at this store all of them are optional. 'Recommended ...' "
                              "upsell groups do not affect it. The choices are in "
                              "data/item-options.json, not in this file.",
        "hours": "Keys are lowercase weekdays; an empty array means closed that day. `store` = the "
                 "restaurant's own hours, `doordash_ordering` = when DoorDash accepts orders.",
        "nulls": "Missing values are null, never empty strings.",
    },
    "not_included": [
        "Item options, add-ons and modifiers: DoorDash only loads them when an item popup is opened, "
        "so the saved store page does not have them. They are in data/item-options.json, written by "
        "scripts/extract_item_options.py from a browser capture of the popups.",
        "Per-item 'goes well with' recommendations: the store page has none, but item popups offer "
        "'Recommended ...' groups of other menu items. data/item-options.json has them as groups "
        "with kind 'upsell'. For other suggestions, use `collections` and other items in the same "
        "category.",
        "Items from menus with extracted=false.",
        "Viewer-specific data: delivery ETA, distance, fees, promos, and cart state.",
    ],
}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out_path = sys.argv[2] if len(sys.argv) > 2 else "data/menu.json"
    data = build(sys.argv[1])
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    s = data["source"]
    print(f"Wrote {out_path}: {len(data['categories'])} categories, {s['unique_items']} unique items "
          f"(from {s['listings_seen']} listings), {len(data['collections'])} collections, "
          f"{len(data['reviews'])} reviews")


if __name__ == "__main__":
    main()
