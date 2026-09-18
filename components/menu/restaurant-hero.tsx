import Image from "next/image"
import Link from "next/link"
import { MapPinIcon, PhoneIcon, StarIcon } from "lucide-react"

import { OpenStatus } from "@/components/menu/open-status"
import { Button } from "@/components/ui/button"
import type { MenuPage } from "@/lib/menu-view"

export function RestaurantHero({
  restaurant,
}: {
  restaurant: MenuPage["restaurant"]
}) {
  const kicker = [restaurant.cuisine, restaurant.priceRange]
    .filter(Boolean)
    .join(" · ")

  return (
    <header>
      <div className="relative h-56 overflow-hidden bg-neutral-900 sm:h-80 lg:h-[26rem]">
        {restaurant.headerImage && (
          <Image
            src={restaurant.headerImage}
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-black/0" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto flex max-w-6xl items-end gap-4 px-4 pb-5 sm:gap-6 sm:px-6 sm:pb-8">
            {restaurant.logo && (
              <Image
                src={restaurant.logo}
                alt={`${restaurant.name} logo`}
                width={88}
                height={88}
                className="size-16 shrink-0 ring-1 ring-white/25 sm:size-22"
              />
            )}
            <div className="min-w-0 text-white">
              {kicker && (
                <p className="text-xs font-semibold tracking-widest text-white/80 uppercase">
                  {kicker}
                </p>
              )}
              <h1 className="mt-1 font-heading text-3xl leading-tight font-semibold text-balance sm:text-5xl">
                {restaurant.name}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-sm sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <StarIcon aria-hidden className="size-4 fill-rating text-rating" />
            <span className="font-semibold">{restaurant.rating.average}</span>
            <span className="text-muted-foreground">
              ({restaurant.rating.count.toLocaleString("en-US")} ratings)
            </span>
          </span>
          <OpenStatus
            hours={restaurant.storeHours}
            timeZone={restaurant.timeZone}
          />
          {restaurant.address && (
            <a
              href={restaurant.mapsUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"
            >
              <MapPinIcon aria-hidden className="size-4" />
              {restaurant.address}
            </a>
          )}
          <Button asChild size="sm" className="sm:ml-auto">
            <Link href="/call">
              <PhoneIcon data-icon="inline-start" />
              Order by voice
            </Link>
          </Button>
        </div>
        {restaurant.tags.length > 0 && (
          <ul
            aria-label="Tags"
            className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 pb-4 text-xs font-semibold tracking-widest text-muted-foreground uppercase sm:px-6"
          >
            {restaurant.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </div>
    </header>
  )
}
