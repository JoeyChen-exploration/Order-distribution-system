import type { Order } from "@/lib/types"

type OrderStatus = Order["status"]

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  0: [1, 4, 5], // 待排单 -> 已分配/已取消/空单
  1: [0, 2, 4, 5], // 已分配 -> 待排单/进行中/取消/空单
  2: [1, 3, 4], // 进行中 -> 已分配/已完成/已取消
  3: [], // 已完成终态
  4: [], // 已取消终态
  5: [0], // 空单可回到待排单
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}
