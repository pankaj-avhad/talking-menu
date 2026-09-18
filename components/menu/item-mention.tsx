"use client"

import { useMenu } from "@/components/menu/menu-provider"

/** A phrase in a review that names a dish on the menu; opens that dish. */
export function ItemMention({
  itemId,
  children,
}: {
  itemId: string
  children: React.ReactNode
}) {
  const { openItem } = useMenu()
  return (
    <button
      type="button"
      onClick={() => openItem(itemId)}
      className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid"
    >
      {children}
    </button>
  )
}
