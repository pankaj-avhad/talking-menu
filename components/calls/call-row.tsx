import Link from "next/link"
import { GlobeIcon, PhoneIcon } from "lucide-react"

import { StatusBadge } from "@/components/calls/status-badge"
import type { CallSummary } from "@/lib/calls-view"

/** One call in a list: who, what they said first, when, how long, and how it went. */
export function CallRow({ call }: { call: CallSummary }) {
  const ChannelIcon = call.channel === "phone" ? PhoneIcon : GlobeIcon

  return (
    <Link
      href={`/calls/${call.callSid}`}
      className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:gap-4"
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold"
      >
        {call.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{call.caller}</span>
          {call.returning && (
            <span className="text-xs text-muted-foreground">Returning</span>
          )}
        </span>
        {call.snippet && (
          <span className="mt-0.5 line-clamp-1 block text-sm text-muted-foreground">
            {call.snippet.quote ? `“${call.snippet.text}”` : call.snippet.text}
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ChannelIcon aria-hidden className="size-3" />
            <span className="sr-only">
              {call.channel === "phone" ? "Phone call" : "Browser call"},
            </span>
            {call.started}
          </span>
          {call.duration && (
            <span className="font-mono tabular-nums">{call.duration}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusBadge status={call.status} />
        {call.order && (
          <span className="text-xs text-muted-foreground tabular-nums">
            #{call.order.number}, {call.order.total}
          </span>
        )}
      </span>
    </Link>
  )
}
