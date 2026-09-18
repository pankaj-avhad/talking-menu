import Image from "next/image"
import Link from "next/link"
import { PhoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { menu } from "@/lib/menu"
import { cn } from "@/lib/utils"

const { restaurant } = menu

const PAGES = [
  { key: "menu", href: "/menu", label: "Menu" },
  { key: "calls", href: "/calls", label: "Calls" },
] as const

/** The bar across the top of every page: the restaurant, its pages, and the call button. */
export function SiteHeader({
  current,
}: {
  current: "menu" | "call" | "calls" | "order"
}) {
  const logo = restaurant.images.cover_square

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/menu"
          className="flex min-w-0 items-center gap-3 rounded-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {logo && (
            <Image
              src={logo}
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-lg"
            />
          )}
          <span className="hidden truncate sm:inline">{restaurant.name}</span>
        </Link>

        <nav aria-label="Site" className="ml-auto flex items-center gap-1">
          {PAGES.map((page) => (
            <Link
              key={page.key}
              href={page.href}
              aria-current={current === page.key ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                "aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
              )}
            >
              {page.label}
            </Link>
          ))}
          {current !== "call" && (
            <Button
              asChild
              variant="brand"
              className="ml-2 hidden sm:inline-flex"
            >
              <Link href="/call">
                <PhoneIcon data-icon="inline-start" />
                Call to order
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  )
}
