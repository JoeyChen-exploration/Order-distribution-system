'use client'

import type { User, Driver, Order, ImportBatch, DashboardStats } from './types'
import {
  DEFAULT_USERS,
  DEFAULT_DRIVERS,
  DEFAULT_ORDERS,
  DEFAULT_IMPORT_BATCHES,
} from './mock-data'

const STORAGE_KEYS = {
  USERS: 'dispatch_users',
  DRIVERS: 'dispatch_drivers',
  ORDERS: 'dispatch_orders',
  IMPORT_BATCHES: 'dispatch_import_batches',
  CURRENT_USER: 'dispatch_current_user',
}

// 初始化存储
function initStorage<T>(key: string, defaultData: T[]): T[] {
  if (typeof window === 'undefined') return defaultData
  
  const stored = localStorage.getItem(key)
  if (!stored) {
    localStorage.setItem(key, JSON.stringify(defaultData))
    return defaultData
  }
  try {
    return JSON.parse(stored)
  } catch {
    localStorage.setItem(key, JSON.stringify(defaultData))
    return defaultData
  }
}

// 通用存储操作
function getItems<T>(key: string, defaultData: T[]): T[] {
  return initStorage(key, defaultData)
}

function setItems<T>(key: string, items: T[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(items))
}

// 用户相关
export function getUsers(): User[] {
  return getItems(STORAGE_KEYS.USERS, DEFAULT_USERS)
}

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function setCurrentUser(user: User | null): void {
  if (typeof window === 'undefined') return
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user))
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER)
  }
}

export function login(username: string, password: string): User | null {
  const users = getUsers()
  const user = users.find(u => u.username === username && u.password === password)
  if (user) {
    setCurrentUser(user)
  }
  return user || null
}

export function logout(): void {
  setCurrentUser(null)
}

// 司机相关
export function getDrivers(): Driver[] {
  return getItems(STORAGE_KEYS.DRIVERS, DEFAULT_DRIVERS)
}

export function getDriverById(id: string): Driver | undefined {
  return getDrivers().find(d => d.id === id)
}

export function createDriver(driver: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Driver {
  const drivers = getDrivers()
  const newDriver: Driver = {
    ...driver,
    id: `driver-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  drivers.push(newDriver)
  setItems(STORAGE_KEYS.DRIVERS, drivers)
  return newDriver
}

export function updateDriver(id: string, updates: Partial<Driver>): Driver | null {
  const drivers = getDrivers()
  const index = drivers.findIndex(d => d.id === id)
  if (index === -1) return null
  
  drivers[index] = {
    ...drivers[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  setItems(STORAGE_KEYS.DRIVERS, drivers)
  return drivers[index]
}

export function deleteDriver(id: string): boolean {
  const drivers = getDrivers()
  const filtered = drivers.filter(d => d.id !== id)
  if (filtered.length === drivers.length) return false
  setItems(STORAGE_KEYS.DRIVERS, filtered)
  return true
}

export function getAvailableDrivers(vehicleType?: string): Driver[] {
  return getDrivers().filter(d => {
    if (d.status !== 'available') return false
    if (d.dailyOrderCount >= d.dailyOrderLimit) return false
    if (vehicleType && d.vehicleType !== vehicleType) return false
    return true
  })
}

// 订单相关
export function getOrders(): Order[] {
  return getItems(STORAGE_KEYS.ORDERS, DEFAULT_ORDERS)
}

export function getOrderById(id: string): Order | undefined {
  return getOrders().find(o => o.id === id)
}

export function createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Order {
  const orders = getOrders()
  const newOrder: Order = {
    ...order,
    id: `order-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  orders.push(newOrder)
  setItems(STORAGE_KEYS.ORDERS, orders)
  return newOrder
}

export function createOrders(orderList: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>[]): Order[] {
  const orders = getOrders()
  const newOrders: Order[] = orderList.map((order, index) => ({
    ...order,
    id: `order-${Date.now()}-${index}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))
  orders.push(...newOrders)
  setItems(STORAGE_KEYS.ORDERS, orders)
  return newOrders
}

export function updateOrder(id: string, updates: Partial<Order>): Order | null {
  const orders = getOrders()
  const index = orders.findIndex(o => o.id === id)
  if (index === -1) return null
  
  orders[index] = {
    ...orders[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  setItems(STORAGE_KEYS.ORDERS, orders)
  return orders[index]
}

export function assignOrder(orderId: string, driverId: string, userId: string): Order | null {
  const driver = getDriverById(driverId)
  if (!driver) return null
  
  // 更新订单
  const order = updateOrder(orderId, {
    status: 1,
    driverId: driver.id,
    driverName: driver.name,
    modifiedUserId: userId,
    modifiedAt: new Date().toISOString(),
  })
  
  // 更新司机工作量
  if (order) {
    updateDriver(driverId, {
      dailyOrderCount: driver.dailyOrderCount + 1,
      status: 'busy',
    })
  }
  
  return order
}

export function cancelOrder(orderId: string, reason: string): Order | null {
  const order = getOrderById(orderId)
  if (!order) return null
  
  // 如果已分配司机，需要回滚工作量
  if (order.driverId) {
    const driver = getDriverById(order.driverId)
    if (driver) {
      updateDriver(driver.id, {
        dailyOrderCount: Math.max(0, driver.dailyOrderCount - 1),
        status: driver.dailyOrderCount <= 1 ? 'available' : driver.status,
      })
    }
  }
  
  return updateOrder(orderId, {
    status: 4,
    cancelReason: reason,
    cancelTime: new Date().toISOString(),
  })
}

export function reassignOrder(orderId: string, newDriverId: string, userId: string): Order | null {
  const order = getOrderById(orderId)
  if (!order) return null
  
  // 释放原司机工作量
  if (order.driverId) {
    const oldDriver = getDriverById(order.driverId)
    if (oldDriver) {
      updateDriver(oldDriver.id, {
        dailyOrderCount: Math.max(0, oldDriver.dailyOrderCount - 1),
        status: 'available',
      })
    }
  }
  
  // 分配给新司机
  return assignOrder(orderId, newDriverId, userId)
}

// 导入批次
export function getImportBatches(): ImportBatch[] {
  return getItems(STORAGE_KEYS.IMPORT_BATCHES, DEFAULT_IMPORT_BATCHES)
}

export function createImportBatch(batch: Omit<ImportBatch, 'id' | 'createdAt'>): ImportBatch {
  const batches = getImportBatches()
  const newBatch: ImportBatch = {
    ...batch,
    id: `batch-${Date.now()}`,
    createdAt: new Date().toISOString(),
  }
  batches.push(newBatch)
  setItems(STORAGE_KEYS.IMPORT_BATCHES, batches)
  return newBatch
}

// 统计数据
export function getDashboardStats(): DashboardStats {
  const orders = getOrders()
  const drivers = getDrivers()
  
  return {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 0).length,
    assignedOrders: orders.filter(o => o.status === 1).length,
    inProgressOrders: orders.filter(o => o.status === 2).length,
    completedOrders: orders.filter(o => o.status === 3).length,
    cancelledOrders: orders.filter(o => o.status === 4).length,
    totalDrivers: drivers.length,
    availableDrivers: drivers.filter(d => d.status === 'available').length,
    busyDrivers: drivers.filter(d => d.status === 'busy').length,
  }
}

// 重置数据（开发调试用）
export function resetAllData(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEYS.USERS)
  localStorage.removeItem(STORAGE_KEYS.DRIVERS)
  localStorage.removeItem(STORAGE_KEYS.ORDERS)
  localStorage.removeItem(STORAGE_KEYS.IMPORT_BATCHES)
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER)
}
