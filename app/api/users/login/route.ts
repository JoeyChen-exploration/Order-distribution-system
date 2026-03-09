import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/users/login
export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const user = await db.user.findFirst({
    where: { username, password },
    select: { id: true, username: true, role: true, name: true, createdAt: true, updatedAt: true },
  })

  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
  }

  return NextResponse.json(user)
}
