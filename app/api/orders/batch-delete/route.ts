import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { batchDeleteSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"
import { errorWithRequestId, getRequestId, jsonWithRequestId } from "@/lib/api-response"

// DELETE /api/orders/batch-delete  body: { ids: string[] }
export async function DELETE(req: NextRequest) {
  const requestId = getRequestId(req)
  const auth = requireAuth(req, ["super_admin"])
  if (auth.error) return auth.error

  try {
    const parsed = batchDeleteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return errorWithRequestId({
        requestId,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "请求参数无效",
        details: parsed.error.flatten(),
      })
    }
    const { ids } = parsed.data
    const result = await db.order.deleteMany({ where: { id: { in: ids } } })
    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.batch_delete",
      entity: "order",
      metadata: { requested: ids.length, deleted: result.count, requestId },
    })
    return jsonWithRequestId({ success: true, deleted: result.count }, requestId)
  } catch (e) {
    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.batch_delete",
      entity: "order",
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
