import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/stats
export async function GET() {
  const [orders, drivers] = await Promise.all([
    db.order.findMany({ select: { status: true } }),
    db.driver.findMany({ select: { status: true } }),
  ])

  return NextResponse.json({
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 0).length,
    assignedOrders: orders.filter(o => o.status === 1).length,
    inProgressOrders: orders.filter(o => o.status === 2).length,
    completedOrders: orders.filter(o => o.status === 3).length,
    cancelledOrders: orders.filter(o => o.status === 4).length,
    totalDrivers: drivers.length,
    availableDrivers: drivers.filter(d => d.status === "available").length,
    busyDrivers: drivers.filter(d => d.status === "busy").length,
  })
}
