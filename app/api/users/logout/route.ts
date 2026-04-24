import { NextResponse } from "next/server"
import { clearAuthCookie } from "@/lib/auth-server"

export async function POST() {
  const res = NextResponse.json({ success: true })
  clearAuthCookie(res)
  return res
}
