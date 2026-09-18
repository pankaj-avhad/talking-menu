import { ThumbsUpIcon } from "lucide-react"

import type { MenuItemView } from "@/lib/menu-view"

/** DoorDash-style "👍 96% (75)": share of raters who liked the item, and how many rated it. */
export function LikeRating({
  rating,
}: {
  rating: NonNullable<MenuItemView["rating"]>
}) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <ThumbsUpIcon aria-hidden className="size-3.5" />
      <span aria-hidden className="tabular-nums">
        {rating.likePercent}% ({rating.count})
      </span>
      <span className="sr-only">
        {rating.likePercent}% of {rating.count} ratings liked it
      </span>
    </span>
  )
}
