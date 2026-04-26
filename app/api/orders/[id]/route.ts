import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { updateOrderSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"
import { canTransitionOrderStatus } from "@/lib/order-status"
import { errorWithRequestId, getRequestId, jsonWithRequestId } from "@/lib/api-response"
import { normalizeOrderPayload } from "@/lib/order-consistency"

// GET /api/orders/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(_req)
  if (auth.error) return auth.error

  const { id } = await params
  const order = await db.order.findUnique({ where: { id }, include: { driver: true } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(order)
}

// PATCH /api/orders/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req)
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { id } = await params
  const parsed = updateOrderSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorWithRequestId({
      requestId,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: parsed.error.flatten(),
    })
  }
  const body = normalizeOrderPayload(parsed.data as Record<string, unknown>)
  if (body.status !== undefined) {
    const current = await db.order.findUnique({ where: { id }, select: { status: true } })
    if (!current) {
      return errorWithRequestId({
        requestId,
        status: 404,
        code: "NOT_FOUND",
        message: "订单不存在",
      })
    }
    if (!canTransitionOrderStatus(current.status, body.status)) {
      return errorWithRequestId({
        requestId,
        status: 409,
        code: "CONFLICT",
        message: `非法状态流转：${current.status} -> ${body.status}`,
      })
    }
  }
  const order = await db.order.update({ where: { id }, data: body, include: { driver: true } })
  await writeAuditLog({
    req,
    session: auth.session,
    action: "order.update",
    entity: "order",
    entityId: id,
    metadata: { changedFields: Object.keys(body), orderNo: order.orderNo, requestId },
  })
  return jsonWithRequestId(order, requestId)
}

// DELETE /api/orders/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(_req)
  const auth = requireAuth(_req)
  if (auth.error) return auth.error

  const { id } = await params
  try {
    const old = await db.order.findUnique({ where: { id }, select: { orderNo: true } })
    await db.order.delete({ where: { id } })
    await writeAuditLog({
      req: _req,
      session: auth.session,
      action: "order.delete",
      entity: "order",
      entityId: id,
      metadata: { orderNo: old?.orderNo ?? null, requestId },
    })
    return jsonWithRequestId({ success: true }, requestId)
  } catch (e) {
    await writeAuditLog({
      req: _req,
      session: auth.session,
      action: "order.delete",
      entity: "order",
      entityId: id,
      status: "failed",
      message: String(e),
      metadata: { requestId },
    })
    return errorWithRequestId({
      requestId,
      status: 500,
      code: "INTERNAL_ERROR",
      message: String(e),
    })
  }
}
