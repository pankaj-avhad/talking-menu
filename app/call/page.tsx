import type { Metadata } from "next"

import { CallConsole } from "@/components/call/call-console"
import { SiteHeader } from "@/components/site-header"
import { menu } from "@/lib/menu"

const { restaurant } = menu

export const metadata: Metadata = {
  title: `Order by voice · ${restaurant.name}`,
  description: `Order from ${restaurant.name} by talking to an AI host, as you would on the phone.`,
}

// The relay is a separate server (npm run relay); see relay/server.ts.
const relayUrl =
  process.env.NEXT_PUBLIC_RELAY_URL ?? "ws://localhost:8787/browser"

export default function CallPage() {
  return (
    <>
      <SiteHeader current="call" />
      <main>
        <CallConsole restaurantName={restaurant.name} relayUrl={relayUrl} />
      </main>
    </>
  )
}
