import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { assignOrdersBatchSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"
import { errorWithRequestId, getRequestId, jsonWithRequestId } from "@/lib/api-response"
import { assignOrderWithTx } from "@/lib/order-assignment"

type ItemResult = {
  orderId: string
  driverId: string
  ok: boolean
  retries: number
  errorCode?: string
  errorMessage?: string
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const parsed = assignOrdersBatchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorWithRequestId({
      requestId,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: parsed.error.flatten(),
    })
  }

  const deduped = new Map<string, { orderId: string; driverId: string }>()
  for (const item of parsed.data.assignments) {
    if (!deduped.has(item.orderId)) deduped.set(item.orderId, item)
  }
  const assignments = Array.from(deduped.values())

  const results: ItemResult[] = []
  const maxAttempts = 3

  for (const item of assignments) {
    const orderDate = await db.order.findUnique({
      where: { id: item.orderId },
      select: { flightDate: true },
    })
    if (!orderDate) {
      results.push({
        orderId: item.orderId,
        driverId: item.driverId,
        ok: false,
        retries: 0,
        errorCode: "ORDER_NOT_FOUND",
        errorMessage: "订单不存在",
      })
      continue
    }
    let attempt = 0
    let done = false
    while (attempt < maxAttempts && !done) {
      attempt += 1
      try {
        const result = await db.$transaction(async (tx) => {
          return assignOrderWithTx(tx as any, {
            orderId: item.orderId,
            driverId: item.driverId,
            actorUserId: auth.session.id,
          })
        })
        if (result.ok) {
          results.push({
            orderId: item.orderId,
            driverId: item.driverId,
            ok: true,
            retries: attempt - 1,
          })
          done = true
        } else {
          if (result.code === "ORDER_NOT_FOUND" || result.code === "DRIVER_NOT_FOUND") {
            results.push({
              orderId: item.orderId,
              driverId: item.driverId,
              ok: false,
              retries: attempt - 1,
              errorCode: result.code,
              errorMessage: result.message,
            })
            done = true
          } else if (attempt >= maxAttempts) {
            results.push({
              orderId: item.orderId,
              driverId: item.driverId,
              ok: false,
              retries: attempt - 1,
              errorCode: result.code,
              errorMessage: result.message,
            })
            done = true
          }
        }
      } catch (e) {
        if (attempt >= maxAttempts) {
          results.push({
            orderId: item.orderId,
            driverId: item.driverId,
            ok: false,
            retries: attempt - 1,
            errorCode: "INTERNAL_ERROR",
            errorMessage: String(e),
          })
        }
      }
    }
  }

  const successCount = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  await writeAuditLog({
    req,
    session: auth.session,
    action: "order.assign_batch",
    entity: "order",
    metadata: {
      requestId,
      total: assignments.length,
      success: successCount,
      failed: failed.length,
      dispatchRequestId: parsed.data.dispatchRequestId ?? null,
      failedItems: failed.map((f) => ({
        orderId: f.orderId,
        driverId: f.driverId,
        errorCode: f.errorCode,
      })),
    },
  })

  return jsonWithRequestId(
    {
      success: failed.length === 0,
      total: assignments.length,
      successCount,
      failedCount: failed.length,
      results,
    },
    requestId,
  )
}
