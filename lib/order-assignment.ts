type TxClient = {
  order: {
    findUnique: (args: unknown) => Promise<any>
    update: (args: unknown) => Promise<any>
  }
  driver: {
    findUnique: (args: unknown) => Promise<any>
    update: (args: unknown) => Promise<any>
  }
}

export type AssignOrderResult =
  | { ok: true; updatedOrder: any; previousDriverId: string | null; idempotent: boolean }
  | { ok: false; code: "ORDER_NOT_FOUND" | "DRIVER_NOT_FOUND" | "ORDER_NOT_ASSIGNABLE" | "DRIVER_NOT_AVAILABLE"; message: string }

export async function assignOrderWithTx(
  tx: TxClient,
  args: { orderId: string; driverId: string; actorUserId: string },
): Promise<AssignOrderResult> {
  const [order, driver] = await Promise.all([
    tx.order.findUnique({ where: { id: args.orderId } }),
    tx.driver.findUnique({ where: { id: args.driverId } }),
  ])

  if (!order) return { ok: false, code: "ORDER_NOT_FOUND", message: "订单不存在" }
  if (!driver) return { ok: false, code: "DRIVER_NOT_FOUND", message: "司机不存在" }
  if (order.status === 3 || order.status === 4 || order.status === 5) {
    return { ok: false, code: "ORDER_NOT_ASSIGNABLE", message: "当前订单状态不可派单" }
  }
  if (driver.status !== "available" && driver.status !== "busy") {
    return { ok: false, code: "DRIVER_NOT_AVAILABLE", message: "司机当前状态不可派单" }
  }

  const previousDriverId = order.driverId ?? null
  const isIdempotent =
    previousDriverId === args.driverId &&
    order.driverName === driver.name &&
    order.status === (order.status === 0 ? 1 : order.status)

  if (isIdempotent) {
    const current = await tx.order.findUnique({ where: { id: args.orderId }, include: { driver: true } })
    return { ok: true, updatedOrder: current, previousDriverId, idempotent: true }
  }

  if (previousDriverId && previousDriverId !== args.driverId) {
    await tx.driver.update({
      where: { id: previousDriverId },
      data: { status: "available" },
    })
  }

  await tx.driver.update({
    where: { id: args.driverId },
    data: { status: "busy" },
  })

  const updatedOrder = await tx.order.update({
    where: { id: args.orderId },
    data: {
      driverId: args.driverId,
      driverName: driver.name,
      status: order.status === 0 ? 1 : order.status,
      modifiedUserId: args.actorUserId,
      modifiedAt: new Date().toISOString(),
    },
    include: { driver: true },
  })

  return { ok: true, updatedOrder, previousDriverId, idempotent: false }
}
