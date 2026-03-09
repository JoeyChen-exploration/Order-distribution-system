import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/drivers
export async function GET(req: NextRequest) {
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
}

// POST /api/drivers
export async function POST(req: NextRequest) {
  const body = await req.json()
  const driver = await db.driver.create({ data: body })
  return NextResponse.json(driver, { status: 201 })
}
