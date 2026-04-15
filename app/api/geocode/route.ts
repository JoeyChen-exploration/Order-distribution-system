import { NextRequest, NextResponse } from "next/server"

// Normalise long / mixed-format addresses before sending to Amap:
// "上海艾迪逊酒店中国上海市黄浦区南京东路199号, 200002 上海艾迪逊酒店"
//  → "上海市黄浦区南京东路199号"
function normaliseAddress(raw: string): string {
  // 1. Strip trailing ", <postal_code> <anything>"
  let addr = raw.replace(/,\s*\d{5,6}\s+.*/u, "").trim()
  // 2. Strip leading hotel/brand name before "中国" or before first 省/市/区
  addr = addr.replace(/^.+?(?=中国|[\u4e00-\u9fa5]{2,4}(?:省|市|自治区))/u, "")
  addr = addr.replace(/^中国\s*/u, "")
  // 3. Cap at 60 chars — Amap rejects extremely long strings
  return addr.slice(0, 60).trim()
}

export async function GET(req: NextRequest) {
  const AMAP_KEY = process.env.AMAP_KEY
  if (!AMAP_KEY) {
    return NextResponse.json({ error: "Geocoding service not configured" }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const rawAddress = searchParams.get("address")
  const city = searchParams.get("city") || "上海"

  if (!rawAddress) return NextResponse.json({ error: "missing address" }, { status: 400 })

  const address = normaliseAddress(rawAddress)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${AMAP_KEY}&city=${encodeURIComponent(city)}`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    const data = await res.json()
    if (data.status === "1" && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(",").map(Number)
      return NextResponse.json({ lat, lng, resolvedAddress: data.geocodes[0].formatted_address })
    }
    return NextResponse.json({ error: "no result" }, { status: 404 })
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "AbortError"
    return NextResponse.json(
      { error: isTimeout ? "geocode timeout" : "Internal server error" },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
