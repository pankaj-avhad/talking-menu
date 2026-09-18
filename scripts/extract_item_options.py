#!/usr/bin/env python3
"""Turn captured DoorDash item popups into data/item-options.json.

Usage:
    python3 scripts/extract_item_options.py <item-pages.json> [menu.json] [output.json]

The saved store page does not have item options: DoorDash fetches each item's
popup from its GraphQL API (`/graphql/itemPage?operation=itemPage`) only when
the item is clicked. The input file is a capture of those responses, made in a
real browser because doordash.com answers non-browser requests with a
Cloudflare challenge:

    {"source": <store page url>,
     "items": [{"variables": <the request's variables>, "response": <the JSON reply>}, ...]}

Capture with Pickup selected on the store page. Pickup prices are the ones in
menu.json; Delivery prices are about 10% higher.
"""

import json
import sys
from datetime import date

GROUP_KINDS = {"extra_option": "add_on", "item": "upsell"}


def price(amount_cents, currency, display):
    return {"amount_cents": amount_cents, "currency": currency, "display": display or None}


def build(capture_path, menu_path):
    capture = json.load(open(capture_path, encoding="utf-8"))
    menu = json.load(open(menu_path, encoding="utf-8"))
    menu_items = menu["items"]

    pages = {}
    for entry in capture["items"]:
        fulfillment = entry["variables"].get("fulfillmentType")
        assert fulfillment == "Pickup", f"capture item {entry['variables']['itemId']} is {fulfillment}, not Pickup"
        assert not entry["response"].get("errors"), entry["response"]["errors"]
        page = entry["response"]["data"]["itemPage"]
        pages[page["itemHeader"]["id"]] = page

    missing = [i for i in menu_items if i not in pages]
    assert not missing, f"capture has no popup for menu items {missing}"

    items = {}
    for item_id, item in menu_items.items():  # menu.json order
        page = pages[item_id]
        header = page["itemHeader"]
        assert header["unitAmount"] == item["price"]["amount_cents"], (
            f"{item['name']}: popup price {header['unitAmount']} != menu.json {item['price']['amount_cents']}"
        )

        groups = []
        for option_list in page["optionLists"]:
            kind = GROUP_KINDS[option_list["type"]]
            options = []
            for o in option_list["options"]:
                # Upsell options are other menu items and share their id.
                linked = o["id"] if kind == "upsell" else None
                if linked:
                    assert linked in menu_items, f"{item['name']}: upsell {o['name']} ({linked}) is not in menu.json"
                assert o.get("minOptionChoiceQuantity") is None and o.get("maxOptionChoiceQuantity") is None, (
                    f"{item['name']}: option {o['name']} has a quantity picker, which this file cannot express"
                )
                options.append({
                    "id": o["id"],
                    "item_id": linked,
                    "name": o["name"].strip(),
                    "price": price(o["unitAmount"], o["currency"], o["displayString"]),
                    "has_sub_options": bool(o.get("nextCursor")),
                })
            dd_max = option_list["maxNumOptions"]
            groups.append({
                "id": option_list["id"],
                "name": option_list["name"].strip(),
                "kind": kind,
                "min_choices": option_list["minNumOptions"] or 0,
                # DoorDash's 0 means no limit; each option can be picked once.
                "max_choices": min(dd_max, len(options)) if dd_max else len(options),
                "rule_text": option_list["subtitle"] or None,
                "options": options,
            })

        option_ids = {o["id"] for g in groups for o in g["options"]}
        combos = []
        for carousel in page.get("presetCarousels") or []:
            for preset in carousel.get("presets") or []:
                nodes = [n for n in preset["flattenedDefaultNodes"] if n.get("__typename") == "DefaultOption"]
                picked = [n["id"] for n in nodes]
                assert set(picked) <= option_ids, f"{item['name']}: preset {preset['name']} names unknown options"
                total = header["unitAmount"] + sum(n["unitAmount"] * (n.get("selectedQuantity") or 1) for n in nodes)
                assert preset.get("displayPrice") == f"${total / 100:,.2f}", (item["name"], preset.get("displayPrice"), total)
                combos.append({
                    "label": preset["name"].strip(),
                    "option_ids": picked,
                    "price": price(total, header["currency"], preset["displayPrice"]),
                })

        instructions = (page.get("itemPreferences") or {}).get("specialInstructions") or {}
        items[item_id] = {
            "name": item["name"],
            "groups": groups,
            "popular_combinations": combos,
            "special_instructions": (
                {"max_length": instructions.get("characterMaxLength") or header.get("specialInstructionsMaxLength")}
                if instructions.get("isEnabled") else None
            ),
        }

    check_quick_add(menu_items, items)
    return {
        "_about": ABOUT,
        "source": {
            "platform": "DoorDash",
            "store_url": capture.get("source"),
            "captured_file": capture_path.rsplit("/", 1)[-1],
            "fulfillment": "pickup",
            "extracted_on": date.today().isoformat(),
        },
        "items": items,
    }


def check_quick_add(menu_items, items):
    """menu.json's _guide says quick_add_eligible=false means the popup has add-on groups."""
    for item_id, entry in items.items():
        has_add_ons = any(g["kind"] == "add_on" for g in entry["groups"])
        assert menu_items[item_id]["quick_add_eligible"] == (not has_add_ons), (
            f"{entry['name']}: quick_add_eligible={menu_items[item_id]['quick_add_eligible']} "
            f"but add-on groups={has_add_ons}; update menu.json's _guide"
        )


ABOUT = {
    "what_this_is": (
        "The choices in each DoorDash item popup, keyed by menu item id (the ids in menu.json). "
        "menu.json does not have them because DoorDash loads them only when an item is clicked. "
        "Written by scripts/extract_item_options.py from a browser capture of those popups."
    ),
    "prices": "Pickup prices, the same as menu.json. price.display is the popup's text, e.g. '+$3.00'.",
    "groups": (
        "In popup order. kind 'add_on' = extras for this dish (for example Add Fried Egg, Brown Rice, "
        "Vegetarian). kind 'upsell' = other menu items offered with this one ('Recommended Beverages'); "
        "each such option has item_id set and costs the same as ordering that item on its own."
    ),
    "choices": (
        "Pick between min_choices and max_choices options from a group, each option at most once. "
        "min_choices 0 = optional. rule_text is the popup's own wording ('Select up to 3'), null when "
        "it shows none."
    ),
    "has_sub_options": (
        "The option opens its own choices. For an upsell option those are the linked item's groups "
        "here (items[item_id])."
    ),
    "popular_combinations": (
        "DoorDash's 'Your recommended options': add-on sets other customers ordered recently. "
        "option_ids point at options in this item's groups; price.display is the total with them."
    ),
    "special_instructions": "Free-text field on the popup, with its max length. null when the popup has none.",
    "not_included": [
        "Delivery prices (about 10% higher).",
        "DoorDash's 'If item is unavailable' setting, which is a DoorDash feature, not a restaurant option.",
    ],
}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    menu_path = sys.argv[2] if len(sys.argv) > 2 else "data/menu.json"
    out_path = sys.argv[3] if len(sys.argv) > 3 else "data/item-options.json"
    data = build(sys.argv[1], menu_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    items = data["items"].values()
    print(f"Wrote {out_path}: {len(data['items'])} items, "
          f"{sum(len(i['groups']) for i in items)} option groups, "
          f"{sum(len(i['popular_combinations']) for i in items)} popular combinations")


if __name__ == "__main__":
    main()
