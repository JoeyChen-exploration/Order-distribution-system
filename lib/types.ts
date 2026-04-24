// 用户类型
export interface User {
  id: string
  username: string
  role: 'super_admin' | 'dispatcher'
  name: string
  createdAt: string
  updatedAt: string
}

// 车辆类型（从高到低）
// '商务型' 是导入订单时的旧值，需用户手动细分为 豪华商务型/普通商务型 后才能派单
export type VehicleType = '豪华商务型' | '普通商务型' | '豪华型' | '舒适型' | '经济型' | '商务型'

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  '豪华商务型': '豪华商务型',
  '普通商务型': '普通商务型',
  '豪华型': '豪华型',
  '舒适型': '舒适型',
  '经济型': '经济型',
  '商务型': '商务型（待细分）',
}

// 司机可选车型（有序，不含旧版"商务型"）
export const VEHICLE_TYPE_OPTIONS: VehicleType[] = ['豪华商务型', '普通商务型', '豪华型', '舒适型', '经济型']

// 车型颜色（统一色块配色，全站通用）
export const VEHICLE_TYPE_COLORS: Record<VehicleType, string> = {
  '豪华商务型': 'bg-purple-500',
  '普通商务型': 'bg-fuchsia-500',
  '豪华型':     'bg-amber-500',
  '舒适型':     'bg-blue-500',
  '经济型':     'bg-green-500',
  '商务型':     'bg-purple-400',
}

// 司机状态
export type DriverStatus = 'available' | 'busy' | 'off_duty' | 'on_leave'

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  available: '在岗',
  busy: '忙碌',
  off_duty: '下线',
  on_leave: '请假',
}

// 司机类型
export interface Driver {
  id: string
  name: string
  phone: string
  vehicleType: VehicleType
  vehiclePlate: string
  homeAddress: string
  homeLat: number
  homeLng: number
  status: DriverStatus
  dailyOrderCount: number
  currentLat?: number
  currentLng?: number
  workingHours?: string
  createdAt: string
  updatedAt: string
}

// 订单状态
export type OrderStatus = 0 | 1 | 2 | 3 | 4 | 5

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  0: '待排单',
  1: '已分配',
  2: '进行中',
  3: '已完成',
  4: '已取消',
  5: '空单',
}

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  0: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  1: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  2: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  3: 'bg-green-500/20 text-green-400 border-green-500/30',
  4: 'bg-red-500/20 text-red-400 border-red-500/30',
  5: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

// 订单类型
export interface Order {
  id: string
  orderNo: string
  passengerName: string
  passengerPhone: string
  flightNo: string
  flightDate: string
  pickupTime: string
  pickupAddress: string
  pickupLat: number
  pickupLng: number
  dropoffAddress: string
  dropoffLat: number
  dropoffLng: number
  reqVehicleType: VehicleType
  status: OrderStatus
  driverId?: string
  driverName?: string
  isEmergency: boolean
  cancelReason?: string
  cancelTime?: string
  modifiedUserId?: string
  modifiedAt?: string
  importBatchId: string | null
  metadata?: string | null  // JSON string: extra fields from xlsx import
  createdAt: string
  updatedAt: string
}

// 导入批次
export interface ImportBatch {
  id: string
  fileName: string
  totalRows: number
  successRows: number
  errorRows: number
  errors: Array<{ row: number; field: string; message: string }>
  importedBy: string
  createdAt: string
}

// 导入错误
export interface ImportError {
  row: number
  field: string
  message: string
}

// 排单候选人
export interface DispatchCandidate {
  driver: Driver
  distance: number
  travelTime: number
  score: number
}

// 统计数据
export interface DashboardStats {
  totalOrders: number
  pendingOrders: number
  assignedOrders: number
  inProgressOrders: number
  completedOrders: number
  cancelledOrders: number
  totalDrivers: number
  availableDrivers: number
  busyDrivers: number
}
