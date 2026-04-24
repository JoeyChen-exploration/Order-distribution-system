import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"

const AMAP_KEY = process.env.AMAP_KEY || ""

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const address = searchParams.get("address")
  const city = searchParams.get("city") || "上海"

  if (!address) return NextResponse.json({ error: "missing address" }, { status: 400 })
  if (!AMAP_KEY) return NextResponse.json({ error: "geocode service unavailable" }, { status: 503 })

  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${AMAP_KEY}&city=${encodeURIComponent(city)}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === "1" && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(",").map(Number)
      return NextResponse.json({ lat, lng })
    }
    return NextResponse.json({ error: "no result", raw: data.info }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
