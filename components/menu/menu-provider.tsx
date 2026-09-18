"use client"

import * as React from "react"

import { ItemDialog } from "@/components/menu/item-dialog"
import type { CategoryView, MenuItemView } from "@/lib/menu-view"

type MenuContextValue = {
  items: Record<string, MenuItemView>
  categories: Record<string, CategoryView>
  query: string
  setQuery: (query: string) => void
  /** Ids of items matching the search, or null when there is no search. */
  matchingIds: ReadonlySet<string> | null
  openItem: (id: string) => void
}

const MenuContext = React.createContext<MenuContextValue | null>(null)

export function useMenu() {
  const context = React.use(MenuContext)
  if (!context) throw new Error("useMenu must be used inside <MenuProvider>")
  return context
}

/** Case- and accent-insensitive, so "pate" finds "pâté". */
function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

export function MenuProvider({
  items,
  categories,
  children,
}: {
  items: Record<string, MenuItemView>
  categories: CategoryView[]
  children: React.ReactNode
}) {
  const [query, setQuery] = React.useState("")
  // The id outlives `open` so the dialog keeps its content while it animates out.
  const [dialog, setDialog] = React.useState<{
    id: string | null
    open: boolean
  }>({
    id: null,
    open: false,
  })

  const categoriesById = React.useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  )

  const searchIndex = React.useMemo(
    () =>
      Object.values(items).map((item) => ({
        id: item.id,
        text: normalize(
          [
            item.name,
            item.description,
            categoriesById[item.categoryId]?.name,
            ...item.badges,
          ].join(" ")
        ),
      })),
    [items, categoriesById]
  )

  const matchingIds = React.useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return null
    return new Set(
      searchIndex
        .filter((entry) => terms.every((t) => entry.text.includes(t)))
        .map((e) => e.id)
    )
  }, [query, searchIndex])

  // Radix returns focus to a DialogTrigger on close; this dialog has none (any
  // card or review link opens it), so remember the opener and return focus there.
  const opener = React.useRef<HTMLElement | null>(null)
  const openItem = React.useCallback((id: string) => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setDialog({ id, open: true })
  }, [])

  const value = React.useMemo(
    () => ({
      items,
      categories: categoriesById,
      query,
      setQuery,
      matchingIds,
      openItem,
    }),
    [items, categoriesById, query, matchingIds, openItem]
  )

  const item = dialog.id ? items[dialog.id] : null

  return (
    <MenuContext value={value}>
      {children}
      {item && (
        <ItemDialog
          item={item}
          category={categoriesById[item.categoryId]}
          open={dialog.open}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            opener.current?.focus()
          }}
        />
      )}
    </MenuContext>
  )
}
