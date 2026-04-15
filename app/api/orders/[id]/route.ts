import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const ALLOWED_ORDER_FIELDS = new Set([
  "status", "driverId", "driverName", "reqVehicleType", "isEmergency",
  "pickupAddress", "pickupLat", "pickupLng",
  "dropoffAddress", "dropoffLat", "dropoffLng",
  "passengerName", "passengerPhone", "flightNo", "flightDate", "pickupTime",
  "cancelReason", "cancelTime", "modifiedAt", "modifiedUserId", "metadata",
])

// GET /api/orders/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const order = await db.order.findUnique({ where: { id }, include: { driver: true } })
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(order)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/orders/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    // Whitelist — only allow known updatable fields
    const data: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (ALLOWED_ORDER_FIELDS.has(key)) data[key] = body[key]
    }

    const order = await db.order.update({ where: { id }, data, include: { driver: true } })
    return NextResponse.json(order)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/orders/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.order.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
