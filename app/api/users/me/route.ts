import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"

// GET /api/users/me
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { id, username, role, name } = auth.session
  return NextResponse.json({ id, username, role, name })
}

