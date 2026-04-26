import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { updateDriverSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"
import { errorWithRequestId, getRequestId, jsonWithRequestId } from "@/lib/api-response"

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
  const requestId = getRequestId(req)
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { id } = await params
  const parsed = updateDriverSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorWithRequestId({
      requestId,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: parsed.error.flatten(),
    })
  }
  const body = parsed.data
  const driver = await db.driver.update({ where: { id }, data: body })
  await writeAuditLog({
    req,
    session: auth.session,
    action: "driver.update",
    entity: "driver",
    entityId: id,
    metadata: { changedFields: Object.keys(body), name: driver.name, requestId },
  })
  return jsonWithRequestId(driver, requestId)
}

// DELETE /api/drivers/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(_req)
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
      metadata: { ...(old ?? {}), requestId },
    })
    return jsonWithRequestId({ success: true }, requestId)
  } catch (e) {
    await writeAuditLog({
      req: _req,
      session: auth.session,
      action: "driver.delete",
      entity: "driver",
      entityId: id,
      status: "failed",
      message: String(e),
      metadata: { requestId },
    })
    return errorWithRequestId({
      requestId,
      status: 500,
      code: "INTERNAL_ERROR",
      message: String(e),
    })
  }
}
