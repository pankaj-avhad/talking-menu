// A simulated caller for testing the agent end to end without a microphone.
// It joins the relay exactly like the call page does and "plays" the agent's
// audio at real speed, echoing marks. A second Boson session, in text mode,
// plays the caller from a short persona: it reads what the agent said and
// decides the reply, which macOS text-to-speech speaks into the call.
//
// Usage: npm run relay     (in another terminal)
//        npm run simulate-call -- [order|addons|returning|handoff|interrupt]
// Needs macOS (`say`, `afconvert`) and BOSON_API_KEY in .env.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { WebSocket } from "ws"

import type { AppEvent, CartView, RelayToBrowser } from "../lib/call-protocol"

type Persona = {
  goal: string
  /** Said over the agent's reply to the caller's first line, to test barge-in. */
  interrupt?: string
}

const PERSONAS: Record<string, Persona> = {
  order: {
    goal: "Your name is Priya. Order two Hue Rolls and one 5-Spice Chicken Banh Mi for delivery. If you're offered a drink, say yes to one. Your address is 180 Spear Street, San Francisco. Once you have an order number, say thanks and goodbye.",
  },
  addons: {
    goal: "Your name is Kim. Order one 5-Spice Chicken rice plate with a fried egg on it. Say no thanks to a drink. Your address is 500 Howard Street, San Francisco. Once you have an order number, say thanks and goodbye.",
  },
  returning: {
    goal: "Your name is Priya and you've ordered here before. If the host offers your last order again, say yes. Keep the same delivery address as last time. Once you have an order number, say thanks and goodbye.",
  },
  handoff: {
    goal: "Your name is Sam. Ask whether they can cater a birthday party for fifty people next Saturday. You'd like to talk to a person about it.",
  },
  interrupt: {
    goal: "Your name is Alex. You want one Thai Iced Tea and nothing else, delivered to 500 Howard Street, San Francisco. Say no to any other suggestions. Once you have an order number, say thanks and goodbye.",
    interrupt: "Sorry, can I just get a Thai iced tea?",
  },
}

const scenario = process.argv[2] ?? "order"
const persona = PERSONAS[scenario]
if (!persona) {
  console.error(`Unknown scenario "${scenario}". Try: ${Object.keys(PERSONAS).join(", ")}`)
  process.exit(1)
}
const apiKey = process.env.BOSON_API_KEY
if (!apiKey) {
  console.error("BOSON_API_KEY is not set. Add it to .env.")
  process.exit(1)
}
const relayUrl = process.env.RELAY_URL ?? "ws://localhost:8787/browser"
const origin = process.env.ORIGIN ?? "http://localhost:3000"

const started = Date.now()
const clock = () => ((Date.now() - started) / 1000).toFixed(1).padStart(5)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- the caller's brain

/** A text-only Boson session that plays the caller. */
class CallerBrain {
  private ws = new WebSocket("wss://api.boson.ai/v1/realtime?model=higgs-realtime", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  private ready = new Promise((resolve) => this.ws.once("open", resolve))
  private reply: ((text: string) => void) | null = null

  constructor(goal: string) {
    this.ws.on("message", (data) => {
      const event = JSON.parse(String(data))
      if (event.type === "response.output_text.done") this.reply?.(event.text)
      if (event.type === "error") console.error("caller brain error:", event.error)
    })
    void this.ready.then(() =>
      this.send({
        type: "session.update",
        session: {
          model: "higgs-realtime",
          output_modalities: ["text"],
          temperature: 0.3,
          instructions: `You are a caller phoning a Vietnamese restaurant to order food. ${goal}
Reply with only the words you say out loud, in one short, natural sentence. Answer only what the host asked; give one piece of information at a time. Don't describe actions.
If the host asks you to spell something, spell it with letters separated by spaces.
If the host already said goodbye or the call is clearly over, reply with exactly: [hang up]`,
        },
      })
    )
  }

  private send(event: object) {
    this.ws.send(JSON.stringify(event))
  }

  /** Tells the brain something the caller already said. */
  async said(text: string) {
    await this.ready
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "assistant", content: [{ type: "text", text }] },
    })
  }

  /** What the caller says next, given what the host just said. */
  async answer(hostSaid: string) {
    await this.ready
    const text = new Promise<string>((resolve) => (this.reply = resolve))
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `The host says: "${hostSaid}"` }],
      },
    })
    this.send({ type: "response.create" })
    return (await text).trim()
  }

  close() {
    this.ws.close()
  }
}

// ---------------------------------------------------------------- the caller's voice

const cacheDir = path.join(tmpdir(), "talking-menu-voices")
mkdirSync(cacheDir, { recursive: true })

/** 24 kHz 16-bit mono PCM of `text`, spoken by macOS's Samantha voice. */
function speech(text: string) {
  const base = path.join(cacheDir, Buffer.from(text).toString("base64url").slice(0, 120))
  if (!existsSync(`${base}.wav`)) {
    execFileSync("say", ["-v", "Samantha", "-o", `${base}.aiff`, text])
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@24000", "-c", "1", `${base}.aiff`, `${base}.wav`])
  }
  const wav = readFileSync(`${base}.wav`)
  // Walk the RIFF chunks to the sample data.
  let offset = 12
  while (offset < wav.length) {
    const id = wav.toString("ascii", offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    if (id === "data") return wav.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + (size % 2)
  }
  throw new Error(`No audio in ${base}.wav`)
}

// ---------------------------------------------------------------- the line

const CHUNK_MS = 40
const CHUNK_BYTES = (24000 * 2 * CHUNK_MS) / 1000

const ws = new WebSocket(relayUrl, { headers: { Origin: origin } })
let mic = Buffer.alloc(0)
// Agent audio waiting to "play": durations in ms, and marks to echo.
let playback: ({ ms: number } | { mark: string })[] = []
let lastAgentAudio = 0
let agentSpokeSinceCaller = false
/** When the caller's queued speech finishes playing into the call. */
let callerBusyUntil = 0
let ended: Extract<AppEvent, { type: "ended" }> | null = null
let order: Extract<AppEvent, { type: "order" }> | null = null
let cart: CartView | null = null
const transcript = new Map<string, { t: number; who: string; text: string }>()
/** Agent lines since the caller last spoke, by line id. */
let agentLines = new Map<string, string>()

ws.on("open", () => {
  ws.send(JSON.stringify({ event: "start", start: { codec: "pcm16-24k" } }))

  // The "microphone": real-time 40 ms chunks, silence between lines.
  let next = Date.now()
  const pump = () => {
    if (ws.readyState !== ws.OPEN) return
    const chunk = Buffer.alloc(CHUNK_BYTES)
    mic.copy(chunk, 0, 0, CHUNK_BYTES)
    mic = mic.subarray(Math.min(CHUNK_BYTES, mic.length))
    ws.send(JSON.stringify({ event: "media", media: { payload: chunk.toString("base64") } }))
    next += CHUNK_MS
    setTimeout(pump, Math.max(0, next - Date.now()))
  }
  pump()

  // The "speaker": consume queued agent audio at real speed, echo marks.
  let last = Date.now()
  setInterval(() => {
    let budget = Date.now() - last
    last = Date.now()
    while (playback.length > 0) {
      const head = playback[0]
      if ("mark" in head) {
        ws.send(JSON.stringify({ event: "mark", mark: { name: head.mark } }))
        playback.shift()
      } else if (head.ms <= budget) {
        budget -= head.ms
        playback.shift()
      } else {
        head.ms -= budget
        break
      }
    }
  }, 20)
})

ws.on("message", (data) => {
  const message = JSON.parse(String(data)) as RelayToBrowser
  switch (message.event) {
    case "media":
      playback.push({ ms: Buffer.byteLength(message.media.payload, "base64") / 48 })
      lastAgentAudio = Date.now()
      // Replies that start while the caller is still talking don't count.
      if (Date.now() > callerBusyUntil) agentSpokeSinceCaller = true
      return
    case "mark":
      playback.push({ mark: message.mark.name })
      return
    case "clear": {
      const marks = playback.filter((p) => "mark" in p) as { mark: string }[]
      playback = []
      for (const { mark } of marks) ws.send(JSON.stringify({ event: "mark", mark: { name: mark } }))
      console.log(`${clock()}  ~~ agent audio cleared (caller talked over it)`)
      return
    }
    case "app":
      return onApp(message.app)
  }
})

function onApp(app: AppEvent) {
  switch (app.type) {
    case "transcript": {
      const { line } = app
      const before = transcript.get(line.id)
      transcript.set(line.id, { t: line.t, who: line.speaker, text: line.text })
      if (line.speaker === "agent") agentLines.set(line.id, line.text)
      const who = line.speaker === "agent" ? "AGENT " : "CALLER"
      const note = line.interrupted ? "  [cut off]" : ""
      console.log(`${clock()}  ${before ? "(edit) " : ""}${who}: ${line.text}${note}`)
      return
    }
    case "tool":
      console.log(`${clock()}     · ${app.label}`)
      return
    case "cart":
      cart = app.cart
      return
    case "order":
      order = app
      console.log(`${clock()}     · order #${app.number}: ${app.url}`)
      return
    case "transfer":
      console.log(`${clock()}     · transfer (${app.reason}): ${app.summary}`)
      return
    case "ended":
      ended = app
      console.log(`${clock()}  == call ended (${app.reason}): ${app.message}`)
      return
  }
}

ws.on("close", (code) => {
  console.log(`${clock()}  socket closed ${code}`)
  finish()
})

/** Until the caller has finished talking and the agent has answered and gone quiet. */
async function agentDone(timeoutMs = 25_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until && !ended) {
    const quiet = playback.length === 0 && Date.now() - lastAgentAudio > 1500
    if (Date.now() > callerBusyUntil && agentSpokeSinceCaller && quiet) return
    await sleep(100)
  }
}

function say(text: string) {
  console.log(`${clock()}  (caller) ${text}`)
  const audio = speech(text)
  agentSpokeSinceCaller = false
  agentLines = new Map()
  mic = Buffer.concat([mic, audio])
  callerBusyUntil = Date.now() + (mic.length / CHUNK_BYTES) * CHUNK_MS + 300
}

const brain = new CallerBrain(persona.goal)

async function run() {
  await new Promise((resolve) => ws.once("open", resolve))
  for (let turn = 0; turn < 16 && !ended; turn++) {
    await agentDone()
    if (ended) break
    const hostSaid = [...agentLines.values()].join(" ") || "(silence)"
    const reply = await brain.answer(hostSaid)
    if (!reply || reply.includes("[hang up]")) {
      console.log(`${clock()}  (caller hangs up)`)
      ws.send(JSON.stringify({ event: "stop" }))
      break
    }
    say(reply)

    if (turn === 0 && persona.interrupt) {
      // Wait for the agent to start answering, then talk over it.
      const until = Date.now() + 15_000
      while (!agentSpokeSinceCaller && Date.now() < until) await sleep(50)
      await sleep(1200)
      say(persona.interrupt)
      await brain.said(persona.interrupt)
    }
  }
  // Give the agent time to hang up by itself.
  const until = Date.now() + 20_000
  while (!ended && Date.now() < until) await sleep(200)
  finish()
}

let finished = false
function finish() {
  if (finished) return
  finished = true
  brain.close()
  console.log("\nTranscript by time:")
  for (const line of [...transcript.values()].sort((a, b) => a.t - b.t)) {
    console.log(`  ${(line.t / 1000).toFixed(1).padStart(5)}s ${line.who.padEnd(8)} ${line.text}`)
  }
  console.log(
    `\nCart: ${cart?.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ") || "empty"}` +
      `\nOrder: ${order ? `#${order.number} ${order.url}` : "none"}` +
      `\nEnded: ${ended ? ended.reason : "no (caller hung up)"}`
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
