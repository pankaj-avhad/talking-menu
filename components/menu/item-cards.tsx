"use client"

import { Badge } from "@/components/ui/badge"
import { ItemPhoto } from "@/components/menu/item-photo"
import { LikeRating } from "@/components/menu/like-rating"
import { useMenu } from "@/components/menu/menu-provider"
import type { MenuItemView } from "@/lib/menu-view"

// Each card is one big click target: the button in the title stretches over the
// whole card with ::after, so the name stays the button's accessible label.
const stretchedButton =
  "text-left outline-none after:absolute after:inset-0 after:z-10 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background cursor-pointer"

/** A menu row: name, description, price and labels, with a square photo on the right. */
export function MenuItemRow({ item }: { item: MenuItemView }) {
  const { openItem } = useMenu()

  return (
    <article className="group relative flex h-full gap-4 border-b py-5 transition-colors">
      <div className="min-w-0 flex-1">
        <h4 className="font-heading text-lg leading-snug font-semibold group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
          <button
            type="button"
            className={stretchedButton}
            onClick={() => openItem(item.id)}
          >
            {item.name}
          </button>
        </h4>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium tabular-nums">{item.price}</span>
          {item.rating && <LikeRating rating={item.rating} />}
          {item.badges.map((badge) => (
            <Badge key={badge} className="text-xs text-chili">
              {badge}
            </Badge>
          ))}
        </div>
      </div>
      {item.photo && (
        <div className="relative size-24 shrink-0 overflow-hidden bg-muted sm:size-28">
          <ItemPhoto
            photo={item.photo}
            sizes="112px"
            className="transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>
      )}
    </article>
  )
}

/** A card in a highlight row: photo first, with the item's rank when the row is ranked. */
export function HighlightCard({
  item,
  rank,
}: {
  item: MenuItemView
  rank: number | null
}) {
  const { openItem } = useMenu()

  return (
    <article className="group relative">
      <div className="relative aspect-4/3 overflow-hidden bg-muted">
        <ItemPhoto
          photo={item.photo}
          sizes="(min-width: 640px) 208px, 42vw"
          className="transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {rank && (
          <span className="absolute top-2 left-2 bg-background/90 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
            <span className="sr-only">Rank </span>#{rank}
          </span>
        )}
      </div>
      <h3 className="mt-3 line-clamp-2 leading-snug font-medium group-hover:underline group-hover:underline-offset-4">
        <button
          type="button"
          className={stretchedButton}
          onClick={() => openItem(item.id)}
        >
          {item.name}
        </button>
      </h3>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
        <span className="tabular-nums">{item.price}</span>
        {item.rating && <LikeRating rating={item.rating} />}
      </p>
    </article>
  )
}
