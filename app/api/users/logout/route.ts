import { NextRequest, NextResponse } from "next/server"
import { clearAuthCookie, getSessionFromRequest } from "@/lib/auth-server"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  const res = NextResponse.json({ success: true })
  clearAuthCookie(res)
  await writeAuditLog({
    req,
    session,
    action: "auth.logout",
    entity: "user",
    entityId: session?.id,
  })
  return res
}
