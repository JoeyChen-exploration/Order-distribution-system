import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { batchDeleteSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"

// DELETE /api/orders/batch-delete  body: { ids: string[] }
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req, ["super_admin"])
  if (auth.error) return auth.error

  try {
    const parsed = batchDeleteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "请求参数无效", details: parsed.error.flatten() }, { status: 400 })
    }
    const { ids } = parsed.data
    const result = await db.order.deleteMany({ where: { id: { in: ids } } })
    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.batch_delete",
      entity: "order",
      metadata: { requested: ids.length, deleted: result.count },
    })
    return NextResponse.json({ success: true, deleted: result.count })
  } catch (e) {
    await writeAuditLog({
      req,
      session: auth.session,
      action: "order.batch_delete",
      entity: "order",
      status: "failed",
      message: String(e),
    })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
