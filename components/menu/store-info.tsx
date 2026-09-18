import { ArrowUpRightIcon, PhoneIcon } from "lucide-react"

import { OpenStatus } from "@/components/menu/open-status"
import type { MenuPage } from "@/lib/menu-view"

const panel = "rounded-2xl border bg-card p-5"
const link =
  "inline-flex items-center gap-1.5 rounded-md font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"

export function StoreInfo({
  restaurant,
}: {
  restaurant: MenuPage["restaurant"]
}) {
  return (
    <div className="grid gap-4 py-10 sm:grid-cols-2 lg:sticky lg:top-20 lg:grid-cols-1">
      <section aria-labelledby="hours-title" className={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="hours-title" className="font-semibold">
            Hours
          </h2>
          <OpenStatus
            hours={restaurant.storeHours}
            timeZone={restaurant.timeZone}
            className="text-sm"
          />
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          {restaurant.hoursByDay.map((group) => (
            <div key={group.days} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{group.days}</dt>
              <dd className="text-right tabular-nums">
                {group.ranges.length > 0 ? (
                  group.ranges.map((range) => <div key={range}>{range}</div>)
                ) : (
                  <span className="text-muted-foreground">Closed</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {restaurant.timeZoneName && (
          <p className="mt-4 text-xs text-muted-foreground">
            All times {restaurant.timeZoneName}
          </p>
        )}
      </section>

      <section aria-labelledby="location-title" className={panel}>
        <h2 id="location-title" className="font-semibold">
          Location
        </h2>
        {restaurant.address && (
          <address className="mt-2 text-sm leading-relaxed text-muted-foreground not-italic">
            {restaurant.address}
          </address>
        )}
        <ul className="mt-4 grid gap-2.5 text-sm">
          {restaurant.mapsUrl && (
            <li>
              <a
                href={restaurant.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className={link}
              >
                Get directions
                <ArrowUpRightIcon aria-hidden className="size-3.5" />
              </a>
            </li>
          )}
          {restaurant.phone && (
            <li>
              <a
                href={restaurant.phone.href}
                className={`${link} tabular-nums`}
              >
                <PhoneIcon aria-hidden className="size-3.5" />
                {restaurant.phone.display}
              </a>
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
