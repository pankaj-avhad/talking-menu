"use client"

import Link from "next/link"
import { PhoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ItemPhoto } from "@/components/menu/item-photo"
import { LikeRating } from "@/components/menu/like-rating"
import type { CategoryView, MenuItemView } from "@/lib/menu-view"

const heading = "text-sm font-semibold"

export function ItemDialog({
  item,
  category,
  items,
  onSelectItem,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  item: MenuItemView
  category: CategoryView | undefined
  items: Record<string, MenuItemView>
  onSelectItem: (id: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}) {
  // Category descriptions often list what every item in them comes with.
  const comesWith = category?.comesWith
  const categoryNote = comesWith ?? category?.description
  const goesWith = item.goesWith.map((id) => items[id]).filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        {...(item.description ? {} : { "aria-describedby": undefined })}
      >
        {/* Keyed by item, so picking a "Goes well with" dish starts at the top. */}
        <div
          key={item.id}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {item.photo && (
            <figure>
              <div className="relative aspect-video bg-muted">
                <ItemPhoto
                  photo={item.photo}
                  sizes="(min-width: 640px) 512px, 100vw"
                />
              </div>
              {item.photo.credit && (
                <figcaption className="px-5 pt-2 text-xs text-muted-foreground sm:px-6">
                  Stock photo by{" "}
                  <a
                    href={item.photo.credit.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {item.photo.credit.photographer}
                  </a>{" "}
                  on Pexels
                </figcaption>
              )}
            </figure>
          )}

          {/* A flex column, not a grid: the scrolling "Goes well with" row would
              otherwise widen the grid's one column past the dialog. */}
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <DialogHeader className={item.photo ? "gap-2" : "gap-2 pr-10"}>
              <DialogTitle className="text-xl leading-tight font-semibold tracking-tight">
                {item.name}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-base font-semibold tabular-nums">
                  {item.price}
                </span>
                {item.rating && <LikeRating rating={item.rating} />}
                {item.badges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
                  >
                    {badge}
                  </span>
                ))}
              </div>
              {item.description && (
                <DialogDescription className="text-[0.9375rem] leading-relaxed text-foreground/80">
                  {item.description}
                </DialogDescription>
              )}
            </DialogHeader>

            {categoryNote && (
              <section>
                <h3 className={heading}>
                  {comesWith ? "Comes with" : "Good to know"}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {categoryNote}
                </p>
              </section>
            )}

            {item.addOnGroups.map((group) => (
              <section key={group.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className={heading}>{group.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {group.rule}
                  </span>
                </div>
                <ul className="mt-2 divide-y rounded-xl border">
                  {group.options.map((option) => (
                    <li
                      key={option.id}
                      className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm"
                    >
                      <span>{option.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {option.price ?? "Free"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {item.popularCombos.map((combo) => (
              <p
                key={combo.label + combo.addOns.join()}
                className="rounded-xl bg-muted px-3.5 py-3 text-sm leading-relaxed"
              >
                <span className="font-medium">{combo.label}:</span>{" "}
                {combo.addOns.join(" + ")}
                {combo.price && (
                  <span className="text-muted-foreground tabular-nums">
                    {" "}
                    ({combo.price} total)
                  </span>
                )}
              </p>
            ))}

            {goesWith.length > 0 && (
              <section>
                <h3 className={heading}>Goes well with</h3>
                <ul className="-mx-5 mt-2 no-scrollbar flex gap-3 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
                  {goesWith.map((other) => (
                    <li key={other.id} className="w-28 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectItem(other.id)}
                        className="group w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                      >
                        <span className="relative block aspect-square overflow-hidden rounded-xl bg-muted transition-transform duration-150 ease-out group-active:scale-[0.97]">
                          <ItemPhoto photo={other.photo} sizes="112px" />
                        </span>
                        <span className="mt-1.5 line-clamp-2 block text-xs leading-snug font-medium">
                          {other.name}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {other.price}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {item.takesNote && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Special requests, like no cilantro, can be added when you order.
              </p>
            )}
          </div>
        </div>

        <div className="border-t bg-popover p-4">
          <Button asChild variant="brand" size="lg" className="w-full">
            <Link href="/call">
              <PhoneIcon data-icon="inline-start" />
              Call to order
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
