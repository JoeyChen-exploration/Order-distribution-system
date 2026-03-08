import type { Order, Driver } from "./types"

const statusLabels: Record<string, string> = {
  pending: "待派单",
  assigned: "已派单",
  accepted: "已接单",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
}

const serviceTypeLabels: Record<string, string> = {
  pickup: "接机",
  dropoff: "送机",
}

const vehicleTypeLabels: Record<string, string> = {
  sedan: "轿车",
  suv: "SUV",
  van: "商务车",
  luxury: "豪华车",
}

const driverStatusLabels: Record<string, string> = {
  available: "在岗",
  busy: "忙碌",
  off_duty: "下线",
  on_leave: "请假",
}

function escapeCSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return ""
  const str = String(field)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function generateCSV(headers: string[], rows: (string | number | undefined | null)[][]): string {
  const headerLine = headers.map(escapeCSVField).join(",")
  const dataLines = rows.map(row => row.map(escapeCSVField).join(","))
  return [headerLine, ...dataLines].join("\n")
}

function downloadFile(content: string, filename: string, mimeType: string = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportOrdersToCSV(
  orders: Order[], 
  drivers: Driver[],
  options?: {
    includeDriverInfo?: boolean
    dateRange?: { start: string; end: string }
  }
): void {
  const driverMap = new Map(drivers.map(d => [d.id, d]))
  
  const filteredOrders = options?.dateRange
    ? orders.filter(o => 
        o.serviceDate >= options.dateRange!.start && 
        o.serviceDate <= options.dateRange!.end
      )
    : orders
  
  const headers = [
    "订单号",
    "状态",
    "服务类型",
    "乘客姓名",
    "联系电话",
    "航班号",
    "服务日期",
    "服务时间",
    "上车地点",
    "下车地点",
    "车型",
    "乘客人数",
    "行李数量",
    "特殊要求",
    "备注",
    "创建时间",
  ]
  
  if (options?.includeDriverInfo) {
    headers.push("司机姓名", "司机电话", "车牌号")
  }
  
  const rows = filteredOrders.map(order => {
    const row: (string | number | undefined)[] = [
      order.orderNumber,
      statusLabels[order.status],
      serviceTypeLabels[order.serviceType],
      order.passengerName,
      order.passengerPhone,
      order.flightNumber,
      order.serviceDate,
      order.serviceTime,
      order.pickupLocation,
      order.dropoffLocation,
      vehicleTypeLabels[order.vehicleType],
      order.passengerCount,
      order.luggageCount,
      order.specialRequirements,
      order.notes,
      new Date(order.createdAt).toLocaleString("zh-CN"),
    ]
    
    if (options?.includeDriverInfo) {
      const driver = order.driverId ? driverMap.get(order.driverId) : undefined
      row.push(
        driver?.name || "-",
        driver?.phone || "-",
        driver?.licensePlate || "-"
      )
    }
    
    return row
  })
  
  const csv = generateCSV(headers, rows)
  const timestamp = new Date().toISOString().slice(0, 10)
  downloadFile(csv, `订单导出_${timestamp}.csv`)
}

export function exportBillingReport(
  orders: Order[],
  drivers: Driver[],
  dateRange: { start: string; end: string }
): void {
  const driverMap = new Map(drivers.map(d => [d.id, d]))
  
  // Filter completed orders within date range
  const completedOrders = orders.filter(
    o => o.status === "completed" &&
    o.serviceDate >= dateRange.start &&
    o.serviceDate <= dateRange.end
  )
  
  // Group by driver
  const driverStats = new Map<string, {
    driver: Driver
    orderCount: number
    orders: Order[]
  }>()
  
  completedOrders.forEach(order => {
    if (!order.driverId) return
    
    const driver = driverMap.get(order.driverId)
    if (!driver) return
    
    if (!driverStats.has(order.driverId)) {
      driverStats.set(order.driverId, {
        driver,
        orderCount: 0,
        orders: [],
      })
    }
    
    const stats = driverStats.get(order.driverId)!
    stats.orderCount++
    stats.orders.push(order)
  })
  
  const headers = [
    "司机姓名",
    "司机电话",
    "车牌号",
    "车型",
    "完成订单数",
    "接机订单",
    "送机订单",
  ]
  
  const rows = Array.from(driverStats.values()).map(({ driver, orderCount, orders }) => [
    driver.name,
    driver.phone,
    driver.licensePlate,
    vehicleTypeLabels[driver.vehicleType],
    orderCount,
    orders.filter(o => o.serviceType === "pickup").length,
    orders.filter(o => o.serviceType === "dropoff").length,
  ])
  
  // Add summary row
  const totalOrders = completedOrders.length
  const totalPickup = completedOrders.filter(o => o.serviceType === "pickup").length
  const totalDropoff = completedOrders.filter(o => o.serviceType === "dropoff").length
  rows.push(["合计", "", "", "", totalOrders, totalPickup, totalDropoff])
  
  const csv = generateCSV(headers, rows)
  downloadFile(csv, `账单报表_${dateRange.start}_${dateRange.end}.csv`)
}

export function exportDriversToCSV(drivers: Driver[]): void {
  const headers = [
    "司机姓名",
    "联系电话",
    "身份证号",
    "驾照号",
    "当前状态",
    "车型",
    "车牌号",
    "车辆品牌",
    "车辆型号",
    "车辆颜色",
    "入职日期",
  ]
  
  const rows = drivers.map(driver => [
    driver.name,
    driver.phone,
    driver.idNumber,
    driver.licenseNumber,
    driverStatusLabels[driver.status],
    vehicleTypeLabels[driver.vehicleType],
    driver.licensePlate,
    driver.vehicleBrand,
    driver.vehicleModel,
    driver.vehicleColor,
    new Date(driver.createdAt).toLocaleDateString("zh-CN"),
  ])
  
  const csv = generateCSV(headers, rows)
  const timestamp = new Date().toISOString().slice(0, 10)
  downloadFile(csv, `司机名册_${timestamp}.csv`)
}
