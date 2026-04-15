import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const MAX_BATCH = 200
const CUID_RE = /^[a-z0-9]{20,30}$/i

// DELETE /api/drivers/batch-delete  body: { ids: string[] }
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { ids } = body as { ids: unknown }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 })
    }
    if (ids.length > MAX_BATCH) {
      return NextResponse.json({ error: `Cannot delete more than ${MAX_BATCH} records at once` }, { status: 400 })
    }
    if (!ids.every(id => typeof id === "string" && CUID_RE.test(id))) {
      return NextResponse.json({ error: "Invalid id format" }, { status: 400 })
    }

    const result = await db.driver.deleteMany({ where: { id: { in: ids as string[] } } })
    return NextResponse.json({ success: true, deleted: result.count })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
