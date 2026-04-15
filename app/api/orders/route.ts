import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const ALLOWED_ORDER_CREATE_FIELDS = new Set([
  "orderNo", "passengerName", "passengerPhone", "flightNo", "flightDate",
  "pickupTime", "pickupAddress", "pickupLat", "pickupLng",
  "dropoffAddress", "dropoffLat", "dropoffLng",
  "reqVehicleType", "status", "isEmergency", "metadata",
  "driverId", "driverName", "modifiedUserId", "importBatchId",
])

// GET /api/orders
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get("status")

    const orders = await db.order.findMany({
      where: { ...(statusParam !== null ? { status: Number(statusParam) } : {}) },
      include: { driver: true },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(orders)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/orders
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const data: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (ALLOWED_ORDER_CREATE_FIELDS.has(key)) data[key] = body[key]
    }

    if (!data.orderNo) {
      return NextResponse.json({ error: "orderNo is required" }, { status: 400 })
    }

    const order = await db.order.upsert({
      where: { orderNo: data.orderNo as string },
      update: data,
      create: data as Parameters<typeof db.order.create>[0]["data"],
    })
    return NextResponse.json(order, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
