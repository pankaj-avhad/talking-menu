"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

/**
 * Re-reads the page's server data every `every` ms while the tab is visible,
 * so new calls and a live call's transcript appear without reloading. Client
 * state such as scroll position survives a refresh.
 */
export function LiveRefresh({ every }: { every: number }) {
  const router = useRouter()

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, every)
    return () => window.clearInterval(id)
  }, [router, every])

  return null
}
