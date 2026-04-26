import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { assignOrderSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"
import { errorWithRequestId, getRequestId, jsonWithRequestId } from "@/lib/api-response"
import { assignOrderWithTx } from "@/lib/order-assignment"

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const parsed = assignOrderSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorWithRequestId({
      requestId,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: parsed.error.flatten(),
    })
  }

  const { orderId, driverId } = parsed.data

  try {
    const result = await db.$transaction(async (tx) => {
      return assignOrderWithTx(tx as any, {
        orderId,
        driverId,
        actorUserId: auth.session.id,
      })
    })

    if (!result.ok) {
      const map = {
        ORDER_NOT_FOUND: { status: 404, code: "NOT_FOUND" as const },
        DRIVER_NOT_FOUND: { status: 404, code: "NOT_FOUND" as const },
        ORDER_NOT_ASSIGNABLE: { status: 409, code: "CONFLICT" as const },
        DRIVER_NOT_AVAILABLE: { status: 409, code: "CONFLICT" as const },
      }
      const hit = map[result.code]
      return errorWithRequestId({
        requestId,
        status: hit.status,
        code: hit.code,
        message: result.message,
      })
    }

    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.assign",
      entity: "order",
      entityId: orderId,
      metadata: {
        newDriverId: driverId,
        previousDriverId: result.previousDriverId ?? null,
        idempotent: result.idempotent,
        requestId,
      },
    })

    return jsonWithRequestId(result.updatedOrder, requestId)
  } catch (e) {
    const message = String(e)
    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.assign",
      entity: "order",
      entityId: orderId,
      status: "failed",
      message,
      metadata: { driverId, requestId },
    })

    return errorWithRequestId({
      requestId,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "派单失败",
    })
  }
}
