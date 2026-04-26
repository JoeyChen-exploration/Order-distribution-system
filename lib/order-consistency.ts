type OrderPayload = {
  reqVehicleType?: string
  flightDate?: string
  pickupTime?: string
  metadata?: string | null
  [k: string]: unknown
}

function safeParseMetadata(metadata: string | null | undefined) {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata)
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

/**
 * 统一导入/派单/导出字段语义，避免同一信息在不同环节 key 不一致。
 */
export function normalizeOrderPayload(input: OrderPayload): OrderPayload {
  const normalized = { ...input }

  if (normalized.reqVehicleType === "商务型") {
    normalized.reqVehicleType = "普通商务型"
  }

  const meta = safeParseMetadata((normalized.metadata as string | null | undefined) ?? null)
  if (meta) {
    const serviceType = String(meta["服务类型"] ?? meta["serviceType"] ?? "").trim()
    if (serviceType) {
      meta["服务类型"] = serviceType
      meta["serviceType"] = serviceType
    }
    const airportCode = String(meta["三字码"] ?? meta["airportCode"] ?? "").trim().toUpperCase()
    if (airportCode) {
      meta["三字码"] = airportCode
      meta["airportCode"] = airportCode
    }
    normalized.metadata = JSON.stringify(meta)
  }

  return normalized
}
