import Image from "next/image"
import Link from "next/link"
import { ArrowUpRightIcon, PhoneIcon, StarIcon } from "lucide-react"

import { OpenStatus } from "@/components/menu/open-status"
import { Button } from "@/components/ui/button"
import type { MenuPage } from "@/lib/menu-view"

/** Split hero: rating and hours, the name, one line about the food, and the call button. */
export function RestaurantHero({
  restaurant,
  summary,
}: {
  restaurant: MenuPage["restaurant"]
  /** e.g. "Vietnamese banh mi sandwiches, vermicelli noodle bowls and rice plates." */
  summary: string
}) {
  return (
    <section
      aria-labelledby="restaurant-name"
      className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-4 sm:px-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-14 lg:pt-12"
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted lg:order-2 lg:aspect-[4/3] lg:rounded-3xl">
        {restaurant.headerImage && (
          <Image
            src={restaurant.headerImage}
            alt={`Dishes from ${restaurant.name}`}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1024px) 600px, 100vw"
            className="object-cover"
          />
        )}
      </div>

      <div className="lg:order-1">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <StarIcon aria-hidden className="size-4 fill-rating text-rating" />
            <span className="font-semibold">{restaurant.rating.average}</span>
            <span className="text-muted-foreground">
              {restaurant.rating.count.toLocaleString("en-US")} ratings
            </span>
          </span>
          <OpenStatus
            hours={restaurant.storeHours}
            timeZone={restaurant.timeZone}
          />
        </p>
        <h1
          id="restaurant-name"
          className="mt-3 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl"
        >
          {restaurant.name}
        </h1>
        <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          {summary} Call and our AI host takes your order.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="brand">
            <Link href="/call">
              <PhoneIcon data-icon="inline-start" />
              Call to order
            </Link>
          </Button>
          {restaurant.mapsUrl && (
            <Button asChild size="lg" variant="outline">
              <a href={restaurant.mapsUrl} target="_blank" rel="noreferrer">
                Directions
                <ArrowUpRightIcon data-icon="inline-end" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
