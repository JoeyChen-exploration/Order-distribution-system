import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const records = await db.dispatchHistory.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(
      records.map(r => {
        let items: unknown = []
        try { items = JSON.parse(r.items) } catch { items = [] }
        return { ...r, items, createdAt: r.createdAt.toISOString() }
      })
    )
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { totalOrders, matched, unmatched, items } = body

    if (typeof totalOrders !== "number" || typeof matched !== "number" || typeof unmatched !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const record = await db.dispatchHistory.create({
      data: {
        totalOrders,
        matched,
        unmatched,
        items: JSON.stringify(Array.isArray(items) ? items : []),
      },
    })
    return NextResponse.json({ id: record.id })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
