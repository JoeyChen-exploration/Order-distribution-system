import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createSessionToken, setAuthCookie, verifyPassword, hashPassword } from "@/lib/auth-server"
import { z } from "zod"

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
})

// POST /api/users/login
export async function POST(req: NextRequest) {
  const parsed = loginSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 })
  }

  const { username, password } = parsed.data

  const user = await db.user.findUnique({
    where: { username },
    select: { id: true, username: true, password: true, role: true, name: true, createdAt: true, updatedAt: true },
  })

  const verify = user ? verifyPassword(password, user.password) : { valid: false, needsRehash: false }
  if (!user || !verify.valid) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
  }

  if (verify.needsRehash) {
    await db.user.update({
      where: { id: user.id },
      data: { password: hashPassword(password) },
    })
  }

  const safeUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
  const token = createSessionToken({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
  })
  const res = NextResponse.json(safeUser)
  setAuthCookie(res, token)
  return res
}
