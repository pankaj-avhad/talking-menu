"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HighlightCard } from "@/components/menu/item-cards"
import { useMenu } from "@/components/menu/menu-provider"
import type { HighlightView } from "@/lib/menu-view"

/** The collections from menu.json (Most Ordered, Featured, Most Liked) as tabbed rows. */
export function Highlights({ highlights }: { highlights: HighlightView[] }) {
  if (highlights.length === 0) return null

  return (
    <section
      id="highlights"
      aria-labelledby="highlights-title"
      className="scroll-mt-20 pt-10"
    >
      <h2 id="highlights-title" className="font-heading text-3xl font-semibold">
        Highlights
      </h2>
      <Tabs defaultValue={highlights[0].id} className="mt-4 gap-5">
        <div className="-mx-4 no-scrollbar overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="line" className="w-max justify-start border-b p-0">
            {highlights.map((h) => (
              <TabsTrigger
                key={h.id}
                value={h.id}
                className="h-10 px-3 first:pl-0"
              >
                {h.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {highlights.map((h) => (
          <TabsContent key={h.id} value={h.id}>
            <HighlightRow highlight={h} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function HighlightRow({ highlight }: { highlight: HighlightView }) {
  const { items } = useMenu()
  const scroller = React.useRef<HTMLUListElement>(null)
  const [edges, setEdges] = React.useState({ start: true, end: false })

  const updateEdges = React.useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }, [])

  React.useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateEdges])

  function scrollByPage(direction: 1 | -1) {
    const el = scroller.current
    if (!el) return
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    el.scrollBy({
      left: direction * el.clientWidth * 0.85,
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }

  return (
    <div className="relative">
      <ul
        ref={scroller}
        onScroll={updateEdges}
        aria-label={highlight.name}
        className="-mx-4 no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0"
      >
        {highlight.itemIds.map((id, index) => (
          // On phones, 42% leaves part of a third card showing, which says "scrolls".
          <li key={id} className="w-[42%] shrink-0 snap-start sm:w-52">
            <HighlightCard
              item={items[id]}
              rank={highlight.ranked ? index + 1 : null}
            />
          </li>
        ))}
      </ul>
      {/* Centered on the 4:3 photos of the w-52 cards: 156px tall, minus half a 36px button.
          z-20 lifts the buttons over the cards' click overlays (z-10). */}
      <div className="pointer-events-none absolute inset-x-0 top-15 z-20 hidden justify-between sm:flex">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Scroll ${highlight.name} back`}
          disabled={edges.start}
          onClick={() => scrollByPage(-1)}
          className="pointer-events-auto -ml-4 bg-background shadow-sm disabled:opacity-0"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Scroll ${highlight.name} forward`}
          disabled={edges.end}
          onClick={() => scrollByPage(1)}
          className="pointer-events-auto -mr-4 bg-background shadow-sm disabled:opacity-0"
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}
