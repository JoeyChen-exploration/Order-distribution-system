'use client'

import type { Driver, Order, User, DashboardStats } from './types'

// ─── Drivers ──────────────────────────────────────────────────────────────────

export async function getDrivers(params?: { status?: string; vehicleType?: string }): Promise<Driver[]> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.vehicleType) query.set('vehicleType', params.vehicleType)
  const res = await fetch(`/api/drivers?${query}`)
  return res.json()
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
  return res.json()
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

export async function assignOrder(orderId: string, driverId: string, userId: string): Promise<Order | null> {
  const driver = await getDriverById(driverId)
  if (!driver) return null

  const order = await updateOrder(orderId, {
    status: 1,
    driverId: driver.id,
    driverName: driver.name,
    modifiedUserId: userId,
    modifiedAt: new Date().toISOString(),
  })

  await updateDriver(driverId, {
    dailyOrderCount: driver.dailyOrderCount + 1,
    status: 'busy',
  })

  return order
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
  setCurrentUser(null)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch('/api/stats')
  return res.json()
}
