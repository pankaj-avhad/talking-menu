"use server"

import { revalidatePath } from "next/cache"

import { getOrder, saveOrder } from "@/lib/store"

/** The mock Pay button: marks the order paid. No card is charged. */
export async function payOrder(orderId: string) {
  const order = await getOrder(orderId)
  if (!order || order.status === "paid") return
  const now = new Date().toISOString()
  await saveOrder({ ...order, status: "paid", paidAt: now, updatedAt: now })
  revalidatePath(`/orders/${orderId}`)
}
