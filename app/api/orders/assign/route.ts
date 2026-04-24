import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { assignOrderSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const parsed = assignOrderSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效", details: parsed.error.flatten() }, { status: 400 })
  }

  const { orderId, driverId } = parsed.data

  try {
    const result = await db.$transaction(async (tx) => {
      const [order, driver] = await Promise.all([
        tx.order.findUnique({ where: { id: orderId } }),
        tx.driver.findUnique({ where: { id: driverId } }),
      ])

      if (!order) throw new Error("ORDER_NOT_FOUND")
      if (!driver) throw new Error("DRIVER_NOT_FOUND")
      if (order.status === 3 || order.status === 4 || order.status === 5) throw new Error("ORDER_NOT_ASSIGNABLE")
      if (driver.status !== "available" && driver.status !== "busy") throw new Error("DRIVER_NOT_AVAILABLE")

      const previousDriverId = order.driverId

      if (previousDriverId && previousDriverId !== driverId) {
        await tx.driver.update({
          where: { id: previousDriverId },
          data: { status: "available" },
        })
      }

      await tx.driver.update({
        where: { id: driverId },
        data: { status: "busy" },
      })

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          driverId,
          driverName: driver.name,
          status: order.status === 0 ? 1 : order.status,
          modifiedUserId: auth.session.id,
          modifiedAt: new Date().toISOString(),
        },
        include: { driver: true },
      })

      return { updatedOrder, previousDriverId }
    })

    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.assign",
      entity: "order",
      entityId: orderId,
      metadata: {
        newDriverId: driverId,
        previousDriverId: result.previousDriverId ?? null,
      },
    })

    return NextResponse.json(result.updatedOrder)
  } catch (e) {
    const message = String(e)
    const errorMap: Record<string, { status: number; message: string }> = {
      ORDER_NOT_FOUND: { status: 404, message: "订单不存在" },
      DRIVER_NOT_FOUND: { status: 404, message: "司机不存在" },
      ORDER_NOT_ASSIGNABLE: { status: 409, message: "当前订单状态不可派单" },
      DRIVER_NOT_AVAILABLE: { status: 409, message: "司机当前状态不可派单" },
    }

    const matched = Object.entries(errorMap).find(([key]) => message.includes(key))
    if (matched) {
      return NextResponse.json({ error: matched[1].message }, { status: matched[1].status })
    }

    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.assign",
      entity: "order",
      entityId: orderId,
      status: "failed",
      message,
      metadata: { driverId },
    })

    return NextResponse.json({ error: "派单失败" }, { status: 500 })
  }
}
