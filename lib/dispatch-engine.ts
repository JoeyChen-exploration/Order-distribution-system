import type { Order, Driver, VehicleType } from "./types"

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
    return meta["服务类型"] ?? null
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

// 车型兼容矩阵：key=司机车型，value=可接受的订单车型（按优先级排列）
const VEHICLE_COMPAT: Record<VehicleType, VehicleType[]> = {
  商务型: ["商务型", "豪华型", "舒适型", "经济型"],
  豪华型: ["豪华型", "舒适型", "经济型"],
  舒适型: ["舒适型", "经济型"],
  经济型: ["经济型"],
}

/** 判断司机车型是否可接此订单 */
function canDriverServeOrder(driverType: VehicleType, orderType: VehicleType): boolean {
  return VEHICLE_COMPAT[driverType]?.includes(orderType) ?? false
}

/**
 * 车型降级惩罚分数（0=完全匹配, 10=降1级, 20=降2级, 30=降3级）
 * 降级越多扣分越多
 */
function getVehicleDowngradePenalty(driverType: VehicleType, orderType: VehicleType): number {
  const compatible = VEHICLE_COMPAT[driverType]
  if (!compatible) return 30
  const idx = compatible.indexOf(orderType)
  if (idx === 0) return 0   // 完全匹配
  if (idx === 1) return 10  // 降一级（如商务做豪华）
  if (idx === 2) return 20  // 降两级
  return 30                 // 降三级（豪华/商务做经济，最坏情况）
}

/**
 * 根据上一单服务类型和新单服务类型，返回要求的最小时间间隔（分钟）
 *
 * 规则：
 * - 送机/站 → 送机/站：120 min
 * - 送机/站 → 接机/站：60 min
 * - 接机/站 → 任意：180 min
 * - 包车 → 任意：120 min（默认）
 */
function getRequiredGap(prevType: string | null, newType: string | null): number {
  if (!prevType) return 120
  if (prevType.startsWith("接机")) return 180
  if (prevType.startsWith("送机")) {
    if (newType?.startsWith("接机")) return 60
    return 120
  }
  if (prevType === "包车") return 120
  if (prevType.startsWith("市内约车")) return 120
  return 120
}

/**
 * 估算从 dropoff 到下一单 pickup 的行驶时间（分钟）
 * 上海城区平均速度 35 km/h；坐标任一为 0 则返回 0（无位置数据）
 */
function estimateTravelMinutes(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): number {
  if (!fromLat || !fromLng || !toLat || !toLng) return 0
  const dist = haversineDistance(fromLat, fromLng, toLat, toLng)
  return Math.ceil(dist / 35 * 60)
}

/** 检查两个时间段是否冲突（服务类型间隔规则 + 实际行驶时间） */
function hasTimeConflict(
  existingOrder: Order,
  newOrder: Order,
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
  const serviceGap = getRequiredGap(prevType, nextType)

  // 行驶时间：从前单的下车点到后单的上车点
  const travelMinutes = estimateTravelMinutes(
    prevOrder.dropoffLat, prevOrder.dropoffLng,
    nextOrder.pickupLat, nextOrder.pickupLng,
  )

  // 总需求 = 服务类型间隔（含服务时长估算）+ 行驶时间
  const required = serviceGap + travelMinutes

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
): DispatchResult {
  const recommendations: DispatchScore[] = []
  const targetDate = order.flightDate
  const targetTime = order.pickupTime

  // 过滤：车型兼容 + 状态在岗
  const compatibleDrivers = availableDrivers.filter(
    (d) =>
      (d.status === "available" || d.status === "busy") &&
      canDriverServeOrder(d.vehicleType, order.reqVehicleType),
  )

  if (compatibleDrivers.length === 0) {
    return {
      success: false,
      orderId: order.id,
      recommendations: [],
      message: `没有兼容车型（${order.reqVehicleType}）的可用司机`,
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
    const downgrade = getVehicleDowngradePenalty(driver.vehicleType, order.reqVehicleType)
    if (downgrade === 0) {
      reasons.push("车型完全匹配")
    } else {
      reasons.push(`车型降级接单（${driver.vehicleType}→${order.reqVehicleType}）`)
    }

    // 3. 工作量评分（当日已接单数，越少越好）
    const workload = calculateWorkload(driver, allOrders, targetDate)
    const workloadScore = Math.max(0, 100 - workload * 12)
    reasons.push(workload === 0 ? "当日无订单" : `当日已接 ${workload} 单`)

    // 4. 时间冲突检查
    const driverOrders = getDriverAssignedOrders(driver.id, allOrders)
    let hasConflict = false
    let conflictDetails: string | undefined
    let timeConflictPenalty = 0

    for (const existing of driverOrders) {
      // 任意一方没有 pickupTime，无法判断冲突，跳过
      if (!existing.pickupTime || !order.pickupTime) continue
      const { conflict, gap, required, travelMinutes } = hasTimeConflict(existing, order)
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
    const distance = haversineDistance(pos.lat, pos.lng, order.pickupLat, order.pickupLng)
    // 50km 内满分线性递减；50km+ 接近 0 分
    const distanceScore = Math.max(0, 100 - distance * 2)
    const posLabel =
      driverOrders.some((o) => o.flightDate === targetDate)
        ? `上一单终点距取货点约 ${distance.toFixed(1)} km`
        : `家庭地址距取货点约 ${distance.toFixed(1)} km`
    reasons.push(posLabel)

    // ── 综合评分 ──
    // 工作量 30% + 距离 35% - 车型降级 - 时间冲突 20% + 车型完全匹配加分 15%
    const vehicleMatchBonus = downgrade === 0 ? 100 : 0
    const totalScore = Math.round(
      workloadScore * 0.3 +
        distanceScore * 0.35 -
        downgrade -
        timeConflictPenalty * 0.2 +
        vehicleMatchBonus * 0.15,
    )

    recommendations.push({
      driverId: driver.id,
      driverName: driver.name,
      totalScore,
      breakdown: {
        vehicleMatch: vehicleMatchBonus,
        vehicleDowngrade: downgrade,
        workloadScore,
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
): Map<string, DispatchResult> {
  const results = new Map<string, DispatchResult>()
  // 本地副本：随批次推进，将已分配订单加入，让后续冲突检测能感知同批次的安排
  const localOrders = [...allOrders]

  // 紧急订单优先，再按服务时间排序
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.isEmergency && !b.isEmergency) return -1
    if (!a.isEmergency && b.isEmergency) return 1
    const dtA = `${a.flightDate} ${a.pickupTime}`
    const dtB = `${b.flightDate} ${b.pickupTime}`
    return dtA.localeCompare(dtB)
  })

  for (const order of sortedOrders) {
    // 所有司机始终作为候选，时间冲突由算法内部检测和降分
    const result = runDispatchAlgorithm(order, drivers, localOrders)
    results.set(order.id, result)

    if (result.bestMatch) {
      // 将该订单以"已分配"状态加入本地列表，供后续订单的冲突检测使用
      localOrders.push({ ...order, driverId: result.bestMatch.driverId, status: 1 as const })
    }
  }

  return results
}
