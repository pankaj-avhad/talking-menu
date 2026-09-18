import { ArrowUpRightIcon, PhoneIcon } from "lucide-react"

import { OpenStatus } from "@/components/menu/open-status"
import type { MenuPage } from "@/lib/menu-view"

const heading =
  "text-xs font-semibold tracking-widest text-muted-foreground uppercase"

export function StoreInfo({
  restaurant,
}: {
  restaurant: MenuPage["restaurant"]
}) {
  return (
    <div className="grid gap-10 border-t py-12 sm:grid-cols-2 lg:sticky lg:top-14 lg:grid-cols-1 lg:border-t-0 lg:pt-10">
      <section aria-labelledby="hours-title">
        <h2 id="hours-title" className={heading}>
          Hours
        </h2>
        <OpenStatus
          hours={restaurant.storeHours}
          timeZone={restaurant.timeZone}
          className="mt-3 text-sm"
        />
        <dl className="mt-3 grid gap-1.5 text-sm">
          {restaurant.hoursByDay.map((group) => (
            <div key={group.days} className="flex justify-between gap-4">
              <dt>{group.days}</dt>
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
          <p className="mt-3 text-xs text-muted-foreground">
            All times {restaurant.timeZoneName}
          </p>
        )}
      </section>

      <section aria-labelledby="location-title">
        <h2 id="location-title" className={heading}>
          Location
        </h2>
        {restaurant.address && (
          <address className="mt-3 text-sm leading-relaxed not-italic">
            {restaurant.address}
          </address>
        )}
        <ul className="mt-3 grid gap-2 text-sm">
          {restaurant.mapsUrl && (
            <li>
              <a
                href={restaurant.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:decoration-2"
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
                className="inline-flex items-center gap-2 font-medium tabular-nums underline underline-offset-4 hover:decoration-2"
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
