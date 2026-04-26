"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import {
  Zap,
  Users,
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Award,
  BarChart3,
  CalendarIcon,
  UserCheck,
  X,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { assignOrder, getOrders, getDrivers, updateOrder } from "@/lib/store"
import { runDispatchAlgorithm, batchDispatch, type DispatchResult, type TravelTimeCache } from "@/lib/dispatch-engine"
import type { Order, Driver } from "@/lib/types"
import { VEHICLE_TYPE_COLORS, VEHICLE_TYPE_OPTIONS } from "@/lib/types"

const serviceTypeConfig: Record<string, { border: string; text: string; bg: string }> = {
  "接机/站": { border: "border-sky-500",     text: "text-sky-400",     bg: "bg-sky-500/10" },
  "送机/站": { border: "border-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10" },
  "包车":    { border: "border-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" },
  "市内约车": { border: "border-violet-500",  text: "text-violet-400",  bg: "bg-violet-500/10" },
}

function extractCity(address: string): string {
  const m = address.match(/^[\u4e00-\u9fa5]{2,4}(?:市|省|区|县)/)
  return m ? m[0].replace(/省|区|县/, "市") : "上海"
}

async function geocodeAddr(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null
  try {
    const city = extractCity(address)
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`)
    const data = await res.json()
    if (data.lat && data.lng) return { lat: data.lat, lng: data.lng }
  } catch {}
  return null
}

function ServiceTypeBadge({ value, charterHours }: { value: string; charterHours?: string }) {
  const cfg = serviceTypeConfig[value]
  if (!cfg) return <span className="text-xs text-muted-foreground">{value || "-"}</span>
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium w-fit ${cfg.border} ${cfg.text} ${cfg.bg}`}>
      {value}{charterHours ? `·${charterHours}h` : ""}
    </span>
  )
}

export default function DispatchPage() {
  const searchParams = useSearchParams()
  const preselectedOrderId = searchParams.get("orderId")
  const isReassign = searchParams.get("reassign") === "true"

  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [currentResult, setCurrentResult] = useState<DispatchResult | null>(null)
  const [batchResults, setBatchResults] = useState<Map<string, DispatchResult> | null>(null)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [dispatchProgress, setDispatchProgress] = useState<{ phase: string; current: number; total: number } | null>(null)
  const cancelledRef = useRef(false)
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined)
  const [orderSearch, setOrderSearch] = useState("")
  const [batchMode, setBatchMode] = useState(false)

  // Manual dispatch state
  const [manualOrder, setManualOrder] = useState<Order | null>(null)
  const [showManualDialog, setShowManualDialog] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState<string>("")
  const [manualDriverFilter, setManualDriverFilter] = useState<"all" | "available">("available")
  const [manualSearch, setManualSearch] = useState("")
  const [manualVehicleFilter, setManualVehicleFilter] = useState<string>("all")
  const [manualShiftFilter, setManualShiftFilter] = useState<"all" | "day" | "night">("all")

  useEffect(() => {
    async function load() {
      const [orders, driverList] = await Promise.all([getOrders(), getDrivers()])
      setAllOrders(orders)
      setDrivers(driverList)
      if (isReassign && preselectedOrderId) {
        const orderToReassign = orders.find(o => o.id === preselectedOrderId)
        if (orderToReassign) {
          setPendingOrders([orderToReassign])
          setSelectedOrders(new Set([preselectedOrderId]))
        }
      } else {
        const pending = orders.filter(o => o.status === 0)
        setPendingOrders(pending)
        if (preselectedOrderId) {
          setSelectedOrders(new Set([preselectedOrderId]))
        }
      }
    }
    load()
  }, [preselectedOrderId, isReassign])

  const filteredOrders = useMemo(() => {
    let list = pendingOrders
    if (dateFilter) {
      const dateStr = format(dateFilter, "yyyy-MM-dd")
      list = list.filter(o => o.flightDate === dateStr)
    }
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase()
      list = list.filter(o =>
        o.orderNo.toLowerCase().includes(q) ||
        o.flightNo.toLowerCase().includes(q) ||
        (o.pickupAddress || "").toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      const dateA = `${a.flightDate} ${a.pickupTime || ""}`.trim()
      const dateB = `${b.flightDate} ${b.pickupTime || ""}`.trim()
      return dateA.localeCompare(dateB)
    })
  }, [pendingOrders, dateFilter, orderSearch])

  const stats = useMemo(() => {
    const candidateDrivers = drivers.filter(d => d.status === "available" || d.status === "busy")
    return {
      pendingCount: pendingOrders.length,
      availableDrivers: candidateDrivers.length,
      selectedCount: selectedOrders.size,
    }
  }, [pendingOrders, drivers, selectedOrders])

  const [coordWarningExpanded, setCoordWarningExpanded] = useState(false)
  const [regeocoding, setRegeocoding] = useState<Set<string>>(new Set())

  // Manual address edit dialog
  const [editCoordOrder, setEditCoordOrder] = useState<Order | null>(null)
  const [editPickupAddr, setEditPickupAddr] = useState("")
  const [editDropoffAddr, setEditDropoffAddr] = useState("")
  const [editPickupFailed, setEditPickupFailed] = useState(false)
  const [editDropoffFailed, setEditDropoffFailed] = useState(false)
  const [editGeocoding, setEditGeocoding] = useState(false)

  const openEditCoordDialog = (order: Order, pickupFailed: boolean, dropoffFailed: boolean) => {
    setEditCoordOrder(order)
    setEditPickupAddr(order.pickupAddress)
    setEditDropoffAddr(order.dropoffAddress)
    setEditPickupFailed(pickupFailed)
    setEditDropoffFailed(dropoffFailed)
  }

  const handleEditGeocode = async () => {
    if (!editCoordOrder) return
    setEditGeocoding(true)
    try {
      const [pickup, dropoff] = await Promise.all([
        editPickupFailed  ? geocodeAddr(editPickupAddr)  : Promise.resolve(null),
        editDropoffFailed ? geocodeAddr(editDropoffAddr) : Promise.resolve(null),
      ])
      const updates: Record<string, unknown> = {}
      if (editPickupFailed && pickup)   { updates.pickupLat  = pickup.lat;  updates.pickupLng  = pickup.lng  }
      if (editDropoffFailed && dropoff) { updates.dropoffLat = dropoff.lat; updates.dropoffLng = dropoff.lng }
      // also persist edited address text
      if (editPickupFailed)  updates.pickupAddress  = editPickupAddr
      if (editDropoffFailed) updates.dropoffAddress = editDropoffAddr

      if ((editPickupFailed && pickup) || (editDropoffFailed && dropoff)) {
        await updateOrder(editCoordOrder.id, updates as Partial<Order>)
        const fresh = await getOrders()
        setAllOrders(fresh)
        setPendingOrders(fresh.filter(o => o.status === 0))
        // check if remaining addresses still fail
        const stillPickupFailed  = editPickupFailed  && !pickup
        const stillDropoffFailed = editDropoffFailed && !dropoff
        if (stillPickupFailed || stillDropoffFailed) {
          setEditPickupFailed(stillPickupFailed)
          setEditDropoffFailed(stillDropoffFailed)
        } else {
          setEditCoordOrder(null)
        }
      } else {
        // nothing resolved — keep dialog open, let user fix further
        setEditPickupFailed(editPickupFailed && !pickup)
        setEditDropoffFailed(editDropoffFailed && !dropoff)
      }
    } finally {
      setEditGeocoding(false)
    }
  }

  const handleRegeocode = async (order: Order) => {
    setRegeocoding(prev => new Set([...prev, order.id]))
    try {
      const [pickup, dropoff] = await Promise.all([
        geocodeAddr(order.pickupAddress),
        geocodeAddr(order.dropoffAddress),
      ])
      const updates: Partial<Order> = {}
      if (pickup)  { updates.pickupLat  = pickup.lat;  updates.pickupLng  = pickup.lng  }
      if (dropoff) { updates.dropoffLat = dropoff.lat; updates.dropoffLng = dropoff.lng }
      if (Object.keys(updates).length > 0) {
        await updateOrder(order.id, updates)
        const fresh = await getOrders()
        setAllOrders(fresh)
        setPendingOrders(fresh.filter(o => o.status === 0))
      }
      // open edit dialog for any address that still failed
      const pickupFailed  = !pickup
      const dropoffFailed = !dropoff
      if (pickupFailed || dropoffFailed) {
        openEditCoordDialog(order, pickupFailed, dropoffFailed)
      }
    } finally {
      setRegeocoding(prev => { const s = new Set(prev); s.delete(order.id); return s })
    }
  }

  const coordWarning = useMemo(() => {
    const badOrders = pendingOrders.filter(o => !o.pickupLat || !o.pickupLng)
    const badDrivers = drivers.filter(d => !d.homeLat || !d.homeLng)
    return {
      ordersNoCoord: badOrders.length,
      driversNoCoord: badDrivers.length,
      badOrders,
      badDrivers,
    }
  }, [pendingOrders, drivers])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)))
    } else {
      setSelectedOrders(new Set())
    }
  }

  const handleSelectOrder = (orderId: string, checked: boolean) => {
    const newSelected = new Set(selectedOrders)
    if (checked) newSelected.add(orderId)
    else newSelected.delete(orderId)
    setSelectedOrders(newSelected)
  }

  const handleSingleDispatch = async (order: Order) => {
    const candidateDrivers = drivers.filter(d => d.status === "available" || d.status === "busy")

    // Pre-fetch driver → pickup travel times for single dispatch too
    const travelCache: TravelTimeCache = new Map()
    if (order.pickupLat && order.pickupLng) {
      await Promise.all(candidateDrivers.map(async driver => {
        const driverOrders = allOrders.filter(
          o => o.driverId === driver.id && o.flightDate === order.flightDate && (o.status === 1 || o.status === 2)
        ).sort((a, b) => b.pickupTime.localeCompare(a.pickupTime))
        const fromLat = driverOrders[0]?.dropoffLat || driver.homeLat
        const fromLng = driverOrders[0]?.dropoffLng || driver.homeLng
        if (!fromLat || !fromLng) return
        const key = `${fromLng},${fromLat}->${order.pickupLng},${order.pickupLat}`
        try {
          const res = await fetch(`/api/maps/drivetime?originLng=${fromLng}&originLat=${fromLat}&destLng=${order.pickupLng}&destLat=${order.pickupLat}&pickupTime=${encodeURIComponent(order.pickupTime)}`)
          const data = await res.json()
          if (data.durationMinutes > 0) travelCache.set(key, data.durationMinutes)
        } catch {}
      }))
    }

    const result = runDispatchAlgorithm(order, candidateDrivers, allOrders, travelCache)
    setCurrentResult(result)
    setShowResultDialog(true)
  }

  const handleOpenManual = (order: Order) => {
    setManualOrder(order)
    setSelectedDriverId("")
    setManualDriverFilter("available")
    setManualSearch("")
    setManualVehicleFilter("all")
    setManualShiftFilter("all")
    setShowManualDialog(true)
  }

  const handleCancelProcessing = () => {
    cancelledRef.current = true
    setIsProcessing(false)
    setDispatchProgress(null)
    setBatchResults(null)
    setBatchMode(false)
    setSelectedOrders(new Set())
  }

  const handleBatchDispatch = async () => {
    if (selectedOrders.size === 0) return

    const ordersToDispatch = filteredOrders.filter(o => selectedOrders.has(o.id))

    // 检查包车时长未确认的订单
    const unconfirmedCharter = ordersToDispatch.filter(o => {
      try { const m = JSON.parse(o.metadata || "{}"); return (m["服务类型"] === "包车" || m.serviceType === "包车") && !m["包车时长"] } catch { return false }
    })
    if (unconfirmedCharter.length > 0) {
      alert(`以下包车订单未确认时长，请先在订单管理中完成选择后再派单：\n${unconfirmedCharter.map(o => o.orderNo).join("\n")}`)
      return
    }

    cancelledRef.current = false
    setIsProcessing(true)
    const candidateDrivers = drivers.filter(d => d.status === "available" || d.status === "busy")

    // ── Phase 1: Build deduplicated route task list ───────────────────────────
    const travelCache: TravelTimeCache = new Map()
    const seen = new Set<string>()
    // Tasks are thunks so we control when each request fires (for rate limiting)
    const routeTasks: Array<() => Promise<void>> = []

    for (const order of ordersToDispatch) {
      if (!order.pickupLat || !order.pickupLng) continue
      for (const driver of candidateDrivers) {
        const driverOrders = allOrders.filter(
          o => o.driverId === driver.id && o.flightDate === order.flightDate && (o.status === 1 || o.status === 2)
        ).sort((a, b) => b.pickupTime.localeCompare(a.pickupTime))
        const fromLat = driverOrders[0]?.dropoffLat || driver.homeLat
        const fromLng = driverOrders[0]?.dropoffLng || driver.homeLng
        if (!fromLat || !fromLng) continue
        const key = `${fromLng},${fromLat}->${order.pickupLng},${order.pickupLat}`
        if (seen.has(key)) continue
        seen.add(key)
        routeTasks.push(() =>
          fetch(`/api/maps/drivetime?originLng=${fromLng}&originLat=${fromLat}&destLng=${order.pickupLng}&destLat=${order.pickupLat}&pickupTime=${encodeURIComponent(order.pickupTime)}`)
            .then(r => r.json())
            .then(data => { if (data.durationMinutes > 0) travelCache.set(key, data.durationMinutes) })
            .catch(() => {})
        )
      }
    }

    // ── Phase 2: Fetch routes with QPS limiting (max 3 concurrent) ───────────
    const totalRoutes = routeTasks.length
    if (totalRoutes > 0) {
      setDispatchProgress({ phase: "prefetch", current: 0, total: totalRoutes })
      let completed = 0
      const QPS = 3  // Amap free tier limit

      // Concurrency-limited runner: keep exactly QPS tasks in-flight at all times
      await new Promise<void>(resolve => {
        let started = 0
        let finished = 0

        function startNext() {
          if (cancelledRef.current) { resolve(); return }
          while (started < routeTasks.length && started - finished < QPS) {
            const task = routeTasks[started++]
            task().then(() => {
              finished++
              completed++
              if (cancelledRef.current) { resolve(); return }
              setDispatchProgress({ phase: "prefetch", current: completed, total: totalRoutes })
              if (finished === routeTasks.length) resolve()
              else startNext()
            })
          }
        }
        startNext()
      })
    }

    if (cancelledRef.current) return

    // ── Phase 3: Run algorithm ────────────────────────────────────────────────
    setDispatchProgress({ phase: "dispatch", current: 0, total: ordersToDispatch.length })
    const results = batchDispatch(ordersToDispatch, candidateDrivers, allOrders, travelCache)

    if (cancelledRef.current) return

    setDispatchProgress(null)
    setBatchResults(results)
    setIsProcessing(false)
  }

  const handleConfirmDispatch = async (orderId: string, driverId: string) => {
    const assigned = await assignOrder(orderId, driverId)
    if (!assigned) {
      alert("派单失败，请刷新后重试")
      return
    }

    const [orders, driverList] = await Promise.all([getOrders(), getDrivers()])
    setAllOrders(orders)
    setDrivers(driverList)
    setPendingOrders(orders.filter(o => o.status === 0))

    const newSelected = new Set(selectedOrders)
    newSelected.delete(orderId)
    setSelectedOrders(newSelected)

    if (currentResult?.orderId === orderId) {
      setShowResultDialog(false)
      setCurrentResult(null)
    }
    if (batchResults) {
      const newResults = new Map(batchResults)
      newResults.delete(orderId)
      setBatchResults(newResults.size > 0 ? newResults : null)
    }
  }

  const handleConfirmManual = async () => {
    if (!manualOrder || !selectedDriverId) return
    await handleConfirmDispatch(manualOrder.id, selectedDriverId)
    setShowManualDialog(false)
    setManualOrder(null)
  }

  const handleConfirmAllBatch = async () => {
    if (!batchResults) return

    // Build history record before clearing state
    const historyItems = Array.from(batchResults.entries()).map(([orderId, result]) => {
      const order = allOrders.find(o => o.id === orderId) || pendingOrders.find(o => o.id === orderId)
      const driver = result.bestMatch ? drivers.find(d => d.id === result.bestMatch!.driverId) : null
      let serviceType = ""
      try {
        const m = JSON.parse(order?.metadata || "{}")
        serviceType = m.serviceType || m["服务类型"] || ""
      } catch {}
      return {
        orderId,
        orderNo: order?.orderNo || orderId,
        flightNo: order?.flightNo || "",
        flightDate: order?.flightDate || "",
        pickupTime: order?.pickupTime || "",
        pickupAddress: order?.pickupAddress || "",
        dropoffAddress: order?.dropoffAddress || "",
        reqVehicleType: order?.reqVehicleType || "",
        serviceType,
        matched: !!result.bestMatch,
        driverId: result.bestMatch?.driverId,
        driverName: result.bestMatch?.driverName,
        driverPhone: driver?.phone,
        vehiclePlate: driver?.vehiclePlate,
        vehicleType: driver?.vehicleType,
        score: result.bestMatch?.totalScore,
        failReason: result.bestMatch ? undefined : result.message,
      }
    })
    const matchedCount = historyItems.filter(i => i.matched).length
    fetch("/api/dispatch-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalOrders: historyItems.length,
        matched: matchedCount,
        unmatched: historyItems.length - matchedCount,
        items: historyItems,
      }),
    }).catch(() => {})

    // 先清空面板和模式，再异步执行派单（避免确认后面板重新渲染空列表）
    const toDispatch = Array.from(batchResults.entries())
      .filter(([, result]) => result.bestMatch)
      .map(([orderId, result]) => ({ orderId, driverId: result.bestMatch!.driverId }))
    setBatchResults(null)
    setBatchMode(false)
    setSelectedOrders(new Set())
    for (const { orderId, driverId } of toDispatch) {
      await assignOrder(orderId, driverId)
    }
    const [orders, driverList] = await Promise.all([getOrders(), getDrivers()])
    setAllOrders(orders)
    setDrivers(driverList)
    setPendingOrders(orders.filter(o => o.status === 0))
  }

  const manualDriverList = useMemo(() => {
    return drivers.filter(d => {
      if (manualDriverFilter === "available" && d.status !== "available") return false
      if (manualVehicleFilter !== "all" && d.vehicleType !== manualVehicleFilter) return false
      if (manualSearch) {
        const q = manualSearch.toLowerCase()
        const matchName = d.name.toLowerCase().includes(q)
        const matchAddress = (d.homeAddress || "").toLowerCase().includes(q)
        if (!matchName && !matchAddress) return false
      }
      if (manualShiftFilter !== "all" && d.workingHours) {
        const startHour = parseInt(d.workingHours.split(":")[0], 10)
        const isDay = startHour >= 4 && startHour < 14
        if (manualShiftFilter === "day" && !isDay) return false
        if (manualShiftFilter === "night" && isDay) return false
      }
      return true
    })
  }, [drivers, manualDriverFilter, manualSearch, manualVehicleFilter, manualShiftFilter])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isReassign ? "订单改派" : "智能排单"}
          </h1>
          <p className="text-muted-foreground">
            {isReassign ? "重新分配订单给其他司机" : "自动匹配最佳司机，一键批量派单"}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">待派单订单</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">可用司机</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.availableDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已选订单</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.selectedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Coordinate Warning */}
      {(coordWarning.ordersNoCoord > 0 || coordWarning.driversNoCoord > 0) && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 text-sm">
          <button
            className="w-full flex items-start gap-3 px-4 py-3 text-left"
            onClick={() => setCoordWarningExpanded(v => !v)}
          >
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-warning/90 space-y-0.5 flex-1">
              <p className="font-medium">坐标数据不完整，距离评分及行驶时间估算将不准确</p>
              <p className="text-warning/70">
                {coordWarning.ordersNoCoord > 0 && `${coordWarning.ordersNoCoord} 条待派单缺少经纬度`}
                {coordWarning.ordersNoCoord > 0 && coordWarning.driversNoCoord > 0 && "；"}
                {coordWarning.driversNoCoord > 0 && `${coordWarning.driversNoCoord} 位司机缺少住址坐标`}
                {" — 点击展开查看详情，重新导入可修复"}
              </p>
            </div>
            <span className="text-warning/60 text-xs mt-0.5">{coordWarningExpanded ? "收起 ▲" : "展开 ▼"}</span>
          </button>
          {coordWarningExpanded && (
            <div className="px-4 pb-3 flex gap-8 text-xs text-warning/80 border-t border-warning/20 pt-3">
              {coordWarning.badOrders.length > 0 && (
                <div>
                  <p className="font-medium mb-2">缺坐标的订单（{coordWarning.badOrders.length} 条）</p>
                  <ul className="space-y-1.5 max-h-40 overflow-auto">
                    {coordWarning.badOrders.map(o => {
                      const busy = regeocoding.has(o.id)
                      return (
                        <li key={o.id} className="flex items-center gap-2">
                          <span className="font-mono">{o.orderNo}</span>
                          <span className="text-warning/50">· {o.flightDate} {o.pickupTime}</span>
                          <button
                            onClick={() => handleRegeocode(o)}
                            disabled={busy}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-warning/40 hover:bg-warning/10 disabled:opacity-50 transition-colors"
                          >
                            {busy
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RefreshCw className="w-3 h-3" />}
                            <span>重新解析</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {coordWarning.badDrivers.length > 0 && (
                <div>
                  <p className="font-medium mb-2">缺坐标的司机（{coordWarning.badDrivers.length} 位）</p>
                  <ul className="space-y-1.5 max-h-40 overflow-auto">
                    {coordWarning.badDrivers.map(d => (
                      <li key={d.id} className="flex items-center gap-2">
                        <span>{d.name}</span>
                        <span className="text-warning/50">· {d.homeAddress || "无住址"}</span>
                        <a
                          href={`/drivers/${d.id}`}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-warning/40 hover:bg-warning/10 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>去补全</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Batch Results */}
      {batchResults && batchResults.size > 0 && (
        <Card className="border-primary/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  批量派单结果
                </CardTitle>
                <CardDescription>
                  共 {batchResults.size} 条订单，
                  {Array.from(batchResults.values()).filter(r => r.bestMatch).length} 条成功匹配
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setBatchResults(null)}>取消</Button>
                <Button onClick={handleConfirmAllBatch}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  确认全部派单
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {Array.from(batchResults.entries()).map(([orderId, result]) => {
                  const order = filteredOrders.find(o => o.id === orderId)
                  if (!order) return null
                  return (
                    <div key={orderId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium">{order.orderNo}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.flightDate} {order.pickupTime} · {order.flightNo}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        {result.bestMatch ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-primary/10">
                              <Award className="mr-1 h-3 w-3" />
                              {result.bestMatch.driverName}
                            </Badge>
                            <span className="text-sm text-muted-foreground">评分 {result.bestMatch.totalScore}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">无匹配司机</Badge>
                            <span className="text-xs text-muted-foreground max-w-[240px] truncate" title={result.message}>
                              {result.message}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {result.bestMatch && (
                          <Button size="sm" onClick={() => handleConfirmDispatch(orderId, result.bestMatch!.driverId)}>
                            确认
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="shrink-0">待派单列表</CardTitle>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="relative w-[220px]">
                <Input
                  placeholder="搜索订单号、航班号..."
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                  className="h-8 text-sm pl-8"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </span>
                {orderSearch && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setOrderSearch("")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-[150px] justify-start text-left font-normal", !dateFilter && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? format(dateFilter, "yyyy-MM-dd") : "选择日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={setDateFilter}
                    locale={zhCN}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {dateFilter && (
                <Button variant="ghost" size="sm" onClick={() => setDateFilter(undefined)}>
                  清除
                </Button>
              )}
              {batchMode ? (
                <>
                  <Button
                    onClick={handleBatchDispatch}
                    disabled={selectedOrders.size === 0 || isProcessing}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    确认派单 ({selectedOrders.size})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setBatchMode(false); setSelectedOrders(new Set()) }}
                  >
                    取消
                  </Button>
                </>
              ) : (
                <Button onClick={() => setBatchMode(true)}>
                  <Zap className="mr-2 h-4 w-4" />
                  批量智能派单
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedOrders.has(o.id))}
                    onCheckedChange={handleSelectAll}
                    className={cn("border-muted-foreground/60", !batchMode && "invisible")}
                  />
                </TableHead>
                <TableHead>订单号</TableHead>
                <TableHead>航班号</TableHead>
                <TableHead>服务时间</TableHead>
                <TableHead>地点</TableHead>
                <TableHead>车型</TableHead>
                <TableHead>服务类型</TableHead>
                <TableHead className="w-[160px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    {pendingOrders.length === 0 ? "暂无待派单订单" : "当前日期无待派单订单"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedOrders.has(order.id)}
                        onCheckedChange={(checked) => handleSelectOrder(order.id, checked as boolean)}
                        className={cn("border-muted-foreground/60", !batchMode && "invisible")}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{order.orderNo}</TableCell>
                    <TableCell>{order.flightNo}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{order.flightDate}</span>
                        {order.pickupTime && (
                          <span className="text-xs text-muted-foreground">{order.pickupTime}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="truncate text-xs" title={order.pickupAddress}>{order.pickupAddress}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${VEHICLE_TYPE_COLORS[order.reqVehicleType as keyof typeof VEHICLE_TYPE_COLORS] ?? "bg-muted"}`} />
                        {order.reqVehicleType}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const meta = order.metadata ? JSON.parse(order.metadata) : {}
                        const svcType = meta["服务类型"] || meta.serviceType || ""
                        const charterHours = meta["包车时长"]
                        return <ServiceTypeBadge value={svcType} charterHours={charterHours} />
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleSingleDispatch(order)}>
                          <Zap className="mr-1 h-3 w-3" />
                          智能派单
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleOpenManual(order)}>
                          <UserCheck className="mr-1 h-3 w-3" />
                          手动
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Smart Dispatch Result Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>智能派单推荐</DialogTitle>
            <DialogDescription>{currentResult?.message}</DialogDescription>
          </DialogHeader>
          {currentResult && (
            <div className="py-4">
              {currentResult.recommendations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-warning" />
                  <p>没有符合条件的可用司机</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {currentResult.recommendations.map((rec, index) => (
                      <Card
                        key={rec.driverId}
                        className={index === 0 && !rec.hasConflict ? "border-primary/50 bg-primary/5" : rec.hasConflict ? "border-warning/50 bg-warning/5" : ""}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                {index === 0 && !rec.hasConflict
                                  ? <Award className="h-5 w-5 text-primary" />
                                  : <Car className="h-5 w-5 text-muted-foreground" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{rec.driverName}</p>
                                  {index === 0 && !rec.hasConflict && <Badge variant="default" className="text-xs">推荐</Badge>}
                                  {rec.hasConflict && <Badge variant="outline" className="text-xs text-warning border-warning">有冲突</Badge>}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {rec.reasons.map((reason, i) => (
                                    <span key={i} className="text-xs text-muted-foreground">
                                      {reason}{i < rec.reasons.length - 1 ? " · " : ""}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="flex items-center gap-1">
                                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-lg font-bold">{rec.totalScore}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">综合评分</p>
                              </div>
                              <Button
                                size="sm"
                                variant={rec.hasConflict ? "outline" : "default"}
                                onClick={() => handleConfirmDispatch(currentResult.orderId, rec.driverId)}
                              >
                                {rec.hasConflict ? "强制派单" : "确认派单"}
                              </Button>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t grid grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">车型匹配</p>
                              <Progress value={rec.breakdown.vehicleMatch} className="h-1 mt-1" />
                            </div>
                            <div>
                              <p className="text-muted-foreground">工作量</p>
                              <Progress value={rec.breakdown.workloadScore} className="h-1 mt-1" />
                            </div>
                            <div>
                              <p className="text-muted-foreground">距离</p>
                              <Progress value={rec.breakdown.distanceScore} className="h-1 mt-1" />
                            </div>
                            <div>
                              <p className="text-muted-foreground">时间冲突</p>
                              <Progress value={100 - rec.breakdown.timeConflictPenalty} className="h-1 mt-1" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Dispatch Progress Dialog */}
      <Dialog open={isProcessing} onOpenChange={open => { if (!open) handleCancelProcessing() }}>
        <DialogContent className="max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              正在计算派单...
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {dispatchProgress?.phase === "prefetch" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">预取路线数据</span>
                  <span className="font-mono text-sm">
                    {dispatchProgress.current} / {dispatchProgress.total}
                  </span>
                </div>
                <Progress
                  value={dispatchProgress.total > 0 ? (dispatchProgress.current / dispatchProgress.total) * 100 : 0}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  正在调用高德地图 API 获取实时行驶时间...
                </p>
              </div>
            )}
            {dispatchProgress?.phase === "dispatch" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">计算最优派单方案</span>
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                </div>
                <Progress value={100} className="h-2 animate-pulse" />
                <p className="text-xs text-muted-foreground">
                  正在为 {dispatchProgress.total} 条订单匹配最佳司机...
                </p>
              </div>
            )}
            {!dispatchProgress && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleCancelProcessing}>
              取消派单
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Coord Address Dialog */}
      <Dialog open={!!editCoordOrder} onOpenChange={open => { if (!open) setEditCoordOrder(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>修正地址并重新解析</DialogTitle>
            <DialogDescription>
              以下地址无法被地图识别，请修改后点击「重新解析」
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editPickupFailed && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  上车地址（解析失败）
                </label>
                <Input
                  value={editPickupAddr}
                  onChange={e => setEditPickupAddr(e.target.value)}
                  placeholder="请输入完整地址，如：上海市浦东新区..."
                  className="text-sm"
                />
              </div>
            )}
            {editDropoffFailed && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  目的地（解析失败）
                </label>
                <Input
                  value={editDropoffAddr}
                  onChange={e => setEditDropoffAddr(e.target.value)}
                  placeholder="请输入完整地址，如：上海市徐汇区..."
                  className="text-sm"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCoordOrder(null)}>取消</Button>
            <Button onClick={handleEditGeocode} disabled={editGeocoding}>
              {editGeocoding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              重新解析
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Dispatch Dialog */}
      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>手动派单</DialogTitle>
            <DialogDescription>
              {manualOrder && `${manualOrder.orderNo} · ${manualOrder.flightDate}${manualOrder.pickupTime ? " " + manualOrder.pickupTime : ""} · ${manualOrder.reqVehicleType}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {/* 搜索 + 筛选 */}
            <div className="flex flex-col gap-2">
              <Input
                placeholder="搜索司机姓名或住址..."
                value={manualSearch}
                onChange={e => setManualSearch(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant={manualDriverFilter === "available" ? "default" : "outline"}
                  onClick={() => setManualDriverFilter("available")}>仅空闲</Button>
                <Button size="sm" variant={manualDriverFilter === "all" ? "default" : "outline"}
                  onClick={() => setManualDriverFilter("all")}>全部</Button>
                <Select value={manualVehicleFilter} onValueChange={setManualVehicleFilter}>
                  <SelectTrigger className="h-8 w-[100px] text-xs">
                    <SelectValue placeholder="车型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部车型</SelectItem>
                    {VEHICLE_TYPE_OPTIONS.map(t => (
                      <SelectItem key={t} value={t}>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${VEHICLE_TYPE_COLORS[t]}`} />
                          {t}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={manualShiftFilter} onValueChange={v => setManualShiftFilter(v as "all" | "day" | "night")}>
                  <SelectTrigger className="h-8 w-[100px] text-xs">
                    <SelectValue placeholder="班次" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部班次</SelectItem>
                    <SelectItem value="day">白班</SelectItem>
                    <SelectItem value="night">夜班</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">共 {manualDriverList.length} 位司机</p>
            <ScrollArea className="h-[340px] border rounded-md">
              {manualDriverList.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
                  暂无符合条件的司机
                </div>
              ) : (
                <div className="divide-y">
                  {manualDriverList.map(driver => (
                    <div
                      key={driver.id}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
                        selectedDriverId === driver.id && "bg-primary/10 hover:bg-primary/10"
                      )}
                      onClick={() => setSelectedDriverId(driver.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium shrink-0">
                          {driver.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{driver.name}</p>
                          <p className="text-xs text-muted-foreground">{driver.phone} · {driver.vehiclePlate}</p>
                          {driver.homeAddress && (
                            <p className="text-xs text-muted-foreground/70 truncate max-w-[220px]" title={driver.homeAddress}>
                              住：{driver.homeAddress}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-xs",
                            driver.status === "available" ? "bg-green-500/20 text-green-400" :
                            driver.status === "busy" ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-gray-500/20 text-gray-400"
                          )}>
                            {driver.status === "available" ? "空闲" : driver.status === "busy" ? "忙碌" : "休息"}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${VEHICLE_TYPE_COLORS[driver.vehicleType as keyof typeof VEHICLE_TYPE_COLORS] ?? "bg-muted"}`} />
                            <span className="text-muted-foreground">{driver.vehicleType}</span>
                          </span>
                          {selectedDriverId === driver.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        {driver.workingHours && (
                          <span className="text-muted-foreground/70">{driver.workingHours}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>取消</Button>
            <Button onClick={handleConfirmManual} disabled={!selectedDriverId}>
              <UserCheck className="mr-2 h-4 w-4" />
              确认派单
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
