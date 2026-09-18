// Messages between the browser call page and the relay. The audio messages
// have the same shapes as Twilio Media Streams (media, mark, clear, stop), so
// the relay handles a browser tab and a phone line the same way. The browser
// also receives "app" messages: the live transcript, cart and order.

import type { CartLine } from "@/lib/cart"
import type { TranscriptLine } from "@/lib/store"

export type BrowserToRelay =
  /** Sent once, first. Audio is 24 kHz 16-bit mono PCM, base64. */
  | { event: "start"; start: { codec: "pcm16-24k" } }
  | { event: "media"; media: { payload: string } }
  /** Echo of a relay mark, sent once the audio queued before it has played. */
  | { event: "mark"; mark: { name: string } }
  /** The caller hung up. */
  | { event: "stop" }

export type RelayToBrowser =
  | { event: "media"; media: { payload: string } }
  | { event: "mark"; mark: { name: string } }
  /** Drop all queued audio (the caller interrupted); echo the dropped marks. */
  | { event: "clear" }
  | { event: "app"; app: AppEvent }

export type CartView = {
  lines: CartLine[]
  itemCount: number
  subtotalCents: number
  deliveryFeeCents: number
  totalCents: number
  address: string | null
}

export type CallEndReason =
  | "agent_hangup"
  | "caller_hangup"
  | "transferred"
  | "idle"
  | "max_duration"
  | "error"

export type AppEvent =
  | { type: "call_started"; callSid: string; restaurant: string }
  | { type: "status"; status: "listening" | "thinking" }
  /** Added or updated (same `line.id`); sort by `line.t`. */
  | { type: "transcript"; line: TranscriptLine }
  /** What the agent just did, e.g. "Added 2 × Hue Rolls". */
  | { type: "tool"; name: string; label: string }
  | { type: "customer"; name: string; returning: boolean }
  | { type: "cart"; cart: CartView }
  | {
      type: "order"
      orderId: string
      number: number
      url: string
      totalCents: number
    }
  | {
      type: "transfer"
      reason: string
      summary: string
      /** Last 4 digits of the staff line, when one is set. */
      staffLine: string | null
    }
  | { type: "ended"; reason: CallEndReason; message: string }
