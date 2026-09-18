"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useMenu } from "@/components/menu/menu-provider"
import { cn } from "@/lib/utils"

export type NavSection = {
  /** The id of the element on the page. */
  id: string
  label: string
  /** Set for menu categories, which search can hide. */
  categoryId?: string
  /** Hidden while searching (the highlight rows are). */
  hideWhileSearching?: boolean
}

// The bar is h-14; sections use scroll-mt-20 to clear it.
const OBSERVER_MARGIN = "-72px 0px -55% 0px"

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Sticky bar with a link per section (highlighting the one in view) and the menu search. */
export function MenuNav({ sections }: { sections: NavSection[] }) {
  const { query, setQuery, matchingIds, items } = useMenu()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const visible = React.useMemo(() => {
    if (!matchingIds) return sections
    const categoriesWithMatches = new Set(
      [...matchingIds].map((id) => items[id].categoryId)
    )
    return sections.filter((s) =>
      s.categoryId
        ? categoriesWithMatches.has(s.categoryId)
        : !s.hideWhileSearching
    )
  }, [sections, matchingIds, items])

  const [active, setActive] = useActiveSection(visible)

  function goTo(event: React.MouseEvent, id: string) {
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    setActive(id, { lock: true })
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    })
  }

  function closeSearch() {
    setQuery("")
    setSearchOpen(false)
  }

  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search the menu"
          aria-expanded={searchOpen}
          className={cn("-ml-2 md:hidden", searchOpen && "hidden")}
          onClick={() => {
            setSearchOpen(true)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
        >
          <SearchIcon className="size-4" />
        </Button>

        <SectionLinks
          sections={visible}
          active={active}
          onNavigate={goTo}
          className={cn(searchOpen && "hidden md:flex")}
        />

        <div
          className={cn(
            "items-center gap-2 md:ml-auto md:flex md:w-64 md:shrink-0",
            searchOpen ? "flex flex-1" : "hidden"
          )}
        >
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              placeholder="Search dishes"
              aria-label="Search the menu"
              autoComplete="off"
              className="[&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 md:hidden"
            onClick={closeSearch}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function SectionLinks({
  sections,
  active,
  onNavigate,
  className,
}: {
  sections: NavSection[]
  active: string | null
  onNavigate: (event: React.MouseEvent, id: string) => void
  className?: string
}) {
  const scroller = React.useRef<HTMLUListElement>(null)

  // Keep the active link centered in the scrollable row; back to the start when none is active.
  React.useEffect(() => {
    const row = scroller.current
    if (!row) return
    const link = active
      ? row.querySelector<HTMLElement>(`[data-section="${active}"]`)
      : null
    row.scrollTo({
      left: link
        ? link.offsetLeft - row.clientWidth / 2 + link.clientWidth / 2
        : 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }, [active])

  return (
    <nav
      aria-label="Menu sections"
      className={cn("flex min-w-0 flex-1 self-stretch", className)}
    >
      <ul
        ref={scroller}
        className="relative no-scrollbar flex min-w-0 flex-1 gap-5 overflow-x-auto"
      >
        {sections.map((section) => (
          <li key={section.id} className="flex shrink-0">
            <a
              href={`#${section.id}`}
              data-section={section.id}
              aria-current={active === section.id ? "true" : undefined}
              onClick={(e) => onNavigate(e, section.id)}
              className="relative -mx-1 flex items-center px-1 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase transition-colors outline-none after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset aria-[current=true]:text-foreground aria-[current=true]:after:opacity-100"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The first section overlapping a band just below the sticky bar. After a
 * click, the clicked section stays active until the smooth scroll settles, so
 * the highlight doesn't flicker through every section passed on the way.
 */
function useActiveSection(sections: NavSection[]) {
  const [active, setActiveState] = React.useState<string | null>(null)
  const lockedUntil = React.useRef(0)
  const ids = sections.map((s) => s.id).join(" ")

  React.useEffect(() => {
    const order = ids.split(" ")
    const inBand = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id)
          else inBand.delete(entry.target.id)
        }
        if (Date.now() < lockedUntil.current) return
        // None in the band (e.g. back up at the hero): nothing is active.
        setActiveState(order.find((id) => inBand.has(id)) ?? null)
      },
      { rootMargin: OBSERVER_MARGIN }
    )
    for (const id of order) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  const setActive = React.useCallback(
    (id: string, { lock }: { lock: boolean }) => {
      if (lock) lockedUntil.current = Date.now() + 1000
      setActiveState(id)
    },
    []
  )

  return [active, setActive] as const
}
