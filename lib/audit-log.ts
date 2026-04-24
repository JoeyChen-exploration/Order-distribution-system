import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import type { SessionPayload } from "@/lib/auth-server"
import { getClientIp } from "@/lib/rate-limit"

type AuditActor = Pick<SessionPayload, "id" | "username" | "role">

type AuditLogInput = {
  req: NextRequest
  session?: AuditActor | null
  action: string
  entity?: string
  entityId?: string | null
  status?: "success" | "failed"
  message?: string
  metadata?: unknown
}

let ensureTablePromise: Promise<void> | null = null

async function ensureAuditTable() {
  if (ensureTablePromise) return ensureTablePromise

  ensureTablePromise = (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "action" TEXT NOT NULL,
        "entity" TEXT,
        "entityId" TEXT,
        "actorUserId" TEXT,
        "actorUsername" TEXT,
        "actorRole" TEXT,
        "method" TEXT,
        "path" TEXT,
        "ip" TEXT,
        "status" TEXT NOT NULL DEFAULT 'success',
        "message" TEXT,
        "metadata" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
      CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
      CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
    `)
  })()

  return ensureTablePromise
}

function safeJsonStringify(data: unknown): string | null {
  if (data === undefined) return null
  try {
    const str = JSON.stringify(data)
    return str.length > 20000 ? `${str.slice(0, 20000)}...[truncated]` : str
  } catch {
    return null
  }
}

export async function writeAuditLog(input: AuditLogInput) {
  try {
    await ensureAuditTable()
    const path = new URL(input.req.url).pathname
    const metadata = safeJsonStringify(input.metadata)
    await db.$executeRaw`
      INSERT INTO "AuditLog" (
        "id", "action", "entity", "entityId", "actorUserId", "actorUsername",
        "actorRole", "method", "path", "ip", "status", "message", "metadata"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${input.action},
        ${input.entity ?? null},
        ${input.entityId ?? null},
        ${input.session?.id ?? null},
        ${input.session?.username ?? null},
        ${input.session?.role ?? null},
        ${input.req.method},
        ${path},
        ${getClientIp(input.req)},
        ${input.status ?? "success"},
        ${input.message ?? null},
        ${metadata}
      )
    `
  } catch (e) {
    console.error("writeAuditLog error:", e)
  }
}
