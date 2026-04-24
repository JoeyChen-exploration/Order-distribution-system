import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"

// DELETE /api/drivers/batch-delete  body: { ids: string[] }
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { ids } = await req.json() as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 })
    }
    const result = await db.driver.deleteMany({ where: { id: { in: ids } } })
    return NextResponse.json({ success: true, deleted: result.count })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
