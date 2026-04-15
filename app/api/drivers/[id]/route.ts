import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const ALLOWED_DRIVER_FIELDS = new Set([
  "name", "phone", "vehicleType", "vehiclePlate",
  "homeAddress", "homeLat", "homeLng",
  "status", "dailyOrderCount", "currentLat", "currentLng", "workingHours",
])

// GET /api/drivers/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const driver = await db.driver.findUnique({ where: { id } })
    if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(driver)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/drivers/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (ALLOWED_DRIVER_FIELDS.has(key)) data[key] = body[key]
    }

    const driver = await db.driver.update({ where: { id }, data })
    return NextResponse.json(driver)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/drivers/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.driver.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
