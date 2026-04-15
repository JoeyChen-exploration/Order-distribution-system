"use client"

// Client-side drive-time lookup — calls Amap REST API directly from the browser.
// Key is loaded from NEXT_PUBLIC_AMAP_KEY (.env.local, gitignored).
// Server-side Node.js on this machine cannot reach restapi.amap.com; browsers can.

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY ?? ""

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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

export async function getDriveTime(
  originLng: number, originLat: number,
  destLng: number, destLat: number,
  pickupTime?: string,
): Promise<{ durationMinutes: number; distanceKm: number; source: "amap" | "estimate" }> {
  if (!originLat || !originLng || !destLat || !destLng) {
    return { durationMinutes: 0, distanceKm: 0, source: "estimate" }
  }

  if (AMAP_KEY) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const url =
        `https://restapi.amap.com/v3/direction/driving` +
        `?origin=${originLng},${originLat}` +
        `&destination=${destLng},${destLat}` +
        `&strategy=0&extensions=base` +
        `&key=${AMAP_KEY}`
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      const data = await res.json()
      if (data.status === "1" && data.route?.paths?.[0]) {
        const path = data.route.paths[0]
        const durationSec = parseInt(path.duration, 10)
        const distanceM   = parseInt(path.distance, 10)
        const multiplier  = getTrafficMultiplier(pickupTime ?? "")
        return {
          durationMinutes: Math.ceil(durationSec / 60 * multiplier),
          distanceKm: distanceM / 1000,
          source: "amap",
        }
      }
    } catch {}
  }

  // Fallback: haversine + traffic multiplier
  const dist = haversine(originLat, originLng, destLat, destLng)
  const multiplier = getTrafficMultiplier(pickupTime ?? "")
  return {
    durationMinutes: Math.ceil(dist / 35 * 60 * multiplier),
    distanceKm: dist,
    source: "estimate",
  }
}
