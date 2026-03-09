import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/users
export async function GET() {
  const users = await db.user.findMany({
    select: { id: true, username: true, role: true, name: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(users)
}

// POST /api/users
export async function POST(req: NextRequest) {
  const body = await req.json()
  const user = await db.user.create({
    data: body,
    select: { id: true, username: true, role: true, name: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json(user, { status: 201 })
}
