import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { updateOrderSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"

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
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { id } = await params
  const parsed = updateOrderSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效", details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data
  const order = await db.order.update({ where: { id }, data: body, include: { driver: true } })
  await writeAuditLog({
    req,
    session: auth.session,
    action: "order.update",
    entity: "order",
    entityId: id,
    metadata: { changedFields: Object.keys(body), orderNo: order.orderNo },
  })
  return NextResponse.json(order)
}

// DELETE /api/orders/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      metadata: { orderNo: old?.orderNo ?? null },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    await writeAuditLog({
      req: _req,
      session: auth.session,
      action: "order.delete",
      entity: "order",
      entityId: id,
      status: "failed",
      message: String(e),
    })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
