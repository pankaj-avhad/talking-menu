"use client"

import { ItemPhoto } from "@/components/menu/item-photo"
import { LikeRating } from "@/components/menu/like-rating"
import { useMenu } from "@/components/menu/menu-provider"
import type { MenuItemView } from "@/lib/menu-view"

// Each card is one big click target: the button in the title stretches over the
// whole card with ::after, so the name stays the button's accessible label.
const stretchedButton =
  "cursor-pointer text-left outline-none after:absolute after:inset-0 after:z-10 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/60"

// Hover only zooms on devices that hover (Tailwind's hover: already checks),
// and never with reduced motion.
const photoZoom =
  "transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"

/** A menu row: name, description, price and labels, with a square photo on the right. */
export function MenuItemRow({ item }: { item: MenuItemView }) {
  const { openItem } = useMenu()

  return (
    <article className="group relative -mx-3 flex h-full gap-4 rounded-2xl p-3 transition-[background-color,transform] duration-150 ease-out hover:bg-muted has-[button:active]:scale-[0.99]">
      <div className="min-w-0 flex-1 py-0.5">
        <h4 className="leading-snug font-semibold">
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
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium tabular-nums">{item.price}</span>
          {item.rating && <LikeRating rating={item.rating} />}
          {item.badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
            >
              {badge}
            </span>
          ))}
        </p>
      </div>
      {item.photo && (
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28">
          <ItemPhoto photo={item.photo} sizes="112px" className={photoZoom} />
        </div>
      )}
    </article>
  )
}

/** A card in a highlight row: photo first, then the name (with its rank in ranked rows). */
export function HighlightCard({
  item,
  rank,
}: {
  item: MenuItemView
  rank: number | null
}) {
  const { openItem } = useMenu()

  return (
    <article className="group relative transition-transform duration-150 ease-out has-[button:active]:scale-[0.98]">
      <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-muted">
        <ItemPhoto
          photo={item.photo}
          sizes="(min-width: 640px) 208px, 42vw"
          className={photoZoom}
        />
      </div>
      <h3 className="mt-3 line-clamp-2 leading-snug font-semibold">
        <button
          type="button"
          className={stretchedButton}
          onClick={() => openItem(item.id)}
        >
          {rank && (
            <span className="mr-1 text-muted-foreground tabular-nums">
              {rank}.
            </span>
          )}
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
