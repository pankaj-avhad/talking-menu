import type { Metadata } from "next"

import { MenuNav, type NavSection } from "@/components/menu/menu-nav"
import { MenuProvider } from "@/components/menu/menu-provider"
import { MenuSections } from "@/components/menu/menu-sections"
import { MobileCallBar } from "@/components/menu/mobile-call-bar"
import { RestaurantHero } from "@/components/menu/restaurant-hero"
import { Reviews } from "@/components/menu/reviews"
import { SiteFooter } from "@/components/menu/site-footer"
import { StoreInfo } from "@/components/menu/store-info"
import { SiteHeader } from "@/components/site-header"
import { getMenuPage } from "@/lib/menu-view"

const page = getMenuPage()
const { restaurant } = page

export const metadata: Metadata = {
  title: `${page.menuName} · ${restaurant.name}`,
  description: [
    `${page.menuName} for ${restaurant.name}`,
    restaurant.cuisine && `${restaurant.cuisine} food`,
    restaurant.address && `at ${restaurant.address}`,
  ]
    .filter(Boolean)
    .join(", ")
    .concat(". Prices, photos and reviews."),
  openGraph: {
    title: restaurant.name,
    images: restaurant.headerImage ? [restaurant.headerImage] : undefined,
  },
}

/** "Vietnamese banh mi sandwiches, vermicelli noodle bowls and rice plates." */
function menuSummary() {
  const names = page.categories.slice(0, 3).map((c) => c.name.toLowerCase())
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : (names[0] ?? "")
  const text = [restaurant.cuisine, list].filter(Boolean).join(" ")
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : ""
}

export default function MenuPage() {
  const sections: NavSection[] = [
    ...(page.highlights.length > 0
      ? [{ id: "highlights", label: "Highlights", hideWhileSearching: true }]
      : []),
    ...page.categories.map((c) => ({
      id: `category-${c.id}`,
      label: c.name,
      categoryId: c.id,
    })),
    ...(page.reviews.length > 0 ? [{ id: "reviews", label: "Reviews" }] : []),
  ]

  return (
    <MenuProvider items={page.items} categories={page.categories}>
      <a
        href="#menu"
        className="sr-only z-50 rounded-full bg-background px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to menu
      </a>
      <div className="pb-20 sm:pb-0">
        <SiteHeader current="menu" />
        <RestaurantHero restaurant={restaurant} summary={menuSummary()} />
        <div className="h-8 sm:h-10" />
        <MenuNav sections={sections} />
        <div className="mx-auto grid max-w-6xl gap-x-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <main className="min-w-0 pb-8">
            <MenuSections
              menuName={page.menuName}
              menuHours={page.menuHours}
              otherMenus={page.otherMenus}
              categories={page.categories}
              highlights={page.highlights}
            />
            {page.reviews.length > 0 && (
              <Reviews rating={restaurant.rating} reviews={page.reviews} />
            )}
          </main>
          <aside aria-label="Hours and location">
            <StoreInfo restaurant={restaurant} />
          </aside>
        </div>
        <SiteFooter page={page} />
      </div>
      <MobileCallBar />
    </MenuProvider>
  )
}
