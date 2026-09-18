"use client"

import * as React from "react"

import { getOpenStatus } from "@/lib/hours"
import type { WeeklyHours } from "@/lib/menu"
import { cn } from "@/lib/utils"

// A clock that ticks every 30 s. The server snapshot is null: the page is
// static, so "open now" can only be decided in the visitor's browser.
function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 30_000)
  return () => window.clearInterval(id)
}
const currentMinute = () => Math.floor(Date.now() / 60_000)
const noMinuteOnServer = () => null

/** "Open now · until 2:15 PM" or "Closed · opens Mon 11 AM", in the restaurant's time zone. */
export function OpenStatus({
  hours,
  timeZone,
  className,
}: {
  hours: WeeklyHours
  timeZone: string | null
  className?: string
}) {
  const minute = React.useSyncExternalStore(
    subscribe,
    currentMinute,
    noMinuteOnServer
  )
  const status =
    minute === null || !timeZone
      ? null
      : getOpenStatus(hours, timeZone, new Date(minute * 60_000))

  if (!status) return null

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          status.open ? "bg-open" : "bg-muted-foreground/60"
        )}
      />
      <span>
        <span className={cn("font-semibold", status.open && "text-open")}>
          {status.open ? "Open now" : "Closed"}
        </span>
        {status.detail && (
          <span className="text-muted-foreground"> · {status.detail}</span>
        )}
      </span>
    </span>
  )
}
