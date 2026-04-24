import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPassword, requireAuth } from "@/lib/auth-server"
import { z } from "zod"

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128),
  role: z.enum(["super_admin", "dispatcher"]).default("dispatcher"),
  name: z.string().trim().min(1).max(64),
})

// GET /api/users
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ["super_admin"])
  if (auth.error) return auth.error

  const users = await db.user.findMany({
    select: { id: true, username: true, role: true, name: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(users)
}

// POST /api/users
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ["super_admin"])
  if (auth.error) return auth.error

  const parsed = createUserSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 })
  }

  const body = parsed.data
  const user = await db.user.create({
    data: {
      username: body.username,
      password: hashPassword(body.password),
      role: body.role,
      name: body.name,
    },
    select: { id: true, username: true, role: true, name: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json(user, { status: 201 })
}
