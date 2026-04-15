import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

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
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/drivers
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const driver = await db.driver.create({ data: body })
    return NextResponse.json(driver, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
