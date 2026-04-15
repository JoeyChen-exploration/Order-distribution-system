"use client"

// Client-side geocoding — calls Amap REST API directly from the browser.
// Key is loaded from NEXT_PUBLIC_AMAP_KEY (.env.local, gitignored).

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY ?? ""

function extractCity(address: string): string {
  const m = address.match(/^[\u4e00-\u9fa5]{2,4}(?:市|省|区|县)/)
  return m ? m[0].replace(/省|区|县/, "市") : "上海"
}

function normaliseAddress(raw: string): string {
  let addr = raw.replace(/,\s*\d{5,6}\s+.*/u, "").trim()
  addr = addr.replace(/^.+?(?=中国|[\u4e00-\u9fa5]{2,4}(?:省|市|自治区))/u, "")
  addr = addr.replace(/^中国\s*/u, "")
  return addr.slice(0, 60).trim()
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; resolvedAddress?: string } | null> {
  if (!address.trim() || !AMAP_KEY) return null
  const normalised = normaliseAddress(address)
  const city = extractCity(normalised)
  try {
    const res = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(normalised)}&key=${AMAP_KEY}&city=${encodeURIComponent(city)}`
    )
    const data = await res.json()
    if (data.status === "1" && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(",").map(Number)
      return { lat, lng, resolvedAddress: data.geocodes[0].formatted_address as string }
    }
  } catch {}
  return null
}
