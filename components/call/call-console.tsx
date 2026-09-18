"use client"

import * as React from "react"
import {
  ArrowUpRightIcon,
  HeadphonesIcon,
  Loader2Icon,
  PhoneIcon,
  PhoneOffIcon,
  UserRoundIcon,
  WrenchIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useVoiceCall, type ToolNote, type VoiceCall } from "@/components/call/use-voice-call"
import type { TranscriptLine } from "@/lib/store"
import { formatUsd } from "@/lib/money"
import { cn } from "@/lib/utils"

const label = "text-xs font-semibold tracking-widest text-muted-foreground uppercase"

export function CallConsole({
  restaurantName,
  relayUrl,
}: {
  restaurantName: string
  relayUrl: string
}) {
  const { call, agentSpeaking, micLevel, start, hangUp } = useVoiceCall(relayUrl)

  return (
    <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="call-title" className="min-w-0">
        <p className={label}>Order by voice</p>
        <h1
          id="call-title"
          className="mt-1 font-heading text-3xl leading-tight font-semibold text-balance sm:text-4xl"
        >
          Call {restaurantName}
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Talk to our AI host the way you would on the phone. It takes your
          order from the menu, reads it back, and gives you a link to pay.
        </p>

        <CallControls
          call={call}
          agentSpeaking={agentSpeaking}
          micLevel={micLevel}
          onStart={start}
          onHangUp={hangUp}
        />

        <Transcript lines={call.lines} notes={call.notes} phase={call.phase} />
      </section>

      <aside aria-label="Your order" className="lg:pt-8">
        <OrderPanel call={call} />
      </aside>
    </div>
  )
}

function CallControls({
  call,
  agentSpeaking,
  micLevel,
  onStart,
  onHangUp,
}: {
  call: VoiceCall
  agentSpeaking: boolean
  micLevel: React.RefObject<number>
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
    <div className="mt-8 border-y py-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        {phase === "live" || phase === "connecting" ? (
          <Button
            size="lg"
            variant="destructive"
            onClick={onHangUp}
            disabled={phase === "connecting"}
          >
            {phase === "connecting" ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <PhoneOffIcon data-icon="inline-start" />
            )}
            {phase === "connecting" ? "Connecting" : "Hang up"}
          </Button>
        ) : (
          <Button size="lg" onClick={onStart}>
            <PhoneIcon data-icon="inline-start" />
            {phase === "ended" ? "Call again" : "Start call"}
          </Button>
        )}

        {phase === "live" && (
          <div className="flex items-center gap-3 text-sm" aria-live="polite">
            <span
              aria-hidden
              className={cn(
                "size-2.5 rounded-full",
                agentSpeaking ? "animate-pulse bg-chili" : "bg-open"
              )}
            />
            <span className="font-medium">{status}</span>
            <MicMeter level={micLevel} />
          </div>
        )}
        {phase === "connecting" && (
          <p className="text-sm text-muted-foreground">{status}</p>
        )}
      </div>

      {call.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {call.error}
        </p>
      )}
      {!call.error && call.ended && (
        <p className="mt-4 text-sm text-muted-foreground">{call.ended.message}</p>
      )}
      {phase === "idle" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <HeadphonesIcon aria-hidden className="size-4 shrink-0" />
          Uses your microphone. Headphones keep the host from hearing itself.
        </p>
      )}
    </div>
  )
}

/** A small live bar for the microphone, drawn every frame from a ref. */
function MicMeter({ level }: { level: React.RefObject<number> }) {
  const bar = React.useRef<HTMLSpanElement>(null)
  React.useEffect(() => {
    let frame = 0
    const draw = () => {
      const value = Math.min(1, (level.current ?? 0) * 6)
      if (bar.current) bar.current.style.transform = `scaleX(${value})`
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [level])

  return (
    <span
      className="relative h-1.5 w-20 overflow-hidden bg-muted"
      role="img"
      aria-label="Microphone level"
    >
      <span
        ref={bar}
        className="absolute inset-0 origin-left scale-x-0 bg-foreground"
      />
    </span>
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

  if (entries.length === 0) {
    return phase === "idle" ? null : (
      <p className="mt-8 text-sm text-muted-foreground">
        The conversation will appear here.
      </p>
    )
  }

  return (
    <section aria-labelledby="transcript-title" className="mt-8">
      <h2 id="transcript-title" className={label}>
        Transcript
      </h2>
      <ol
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="mt-4 grid max-h-[32rem] gap-3 overflow-y-auto overscroll-contain pr-2"
        aria-live="polite"
      >
        {entries.map((entry) =>
          entry.kind === "note" ? (
            <li
              key={`note-${entry.note.id}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <WrenchIcon aria-hidden className="size-3 shrink-0" />
              {entry.note.label}
            </li>
          ) : (
            <li
              key={`line-${entry.line.id}`}
              className={cn(
                "max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed",
                entry.line.speaker === "customer"
                  ? "justify-self-end bg-foreground text-background"
                  : "bg-muted"
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
    </section>
  )
}

function OrderPanel({ call }: { call: VoiceCall }) {
  const { cart, customer, order, transfer } = call
  const lines = cart?.lines ?? []

  return (
    <div className="border-t-2 border-foreground pt-4 lg:sticky lg:top-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-2xl font-semibold">Your order</h2>
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
        <p className="mt-6 text-sm text-muted-foreground">
          {call.phase === "idle"
            ? "Start a call and tell the host what you'd like. Your order fills in here as you talk."
            : "Nothing yet."}
        </p>
      ) : (
        <>
          <ul className="mt-5 divide-y border-y">
            {lines.map((line) => (
              <li key={line.lineId} className="flex gap-3 py-3 text-sm">
                <span className="w-6 shrink-0 font-semibold tabular-nums">
                  {line.quantity}×
                </span>
                <span className="min-w-0 flex-1">
                  {line.name}
                  {(line.addOns ?? []).map((addOn) => (
                    <span key={addOn.id} className="block text-xs text-muted-foreground">
                      + {addOn.name.replace(/^Add\s+/i, "")}
                    </span>
                  ))}
                  {line.note && (
                    <span className="block text-xs text-muted-foreground">
                      {line.note}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{formatUsd(line.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid gap-1.5 text-sm">
            {cart!.deliveryFeeCents > 0 && (
              <>
                <Row term="Subtotal" value={formatUsd(cart!.subtotalCents)} />
                <Row term="Delivery" value={formatUsd(cart!.deliveryFeeCents)} />
              </>
            )}
            <Row term="Total" value={formatUsd(cart!.totalCents)} strong />
          </dl>
        </>
      )}

      {cart?.address && (
        <div className="mt-5 text-sm">
          <p className={label}>Deliver to</p>
          <p className="mt-1">{cart.address}</p>
        </div>
      )}

      {order && (
        <div className="mt-6 border border-open/40 bg-open/5 p-4">
          <p className="font-heading text-lg font-semibold">Order #{order.number} placed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            On a phone call this link arrives by text message.
          </p>
          <Button asChild className="mt-3 w-full">
            <a href={order.url} target="_blank" rel="noreferrer">
              View and pay {formatUsd(order.totalCents)}
              <ArrowUpRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </div>
      )}

      {transfer && (
        <div className="mt-6 border p-4 text-sm">
          <p className="font-heading text-lg font-semibold">Handed to staff</p>
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
    <div className={cn("flex justify-between gap-4", strong && "font-semibold")}>
      <dt>{term}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
