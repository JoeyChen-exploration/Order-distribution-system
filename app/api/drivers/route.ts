import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { createDriverSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"

// GET /api/drivers
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

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
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  try {
    const parsed = createDriverSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "请求参数无效", details: parsed.error.flatten() }, { status: 400 })
    }
    const body = parsed.data
    const driver = await db.driver.create({ data: body })
    await writeAuditLog({
      req,
      session: auth.session,
      action: "driver.create",
      entity: "driver",
      entityId: driver.id,
      metadata: { name: driver.name, vehiclePlate: driver.vehiclePlate },
    })
    return NextResponse.json(driver, { status: 201 })
  } catch (e) {
    await writeAuditLog({
      req,
      session: auth.session,
      action: "driver.create",
      entity: "driver",
      status: "failed",
      message: String(e),
    })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
