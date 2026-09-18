// One call: the caller's audio line, a Boson Realtime session, the agent's
// tools and the transcript. Audio passes through untouched both ways; the
// session also tracks how much of the agent's audio the caller has actually
// heard (via marks), so interruptions, hang-ups and transfers line up with
// what was said.

import WebSocket from "ws"

import type { AppEvent, CallEndReason } from "@/lib/call-protocol"
import { menu } from "@/lib/menu"
import { saveCall, type CallRecord, type TranscriptLine } from "@/lib/store"
import { config } from "./config"
import { buildInstructions, greeting } from "./prompt"
import { OrderingTools, TOOLS, type ToolResult } from "./tools"

export type AudioFormat =
  | { type: "audio/pcm"; rate: 24000 }
  | { type: "audio/pcmu" }

/** The caller's side: a browser tab for now, a Twilio media stream later. */
export interface CallerLine {
  readonly channel: "browser" | "phone"
  /** Used for both directions, so audio is never converted. */
  readonly format: AudioFormat
  sendAudio(payload: string): void
  /** Asks the line to echo `name` back once the audio sent so far has played. */
  sendMark(name: string): void
  /** Drops audio that hasn't played yet. */
  clearAudio(): void
  /** Live updates for the call page; a phone line ignores them. */
  emit(event: AppEvent): void
  close(): void
}

// The Boson events this session reads (see boson-docs/llms-full.txt,
// "Server events"). Others, including Boson's extensions, are ignored.
type BosonEvent = { type: string }
type ItemEvent = { item_id: string }
type Transcription = { item_id: string; transcript: string }
type AudioDelta = { item_id: string; response_id: string; delta: string }
type TranscriptLength = { item_id: string; delta: string; length_ms: number }
type ArgumentsDone = { call_id: string; name: string; arguments: string }
type ErrorEvent = { error: { type: string; code: string | null; message: string } }
type Response = {
  id: string
  status: string
  output: {
    type: string
    call_id?: string
    name?: string
    arguments?: string
    content?: { transcript?: string | null; text?: string | null }[]
  }[]
}

type AgentItem = {
  line: TranscriptLine
  /** Transcript pieces with the audio time (ms) at which each one ends. */
  fragments: { text: string; endMs: number }[]
  /** Set when the caller cut in, at how much audio they'd heard. */
  heardMs: number | null
}

const IDLE_NUDGE_MS = 20_000
const DEBUG = process.env.RELAY_DEBUG === "1"
const DEBUG_EVENTS = new Set([
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "conversation.item.input_audio_transcription.completed",
  "response.created",
  "response.done",
])
const GOODBYE =
  /\b(good ?bye|bye|take care|have a (great|good|nice|lovely) (day|afternoon|evening|night|one|meal)|enjoy your (meal|food|lunch|dinner|order))\b/i
// Things the agent sometimes says without having called the tool.
const ORDER_CLAIM = /\b(placing|placed|finali[sz]\w*|submit\w*|order is in)\b/i
const CART_CLAIM =
  /\b(added|adding|(let me|i'll|i will) add|in your (cart|order)|i've got (those|that|it|them|your)|got (those|that|them) (in|down|ready))\b/i
const CART_TOOLS = new Set([
  "add_to_cart",
  "update_cart_item",
  "remove_from_cart",
  "repeat_last_order",
])
const CLOSE_MESSAGES: Record<number, string> = {
  1013: "All our lines are busy right now. Please try again in a minute.",
  3000: "The voice service rejected the relay's API key.",
  4429: "The voice service account is out of credit.",
}

export class CallSession {
  readonly callSid: string
  private readonly startedAt = Date.now()
  private readonly tools: OrderingTools
  private readonly record: CallRecord
  private readonly instructions: string
  private readonly onEnd?: (session: CallSession) => void
  private boson: WebSocket | null = null
  private bosonReady = false
  private queuedAudio: string[] = []
  private ended = false

  // Playback. Marks are named "<generation>|<item>|<ms>"; clearing the line
  // bumps the generation so marks for dropped audio are ignored.
  private generation = 0
  private pendingMarks = 0
  private playing: { itemId: string; sentMs: number; heardMs: number } | null = null
  /** Replies the caller talked over; late audio for them is dropped. */
  private interrupted = new Set<string>()
  private playbackWaiters: (() => void)[] = []

  /** Responses finish one at a time, so tool results go back in order. */
  private responses: Promise<void> = Promise.resolve()
  private responseActive = false
  private spokenResponses = new Set<string>()
  private toolRuns = new Map<string, Promise<ToolResult>>()
  /** What to do once the agent's current line has played. */
  private after: { action: "hangup" | "transfer"; reason: CallEndReason } | null = null
  private afterTimer: NodeJS.Timeout | null = null

  private lines = new Map<string, TranscriptLine>()
  private agentItems = new Map<string, AgentItem>()
  private speechStartedAt = new Map<string, number>()
  private lastCallerText = ""
  private lastSpeechStopped = 0
  private lastTranscript = 0

  /** Tools called since the caller last spoke. */
  private toolsThisTurn: string[] = []
  /** A correction note was already added this turn (see checkClaims). */
  private correctedThisTurn = false

  private callerSpeaking = false
  private lastActivity = Date.now()
  private idleNudges = 0
  private timers: NodeJS.Timeout[] = []
  private saveTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly caller: CallerLine,
    options: {
      callSid: string
      callerPhone: string | null
      /** The web app that order links point to. */
      appUrl: string
      onEnd?: (session: CallSession) => void
    }
  ) {
    this.callSid = options.callSid
    this.onEnd = options.onEnd
    const paymentLink = caller.channel === "phone" ? "sms" : "screen"
    this.tools = new OrderingTools({
      callSid: options.callSid,
      callerPhone: options.callerPhone,
      appUrl: options.appUrl,
      deliveryFeeCents: config.deliveryFeeCents,
      timeZone: menu.restaurant.timezone ?? "America/Los_Angeles",
      paymentLink,
      callerSpeech: () => this.callerSpeech(),
    })
    this.instructions = buildInstructions({
      now: new Date(),
      deliveryFeeCents: config.deliveryFeeCents,
      paymentLink,
    })
    this.record = {
      callSid: options.callSid,
      channel: caller.channel,
      callerPhone: options.callerPhone,
      customerId: null,
      customerName: null,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: null,
      outcome: null,
      endReason: null,
      transferReason: null,
      transferSummary: null,
      orderId: null,
      cart: [],
      address: null,
      offeredItemIds: [],
      transcript: [],
    }
  }

  start() {
    this.log(`call started (${this.caller.channel})`)
    void this.save()
    this.caller.emit({
      type: "call_started",
      callSid: this.callSid,
      restaurant: menu.restaurant.name,
    })
    this.caller.emit({ type: "cart", cart: this.tools.cartView() })

    const ws = new WebSocket(config.bosonUrl, {
      headers: { Authorization: `Bearer ${config.bosonApiKey}` },
    })
    this.boson = ws
    ws.on("open", () => this.onBosonOpen())
    ws.on("message", (data) => {
      let event: BosonEvent
      try {
        event = JSON.parse(String(data))
      } catch {
        return
      }
      try {
        this.onBosonEvent(event)
      } catch (error) {
        this.log(`handling ${event.type} failed:`, error)
      }
    })
    ws.on("close", (code, reason) => this.onBosonClose(code, reason.toString()))
    ws.on("error", (error) => this.log("Boson socket error:", error.message))

    this.timers.push(
      setInterval(() => this.checkIdle(), 2000),
      setTimeout(
        () =>
          void this.finish(
            "max_duration",
            "This call reached its time limit, so it ended."
          ),
        config.maxCallMinutes * 60_000
      )
    )
  }

  // ------------------------------------------------------------ caller side

  onCallerAudio(payload: string) {
    if (this.ended) return
    if (!this.bosonReady) {
      // About 10 s of audio while Boson connects; older chunks are dropped.
      if (this.queuedAudio.length > 250) this.queuedAudio.shift()
      this.queuedAudio.push(payload)
      return
    }
    this.send({ type: "input_audio_buffer.append", audio: payload })
  }

  onMark(name: string) {
    const [generation, itemId, ms] = name.split("|")
    if (Number(generation) !== this.generation) return
    this.pendingMarks = Math.max(0, this.pendingMarks - 1)
    if (this.playing?.itemId === itemId) {
      this.playing.heardMs = Math.max(this.playing.heardMs, Number(ms))
    }
    if (this.pendingMarks === 0) {
      this.lastActivity = Date.now()
      this.releasePlaybackWaiters()
    }
  }

  onCallerHangup() {
    void this.finish("caller_hangup", "You hung up.")
  }

  /** Ends the call from the relay's side, e.g. when it shuts down. */
  end(message: string) {
    void this.finish("error", message)
  }

  /**
   * The caller's latest words from the speech-to-text transcript. Waits
   * briefly when the caller has just stopped and their transcript is due.
   */
  private async callerSpeech() {
    const deadline = Date.now() + 1500
    while (this.lastTranscript < this.lastSpeechStopped && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return this.lastCallerText
  }

  // ------------------------------------------------------------ Boson side

  private send(event: Record<string, unknown>) {
    if (this.boson?.readyState === WebSocket.OPEN) {
      this.boson.send(JSON.stringify(event))
    }
  }

  private onBosonOpen() {
    this.send({
      type: "session.update",
      session: {
        model: "higgs-realtime",
        instructions: this.instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            format: this.caller.format,
            transcription: { model: "higgs-stt-3.1", language: "en" },
            turn_detection:
              config.turnDetection === "server_vad"
                ? { type: "server_vad", silence_duration_ms: config.silenceMs }
                : { type: "semantic_vad" },
            noise_reduction: { type: "far_field" },
          },
          output: { format: this.caller.format, voice: config.voice },
        },
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        truncation: "auto",
      },
    })
    this.bosonReady = true
    for (const audio of this.queuedAudio) {
      this.send({ type: "input_audio_buffer.append", audio })
    }
    this.queuedAudio = []
    // Boson never speaks first, so the greeting is requested.
    this.speak(`The call has just connected. Say exactly: "${greeting}"`)
  }

  /**
   * Adds a bracketed note to the conversation and asks for a reply. Unlike
   * speak(), the model keeps its place in the call.
   */
  private note(text: string, respond = true) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `[${text}]` }],
      },
    })
    if (respond) this.send({ type: "response.create" })
  }

  /** Asks for a spoken reply with one extra instruction for this turn only. */
  private speak(extra: string) {
    this.send({
      type: "response.create",
      response: { instructions: `${this.instructions}\n\n# Right now\n${extra}` },
    })
  }

  private onBosonEvent(event: BosonEvent) {
    if (DEBUG && DEBUG_EVENTS.has(event.type)) this.debug(event)
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        return this.onSpeechStarted(event as BosonEvent & ItemEvent)

      case "input_audio_buffer.speech_stopped":
        this.callerSpeaking = false
        this.lastSpeechStopped = Date.now()
        this.lastActivity = Date.now()
        this.caller.emit({ type: "status", status: "thinking" })
        return

      case "conversation.item.input_audio_transcription.completed": {
        const e = event as BosonEvent & Transcription
        const text = e.transcript.trim()
        this.lastTranscript = Date.now()
        if (!text) return
        this.lastCallerText = text
        this.upsertLine({
          id: e.item_id,
          t: this.speechStartedAt.get(e.item_id) ?? this.elapsed(),
          speaker: "customer",
          text,
          source: "boson",
        })
        return
      }

      case "response.created":
        this.responseActive = true
        return

      case "response.output_audio.delta":
        return this.onAudioDelta(event as BosonEvent & AudioDelta)

      case "response.output_audio_transcript.length": {
        // length_ms is the audio played up to the end of this piece of text.
        const e = event as BosonEvent & TranscriptLength
        this.agentItem(e.item_id).fragments.push({
          text: e.delta,
          endMs: e.length_ms,
        })
        return
      }

      case "response.output_audio_transcript.done": {
        const e = event as BosonEvent & Transcription
        const item = this.agentItem(e.item_id)
        item.line.text = e.transcript.trim()
        this.showAgentLine(item)
        this.tools.agentSaid(item.line.text)
        return
      }

      case "response.function_call_arguments.done": {
        // Start the tool now; its result is sent once the response is done.
        const e = event as BosonEvent & ArgumentsDone
        this.toolRuns.set(e.call_id, this.runTool(e.name, e.arguments))
        return
      }

      case "response.done": {
        const { response } = event as BosonEvent & { response: Response }
        this.responseActive = false
        this.responses = this.responses
          .then(() => this.onResponseDone(response))
          .catch((error) => this.log("finishing a response failed:", error))
        return
      }

      case "error": {
        const { error } = event as BosonEvent & ErrorEvent
        this.log(`Boson error ${error.type}/${error.code}: ${error.message}`)
        if (error.type === "insufficient_quota") {
          void this.finish("error", CLOSE_MESSAGES[4429])
        }
        return
      }

      case "session.idle_timeout":
        void this.finish("idle", "The line was quiet for too long, so the call ended.")
        return

      case "session.max_duration_reached":
        void this.finish(
          "max_duration",
          "This call reached the voice service's time limit, so it ended."
        )
        return
    }
  }

  private onBosonClose(code: number, reason: string) {
    this.boson = null
    if (this.ended) return
    this.log(`Boson closed the session: ${code} ${reason}`)
    void this.finish(
      "error",
      CLOSE_MESSAGES[code] ?? "The voice service disconnected. Please call again."
    )
  }

  // ------------------------------------------------------------ audio

  private onAudioDelta(e: AudioDelta) {
    if (this.ended || this.interrupted.has(e.item_id)) return
    if (this.playing?.itemId !== e.item_id) {
      this.playing = { itemId: e.item_id, sentMs: 0, heardMs: 0 }
      this.agentItem(e.item_id).line.t = this.elapsed()
    }
    this.spokenResponses.add(e.response_id)
    this.caller.sendAudio(e.delta)
    this.playing.sentMs += this.audioMs(e.delta)
    this.pendingMarks++
    this.caller.sendMark(
      `${this.generation}|${e.item_id}|${Math.round(this.playing.sentMs)}`
    )
  }

  private audioMs(base64: string) {
    const bytes = Buffer.byteLength(base64, "base64")
    // μ-law is 8 bytes per ms; 24 kHz 16-bit PCM is 48.
    return this.caller.format.type === "audio/pcmu" ? bytes / 8 : bytes / 48
  }

  /** The caller started talking: if the agent is mid-sentence, cut it off. */
  private onSpeechStarted(e: ItemEvent) {
    if (!this.speechStartedAt.has(e.item_id)) {
      this.speechStartedAt.set(e.item_id, this.elapsed())
    }
    this.callerSpeaking = true
    this.toolsThisTurn = []
    this.correctedThisTurn = false
    this.idleNudges = 0
    this.lastActivity = Date.now()
    this.caller.emit({ type: "status", status: "listening" })

    if (this.pendingMarks === 0 || !this.playing) return
    const { itemId, heardMs } = this.playing
    this.interrupted.add(itemId)
    this.generation++
    this.pendingMarks = 0
    this.caller.clearAudio()
    // Boson cuts its copy of the reply too, but it can't know how much of
    // the audio had actually played.
    this.send({
      type: "conversation.item.truncate",
      item_id: itemId,
      content_index: 0,
      audio_end_ms: Math.floor(heardMs),
    })
    const item = this.agentItem(itemId)
    item.heardMs = heardMs
    this.showAgentLine(item)
    // Talking over the goodbye means the caller isn't done after all.
    if (this.after?.action === "hangup") this.cancelAfter()
    this.releasePlaybackWaiters()
  }

  private waitForPlayback() {
    if (this.pendingMarks === 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      // Safety net in case the line never echoes its marks.
      const timer = setTimeout(resolve, 15_000)
      this.playbackWaiters.push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private releasePlaybackWaiters() {
    const waiters = this.playbackWaiters
    this.playbackWaiters = []
    for (const done of waiters) done()
  }

  // ------------------------------------------------------------ responses and tools

  private async onResponseDone(response: Response) {
    const calls = response.output.filter(
      (item) => item.type === "function_call" && item.call_id
    )
    const spoke = this.spokenResponses.delete(response.id)
    // Speech alongside a tool call is filler ("let me add that"); a reply
    // with no tool call is where a suggestion gets offered.
    if (spoke && calls.length === 0) this.tools.agentSpoke()

    if (calls.length > 0) {
      for (const call of calls) {
        const callId = call.call_id!
        const result = await (this.toolRuns.get(callId) ??
          this.runTool(call.name ?? "", call.arguments ?? "{}"))
        this.toolRuns.delete(callId)
        if (result.after === "transfer") this.setAfter("transfer", "transferred")
        else if (result.after === "hangup") this.setAfter("hangup", "agent_hangup")
        this.send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(result.output),
          },
        })
      }
      // If the caller cut in or is talking, their turn produces the next
      // response; asking for one as well can leave Boson with a reply that
      // never finishes, after which it stops hearing the caller.
      if (response.status !== "cancelled" && !this.callerSpeaking) {
        this.send({ type: "response.create" })
      }
      return
    }

    if (!spoke || response.status === "cancelled") return
    // The agent sometimes says goodbye without calling end_call; once the
    // order is placed, a goodbye that asks nothing ends the call.
    const said = response.output
      .flatMap((item) => item.content ?? [])
      .map((part) => part.transcript ?? part.text ?? "")
      .join(" ")
      .trim()
    if (!this.after && this.tools.state.order && GOODBYE.test(said) && !said.endsWith("?")) {
      this.setAfter("hangup", "agent_hangup")
    }
    this.checkClaims(said)
    // A pending hang-up or transfer happens once the caller has heard this.
    if (this.after) {
      const after = this.after
      await this.waitForPlayback()
      if (this.after === after) await this.performAfter()
    }
  }

  /**
   * The model sometimes says a dish was added, or the order placed, without
   * calling the tool. When the cart or order says otherwise, a note tells it
   * so, once per caller turn, and asks it to fix that.
   */
  private checkClaims(said: string) {
    if (this.correctedThisTurn || this.after) return
    const { state } = this.tools
    let note: string | null = null
    if (!state.order && ORDER_CLAIM.test(said)) {
      note =
        "The order has not been placed yet. Call place_order now, and if it returns an error, do what the error says."
    } else if (
      CART_CLAIM.test(said) &&
      !this.toolsThisTurn.some((name) => CART_TOOLS.has(name))
    ) {
      const cart =
        state.cart.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ") || "nothing"
      note = `Nothing was added to the cart just now; it has ${cart}. Call add_to_cart for each dish the caller wants before saying it's added.`
    }
    if (!note) return
    this.correctedThisTurn = true
    this.log(`correction: ${note}`)
    this.note(note, !this.callerSpeaking)
  }

  private setAfter(action: "hangup" | "transfer", reason: CallEndReason) {
    if (this.after?.action === "transfer") return
    this.cancelAfter()
    this.after = { action, reason }
    // In case the agent never says its last line.
    this.afterTimer = setTimeout(() => void this.performAfter(), 20_000)
  }

  private cancelAfter() {
    if (this.afterTimer) clearTimeout(this.afterTimer)
    this.afterTimer = null
    this.after = null
  }

  private async performAfter() {
    const after = this.after
    if (!after || this.ended) return
    this.cancelAfter()
    if (after.action === "transfer") await this.transfer()
    else if (after.reason === "idle") {
      await this.finish("idle", "The line was quiet, so the call ended.")
    } else await this.finish(after.reason, "The call has ended. Thanks for calling!")
  }

  private async runTool(name: string, args: string): Promise<ToolResult> {
    this.toolsThisTurn.push(name)
    let result: ToolResult
    try {
      result = await this.tools.run(name, args)
    } catch (error) {
      this.log(`tool ${name} threw:`, error)
      result = {
        output: {
          error:
            "Something went wrong on our side. Apologise, and offer to transfer the call if it happens again.",
        },
        label: `${name} failed`,
      }
    }
    this.log(`tool ${name}(${args}) -> ${JSON.stringify(result.output).slice(0, 240)}`)
    this.caller.emit({ type: "tool", name, label: result.label })

    const { state } = this.tools
    if (result.changed?.includes("cart")) {
      this.caller.emit({ type: "cart", cart: this.tools.cartView() })
    }
    if (result.changed?.includes("customer") && state.customer) {
      this.record.customerId = state.customer.id
      this.record.customerName = state.customer.name
      this.caller.emit({
        type: "customer",
        name: state.customer.name,
        returning: result.output.status === "returning",
      })
    }
    if (result.changed?.includes("order") && state.order) {
      this.record.orderId = state.order.id
      this.record.outcome = "ordered"
      this.caller.emit({
        type: "order",
        orderId: state.order.id,
        number: state.order.number,
        url: this.tools.orderUrl()!,
        totalCents: state.order.totalCents,
      })
    }
    this.saveSoon()
    return result
  }

  /**
   * Hands the call to staff. A browser call can't ring a phone, so it ends
   * here and says where a phone call would have gone. Phone calls will be
   * redirected with Twilio's REST API (PRD milestone 4).
   */
  private async transfer() {
    const transfer = this.tools.state.transfer
    this.record.outcome = "transferred"
    this.record.transferReason = transfer?.reason ?? "other"
    this.record.transferSummary = transfer?.summary ?? null
    this.caller.emit({
      type: "transfer",
      reason: this.record.transferReason,
      summary: this.record.transferSummary ?? "",
      staffLine: config.staffPhone ? config.staffPhone.slice(-4) : null,
    })
    await this.finish(
      "transferred",
      "On a phone call, you'd now be connected to the restaurant's staff line."
    )
  }

  // ------------------------------------------------------------ transcript

  private elapsed() {
    return Date.now() - this.startedAt
  }

  private agentItem(itemId: string) {
    let item = this.agentItems.get(itemId)
    if (!item) {
      item = {
        line: { id: itemId, t: this.elapsed(), speaker: "agent", text: "", source: "boson" },
        fragments: [],
        heardMs: null,
      }
      this.agentItems.set(itemId, item)
    }
    return item
  }

  /** Shows an agent line, cut to what the caller heard if they interrupted. */
  private showAgentLine(item: AgentItem) {
    if (!item.line.text) return
    const line =
      item.heardMs === null
        ? item.line
        : { ...item.line, text: heardText(item, item.heardMs), interrupted: true }
    if (line.text) this.upsertLine(line)
    else this.lines.delete(line.id)
  }

  private upsertLine(line: TranscriptLine) {
    this.lines.set(line.id, line)
    this.caller.emit({ type: "transcript", line })
    this.saveSoon()
  }

  // ------------------------------------------------------------ idle and end

  private checkIdle() {
    if (
      this.ended ||
      this.callerSpeaking ||
      this.responseActive ||
      this.pendingMarks > 0 ||
      this.after
    ) {
      return
    }
    if (Date.now() - this.lastActivity < IDLE_NUDGE_MS) return
    this.lastActivity = Date.now()
    if (this.idleNudges++ === 0) {
      this.note("The caller has said nothing for a while. Ask briefly if they're still there.")
    } else {
      this.setAfter("hangup", "idle")
      this.note(
        "The caller still hasn't answered. Say you'll end the call for now and they can call back any time, then goodbye."
      )
    }
  }

  private async finish(reason: CallEndReason, message: string) {
    if (this.ended) return
    this.ended = true
    for (const timer of this.timers) clearTimeout(timer)
    this.cancelAfter()
    this.releasePlaybackWaiters()
    this.log(`call ended: ${reason}`)

    this.record.endedAt = new Date().toISOString()
    this.record.endReason = reason
    this.record.outcome ??= this.tools.state.order ? "ordered" : "abandoned"
    await this.save()

    this.caller.emit({ type: "ended", reason, message })
    this.caller.close()
    this.boson?.close(1000)
    this.onEnd?.(this)
  }

  private saveSoon() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.save()
    }, 300)
  }

  private async save() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const { state } = this.tools
    this.record.cart = state.cart.lines.map((line) => ({ ...line }))
    this.record.address = state.address
    this.record.offeredItemIds = [...state.offeredItemIds]
    this.record.transcript = [...this.lines.values()].sort((a, b) => a.t - b.t)
    try {
      await saveCall(this.record)
    } catch (error) {
      this.log("couldn't save the call:", error)
    }
  }

  private log(...parts: unknown[]) {
    console.log(`[${this.callSid}]`, ...parts)
  }

  private debug(event: BosonEvent) {
    const e = event as BosonEvent & {
      transcript?: string
      response?: Response
    }
    const detail =
      e.transcript ??
      (e.response
        ? `${e.response.id} ${e.response.status} ${e.response.output?.map((o) => o.type).join(",") ?? ""}`
        : "")
    this.log(`  ${(this.elapsed() / 1000).toFixed(1)}s ${event.type} ${detail}`)
  }
}

/**
 * The part of an agent line the caller heard before cutting in, using the
 * audio time Boson reports for each piece of transcript. A piece that was
 * only partly played keeps a matching share of its words.
 */
export function heardText(
  item: Pick<AgentItem, "fragments" | "line">,
  heardMs: number
) {
  if (item.fragments.length === 0) return `${item.line.text}…`
  let heard = ""
  let start = 0
  for (const fragment of item.fragments) {
    if (fragment.endMs <= heardMs) {
      heard += fragment.text
      start = fragment.endMs
      continue
    }
    const share = (heardMs - start) / Math.max(1, fragment.endMs - start)
    const words = fragment.text.trim().split(/\s+/)
    const kept = words.slice(0, Math.floor(words.length * share)).join(" ")
    if (kept) heard += ` ${kept}`
    return heard.trim() ? `${heard.trim()}…` : ""
  }
  return heard.trim()
}
