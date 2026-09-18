import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { CallConsole } from "@/components/call/call-console"
import { menu } from "@/lib/menu"

const { restaurant } = menu

export const metadata: Metadata = {
  title: `Order by voice · ${restaurant.name}`,
  description: `Order from ${restaurant.name} by talking to an AI host, as you would on the phone.`,
}

// The relay is a separate server (npm run relay); see relay/server.ts.
const relayUrl = process.env.NEXT_PUBLIC_RELAY_URL ?? "ws://localhost:8787/browser"

export default function CallPage() {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 text-sm sm:px-6">
          <Link
            href="/menu"
            className="inline-flex items-center gap-1.5 font-medium hover:underline hover:underline-offset-4"
          >
            <ArrowLeftIcon aria-hidden className="size-4" />
            Menu
          </Link>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Talking Menu
          </span>
        </div>
      </header>
      <main>
        <CallConsole restaurantName={restaurant.name} relayUrl={relayUrl} />
      </main>
    </>
  )
}
