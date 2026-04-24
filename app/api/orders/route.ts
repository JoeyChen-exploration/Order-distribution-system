import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { createOrderSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"

// GET /api/orders
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  const orders = await db.order.findMany({
    where: { ...(status !== null ? { status: Number(status) } : {}) },
    include: { driver: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(orders)
}

// POST /api/orders
export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const parsed = createOrderSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效", details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data
  const { orderNo, ...rest } = body
  const order = await db.order.upsert({
    where: { orderNo },
    update: rest,
    create: body,
  })
  await writeAuditLog({
    req,
    session: auth.session,
    action: "order.upsert",
    entity: "order",
    entityId: order.id,
    metadata: { orderNo: order.orderNo, status: order.status },
  })
  return NextResponse.json(order, { status: 201 })
}
