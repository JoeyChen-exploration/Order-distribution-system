import { NextRequest } from "next/server"
import { clearAuthCookie, getSessionFromRequest } from "@/lib/auth-server"
import { writeAuditLog } from "@/lib/audit-log"
import { getRequestId, jsonWithRequestId } from "@/lib/api-response"

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const session = getSessionFromRequest(req)
  const res = jsonWithRequestId({ success: true }, requestId)
  clearAuthCookie(res)
  await writeAuditLog({
    req,
    session,
    action: "auth.logout",
    entity: "user",
    entityId: session?.id,
    metadata: { requestId },
  })
  return res
}
