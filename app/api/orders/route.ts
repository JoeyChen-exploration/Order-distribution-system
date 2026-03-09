import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/orders
export async function GET(req: NextRequest) {
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
  const body = await req.json()
  const order = await db.order.create({ data: body })
  return NextResponse.json(order, { status: 201 })
}
