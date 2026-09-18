"use client"

import * as React from "react"
import {
  ArrowUpRightIcon,
  EllipsisIcon,
  HeadphonesIcon,
  Loader2Icon,
  MicIcon,
  PhoneIcon,
  PhoneOffIcon,
  UserRoundIcon,
  Volume2Icon,
  WrenchIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  useVoiceCall,
  type ToolNote,
  type VoiceCall,
} from "@/components/call/use-voice-call"
import type { TranscriptLine } from "@/lib/store"
import { formatUsd } from "@/lib/money"
import { cn } from "@/lib/utils"

const card = "rounded-3xl border bg-card"

export function CallConsole({
  restaurantName,
  relayUrl,
}: {
  restaurantName: string
  relayUrl: string
}) {
  const { call, agentSpeaking, micLevel, start, hangUp } =
    useVoiceCall(relayUrl)
  // Set when the caller presses call, for the timer.
  const [startedAt, setStartedAt] = React.useState<number | null>(null)

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8 lg:pt-10">
      <section
        aria-labelledby="call-title"
        className="grid min-w-0 content-start gap-6"
      >
        <div className={cn(card, "px-6 py-10 text-center sm:px-10 sm:py-12")}>
          <h1
            id="call-title"
            className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            Call {restaurantName}
          </h1>
          <p className="mx-auto mt-2 max-w-[44ch] text-sm leading-relaxed text-pretty text-muted-foreground">
            Talk to our AI host the way you would on the phone. It takes your
            order from the menu, reads it back, and gives you a link to pay.
          </p>

          <VoiceOrb
            call={call}
            agentSpeaking={agentSpeaking}
            micLevel={micLevel}
          />

          <CallControls
            call={call}
            agentSpeaking={agentSpeaking}
            startedAt={startedAt}
            onStart={() => {
              setStartedAt(Date.now())
              start()
            }}
            onHangUp={hangUp}
          />
        </div>

        <Transcript lines={call.lines} notes={call.notes} phase={call.phase} />
      </section>

      <aside aria-label="Your order">
        <OrderPanel call={call} />
      </aside>
    </div>
  )
}

/**
 * The call's state at a glance. The ring follows the caller's microphone
 * (drawn every frame from a ref, transform only) and breathes while the host
 * talks; with reduced motion it stays still and the label carries the state.
 */
function VoiceOrb({
  call,
  agentSpeaking,
  micLevel,
}: {
  call: VoiceCall
  agentSpeaking: boolean
  micLevel: React.RefObject<number>
}) {
  const ring = React.useRef<HTMLSpanElement>(null)
  const live = call.phase === "live"
  const listening = live && !agentSpeaking && call.turn !== "thinking"

  React.useEffect(() => {
    const el = ring.current
    if (!listening || !el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let frame = 0
    const draw = () => {
      const level = Math.min(1, (micLevel.current ?? 0) * 6)
      el.style.transform = `scale(${1 + level * 0.28})`
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      el.style.transform = ""
    }
  }, [listening, micLevel])

  const Icon =
    call.phase === "connecting"
      ? Loader2Icon
      : live
        ? agentSpeaking
          ? Volume2Icon
          : call.turn === "thinking"
            ? EllipsisIcon
            : MicIcon
        : call.phase === "ended"
          ? PhoneOffIcon
          : PhoneIcon

  return (
    <div
      aria-hidden
      className="relative mx-auto mt-8 grid size-36 place-items-center"
    >
      <span
        ref={ring}
        className={cn(
          "absolute inset-0 rounded-full transition-[background-color] duration-300 ease-out",
          live ? "bg-brand/15" : "bg-muted",
          agentSpeaking && "animate-voice motion-reduce:animate-none"
        )}
      />
      <span
        className={cn(
          "relative grid size-24 place-items-center rounded-full transition-[background-color,color] duration-300 ease-out",
          live || call.phase === "connecting"
            ? "bg-brand text-brand-foreground"
            : "bg-foreground text-background"
        )}
      >
        <Icon
          className={cn(
            "size-8",
            call.phase === "connecting" &&
              "animate-spin motion-reduce:animate-none"
          )}
        />
      </span>
    </div>
  )
}

function CallControls({
  call,
  agentSpeaking,
  startedAt,
  onStart,
  onHangUp,
}: {
  call: VoiceCall
  agentSpeaking: boolean
  startedAt: number | null
  onStart: () => void
  onHangUp: () => void
}) {
  const { phase } = call
  const status =
    phase === "connecting"
      ? "Connecting…"
      : phase === "live"
        ? agentSpeaking
          ? "Host is speaking"
          : call.turn === "thinking"
            ? "Host is thinking…"
            : "Listening"
        : null

  return (
    <div className="mt-6">
      <p
        aria-live="polite"
        className="flex min-h-5 items-center justify-center gap-2 text-sm font-medium"
      >
        {status}
        {phase === "live" && startedAt !== null && (
          <span className="font-mono text-muted-foreground tabular-nums">
            <CallTimer startedAt={startedAt} />
          </span>
        )}
      </p>

      <div className="mt-5 flex justify-center">
        {phase === "live" || phase === "connecting" ? (
          <Button
            size="lg"
            variant="destructive"
            onClick={onHangUp}
            disabled={phase === "connecting"}
            className="min-w-40"
          >
            <PhoneOffIcon data-icon="inline-start" />
            Hang up
          </Button>
        ) : (
          <Button
            size="lg"
            variant="brand"
            onClick={onStart}
            className="min-w-40"
          >
            <PhoneIcon data-icon="inline-start" />
            {phase === "ended" ? "Call again" : "Start call"}
          </Button>
        )}
      </div>

      {call.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {call.error}
        </p>
      )}
      {!call.error && call.ended && (
        <p className="mt-4 text-sm text-muted-foreground">
          {call.ended.message}
        </p>
      )}
      {phase === "idle" && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <HeadphonesIcon aria-hidden className="size-4 shrink-0" />
          Uses your microphone. Headphones keep the host from hearing itself.
        </p>
      )}
    </div>
  )
}

// A clock that ticks once a second; null on the server, where no call runs.
function subscribeSeconds(onTick: () => void) {
  const id = window.setInterval(onTick, 1000)
  return () => window.clearInterval(id)
}
const currentSecond = () => Math.floor(Date.now() / 1000)
const noSecondOnServer = () => null

/** "1:07" since the caller pressed call. */
function CallTimer({ startedAt }: { startedAt: number }) {
  const second = React.useSyncExternalStore(
    subscribeSeconds,
    currentSecond,
    noSecondOnServer
  )
  if (second === null) return null
  const elapsed = Math.max(0, second - Math.floor(startedAt / 1000))
  return (
    <>
      {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
    </>
  )
}

type Entry =
  | { kind: "line"; t: number; line: TranscriptLine }
  | { kind: "note"; t: number; note: ToolNote }

function Transcript({
  lines,
  notes,
  phase,
}: {
  lines: TranscriptLine[]
  notes: ToolNote[]
  phase: VoiceCall["phase"]
}) {
  const entries: Entry[] = [
    ...lines.map((line) => ({ kind: "line" as const, t: line.t, line })),
    ...notes.map((note) => ({ kind: "note" as const, t: note.t, note })),
  ].sort((a, b) => a.t - b.t)

  // Follow the conversation, unless the reader has scrolled up to reread.
  const list = React.useRef<HTMLOListElement>(null)
  const following = React.useRef(true)
  React.useEffect(() => {
    const el = list.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [entries.length, lines])

  if (phase === "idle" && entries.length === 0) return null

  return (
    <section
      aria-labelledby="transcript-title"
      className={cn(card, "p-5 sm:p-6")}
    >
      <h2 id="transcript-title" className="font-semibold">
        Transcript
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          The conversation will appear here.
        </p>
      ) : (
        <ol
          ref={list}
          onScroll={(e) => {
            const el = e.currentTarget
            following.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          className="mt-4 grid max-h-[28rem] gap-2.5 overflow-y-auto overscroll-contain pr-1"
          aria-live="polite"
        >
          {entries.map((entry) =>
            entry.kind === "note" ? (
              <li
                key={`note-${entry.note.id}`}
                className="flex items-center gap-1.5 justify-self-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
              >
                <WrenchIcon aria-hidden className="size-3 shrink-0" />
                {entry.note.label}
              </li>
            ) : (
              <li
                key={`line-${entry.line.id}`}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  entry.line.speaker === "customer"
                    ? "justify-self-end rounded-br-md bg-foreground text-background"
                    : "rounded-bl-md bg-muted"
                )}
              >
                <span className="sr-only">
                  {entry.line.speaker === "customer" ? "You: " : "Host: "}
                </span>
                {entry.line.text}
                {entry.line.interrupted && (
                  <span className="ml-1 text-xs opacity-70">(cut off)</span>
                )}
              </li>
            )
          )}
        </ol>
      )}
    </section>
  )
}

function OrderPanel({ call }: { call: VoiceCall }) {
  const { cart, customer, order, transfer } = call
  const lines = cart?.lines ?? []

  return (
    <div className={cn(card, "p-5 sm:p-6 lg:sticky lg:top-6")}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Your order</h2>
        {cart && cart.itemCount > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {customer && (
        <p className="mt-3 flex items-center gap-2 text-sm">
          <UserRoundIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="font-medium">{customer.name}</span>
          {customer.returning && <Badge variant="secondary">Returning</Badge>}
        </p>
      )}

      {lines.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {call.phase === "idle"
            ? "Start a call and tell the host what you'd like. Your order fills in here as you talk."
            : "Nothing yet."}
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y">
            {lines.map((line) => (
              <li key={line.lineId} className="flex gap-3 py-3 text-sm">
                <span className="w-6 shrink-0 font-semibold tabular-nums">
                  {line.quantity}×
                </span>
                <span className="min-w-0 flex-1">
                  {line.name}
                  {(line.addOns ?? []).map((addOn) => (
                    <span
                      key={addOn.id}
                      className="block text-xs text-muted-foreground"
                    >
                      + {addOn.name.replace(/^Add\s+/i, "")}
                    </span>
                  ))}
                  {line.note && (
                    <span className="block text-xs text-muted-foreground">
                      {line.note}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">
                  {formatUsd(line.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 grid gap-1.5 border-t pt-3 text-sm">
            {cart!.deliveryFeeCents > 0 && (
              <>
                <Row term="Subtotal" value={formatUsd(cart!.subtotalCents)} />
                <Row
                  term="Delivery"
                  value={formatUsd(cart!.deliveryFeeCents)}
                />
              </>
            )}
            <Row term="Total" value={formatUsd(cart!.totalCents)} strong />
          </dl>
        </>
      )}

      {cart?.address && (
        <div className="mt-5 text-sm">
          <p className="font-medium">Deliver to</p>
          <p className="mt-0.5 text-muted-foreground">{cart.address}</p>
        </div>
      )}

      {order && (
        <div className="mt-5 rounded-2xl bg-brand/10 p-4">
          <p className="font-semibold">Order #{order.number} placed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            On a phone call this link arrives by text message.
          </p>
          <Button asChild variant="brand" className="mt-3 w-full">
            <a href={order.url} target="_blank" rel="noreferrer">
              View and pay {formatUsd(order.totalCents)}
              <ArrowUpRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </div>
      )}

      {transfer && (
        <div className="mt-5 rounded-2xl bg-muted p-4 text-sm">
          <p className="font-semibold">Handed to staff</p>
          {transfer.summary && <p className="mt-1">“{transfer.summary}”</p>}
          <p className="mt-2 text-muted-foreground">
            On a phone call, the host would now ring the restaurant’s staff line
            {transfer.staffLine ? ` (ending in ${transfer.staffLine})` : ""} and
            pass on this summary.
          </p>
        </div>
      )}
    </div>
  )
}

function Row({
  term,
  value,
  strong = false,
}: {
  term: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={cn("flex justify-between gap-4", strong && "font-semibold")}
    >
      <dt>{term}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
