import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { createDispatchHistorySchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"
import { errorWithRequestId, getRequestId, jsonWithRequestId } from "@/lib/api-response"

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const records = await db.dispatchHistory.findMany({
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(
    records.map(r => ({
      ...r,
      items: JSON.parse(r.items),
      createdAt: r.createdAt.toISOString(),
    }))
  )
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const parsed = createDispatchHistorySchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorWithRequestId({
      requestId,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: parsed.error.flatten(),
    })
  }

  const { totalOrders, matched, unmatched, items } = parsed.data
  const record = await db.dispatchHistory.create({
    data: {
      totalOrders,
      matched,
      unmatched,
      items: JSON.stringify(items),
    },
  })
  await writeAuditLog({
    req,
    session: auth.session,
    action: "dispatch_history.create",
    entity: "dispatch_history",
    entityId: record.id,
    metadata: { totalOrders, matched, unmatched, requestId },
  })
  return jsonWithRequestId({ id: record.id }, requestId)
}
