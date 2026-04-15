import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

// POST /api/users/login
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
    }

    const user = await db.user.findFirst({
      where: { username },
      select: { id: true, username: true, password: true, role: true, name: true, createdAt: true, updatedAt: true },
    })

    if (!user) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
    }

    // Support lazy migration: if stored password is not a bcrypt hash, compare plaintext
    // then re-hash it on first successful login
    let passwordMatch = false
    const isBcryptHash = user.password.startsWith("$2")

    if (isBcryptHash) {
      passwordMatch = await bcrypt.compare(password, user.password)
    } else {
      // Legacy plaintext — migrate on first login
      passwordMatch = password === user.password
      if (passwordMatch) {
        const hashed = await bcrypt.hash(password, 12)
        await db.user.update({ where: { id: user.id }, data: { password: hashed } })
      }
    }

    if (!passwordMatch) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...safeUser } = user
    return NextResponse.json(safeUser)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
