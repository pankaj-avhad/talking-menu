"use client"

import { Badge } from "@/components/ui/badge"
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

export function ItemDialog({
  item,
  category,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  item: MenuItemView
  category: CategoryView | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}) {
  // Category descriptions often list what every item in them comes with.
  const comesWith = category?.comesWith
  const categoryNote = comesWith ?? category?.description
  const listedIn = [
    category?.name,
    ...item.highlights.map((h) =>
      h.rank ? `#${h.rank} in ${h.name}` : h.name
    ),
  ].filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg"
        {...(item.description ? {} : { "aria-describedby": undefined })}
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
              <figcaption className="px-6 pt-2 text-xs text-muted-foreground">
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

        <div className="grid gap-5 p-6">
          <DialogHeader className="gap-3 pr-10">
            <DialogTitle className="text-2xl leading-tight tracking-normal normal-case">
              {item.name}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-base font-semibold tabular-nums">
                {item.price}
              </span>
              {item.rating && <LikeRating rating={item.rating} />}
              {item.badges.map((badge) => (
                <Badge key={badge} className="text-xs text-chili">
                  {badge}
                </Badge>
              ))}
            </div>
          </DialogHeader>

          {item.description && (
            <DialogDescription className="text-base text-foreground/80">
              {item.description}
            </DialogDescription>
          )}

          <dl className="grid gap-3 border-t pt-5 text-sm sm:grid-cols-[7rem_1fr] sm:gap-x-4">
            {categoryNote && (
              <Detail label={comesWith ? "Comes with" : "Good to know"}>
                {categoryNote}
              </Detail>
            )}
            {item.hasChoices && (
              <Detail label="Options">
                Usually asks for a choice when ordering, such as a protein or
                size. The choices aren&apos;t listed on this menu.
              </Detail>
            )}
            {listedIn.length > 0 && (
              <Detail label="Listed in">{listedIn.join(" · ")}</Detail>
            )}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Detail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1 sm:col-span-2 sm:grid-cols-subgrid">
      <dt className="text-xs font-semibold tracking-widest text-muted-foreground uppercase sm:pt-0.5">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}
