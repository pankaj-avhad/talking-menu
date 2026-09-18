# Talking Menu

A caller phones one restaurant and orders from its real menu by talking to an AI
host. This repo has the Next.js web app (App Router, shadcn/ui, Tailwind v4)
that will run on Vercel, and the voice relay that connects callers to the AI
(Boson Higgs Realtime). Milestones 1 and 2 of the PRD are done:

- **`/menu`**: the restaurant's menu, built from `data/menu.json`. It has
  highlight rows (Most Ordered, Featured, Most Liked), every category in
  DoorDash's order, item details, search, opening hours, and reviews.
  `/` redirects here. The page is static.
- **`/call`**: talk to the AI host from the browser, as on a phone call. It
  takes your name, remembers returning callers, takes the order with add-ons,
  suggests pairings, reads back the total, takes the address and places the
  order. The transcript and cart fill in live. Needs the relay (below).
- **`/orders/[id]`**: the check a caller pays from, with a mock Pay button
  (no card is charged).

## Run it

```bash
npm install
npm run dev        # the web app, http://localhost:3000 (or the next free port)
npm run relay      # the voice relay, ws://localhost:8787; needs BOSON_API_KEY in .env
npm run dev:all    # both at once (relay:dev restarts on file changes)
```

Open `/call`, press **Start call** and allow the microphone. Headphones stop
the host hearing itself through your speakers.

```bash
npm run build      # what Vercel runs; fails if menu.json has broken references
npm run lint
npm run typecheck
npm test           # unit tests: search, cart, add-ons, names, the agent's tools
npm run simulate-call -- order   # a whole call with a simulated caller (macOS)
```

`simulate-call` joins the relay like the call page does. A second Boson session
plays the caller from a short persona, and macOS text-to-speech speaks its lines
into the call. The scenarios are `order`, `addons`, `returning`, `handoff` and
`interrupt`. Each call costs a few cents of Boson credit.

## How a call works

```
browser mic (24 kHz PCM) ⇄ relay (relay/, Node + ws) ⇄ Boson Higgs Realtime
                              │ tools, transcript
                              ▼
                     .data/ (calls, customers, orders) ◀── Next.js pages
```

- **`relay/server.ts`**: accepts calls on `/browser`. Only pages on
  `localhost` may connect unless `RELAY_ALLOWED_ORIGINS` says otherwise, because
  every call is a paid Boson session.
- **`relay/call-session.ts`**: one call. It passes audio through untouched and
  tracks what the caller has actually heard (marks), so a caller who talks over
  the host cuts it off and the transcript keeps only the part they heard. It
  runs the tools, keeps the transcript, nudges a silent caller, and hangs up or
  hands off once the host's last line has played. The browser speaks the same
  media, mark, clear and stop messages as Twilio Media Streams, so a phone line
  can plug into the same session later.
- **`relay/tools.ts`**: the 13 tools from the PRD. The model talks; the tools
  own every price, cart change and customer lookup.
- **`relay/prompt.ts`**: the host's instructions, with the whole menu,
  add-ons included.
- **`lib/catalog.ts`**: search that tolerates speech-to-text slips, add-on
  matching, and suggestions. Suggestions come only from the data: each dish's
  "Recommended …" rows and popular add-on sets (`data/item-options.json`), then
  popularity labels. The limit is two per call, and none after a no.
- **`lib/store.ts`**: customers, calls (with transcripts) and orders as JSON
  files in `.data/` (gitignored), shared by the relay and the web app. Set
  `DATA_DIR` to put them elsewhere.

What testing showed, and what the code does about it:

- **Names:** the model sometimes mishears names that Boson's speech-to-text gets
  right ("Priya" heard as "Tri"). `identify_customer` checks the name against
  the transcript and uses the transcript's spelling. Close spellings count as
  the same caller.
- **Acting without tools:** the model sometimes says it added a dish or placed
  the order without calling the tool. `place_order` hands over the exact
  read-back first unless the host has already said the right total. A reply
  that claims an action the cart doesn't show gets a correction note. A goodbye
  after the order is placed ends the call even if `end_call` wasn't called.
- **Turn-taking:** `server_vad` is the default. `semantic_vad`, the PRD's first
  choice, ends turns after 100 ms and split sentences in two.

## Settings (`.env`)

| Variable | What it does |
|---|---|
| `BOSON_API_KEY` | Needed by the relay. |
| `STAFF_PHONE_NUMBER` | The restaurant's own line, for hand-offs once calls come in over Twilio. Browser calls only show its last four digits. |
| `AGENT_VOICE` | `chloe` (default), `eleanor`, `nora`, `jake`, `marcus`, `oliver` or `default`. |
| `AGENT_TURN_DETECTION`, `AGENT_SILENCE_MS` | `server_vad` (default) and the pause that ends a caller's turn (500 ms). |
| `DELIVERY_FEE_CENTS` | Added to every order; 0 by default, because the menu page has no fee. |
| `PUBLIC_APP_URL` | Where order links point. Browser calls default to the page that opened them. |
| `RELAY_PORT`, `RELAY_ALLOWED_ORIGINS`, `MAX_BROWSER_CALLS`, `MAX_CALL_MINUTES` | Relay limits; see `.env.example`. |
| `NEXT_PUBLIC_RELAY_URL` | Where `/call` finds the relay, read at build time. Default `ws://localhost:8787/browser`. |

Known limits:

- Boson's turn detection sometimes ends a long sentence early. It happened with
  synthetic speech even with no pause in the audio ("I'd like to order the…"),
  and speech during the first moment of the host's reply is lost. Raising
  `AGENT_SILENCE_MS` didn't help in testing. The host usually asks again.
- Browser calls aren't recorded as audio; the transcript is the record.

## Data

| File | What it is |
|---|---|
| `data/menu.json` | The menu, extracted from a saved DoorDash page by `scripts/extract_doordash_menu.py`. Read its `_guide` section first. |
| `data/fallback-images.json` | Pexels stock photos for items that have no photo (`image_url: null`), with photographer credits. Written by `npm run fill-images`. |
| `data/item-options.json` | Choices from each DoorDash item popup (add-ons, "Recommended …" upsells, limits, popular combinations, special instructions), which the saved store page does not have. Written by `scripts/extract_item_options.py`. Read its `_about` first. |

`lib/menu.ts` holds the typed data and checks the `_guide` rules when the app
loads. For example, it checks that every item is in exactly one category and
that every collection points at real items. `lib/menu-view.ts` shapes that data
for the page. Neither file imports anything specific to Next.js, so the phone
relay can reuse them later.

To refresh the menu, re-run the extractor. It rewrites `menu.json` only. Then fill
photos for any new items that have none:

```bash
python3 scripts/extract_doordash_menu.py "<saved page>.html" data/menu.json
npm run fill-images                               # needs PEXELS_API_KEY in .env
npm run fill-images -- --query <itemId>="pepsi can"   # retry one item with your own search
```

Item options need a second capture, because DoorDash only loads an item's
options when its popup opens, and doordash.com blocks non-browser requests. In
a browser, with **Pickup** selected on the store page (`menu.json` has pickup
prices), open every item and record each `/graphql/itemPage` response as
`{"items": [{"variables", "response"}]}`. Then:

```bash
python3 scripts/extract_item_options.py "<item pages>.json"   # checks prices and ids against menu.json
```

## Deploy to Vercel

Import the repo in Vercel, or run `vercel` in this folder. The framework preset
is Next.js. Images come from DoorDash's CDN (`img.cdn4dd.com`) and Pexels, and
they are resized by Vercel's image optimization. Both hosts are allowed in
`next.config.ts`. `.vercelignore` keeps `.env` and `.data` out of CLI uploads.

`/menu` works on Vercel as it is. Calls need two more things:

- **An always-on host for the relay** (Railway, Render, Fly.io, or this
  machine behind ngrok). Vercel functions can't hold the call's WebSockets.
  Then set `NEXT_PUBLIC_RELAY_URL` to its `wss://` address.
- **A database behind `lib/store.ts`**. Vercel's file system is read-only, so
  orders and calls can't be JSON files there. The PRD picks Upstash Redis or
  Neon from the Vercel Marketplace.

## Next: phone calls (PRD milestones 3 and 4)

Needed first:

- A Twilio account (upgraded from trial), a US number with Voice and SMS, and
  `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`.
- A public URL for the relay (ngrok is installed here).

The browser already speaks Twilio's Media Streams messages to the relay, so the
phone line is a second endpoint on the same `CallSession` using `audio/pcmu`.
After that come a voice webhook, recording, the SMS link, and the hand-off to
`STAFF_PHONE_NUMBER`.
