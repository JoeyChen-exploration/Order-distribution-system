import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const ALLOWED_DRIVER_CREATE_FIELDS = new Set([
  "name", "phone", "vehicleType", "vehiclePlate",
  "homeAddress", "homeLat", "homeLng",
  "status", "dailyOrderCount", "workingHours",
])

// GET /api/drivers
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const vehicleType = searchParams.get("vehicleType")

    const drivers = await db.driver.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(vehicleType ? { vehicleType } : {}),
      },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(drivers)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/drivers
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const data: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (ALLOWED_DRIVER_CREATE_FIELDS.has(key)) data[key] = body[key]
    }

    if (!data.name || !data.phone || !data.vehiclePlate) {
      return NextResponse.json({ error: "name, phone, vehiclePlate are required" }, { status: 400 })
    }

    const driver = await db.driver.create({ data: data as Parameters<typeof db.driver.create>[0]["data"] })
    return NextResponse.json(driver, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
