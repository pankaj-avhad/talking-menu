import Image from "next/image"
import { UtensilsCrossedIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import type { ItemPhoto as ItemPhotoData } from "@/lib/menu-view"

/** Fills its (positioned, sized) parent. Items without any photo get a quiet placeholder. */
export function ItemPhoto({
  photo,
  sizes,
  className,
}: {
  photo: ItemPhotoData | null
  sizes: string
  className?: string
}) {
  if (!photo) {
    return (
      <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
        <UtensilsCrossedIcon aria-hidden className="size-6" />
      </div>
    )
  }
  return (
    <Image
      src={photo.src}
      alt={photo.alt}
      fill
      sizes={sizes}
      className={cn("object-cover", className)}
    />
  )
}
