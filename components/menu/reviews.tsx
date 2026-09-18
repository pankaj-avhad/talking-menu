import { StarIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ItemMention } from "@/components/menu/item-mention"
import type { MenuPage, ReviewView } from "@/lib/menu-view"
import { cn } from "@/lib/utils"

export function Reviews({
  rating,
  reviews,
}: {
  rating: MenuPage["restaurant"]["rating"]
  reviews: ReviewView[]
}) {
  return (
    <section
      id="reviews"
      aria-labelledby="reviews-title"
      className="scroll-mt-20 pt-16"
    >
      <h2
        id="reviews-title"
        className="border-b-2 border-foreground pb-3 font-heading text-3xl font-semibold"
      >
        Reviews
      </h2>
      <div className="mt-8 grid gap-10 md:grid-cols-[14rem_minmax(0,1fr)]">
        <RatingSummary rating={rating} />
        <ul className="divide-y">
          {reviews.map((review) => (
            <li key={review.key} className="py-6 first:pt-0">
              <ReviewCard review={review} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Average, count, and a one-series bar per star level; every count is also printed. */
function RatingSummary({
  rating,
}: {
  rating: MenuPage["restaurant"]["rating"]
}) {
  // Bars show each level's share of the breakdown. The breakdown doesn't always
  // add up to rating.count, so only raw counts are printed, never percentages.
  const total = rating.breakdown.reduce((sum, row) => sum + row.count, 0)

  return (
    <div>
      <p className="text-5xl font-semibold tracking-tight">{rating.average}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        out of 5 · {rating.count.toLocaleString("en-US")} ratings
      </p>
      {total > 0 && (
        <dl className="mt-5 grid gap-2 text-sm">
          {rating.breakdown.map(({ stars, count }) => (
            <div
              key={stars}
              title={`${count.toLocaleString("en-US")} ${stars}-star ratings`}
              className="grid grid-cols-[2rem_minmax(0,1fr)_3rem] items-center gap-2"
            >
              <dt className="inline-flex items-center gap-1 tabular-nums">
                {stars}
                <StarIcon
                  aria-hidden
                  className="size-3 fill-muted-foreground text-muted-foreground"
                />
                <span className="sr-only">
                  {stars === 1 ? "star" : "stars"}
                </span>
              </dt>
              <dd aria-hidden className="h-2 bg-rating/15">
                <div
                  className="h-full rounded-r-[4px] bg-rating"
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </dd>
              <dd className="text-right text-muted-foreground tabular-nums">
                {count.toLocaleString("en-US")}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function ReviewCard({ review }: { review: ReviewView }) {
  return (
    <article className="flex gap-4">
      <Avatar size="lg" aria-hidden>
        <AvatarFallback className="text-xs font-semibold">
          {review.initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-semibold">{review.reviewer}</h3>
          {review.date && (
            <time
              dateTime={review.dateTime ?? undefined}
              className="text-xs text-muted-foreground"
            >
              {review.date}
            </time>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs">
          {review.stars !== null && <Stars count={review.stars} />}
          {review.reaction && (
            <span className="font-semibold tracking-widest text-muted-foreground uppercase">
              {review.reaction}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">
          {review.parts.map((part, i) =>
            part.itemId ? (
              <ItemMention key={i} itemId={part.itemId}>
                {part.text}
              </ItemMention>
            ) : (
              part.text
            )
          )}
        </p>
      </div>
    </article>
  )
}

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          aria-hidden
          className={cn(
            "size-3.5",
            n <= count
              ? "fill-rating text-rating"
              : "fill-transparent text-muted-foreground/50"
          )}
        />
      ))}
      <span className="sr-only">{count} out of 5 stars</span>
    </span>
  )
}
