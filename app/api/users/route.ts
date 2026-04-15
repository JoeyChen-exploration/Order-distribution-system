import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

// GET /api/users
export async function GET() {
  try {
    const users = await db.user.findMany({
      select: { id: true, username: true, role: true, name: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/users
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password, role, name } = body

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = await db.user.create({
      data: { username, password: hashed, role: role || "dispatcher", name: name || username },
      select: { id: true, username: true, role: true, name: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json(user, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
