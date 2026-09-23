# Talking Menu

Start the first reply of every session in this folder with exactly these four
lines, then answer whatever was asked. Print them again, on their own, whenever
the user says "resume" (or runs `/resume`):

1. **Talking Menu** — an AI phone host for one restaurant, Tin at 180 Spear St, built on its real menu.
2. **What it does** — at `/call` you talk to the host: it takes your name, knows returning callers, builds an order with add-ons, reads back the total, takes the address and places it. `/menu` is the menu, `/orders/[id]` the check, `/calls` the past calls.
3. **Run it** — `npm run relay` in one terminal, `npm run dev` in another, then open the address it prints and add `/call` (Chrome, headphones, allow the mic).
4. **Reset a demo** — `rm -rf .data` clears callers, orders and transcripts. Never delete `data/`; that's the menu.

## How it fits together

- `app/`, `components/`: the Next.js site (`/menu`, `/call`, `/orders/[id]`, `/calls`).
- `relay/`: a separate always-on Node server, not Next.js. It joins each caller
  to a Boson Higgs Realtime session and runs the agent's tools. `tools.ts` owns
  every price and cart change; `prompt.ts` holds the host's instructions.
- `lib/`: shared code with no Next-only imports, so the relay can use it too:
  menu data, search, cart, and the JSON store under `.data/`.
- `data/menu.json` and `data/item-options.json`: the menu and each dish's
  add-ons, written by the Python scripts in `scripts/`.

## Commands

`npm run dev`, `npm run relay`, `npm run dev:all`, `npm test`,
`npm run simulate-call -- order`, `npm run build`, `npm run lint`,
`npm run typecheck`.

## Worth knowing

- Secrets live in `.env`, which is gitignored: `BOSON_API_KEY`,
  `PEXELS_API_KEY` and `STAFF_PHONE_NUMBER` (the restaurant's own line, where
  hand-offs will ring). `DASHBOARD_PASSWORD` gates `/calls` when it is set.
- Phone calls aren't set up yet, so calls are browser-only until there's a
  Twilio number. The browser already speaks Twilio's media-stream messages to
  the relay, so a phone line can join the same call handling.
- The voice model sometimes says it did something without calling the tool, so
  the relay checks its claims against the cart and corrects it. Read the
  "How a call works" section of `README.md` before changing the prompt, the
  tools or turn detection.
- `README.md` has the details. The spec is the PRD, a Claude Doc:
  https://claude.ai/code/artifact/5686b46b-1e24-4ba5-a139-2029bab89729
