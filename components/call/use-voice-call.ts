"use client"

// The browser side of a call: microphone in, agent's voice out, over a
// WebSocket to the relay, plus the live transcript, cart and order the relay
// sends along. The audio work happens in two AudioWorklets under
// public/worklets/.

import * as React from "react"

import type {
  AppEvent,
  BrowserToRelay,
  CallEndReason,
  CartView,
  RelayToBrowser,
} from "@/lib/call-protocol"
import type { TranscriptLine } from "@/lib/store"

export type CallPhase = "idle" | "connecting" | "live" | "ended"

/** Something the agent did, e.g. "Added 2 × Hue Rolls". */
export type ToolNote = { id: string; t: number; label: string }

export type VoiceCall = {
  phase: CallPhase
  lines: TranscriptLine[]
  notes: ToolNote[]
  cart: CartView | null
  customer: { name: string; returning: boolean } | null
  order: Extract<AppEvent, { type: "order" }> | null
  transfer: Extract<AppEvent, { type: "transfer" }> | null
  ended: { reason: CallEndReason; message: string } | null
  error: string | null
  /** The relay's view of the caller's turn. */
  turn: "listening" | "thinking" | null
}

const initialCall: VoiceCall = {
  phase: "idle",
  lines: [],
  notes: [],
  cart: null,
  customer: null,
  order: null,
  transfer: null,
  ended: null,
  error: null,
  turn: null,
}

type Action =
  | { type: "connecting" }
  | { type: "live" }
  | { type: "app"; event: AppEvent; t: number }
  | { type: "failed"; message: string }
  | { type: "hung_up" }
  | { type: "closed" }

function reducer(call: VoiceCall, action: Action): VoiceCall {
  switch (action.type) {
    case "connecting":
      return { ...initialCall, phase: "connecting" }
    case "live":
      return { ...call, phase: "live" }
    case "failed":
      return { ...call, phase: "ended", error: action.message }
    case "hung_up":
      return {
        ...call,
        phase: "ended",
        turn: null,
        ended: { reason: "caller_hangup", message: "You hung up." },
      }
    case "closed":
      return call.phase === "ended"
        ? call
        : {
            ...call,
            phase: "ended",
            ended: call.ended ?? {
              reason: "error",
              message: "The line dropped. Please call again.",
            },
          }
    case "app":
      return applyEvent(call, action.event, action.t)
  }
}

function applyEvent(call: VoiceCall, event: AppEvent, t: number): VoiceCall {
  switch (event.type) {
    case "call_started":
      return call
    case "status":
      return { ...call, turn: event.status }
    case "transcript": {
      const lines = call.lines.filter((line) => line.id !== event.line.id)
      lines.push(event.line)
      lines.sort((a, b) => a.t - b.t)
      return { ...call, lines }
    }
    case "tool":
      return {
        ...call,
        notes: [...call.notes, { id: `${call.notes.length}`, t, label: event.label }],
      }
    case "customer":
      return { ...call, customer: { name: event.name, returning: event.returning } }
    case "cart":
      return { ...call, cart: event.cart }
    case "order":
      return { ...call, order: event }
    case "transfer":
      return { ...call, transfer: event }
    case "ended":
      return { ...call, phase: "ended", turn: null, ended: event }
  }
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

type LineHandlers = {
  onOpen(): void
  onApp(event: AppEvent): void
  onClose(): void
  onFailed(message: string): void
  onSpeaking(speaking: boolean): void
  onLevel(level: number): void
}

/** The call's audio and socket; knows nothing about React. */
class BrowserLine {
  private readonly context: AudioContext
  private ws: WebSocket | null = null
  private stream: MediaStream | null = null
  private opened = false
  private closed = false

  constructor(
    private readonly relayUrl: string,
    private readonly on: LineHandlers
  ) {
    // Created inside the click that starts the call, so the browser lets it play.
    this.context = new AudioContext({ latencyHint: "interactive" })
  }

  async open() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "This browser can't use the microphone here. Open the page on localhost or over HTTPS."
      )
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    await this.context.resume()
    await this.context.audioWorklet.addModule("/worklets/mic-capture.js")
    await this.context.audioWorklet.addModule("/worklets/pcm-player.js")
    if (this.closed) return

    const player = new AudioWorkletNode(this.context, "pcm-player", {
      outputChannelCount: [1],
    })
    player.connect(this.context.destination)
    const capture = new AudioWorkletNode(this.context, "mic-capture")
    this.context.createMediaStreamSource(this.stream).connect(capture)
    // The capture node only runs while connected to the output; a muted
    // gain keeps the microphone out of the speakers.
    const muted = this.context.createGain()
    muted.gain.value = 0
    capture.connect(muted).connect(this.context.destination)

    const ws = new WebSocket(this.relayUrl)
    this.ws = ws
    ws.onopen = () => {
      this.opened = true
      this.send({ event: "start", start: { codec: "pcm16-24k" } })
      this.on.onOpen()
    }
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(String(data)) as RelayToBrowser
      switch (message.event) {
        case "media": {
          const pcm = fromBase64(message.media.payload)
          player.port.postMessage({ type: "audio", pcm }, [pcm])
          return
        }
        case "mark":
          player.port.postMessage({ type: "mark", name: message.mark.name })
          return
        case "clear":
          player.port.postMessage({ type: "clear" })
          return
        case "app":
          this.on.onApp(message.app)
          return
      }
    }
    ws.onclose = () => {
      if (!this.opened && !this.closed) {
        this.on.onFailed(
          `Can't reach the ordering line at ${this.relayUrl}. Is the relay running (npm run relay)?`
        )
      } else {
        this.on.onClose()
      }
      this.close()
    }

    capture.port.onmessage = ({ data }) => {
      this.on.onLevel(data.level)
      this.send({ event: "media", media: { payload: toBase64(data.pcm) } })
    }
    player.port.onmessage = ({ data }) => {
      if (data.type === "mark") {
        this.send({ event: "mark", mark: { name: data.name } })
      } else if (data.type === "cleared") {
        for (const name of data.marks) this.send({ event: "mark", mark: { name } })
      } else if (data.type === "playing") {
        this.on.onSpeaking(data.playing)
      }
    }
  }

  private send(message: BrowserToRelay) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  hangUp() {
    this.send({ event: "stop" })
    this.close()
  }

  close() {
    if (this.closed) return
    this.closed = true
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    void this.context.close()
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close()
    this.on.onSpeaking(false)
  }
}

function describeError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in the address bar, then try again."
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found."
  }
  return error instanceof Error ? error.message : "The call couldn't start."
}

export function useVoiceCall(relayUrl: string) {
  const [call, dispatch] = React.useReducer(reducer, initialCall)
  const [agentSpeaking, setAgentSpeaking] = React.useState(false)
  /** Microphone loudness, 0–1, updated every 40 ms; read it in an animation frame. */
  const micLevel = React.useRef(0)
  const line = React.useRef<BrowserLine | null>(null)
  const startedAt = React.useRef(0)

  React.useEffect(() => () => line.current?.close(), [])

  const start = React.useCallback(async () => {
    if (line.current) return
    dispatch({ type: "connecting" })
    startedAt.current = Date.now()
    const current = new BrowserLine(relayUrl, {
      onOpen: () => dispatch({ type: "live" }),
      onApp: (event) => {
        // Line up tool notes with the relay's transcript clock.
        if (event.type === "call_started") startedAt.current = Date.now()
        dispatch({ type: "app", event, t: Date.now() - startedAt.current })
      },
      onClose: () => {
        dispatch({ type: "closed" })
        if (line.current === current) line.current = null
      },
      onFailed: (message) => {
        dispatch({ type: "failed", message })
        if (line.current === current) line.current = null
      },
      onSpeaking: setAgentSpeaking,
      onLevel: (level) => (micLevel.current = level),
    })
    line.current = current
    try {
      await current.open()
    } catch (error) {
      current.close()
      line.current = null
      dispatch({ type: "failed", message: describeError(error) })
    }
  }, [relayUrl])

  const hangUp = React.useCallback(() => {
    line.current?.hangUp()
    line.current = null
    dispatch({ type: "hung_up" })
  }, [])

  return { call, agentSpeaking, micLevel, start, hangUp }
}
