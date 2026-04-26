'use client'

import type { Driver, Order, User, DashboardStats } from './types'

const EMPTY_STATS: DashboardStats = {
  totalOrders: 0,
  pendingOrders: 0,
  assignedOrders: 0,
  inProgressOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  totalDrivers: 0,
  availableDrivers: 0,
  busyDrivers: 0,
}

function tryUnwrapData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data
  }
  return null
}

// ─── Drivers ──────────────────────────────────────────────────────────────────

export async function getDrivers(params?: { status?: string; vehicleType?: string }): Promise<Driver[]> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.vehicleType) query.set('vehicleType', params.vehicleType)
  const res = await fetch(`/api/drivers?${query}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function getDriverById(id: string): Promise<Driver | null> {
  const res = await fetch(`/api/drivers/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function createDriver(data: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<Driver> {
  const res = await fetch('/api/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function updateDriver(id: string, data: Partial<Driver>): Promise<Driver> {
  const res = await fetch(`/api/drivers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteDriver(id: string): Promise<void> {
  await fetch(`/api/drivers/${id}`, { method: 'DELETE' })
}

export async function getAvailableDrivers(vehicleType?: string): Promise<Driver[]> {
  return getDrivers({ status: 'available', vehicleType })
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function getOrders(status?: number): Promise<Order[]> {
  const query = status !== undefined ? `?status=${status}` : ''
  const res = await fetch(`/api/orders${query}`)
  if (!res.ok) return []
  const payload = await res.json()
  if (Array.isArray(payload)) return payload as Order[]
  const unwrapped = tryUnwrapData<Order[]>(payload)
  return Array.isArray(unwrapped) ? unwrapped : []
}

export async function getOrderById(id: string): Promise<Order | null> {
  const res = await fetch(`/api/orders/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function createOrder(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function updateOrder(id: string, data: Partial<Order>): Promise<Order> {
  const res = await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function assignOrder(orderId: string, driverId: string): Promise<Order | null> {
  const res = await fetch("/api/orders/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, driverId }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function assignOrdersBatch(assignments: Array<{ orderId: string; driverId: string }>, dispatchRequestId?: string) {
  const res = await fetch("/api/orders/assign-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments, dispatchRequestId }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteOrder(id: string): Promise<void> {
  await fetch(`/api/orders/${id}`, { method: 'DELETE' })
}

/** 撤销派单：将订单状态重置为待排单，清空司机信息 */
export async function cancelDispatch(orderId: string): Promise<Order> {
  return updateOrder(orderId, { status: 0, driverId: null, driverName: null })
}

export async function cancelOrder(orderId: string, reason: string): Promise<Order | null> {
  const order = await getOrderById(orderId)
  if (!order) return null

  if (order.driverId) {
    const driver = await getDriverById(order.driverId)
    if (driver) {
      await updateDriver(driver.id, {
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

// ─── Users / Auth ─────────────────────────────────────────────────────────────

const CURRENT_USER_KEY = 'dispatch_current_user'

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(CURRENT_USER_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function setCurrentUser(user: User | null) {
  if (typeof window === 'undefined') return
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(CURRENT_USER_KEY)
  }
}

export async function login(username: string, password: string): Promise<User | null> {
  const res = await fetch('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) return null
  const user: User = await res.json()
  setCurrentUser(user)
  return user
}

export function logout(): void {
  fetch("/api/users/logout", { method: "POST" }).catch(() => {})
  setCurrentUser(null)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch('/api/stats')
  if (!res.ok) return EMPTY_STATS
  const payload = await res.json()
  const stats = tryUnwrapData<DashboardStats>(payload) ?? payload
  if (!stats || typeof stats !== "object") return EMPTY_STATS
  return {
    totalOrders: Number((stats as DashboardStats).totalOrders ?? 0),
    pendingOrders: Number((stats as DashboardStats).pendingOrders ?? 0),
    assignedOrders: Number((stats as DashboardStats).assignedOrders ?? 0),
    inProgressOrders: Number((stats as DashboardStats).inProgressOrders ?? 0),
    completedOrders: Number((stats as DashboardStats).completedOrders ?? 0),
    cancelledOrders: Number((stats as DashboardStats).cancelledOrders ?? 0),
    totalDrivers: Number((stats as DashboardStats).totalDrivers ?? 0),
    availableDrivers: Number((stats as DashboardStats).availableDrivers ?? 0),
    busyDrivers: Number((stats as DashboardStats).busyDrivers ?? 0),
  }
}
