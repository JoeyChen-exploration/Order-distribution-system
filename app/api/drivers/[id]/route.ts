import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { updateDriverSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"

// GET /api/drivers/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(_req)
  if (auth.error) return auth.error

  const { id } = await params
  const driver = await db.driver.findUnique({ where: { id } })
  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(driver)
}

// PATCH /api/drivers/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { id } = await params
  const parsed = updateDriverSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效", details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data
  const driver = await db.driver.update({ where: { id }, data: body })
  await writeAuditLog({
    req,
    session: auth.session,
    action: "driver.update",
    entity: "driver",
    entityId: id,
    metadata: { changedFields: Object.keys(body), name: driver.name },
  })
  return NextResponse.json(driver)
}

// DELETE /api/drivers/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(_req)
  if (auth.error) return auth.error

  const { id } = await params
  try {
    const old = await db.driver.findUnique({ where: { id }, select: { name: true, vehiclePlate: true } })
    await db.driver.delete({ where: { id } })
    await writeAuditLog({
      req: _req,
      session: auth.session,
      action: "driver.delete",
      entity: "driver",
      entityId: id,
      metadata: old ?? null,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    await writeAuditLog({
      req: _req,
      session: auth.session,
      action: "driver.delete",
      entity: "driver",
      entityId: id,
      status: "failed",
      message: String(e),
    })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
