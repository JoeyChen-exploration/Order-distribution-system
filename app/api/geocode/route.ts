import { NextRequest, NextResponse } from "next/server"

const AMAP_KEY = process.env.AMAP_KEY
if (!AMAP_KEY) throw new Error("AMAP_KEY env variable is not set")

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get("address")
  const city = searchParams.get("city") || "上海"

  if (!address) return NextResponse.json({ error: "missing address" }, { status: 400 })

  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${AMAP_KEY}&city=${encodeURIComponent(city)}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === "1" && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(",").map(Number)
      return NextResponse.json({ lat, lng })
    }
    return NextResponse.json({ error: "no result" }, { status: 404 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
