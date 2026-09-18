import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"

import { CallRow } from "@/components/calls/call-row"
import { LiveRefresh } from "@/components/calls/live-refresh"
import { StatusBadge } from "@/components/calls/status-badge"
import { SiteHeader } from "@/components/site-header"
import { getCallDetail, type CallDetail } from "@/lib/calls-view"
import { cn } from "@/lib/utils"

type Props = { params: Promise<{ callSid: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { callSid } = await params
  const detail = await getCallDetail(callSid)
  return {
    title: detail ? `Call from ${detail.summary.caller}` : "Call not found",
    robots: { index: false },
  }
}

const panel = "rounded-2xl border bg-card p-5"

export default async function CallPage({ params }: Props) {
  await connection()
  const { callSid } = await params
  const detail = await getCallDetail(callSid)
  if (!detail) notFound()
  const { summary, context, customer } = detail
  const live = summary.status === "live"

  return (
    <>
      <SiteHeader current="calls" />
      {live && <LiveRefresh every={2000} />}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <Link
          href="/calls"
          className="inline-flex items-center gap-1.5 rounded-full text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          All calls
        </Link>

        <header className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-full bg-muted font-semibold"
            >
              {summary.initials}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {summary.caller}
              </h1>
              <p className="text-sm text-muted-foreground">
                {context.channel} call, {summary.started}
                {summary.duration && (
                  <>
                    ,{" "}
                    <span className="font-mono tabular-nums">
                      {summary.duration}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <StatusBadge status={summary.status} />
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Transcript detail={detail} live={live} />

          <aside aria-label="What was saved" className="grid gap-4">
            {customer && (
              <section aria-labelledby="caller-title" className={panel}>
                <h2 id="caller-title" className="font-semibold">
                  {customer.name}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {summary.returning ? "Returning caller" : "First call"}
                </p>
                <Facts
                  facts={[
                    ["Phone", customer.phone ?? "Not given (browser call)"],
                    ["First called", customer.firstSeen],
                    ["Calls", String(customer.calls)],
                    ["Last address", customer.lastAddress],
                    ["Last order", customer.lastOrder],
                    ["Name key", customer.nameKey, "mono"],
                  ]}
                />
                {customer.calls > 1 && (
                  <Link
                    href={`/calls?caller=${customer.id}`}
                    className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
                  >
                    All calls from {customer.name}
                  </Link>
                )}
              </section>
            )}

            <section aria-labelledby="context-title" className={panel}>
              <h2 id="context-title" className="font-semibold">
                This call
              </h2>
              <Facts
                facts={[
                  ["Ended", live ? "Still in progress" : context.endReason],
                  ["Hand-off", context.transfer?.reason ?? null],
                  ["Summary for staff", context.transfer?.summary ?? null],
                  ["Deliver to", context.address],
                  ["Caller ID", context.callerPhone],
                  ["Call ID", summary.callSid, "mono"],
                ]}
              />
              {context.offered.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Suggested by the host
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {context.offered.map((name) => (
                      <li
                        key={name}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <OrderPanel detail={detail} live={live} />

            {detail.otherCalls.length > 0 && (
              <section
                aria-labelledby="other-title"
                className="rounded-2xl border bg-card p-2"
              >
                <h2 id="other-title" className="px-3 pt-2 pb-1 font-semibold">
                  Other calls from {summary.caller}
                </h2>
                <ol>
                  {detail.otherCalls.map((call) => (
                    <li key={call.callSid}>
                      <CallRow call={call} />
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <details className="group rounded-2xl border bg-card">
              <summary className="cursor-pointer rounded-2xl px-5 py-4 text-sm font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50">
                Saved record (JSON)
              </summary>
              <pre className="max-h-96 overflow-auto border-t px-5 py-4 font-mono text-xs leading-relaxed">
                {detail.raw}
              </pre>
            </details>
          </aside>
        </div>
      </main>
    </>
  )
}

function Transcript({ detail, live }: { detail: CallDetail; live: boolean }) {
  const { transcript } = detail
  return (
    <section aria-labelledby="transcript-title" className={cn(panel, "sm:p-6")}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="transcript-title" className="font-semibold">
          Transcript
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {transcript.length} {transcript.length === 1 ? "line" : "lines"}
        </span>
      </div>
      {transcript.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {live ? "Waiting for the first words…" : "Nothing was said."}
        </p>
      ) : (
        <ol className="mt-5 grid gap-4">
          {transcript.map((line) => {
            const caller = line.speaker === "customer"
            return (
              <li
                key={line.id}
                className={cn(
                  "flex max-w-[88%] flex-col gap-1",
                  caller && "items-end justify-self-end"
                )}
              >
                <span className="px-1 text-xs text-muted-foreground">
                  {line.speakerLabel}{" "}
                  <span className="font-mono tabular-nums">{line.time}</span>
                </span>
                <p
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    caller
                      ? "rounded-tr-md bg-foreground text-background"
                      : line.speaker === "staff"
                        ? "rounded-tl-md border bg-background"
                        : "rounded-tl-md bg-muted"
                  )}
                >
                  {line.text}
                  {line.interrupted && (
                    <span className="ml-1 text-xs opacity-70">
                      (cut off by the caller)
                    </span>
                  )}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function OrderPanel({ detail, live }: { detail: CallDetail; live: boolean }) {
  const { cart, order } = detail.context
  return (
    <section aria-labelledby="order-title" className={panel}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="order-title" className="font-semibold">
          {order ? `Order #${order.number}` : live ? "Cart so far" : "Cart"}
        </h2>
        {order && (
          <span
            className={cn(
              "text-sm",
              order.paid ? "font-medium text-brand" : "text-muted-foreground"
            )}
          >
            {order.status}
          </span>
        )}
      </div>
      {cart.lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing in the cart.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex gap-3 py-2.5 text-sm">
                <span className="w-6 shrink-0 font-semibold tabular-nums">
                  {line.quantity}×
                </span>
                <span className="min-w-0 flex-1">
                  {line.name}
                  {line.addOns.map((addOn) => (
                    <span
                      key={addOn}
                      className="block text-xs text-muted-foreground"
                    >
                      + {addOn}
                    </span>
                  ))}
                  {line.note && (
                    <span className="block text-xs text-muted-foreground">
                      {line.note}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{line.total}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t pt-2.5 text-sm font-semibold">
            <span>{order ? "Total" : "Subtotal"}</span>
            <span className="tabular-nums">
              {order ? order.total : cart.subtotal}
            </span>
          </p>
        </>
      )}
      {order && (
        <Link
          href={`/orders/${order.id}`}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          Open the check
          <ArrowUpRightIcon aria-hidden className="size-3.5" />
        </Link>
      )}
    </section>
  )
}

/** Label/value rows; rows without a value are left out. */
function Facts({ facts }: { facts: [string, string | null, "mono"?][] }) {
  const shown = facts.filter(([, value]) => value)
  if (shown.length === 0) return null
  return (
    <dl className="mt-4 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
      {shown.map(([label, value, style]) => (
        <div key={label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              "break-words",
              style === "mono" && "font-mono text-xs"
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
