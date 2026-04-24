import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"

// AviationStack API key — set AVIATIONSTACK_API_KEY in .env.local
// Free tier: 100 calls/month (http only). Paid plans support more calls.
const API_KEY = process.env.AVIATIONSTACK_API_KEY || ""

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const flightNo = searchParams.get("flightNo")?.trim().toUpperCase()
  const date = searchParams.get("date") // YYYY-MM-DD

  if (!flightNo || !date) {
    return NextResponse.json({ status: "unknown", message: "缺少参数" }, { status: 400 })
  }

  if (!API_KEY) {
    return NextResponse.json({ status: "unknown", message: "未配置航班API密钥" })
  }

  try {
    // AviationStack uses http on free plan; called server-side so no mixed-content issue
    const url = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${encodeURIComponent(flightNo)}&flight_date=${date}`
    const res = await fetch(url, { next: { revalidate: 300 } }) // cache 5 min
    const data = await res.json()

    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ status: "unknown", message: "未找到航班" })
    }

    const flight = data.data[0]
    const rawStatus: string = flight.flight_status ?? ""
    const depDelay: number = flight.departure?.delay ?? 0
    const arrDelay: number = flight.arrival?.delay ?? 0
    const delay = Math.max(depDelay, arrDelay)

    let status: "on_time" | "delayed" | "cancelled" | "landed" | "unknown"
    let message: string

    if (rawStatus === "cancelled") {
      status = "cancelled"; message = "航班取消"
    } else if (rawStatus === "landed") {
      status = "landed"; message = arrDelay > 0 ? `已落地（晚 ${arrDelay} 分）` : "已落地"
    } else if (rawStatus === "active") {
      status = delay > 15 ? "delayed" : "on_time"
      message = delay > 15 ? `飞行中，延误 ${delay} 分` : "飞行中"
    } else if (delay > 15) {
      status = "delayed"; message = `延误 ${delay} 分钟`
    } else {
      status = "on_time"; message = "正常"
    }

    return NextResponse.json({
      status,
      message,
      delayMinutes: delay,
      scheduledDeparture: flight.departure?.scheduled ?? null,
      estimatedDeparture: flight.departure?.estimated ?? null,
      scheduledArrival: flight.arrival?.scheduled ?? null,
      estimatedArrival: flight.arrival?.estimated ?? null,
    })
  } catch {
    return NextResponse.json({ status: "unknown", message: "查询失败" })
  }
}
