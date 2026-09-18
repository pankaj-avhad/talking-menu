import { CheckIcon, HeadsetIcon, PhoneMissedIcon } from "lucide-react"

import type { CallStatus } from "@/lib/calls-view"
import { cn } from "@/lib/utils"

const LABEL: Record<CallStatus, string> = {
  live: "Live",
  ordered: "Ordered",
  transferred: "Handed to staff",
  abandoned: "No order",
}

const STYLE: Record<CallStatus, string> = {
  live: "bg-brand text-brand-foreground",
  ordered: "bg-brand/10 text-brand",
  transferred: "bg-secondary text-secondary-foreground",
  abandoned: "bg-muted text-muted-foreground",
}

const ICON = {
  ordered: CheckIcon,
  transferred: HeadsetIcon,
  abandoned: PhoneMissedIcon,
}

/** The call's outcome as an icon and a word, so it never rests on color alone. */
export function StatusBadge({ status }: { status: CallStatus }) {
  const Icon = status === "live" ? null : ICON[status]
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        STYLE[status]
      )}
    >
      {Icon ? (
        <Icon aria-hidden className="size-3.5" />
      ) : (
        // A call in progress: the one place a pulsing dot means something.
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-foreground/70 motion-reduce:animate-none" />
          <span className="relative size-2 rounded-full bg-brand-foreground" />
        </span>
      )}
      {LABEL[status]}
    </span>
  )
}
