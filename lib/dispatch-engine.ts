import type { Order, Driver } from "./types"

/**
 * Cache of pre-fetched Amap driving times.
 * Key: "originLng,originLat->destLng,destLat"
 * Value: driving time in minutes
 */
export type TravelTimeCache = Map<string, number>

export interface DispatchScore {
  driverId: string
  driverName: string
  totalScore: number
  breakdown: {
    vehicleMatch: number
    vehicleDowngrade: number
    workloadScore: number
    distanceScore: number
    timeConflictPenalty: number
  }
  reasons: string[]
  hasConflict: boolean
  conflictDetails?: string
  workingHoursOk: boolean
}

export interface DispatchResult {
  success: boolean
  orderId: string
  recommendations: DispatchScore[]
  bestMatch?: DispatchScore
  message: string
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** Haversine 公式：计算两点直线距离（km） */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** 从 order.metadata JSON 提取服务类型字段 */
function getServiceType(order: Order): string | null {
  if (!order.metadata) return null
  try {
    const meta = typeof order.metadata === "string" ? JSON.parse(order.metadata) : order.metadata
    return meta["服务类型"] ?? meta["serviceType"] ?? null
  } catch {
    return null
  }
}

/** 判断 time（HH:MM）是否在 workingHours（HH:MM-HH:MM）范围内 */
export function isWithinWorkingHours(workingHours: string, time: string): boolean {
  if (!workingHours || !time) return false
  const match = workingHours.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/)
  if (!match) return false

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }

  const start = toMinutes(match[1])
  const end = toMinutes(match[2])
  const target = toMinutes(time)

  if (start <= end) {
    return target >= start && target <= end
  } else {
    // 跨午夜（如 22:00-06:00）
    return target >= start || target <= end
  }
}

/**
 * 车型兼容矩阵（从高到低：豪华商务型 > 普通商务型 > 豪华型 > 舒适型 > 经济型）
 * key=司机车型，value=可接受的订单车型列表（index越大降级越多，惩罚越高）
 *
 * 注意：
 * - 商务型（两档）不接经济型订单
 * - 豪华型不接经济型订单（接舒适型属于降级接单）
 * - 数据库中残留的旧"商务型"司机车型视为普通商务型处理
 */
const VEHICLE_COMPAT: Record<string, string[]> = {
  豪华商务型: ["豪华商务型", "普通商务型", "商务型", "豪华型", "舒适型"],
  普通商务型: ["普通商务型", "商务型", "豪华型", "舒适型"],
  豪华型:     ["豪华型", "舒适型"],
  舒适型:     ["舒适型", "经济型"],
  经济型:     ["经济型"],
}

/** 判断司机车型是否可接此订单车型 */
function canDriverServeOrder(driverType: string, orderType: string): boolean {
  return VEHICLE_COMPAT[driverType]?.includes(orderType) ?? false
}

/**
 * 车型降级惩罚（0=完全匹配或等价接单, 10=降1级, 20=降2级, 30=降3级）
 * 不兼容返回 999（硬过滤）
 *
 * 特例：豪华型司机接舒适型订单惩罚为 0——
 * 豪华型与舒适型在乘客体验上差异较小，且 MRV 已在调度层面保证
 * 豪华型订单优先匹配豪华型司机，剩余容量无惩罚竞争舒适型订单，提升利用率。
 */
function getVehicleDowngradePenalty(driverType: string, orderType: string): number {
  const compatible = VEHICLE_COMPAT[driverType]
  if (!compatible) return 999
  const idx = compatible.indexOf(orderType)
  if (idx < 0)  return 999
  if (idx === 0) return 0
  if (driverType === "豪华型" && orderType === "舒适型") return 0
  if (idx === 1) return 10
  if (idx === 2) return 20
  return 30
}

/**
 * 获取订单的有效车型。
 * 旧版数据库中残留的 "商务型" 直接视为 "普通商务型"。
 */
export function getEffectiveOrderVehicleType(order: Order): string {
  if (order.reqVehicleType === "商务型") return "普通商务型"
  return order.reqVehicleType
}

/** 从 metadata 读取包车时长（小时），只有 4 和 8 两档，默认 4 */
function getCharterHours(order: Order): number {
  if (!order.metadata) return 4
  try {
    const meta = typeof order.metadata === "string" ? JSON.parse(order.metadata) : order.metadata
    const val = parseInt(String(meta["包车时长"] ?? "4"), 10)
    return val === 8 ? 8 : 4
  } catch {
    return 4
  }
}

/**
 * 返回服务类型的"非行驶"缓冲时间（分钟）。
 *
 * 业务最小间隔（pickup→pickup 时间差下限），动态行驶时间叠加在此之上：
 * - 接机/站 → 任意：90 min（等落地 + 提行李 + 离场缓冲，行驶时间动态加）
 * - 送机/站 → 接机/站：60 min
 * - 送机/站 → 送机/站：120 min
 * - 包车 → 任意：包车时长 × 60 min
 * - 市内约车 → 任意：60 min
 *
 * 实际所需间隔 = serviceBuffer + travelMinutes(前单下车点 → 后单上车点)
 */
function getServiceBuffer(prevType: string | null, newType: string | null, charterHours = 4): number {
  if (!prevType) return 60
  if (prevType.startsWith("接机")) return 90
  if (prevType.startsWith("送机")) {
    if (newType?.startsWith("接机")) return 60
    return 120
  }
  if (prevType === "包车") return charterHours * 60
  if (prevType.startsWith("市内约车")) return 60
  return 60
}

/**
 * 上海时段交通系数
 * 07:00–09:30 早高峰 +40%
 * 11:30–13:30 午高峰 +10%
 * 17:00–20:00 晚高峰 +55%
 * 22:00–06:00 夜间   -20%
 * 交通系数仅在 /api/maps/drivetime 服务端叠加，haversine 回退不使用。
 */

/**
 * 获取从 from → to 的行驶时间（分钟）
 * 优先从 cache（Amap API 预取结果）读取；
 * cache 未命中则用 haversine + 时段交通系数估算。
 */
function estimateTravelMinutes(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  cache?: TravelTimeCache,
): number {
  if (!fromLat || !fromLng || !toLat || !toLng) return 0

  // Try cache first (populated by Amap route API before dispatch)
  if (cache) {
    const key = `${fromLng},${fromLat}->${toLng},${toLat}`
    if (cache.has(key)) return cache.get(key)!
  }

  // Fallback: haversine at 35 km/h — NO traffic multiplier here.
  // 35 km/h is already a conservative urban estimate; the multiplier only applies
  // on top of Amap's base duration (handled in /api/maps/drivetime).
  const dist = haversineDistance(fromLat, fromLng, toLat, toLng)
  return Math.ceil(dist / 35 * 60)
}

/** 检查两个时间段是否冲突（服务类型间隔规则 + 实际行驶时间） */
function hasTimeConflict(
  existingOrder: Order,
  newOrder: Order,
  cache?: TravelTimeCache,
): { conflict: boolean; gap: number; required: number; travelMinutes: number } {
  if (existingOrder.flightDate !== newOrder.flightDate) {
    return { conflict: false, gap: Infinity, required: 0, travelMinutes: 0 }
  }

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }

  const existingStart = toMinutes(existingOrder.pickupTime)
  const newStart = toMinutes(newOrder.pickupTime)
  const gapMinutes = Math.abs(newStart - existingStart)

  // 以时间靠前的那单的服务类型来决定所需间隔
  const isExistingFirst = existingStart <= newStart
  const prevOrder = isExistingFirst ? existingOrder : newOrder
  const nextOrder = isExistingFirst ? newOrder : existingOrder

  const prevType = getServiceType(prevOrder)
  const nextType = getServiceType(nextOrder)
  const charterHours = prevType === "包车" ? getCharterHours(prevOrder) : 4

  // 行驶时间：从前单下车点到后单上车点（Amap 缓存 > haversine 估算）
  const travelMinutes = estimateTravelMinutes(
    prevOrder.dropoffLat, prevOrder.dropoffLng,
    nextOrder.pickupLat, nextOrder.pickupLng,
    cache,
  )

  // 所需间隔 = 业务缓冲 + 实际行驶时间（前单下车点 → 后单上车点）
  const serviceBuffer = getServiceBuffer(prevType, nextType, charterHours)
  const required = serviceBuffer + travelMinutes

  return { conflict: gapMinutes < required, gap: gapMinutes, required, travelMinutes }
}

/** 返回司机在指定日期的"有效起点"坐标（最后一单终点，或家庭地址） */
function getDriverEffectivePosition(
  driver: Driver,
  allOrders: Order[],
  targetDate: string,
  beforeTime?: string,
): { lat: number; lng: number } {
  // 找当天已分配（status 1/2）的订单，取出取车时间在目标时间之前的，按时间倒序取最后一单
  const driverOrders = allOrders
    .filter(
      (o) =>
        o.driverId === driver.id &&
        o.flightDate === targetDate &&
        (o.status === 1 || o.status === 2) &&
        (beforeTime == null || o.pickupTime < beforeTime),
    )
    .sort((a, b) => b.pickupTime.localeCompare(a.pickupTime))

  if (driverOrders.length > 0) {
    const lastOrder = driverOrders[0]
    if (lastOrder.dropoffLat && lastOrder.dropoffLng) {
      return { lat: lastOrder.dropoffLat, lng: lastOrder.dropoffLng }
    }
  }

  return { lat: driver.homeLat, lng: driver.homeLng }
}

/** 计算司机当日（指定日期）已接单数（不含完成/取消/空单） */
function calculateWorkload(driver: Driver, allOrders: Order[], targetDate: string): number {
  return allOrders.filter(
    (o) =>
      o.driverId === driver.id &&
      o.flightDate === targetDate &&
      o.status !== 3 &&
      o.status !== 4 &&
      o.status !== 5,
  ).length
}

/** 获取司机当日已分配的订单（用于时间冲突检查） */
function getDriverAssignedOrders(driverId: string, allOrders: Order[]): Order[] {
  return allOrders.filter(
    (o) =>
      o.driverId === driverId &&
      o.status !== 3 &&
      o.status !== 4 &&
      o.status !== 5,
  )
}

// ─── 主算法 ──────────────────────────────────────────────────────────────────

export function runDispatchAlgorithm(
  order: Order,
  availableDrivers: Driver[],
  allOrders: Order[],
  travelCache?: TravelTimeCache,
): DispatchResult {
  const recommendations: DispatchScore[] = []
  const targetDate = order.flightDate
  const targetTime = order.pickupTime

  const effectiveOrderType = getEffectiveOrderVehicleType(order)

  // 过滤：车型兼容 + 状态在岗
  const compatibleDrivers = availableDrivers.filter(
    (d) =>
      (d.status === "available" || d.status === "busy") &&
      canDriverServeOrder(d.vehicleType, effectiveOrderType),
  )

  if (compatibleDrivers.length === 0) {
    return {
      success: false,
      orderId: order.id,
      recommendations: [],
      message: `没有兼容车型（${effectiveOrderType}）的可用司机`,
    }
  }

  for (const driver of compatibleDrivers) {
    const reasons: string[] = []

    // 1. 工作时间检查（硬过滤）
    // 若订单没有 pickupTime 或司机没有 workingHours，跳过时间过滤（不排除司机）
    const workingHoursOk = (!driver.workingHours || !targetTime)
      ? true
      : isWithinWorkingHours(driver.workingHours, targetTime)

    if (!workingHoursOk) {
      continue
    }
    if (driver.workingHours && targetTime) {
      reasons.push(`工作时段：${driver.workingHours}`)
    }

    // 2. 车型降级惩罚
    const downgrade = getVehicleDowngradePenalty(driver.vehicleType, effectiveOrderType)
    if (downgrade === 0) {
      reasons.push("车型完全匹配")
    } else {
      reasons.push(`车型降级接单（${driver.vehicleType}→${effectiveOrderType}）`)
    }

    // 3. 工作量（仅用于展示，不参与评分）
    const workload = calculateWorkload(driver, allOrders, targetDate)
    reasons.push(workload === 0 ? "当日无订单" : `当日已接 ${workload} 单`)

    // 4. 时间冲突检查
    const driverOrders = getDriverAssignedOrders(driver.id, allOrders)
    let hasConflict = false
    let conflictDetails: string | undefined
    let timeConflictPenalty = 0

    for (const existing of driverOrders) {
      // 任意一方没有 pickupTime，无法判断冲突，跳过
      if (!existing.pickupTime || !order.pickupTime) continue
      const { conflict, gap, required, travelMinutes } = hasTimeConflict(existing, order, travelCache)
      if (conflict) {
        hasConflict = true
        timeConflictPenalty = 50
        const travelNote = travelMinutes > 0 ? `（含行驶 ${travelMinutes} 分钟）` : ""
        conflictDetails = `与订单 ${existing.orderNo}（${existing.pickupTime}）时间冲突，间隔 ${gap} 分钟，要求 ≥ ${required} 分钟${travelNote}`
        reasons.push(conflictDetails)
        break
      }
    }
    if (!hasConflict) {
      reasons.push("无时间冲突")
    }

    // 5. 距离评分（司机有效起点 → 订单取货点）
    const pos = getDriverEffectivePosition(driver, allOrders, targetDate, targetTime)
    // 如果 cache 有从司机位置到取货点的行驶时间，用行驶时间推算等效距离；否则直接用 haversine
    const cacheKey = `${pos.lng},${pos.lat}->${order.pickupLng},${order.pickupLat}`
    const cachedMinutes = travelCache?.get(cacheKey)
    const distance = cachedMinutes != null
      ? cachedMinutes / 60 * 35   // 反推等效距离（km），便于统一评分量纲
      : haversineDistance(pos.lat, pos.lng, order.pickupLat, order.pickupLng)
    // 50km 内满分线性递减；50km+ 接近 0 分
    const distanceScore = Math.max(0, 100 - distance * 2)
    const posLabel =
      driverOrders.some((o) => o.flightDate === targetDate)
        ? `上一单终点距取货点约 ${distance.toFixed(1)} km`
        : `家庭地址距取货点约 ${distance.toFixed(1)} km`
    reasons.push(posLabel)

    // ── 综合评分 ──
    // 距离 50% - 车型降级 - 时间冲突 25% + 车型完全匹配加分 25%
    const vehicleMatchBonus = downgrade === 0 ? 100 : 0
    const totalScore = Math.round(
      distanceScore * 0.5 -
        downgrade -
        timeConflictPenalty * 0.25 +
        vehicleMatchBonus * 0.25,
    )

    recommendations.push({
      driverId: driver.id,
      driverName: driver.name,
      totalScore,
      breakdown: {
        vehicleMatch: vehicleMatchBonus,
        vehicleDowngrade: downgrade,
        workloadScore: 0,
        distanceScore,
        timeConflictPenalty,
      },
      reasons,
      hasConflict,
      conflictDetails,
      workingHoursOk: true,
    })
  }

  // 按分数降序排列
  recommendations.sort((a, b) => b.totalScore - a.totalScore)

  const bestMatch = recommendations.find((r) => !r.hasConflict)

  return {
    success: recommendations.length > 0,
    orderId: order.id,
    recommendations,
    bestMatch,
    message: bestMatch
      ? `推荐司机：${bestMatch.driverName}（评分 ${bestMatch.totalScore}）`
      : recommendations.length > 0
        ? "所有候选司机均存在时间冲突，请手动选择或调整订单时间"
        : "没有符合条件的可用司机（工作时间或车型不匹配）",
  }
}

// ─── 批量派单 ────────────────────────────────────────────────────────────────

export function batchDispatch(
  orders: Order[],
  drivers: Driver[],
  allOrders: Order[],
  travelCache?: TravelTimeCache,
): Map<string, DispatchResult> {
  const results = new Map<string, DispatchResult>()
  // 本地副本：随批次推进，将已分配订单加入，让后续冲突检测能感知同批次的安排
  const localOrders = [...allOrders]

  const processOrder = (order: Order) => {
    const result = runDispatchAlgorithm(order, drivers, localOrders, travelCache)
    results.set(order.id, result)
    if (result.bestMatch) {
      localOrders.push({ ...order, driverId: result.bestMatch.driverId, status: 1 as const })
    }
  }

  // ① 紧急订单：按时间升序优先处理
  const emergencies = orders
    .filter(o => o.isEmergency)
    .sort((a, b) => `${a.flightDate} ${a.pickupTime}`.localeCompare(`${b.flightDate} ${b.pickupTime}`))
  for (const order of emergencies) processOrder(order)

  // ② 普通订单：MRV（最小剩余值）动态排序
  // 每轮选"当前可用司机最少"的订单优先派，防止高峰期贪心消耗司机导致后续订单无人可派
  const remaining = orders.filter(o => !o.isEmergency)

  while (remaining.length > 0) {
    let minCount = Infinity
    let minIdx = 0

    for (let i = 0; i < remaining.length; i++) {
      const order = remaining[i]
      const effectiveType = getEffectiveOrderVehicleType(order)
      let count = 0

      for (const driver of drivers) {
        if (driver.status !== "available" && driver.status !== "busy") continue
        if (!canDriverServeOrder(driver.vehicleType, effectiveType)) continue
        if (driver.workingHours && order.pickupTime &&
            !isWithinWorkingHours(driver.workingHours, order.pickupTime)) continue
        // 检查是否与当前已分配订单存在时间冲突
        const assigned = getDriverAssignedOrders(driver.id, localOrders)
        let blocked = false
        for (const existing of assigned) {
          if (!existing.pickupTime || !order.pickupTime) continue
          const { conflict } = hasTimeConflict(existing, order, travelCache)
          if (conflict) { blocked = true; break }
        }
        if (!blocked) count++
      }

      // 平局：时间早的优先（与原来行为保持连贯）
      const t = `${order.flightDate} ${order.pickupTime}`
      const tMin = `${remaining[minIdx].flightDate} ${remaining[minIdx].pickupTime}`
      if (count < minCount || (count === minCount && t < tMin)) {
        minCount = count
        minIdx = i
      }
    }

    const [order] = remaining.splice(minIdx, 1)
    processOrder(order)
  }

  return results
}
