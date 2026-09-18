import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { PhoneIcon, XIcon } from "lucide-react"

import { CallRow } from "@/components/calls/call-row"
import { LiveRefresh } from "@/components/calls/live-refresh"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getCallsDashboard, type CallerSummary } from "@/lib/calls-view"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Calls",
  robots: { index: false },
}

type Props = { searchParams: Promise<{ caller?: string | string[] }> }

export default async function CallsPage({ searchParams }: Props) {
  // Calls change all the time, so always read the current records.
  await connection()
  const { caller } = await searchParams
  const data = await getCallsDashboard(
    typeof caller === "string" ? caller : undefined
  )
  const { stats } = data

  return (
    <>
      <SiteHeader current="calls" />
      <LiveRefresh every={data.hasLive ? 2000 : 5000} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Calls</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Everyone who called, what they said, and what the host saved. Updates
          on its own every few seconds.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Calls" value={stats.calls} />
          <Stat label="Orders" value={stats.orders} />
          <Stat label="Ordered" value={stats.orderValue} />
          <Stat label="Handed to staff" value={stats.transferred} />
        </dl>

        {stats.calls === 0 ? (
          <NoCalls />
        ) : (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <Callers callers={data.callers} selectedId={data.selected?.id} />

            <section
              aria-labelledby="calls-title"
              className="rounded-2xl border bg-card p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 pb-1">
                <h2 id="calls-title" className="font-semibold">
                  {data.selected
                    ? `Calls from ${data.selected.name}`
                    : "Recent calls"}
                </h2>
                {data.selected && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/calls">
                      <XIcon data-icon="inline-start" />
                      Show everyone
                    </Link>
                  </Button>
                )}
              </div>
              <ol>
                {data.calls.map((call) => (
                  <li key={call.callSid}>
                    <CallRow call={call} />
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
    </div>
  )
}

function Callers({
  callers,
  selectedId,
}: {
  callers: CallerSummary[]
  selectedId: string | undefined
}) {
  return (
    <section
      aria-labelledby="callers-title"
      className="rounded-2xl border bg-card p-2"
    >
      <h2 id="callers-title" className="px-3 pt-2 pb-1 font-semibold">
        Callers{" "}
        <span className="font-normal text-muted-foreground">
          {callers.length}
        </span>
      </h2>
      {callers.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">
          Nobody has given a name yet.
        </p>
      ) : (
        <ul>
          {callers.map((caller) => (
            <li key={caller.id}>
              <Link
                href={`/calls?caller=${caller.id}`}
                aria-current={caller.id === selectedId ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  "aria-[current=page]:bg-muted"
                )}
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold"
                >
                  {caller.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {caller.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {caller.calls} {caller.calls === 1 ? "call" : "calls"},{" "}
                    {caller.orders} {caller.orders === 1 ? "order" : "orders"}
                  </span>
                </span>
                {caller.lastCall && (
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {caller.lastCall.replace(/, .*$/, "")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NoCalls() {
  return (
    <Empty className="mt-8 rounded-2xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PhoneIcon />
        </EmptyMedia>
        <EmptyTitle>No calls yet</EmptyTitle>
        <EmptyDescription>
          Calls appear here as soon as the relay (npm run relay) handles one,
          with the transcript and everything the host saved. A deployed site
          needs a database for this, since the records are files on the
          relay&apos;s machine.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="brand">
          <Link href="/call">
            <PhoneIcon data-icon="inline-start" />
            Make a test call
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
