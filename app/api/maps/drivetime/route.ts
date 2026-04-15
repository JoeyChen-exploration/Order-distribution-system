import { NextRequest, NextResponse } from "next/server"

const AMAP_KEY = process.env.AMAP_KEY
if (!AMAP_KEY) throw new Error("AMAP_KEY env variable is not set")

/**
 * GET /api/maps/drivetime
 * ?originLng=121.0&originLat=31.0&destLng=121.5&destLat=31.5&pickupTime=08:30
 *
 * Returns: { durationMinutes, distanceKm, source: "amap" | "estimate" }
 *
 * Uses Amap driving direction v3 API (server-side, key not exposed to client).
 * Falls back to haversine + time-of-day traffic multiplier if API unavailable.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const originLng = parseFloat(searchParams.get("originLng") || "0")
  const originLat = parseFloat(searchParams.get("originLat") || "0")
  const destLng   = parseFloat(searchParams.get("destLng")   || "0")
  const destLat   = parseFloat(searchParams.get("destLat")   || "0")
  const pickupTime = searchParams.get("pickupTime") || ""  // HH:MM

  if (!originLat || !originLng || !destLat || !destLng) {
    return NextResponse.json({ durationMinutes: 0, distanceKm: 0, source: "no_coords" })
  }

  // ── 1. Try Amap driving direction API ──────────────────────────────────────
  try {
    // Amap takes lng,lat order
    const url = `https://restapi.amap.com/v3/direction/driving` +
      `?origin=${originLng},${originLat}` +
      `&destination=${destLng},${destLat}` +
      `&strategy=0` +      // fastest route
      `&extensions=base` +
      `&key=${AMAP_KEY}`

    const res = await fetch(url, { next: { revalidate: 600 } })  // cache 10 min
    const data = await res.json()

    if (data.status === "1" && data.route?.paths?.[0]) {
      const path = data.route.paths[0]
      const durationSec  = parseInt(path.duration, 10)   // seconds
      const distanceM    = parseInt(path.distance, 10)   // meters

      // Apply time-of-day traffic multiplier to Amap's base duration
      // (Amap free tier returns typical-day duration, not real-time traffic)
      const multiplier = getTrafficMultiplier(pickupTime)
      const durationMinutes = Math.ceil(durationSec / 60 * multiplier)
      const distanceKm = distanceM / 1000

      return NextResponse.json({ durationMinutes, distanceKm, source: "amap" })
    }
  } catch {
    // fall through to estimate
  }

  // ── 2. Fallback: haversine + traffic multiplier ────────────────────────────
  const dist = haversine(originLat, originLng, destLat, destLng)
  const multiplier = getTrafficMultiplier(pickupTime)
  const durationMinutes = Math.ceil(dist / 35 * 60 * multiplier)

  return NextResponse.json({ durationMinutes, distanceKm: dist, source: "estimate" })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Time-of-day traffic multiplier for Shanghai.
 * Applied on top of Amap's base duration (which already accounts for typical day).
 * Used as a predictive adjustment for early/late routes.
 *
 * 07:00–09:30  morning rush  → +40%
 * 11:30–13:30  lunch         → +10%
 * 17:00–20:00  evening rush  → +55%
 * 22:00–06:00  night         → −20% (faster)
 * otherwise                  → base (1.0)
 */
function getTrafficMultiplier(timeStr: string): number {
  if (!timeStr) return 1.0
  const parts = timeStr.split(":")
  if (parts.length < 2) return 1.0
  const mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)

  if (mins >= 420  && mins <= 570)  return 1.4   // 07:00–09:30 morning rush
  if (mins >= 690  && mins <= 810)  return 1.1   // 11:30–13:30 lunch
  if (mins >= 1020 && mins <= 1200) return 1.55  // 17:00–20:00 evening rush
  if (mins >= 1320 || mins <= 360)  return 0.8   // 22:00–06:00 night
  return 1.0
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
