import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { CheckCircle2Icon, MapPinIcon } from "lucide-react"

import { payOrder } from "./actions"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { menu } from "@/lib/menu"
import { formatUsd } from "@/lib/money"
import { getOrder } from "@/lib/store"

// The check: the "cart link" a caller gets at the end of a call.

type Props = { params: Promise<{ id: string }> }

const { restaurant } = menu
const heading = "text-sm font-semibold"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const order = await getOrder(id)
  return {
    title: order
      ? `Order #${order.number} · ${restaurant.name}`
      : "Order not found",
    robots: { index: false },
  }
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: restaurant.timezone ?? "America/Los_Angeles",
  }).format(new Date(iso))
}

export default async function OrderPage({ params }: Props) {
  // Orders change after the build, so always read the current one.
  await connection()
  const { id } = await params
  const order = await getOrder(id)
  if (!order) notFound()

  const paid = order.status === "paid"

  return (
    <>
      <SiteHeader current="order" />
      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-3xl border bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Order #{order.number}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                For {order.customerName}, {formatTime(order.createdAt)}
              </p>
            </div>
            <p
              className={
                paid
                  ? "inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand"
                  : "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium"
              }
            >
              {paid && <CheckCircle2Icon aria-hidden className="size-4" />}
              {paid ? "Paid" : "Awaiting payment"}
            </p>
          </div>

          <section aria-labelledby="items-title" className="mt-8">
            <h2 id="items-title" className={heading}>
              Items
            </h2>
            <ul className="mt-2 divide-y">
              {order.lines.map((line) => (
                <li key={line.lineId} className="flex gap-3 py-3 text-sm">
                  <span className="w-7 shrink-0 font-semibold tabular-nums">
                    {line.quantity}×
                  </span>
                  <span className="min-w-0 flex-1">
                    {line.name}
                    {/* Orders saved before add-ons existed have none. */}
                    {(line.addOns ?? []).map((addOn) => (
                      <span
                        key={addOn.id}
                        className="flex justify-between gap-3 text-xs text-muted-foreground"
                      >
                        <span>+ {addOn.name.replace(/^Add\s+/i, "")}</span>
                        {addOn.priceCents > 0 && (
                          <span className="tabular-nums">
                            {formatUsd(addOn.priceCents)}
                          </span>
                        )}
                      </span>
                    ))}
                    {line.note && (
                      <span className="block text-xs text-muted-foreground">
                        {line.note}
                      </span>
                    )}
                    {line.quantity > 1 && (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {formatUsd(line.unitPriceCents)} each
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {formatUsd(line.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 grid gap-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">
                  {formatUsd(order.subtotalCents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd className="tabular-nums">
                  {order.deliveryFeeCents > 0
                    ? formatUsd(order.deliveryFeeCents)
                    : "No fee"}
                </dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatUsd(order.totalCents)}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="address-title" className="mt-8">
            <h2 id="address-title" className={heading}>
              Deliver to
            </h2>
            <p className="mt-2 flex items-start gap-2 text-sm">
              <MapPinIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              {order.address}
            </p>
          </section>

          <div className="mt-10">
            {paid ? (
              <p className="text-sm text-muted-foreground">
                Paid {order.paidAt ? formatTime(order.paidAt) : ""}. Thanks for
                your order!
              </p>
            ) : (
              <form action={payOrder.bind(null, order.id)}>
                <Button
                  type="submit"
                  size="lg"
                  variant="brand"
                  className="w-full"
                >
                  Pay {formatUsd(order.totalCents)}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Demo checkout: no card is charged.
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link
            href="/menu"
            className="underline underline-offset-4 hover:decoration-2"
          >
            Back to the menu
          </Link>
        </p>
      </main>
    </>
  )
}
