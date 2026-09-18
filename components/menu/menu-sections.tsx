"use client"

import * as React from "react"
import { SearchXIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Highlights } from "@/components/menu/highlights"
import { MenuItemRow } from "@/components/menu/item-cards"
import { useMenu } from "@/components/menu/menu-provider"
import type { CategoryView, HighlightView } from "@/lib/menu-view"

export function MenuSections({
  menuName,
  menuHours,
  otherMenus,
  categories,
  highlights,
}: {
  menuName: string
  menuHours: string | null
  otherMenus: string[]
  categories: CategoryView[]
  highlights: HighlightView[]
}) {
  const { items, query, setQuery, matchingIds } = useMenu()
  const searching = matchingIds !== null
  const shown = searching
    ? categories
        .map((c) => ({
          ...c,
          itemIds: c.itemIds.filter((id) => matchingIds.has(id)),
        }))
        .filter((c) => c.itemIds.length > 0)
    : categories

  // Results replace the menu in place, so bring the top of them into view.
  const top = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = top.current
    if (!searching || !el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 64
    if (window.scrollY > y) window.scrollTo({ top: y })
  }, [query, searching])

  return (
    <div ref={top} id="menu" className="scroll-mt-20">
      {!searching && <Highlights highlights={highlights} />}

      <section aria-labelledby="menu-title" className="pt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b-2 border-foreground pb-3">
          <h2 id="menu-title" className="font-heading text-3xl font-semibold">
            {menuName}
          </h2>
          {menuHours && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {menuHours}
            </p>
          )}
        </div>
        <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
          {searching
            ? `${matchingIds.size} ${matchingIds.size === 1 ? "dish matches" : "dishes match"} “${query.trim()}”`
            : otherMenus.length > 0 &&
              `${otherMenus.join(" and ")} not included.`}
        </p>

        {shown.map((category) => (
          <CategorySection key={category.id} category={category}>
            {category.itemIds.map((id) => (
              <li key={id}>
                <MenuItemRow item={items[id]} />
              </li>
            ))}
          </CategorySection>
        ))}

        {searching && shown.length === 0 && (
          <Empty className="mt-8 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon />
              </EmptyMedia>
              <EmptyTitle>No dishes found</EmptyTitle>
              <EmptyDescription>
                Nothing on the {menuName.toLowerCase()} matches “{query.trim()}
                ”. Try a dish, an ingredient like “tofu”, or a category.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </section>
    </div>
  )
}

function CategorySection({
  category,
  children,
}: {
  category: CategoryView
  children: React.ReactNode
}) {
  const titleId = `category-${category.id}-title`
  return (
    <section
      id={`category-${category.id}`}
      aria-labelledby={titleId}
      className="scroll-mt-20 pt-10"
    >
      <h3
        id={titleId}
        className="font-heading text-xl font-semibold tracking-wider uppercase"
      >
        {category.name}
      </h3>
      {category.description && (
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {category.description}
        </p>
      )}
      <ul className="mt-2 grid gap-x-10 md:grid-cols-2">{children}</ul>
    </section>
  )
}
