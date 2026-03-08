import type { Order, Driver, VehicleType } from "./types"

export interface DispatchScore {
  driverId: string
  driverName: string
  totalScore: number
  breakdown: {
    vehicleMatch: number
    workloadScore: number
    distanceScore: number
    timeConflictPenalty: number
  }
  reasons: string[]
  hasConflict: boolean
  conflictDetails?: string
}

export interface DispatchResult {
  success: boolean
  orderId: string
  recommendations: DispatchScore[]
  bestMatch?: DispatchScore
  message: string
}

// Simulated distance calculation (in real scenario, would use AMap API)
function calculateDistance(from: string, to: string): number {
  // Mock distance based on string similarity and randomization
  const seed = (from + to).split("").reduce((a, b) => a + b.charCodeAt(0), 0)
  return 5 + (seed % 45) // 5-50 km range
}

// Check if two time slots conflict
function hasTimeConflict(
  existingDate: string,
  existingTime: string,
  newDate: string,
  newTime: string,
  bufferMinutes: number = 120
): boolean {
  if (existingDate !== newDate) return false
  
  const [existingHour, existingMin] = existingTime.split(":").map(Number)
  const [newHour, newMin] = newTime.split(":").map(Number)
  
  const existingMinutes = existingHour * 60 + existingMin
  const newMinutes = newHour * 60 + newMin
  
  return Math.abs(existingMinutes - newMinutes) < bufferMinutes
}

// Calculate driver's current workload
function calculateWorkload(driver: Driver, allOrders: Order[]): number {
  const today = new Date().toISOString().split("T")[0]
  const driverOrders = allOrders.filter(
    o => o.driverId === driver.id && 
    o.serviceDate === today && 
    !["completed", "cancelled"].includes(o.status)
  )
  return driverOrders.length
}

// Get driver's assigned orders for conflict checking
function getDriverAssignedOrders(driverId: string, allOrders: Order[]): Order[] {
  return allOrders.filter(
    o => o.driverId === driverId && !["completed", "cancelled"].includes(o.status)
  )
}

export function runDispatchAlgorithm(
  order: Order,
  availableDrivers: Driver[],
  allOrders: Order[],
  config: {
    maxDailyOrders: number
    conflictBufferMinutes: number
  } = {
    maxDailyOrders: 8,
    conflictBufferMinutes: 120,
  }
): DispatchResult {
  const recommendations: DispatchScore[] = []
  
  // Filter drivers by vehicle type first
  const eligibleDrivers = availableDrivers.filter(
    d => d.vehicleType === order.vehicleType && d.status === "available"
  )
  
  if (eligibleDrivers.length === 0) {
    return {
      success: false,
      orderId: order.id,
      recommendations: [],
      message: `没有符合车型要求（${order.vehicleType}）的可用司机`,
    }
  }
  
  for (const driver of eligibleDrivers) {
    const reasons: string[] = []
    let hasConflict = false
    let conflictDetails: string | undefined
    
    // 1. Vehicle type match (already filtered, but for scoring)
    const vehicleMatch = 100
    reasons.push("车型匹配")
    
    // 2. Workload score (prefer drivers with lower workload)
    const workload = calculateWorkload(driver, allOrders)
    let workloadScore = 100
    if (workload >= config.maxDailyOrders) {
      workloadScore = 0
      reasons.push(`当日已接${workload}单，超出限制`)
    } else {
      workloadScore = Math.max(0, 100 - (workload * 15))
      if (workload > 0) {
        reasons.push(`当日已接${workload}单`)
      } else {
        reasons.push("当日无订单")
      }
    }
    
    // 3. Time conflict check
    const driverOrders = getDriverAssignedOrders(driver.id, allOrders)
    let timeConflictPenalty = 0
    
    for (const existingOrder of driverOrders) {
      if (hasTimeConflict(
        existingOrder.serviceDate,
        existingOrder.serviceTime,
        order.serviceDate,
        order.serviceTime,
        config.conflictBufferMinutes
      )) {
        hasConflict = true
        timeConflictPenalty = 50
        conflictDetails = `与订单 ${existingOrder.orderNumber} 时间冲突（${existingOrder.serviceTime}）`
        reasons.push(conflictDetails)
        break
      }
    }
    
    if (!hasConflict) {
      reasons.push("无时间冲突")
    }
    
    // 4. Distance score (simulated)
    const distance = calculateDistance(driver.currentLocation || "默认位置", order.pickupLocation)
    const distanceScore = Math.max(0, 100 - distance * 2)
    reasons.push(`距离约${distance.toFixed(1)}公里`)
    
    // Calculate total score
    const totalScore = Math.round(
      (vehicleMatch * 0.3) +
      (workloadScore * 0.3) +
      (distanceScore * 0.2) -
      (timeConflictPenalty * 0.2)
    )
    
    recommendations.push({
      driverId: driver.id,
      driverName: driver.name,
      totalScore,
      breakdown: {
        vehicleMatch,
        workloadScore,
        distanceScore,
        timeConflictPenalty,
      },
      reasons,
      hasConflict,
      conflictDetails,
    })
  }
  
  // Sort by total score descending
  recommendations.sort((a, b) => b.totalScore - a.totalScore)
  
  const bestMatch = recommendations.find(r => !r.hasConflict)
  
  return {
    success: recommendations.length > 0,
    orderId: order.id,
    recommendations,
    bestMatch,
    message: bestMatch 
      ? `推荐司机：${bestMatch.driverName}（评分 ${bestMatch.totalScore}）`
      : recommendations.length > 0
      ? "所有可用司机均存在时间冲突，请手动选择或调整订单时间"
      : "没有符合条件的可用司机",
  }
}

// Batch dispatch for multiple orders
export function batchDispatch(
  orders: Order[],
  drivers: Driver[],
  allOrders: Order[],
  config?: {
    maxDailyOrders: number
    conflictBufferMinutes: number
  }
): Map<string, DispatchResult> {
  const results = new Map<string, DispatchResult>()
  const assignedDrivers = new Set<string>()
  
  // Sort orders by service time (earlier first)
  const sortedOrders = [...orders].sort((a, b) => {
    const dateTimeA = `${a.serviceDate} ${a.serviceTime}`
    const dateTimeB = `${b.serviceDate} ${b.serviceTime}`
    return dateTimeA.localeCompare(dateTimeB)
  })
  
  for (const order of sortedOrders) {
    // Filter out already assigned drivers for this batch
    const availableDriversForOrder = drivers.filter(d => !assignedDrivers.has(d.id))
    
    const result = runDispatchAlgorithm(order, availableDriversForOrder, allOrders, config)
    results.set(order.id, result)
    
    // Mark best match as assigned
    if (result.bestMatch) {
      assignedDrivers.add(result.bestMatch.driverId)
    }
  }
  
  return results
}
