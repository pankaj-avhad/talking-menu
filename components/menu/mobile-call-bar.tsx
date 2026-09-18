import Link from "next/link"
import { PhoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Phones get the call button pinned to the bottom, within thumb reach; the
 * page adds matching bottom padding so the footer isn't hidden under it.
 */
export function MobileCallBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur-sm sm:hidden">
      <Button asChild variant="brand" size="lg" className="w-full">
        <Link href="/call">
          <PhoneIcon data-icon="inline-start" />
          Call to order
        </Link>
      </Button>
    </div>
  )
}
