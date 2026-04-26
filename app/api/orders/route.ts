import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { createOrderSchema } from "@/lib/validation"
import { writeAuditLog } from "@/lib/audit-log"
import { errorWithRequestId, getRequestId, jsonWithRequestId } from "@/lib/api-response"
import { normalizeOrderPayload } from "@/lib/order-consistency"

let ensureOrderSchemaPromise: Promise<void> | null = null

async function ensureOrderSchema() {
  if (ensureOrderSchemaPromise) return ensureOrderSchemaPromise
  ensureOrderSchemaPromise = (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Order" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orderNo" TEXT NOT NULL,
        "passengerName" TEXT NOT NULL,
        "passengerPhone" TEXT NOT NULL,
        "flightNo" TEXT NOT NULL,
        "flightDate" TEXT NOT NULL,
        "pickupTime" TEXT NOT NULL,
        "pickupAddress" TEXT NOT NULL,
        "pickupLat" REAL NOT NULL DEFAULT 0,
        "pickupLng" REAL NOT NULL DEFAULT 0,
        "dropoffAddress" TEXT NOT NULL,
        "dropoffLat" REAL NOT NULL DEFAULT 0,
        "dropoffLng" REAL NOT NULL DEFAULT 0,
        "reqVehicleType" TEXT NOT NULL,
        "status" INTEGER NOT NULL DEFAULT 0,
        "isEmergency" BOOLEAN NOT NULL DEFAULT false,
        "cancelReason" TEXT,
        "cancelTime" TEXT,
        "modifiedAt" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "driverId" TEXT,
        "driverName" TEXT,
        "modifiedUserId" TEXT,
        "importBatchId" TEXT,
        "metadata" TEXT
      );
    `)
    const cols = await db.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("Order")`)
    const names = cols.map((c) => c.name)
    if (!names.includes("metadata")) {
      await db.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN "metadata" TEXT`)
    }
  })()
  return ensureOrderSchemaPromise
}

// GET /api/orders
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error
  await ensureOrderSchema()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  const orders = await db.order.findMany({
    where: { ...(status !== null ? { status: Number(status) } : {}) },
    include: { driver: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(orders)
}

// POST /api/orders
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const auth = requireAuth(req)
  if (auth.error) return auth.error
  await ensureOrderSchema()

  const parsed = createOrderSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorWithRequestId({
      requestId,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: parsed.error.flatten(),
    })
  }
  const body = normalizeOrderPayload(parsed.data)
  const { orderNo, ...rest } = body
  const order = await db.order.upsert({
    where: { orderNo },
    update: rest,
    create: body,
  })
  await writeAuditLog({
    req,
    session: auth.session,
    action: "order.upsert",
    entity: "order",
    entityId: order.id,
    metadata: { orderNo: order.orderNo, status: order.status, requestId },
  })
  return jsonWithRequestId(order, requestId, 201)
}
