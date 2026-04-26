import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getClientIp } from "@/lib/rate-limit"

type CheckLoginRateLimitInput = {
  req: NextRequest
  username: string
  limit?: number
  windowMinutes?: number
}

let ensureTablePromise: Promise<void> | null = null

async function ensureTable() {
  if (ensureTablePromise) return ensureTablePromise
  ensureTablePromise = (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LoginRateLimit" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bucketKey" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "LoginRateLimit_bucketKey_createdAt_idx"
      ON "LoginRateLimit"("bucketKey","createdAt");
    `)
  })()
  return ensureTablePromise
}

export async function checkAndRecordLoginRateLimit(input: CheckLoginRateLimitInput) {
  const limit = input.limit ?? 8
  const windowMinutes = input.windowMinutes ?? 15
  const ip = getClientIp(input.req)
  const bucketKey = `login:${ip}:${input.username.toLowerCase()}`

  await ensureTable()

  await db.$executeRawUnsafe(
    `DELETE FROM "LoginRateLimit" WHERE "createdAt" < datetime('now', '-1 day')`,
  )

  const rows = await db.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) as count
     FROM "LoginRateLimit"
     WHERE "bucketKey" = ?
       AND "createdAt" >= datetime('now', ?)
    `,
    bucketKey,
    `-${windowMinutes} minutes`,
  )

  const count = Number(rows[0]?.count || 0)
  if (count >= limit) {
    return {
      ok: false,
      retryAfterSec: 60,
      bucketKey,
      ip,
    }
  }

  await db.$executeRawUnsafe(
    `INSERT INTO "LoginRateLimit" ("id","bucketKey") VALUES (?, ?)`,
    crypto.randomUUID(),
    bucketKey,
  )

  return {
    ok: true,
    retryAfterSec: 0,
    bucketKey,
    ip,
  }
}
