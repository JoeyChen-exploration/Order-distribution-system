import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"

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
  const body = await req.json()
  const order = await db.order.update({ where: { id }, data: body, include: { driver: true } })
  return NextResponse.json(order)
}

// DELETE /api/orders/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(_req)
  if (auth.error) return auth.error

  const { id } = await params
  try {
    await db.order.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
