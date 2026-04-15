import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
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
  const { totalOrders, matched, unmatched, items } = await req.json()
  const record = await db.dispatchHistory.create({
    data: {
      totalOrders,
      matched,
      unmatched,
      items: JSON.stringify(items),
    },
  })
  return NextResponse.json({ id: record.id })
}
