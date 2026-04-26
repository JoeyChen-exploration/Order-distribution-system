"use client"

import React, { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus,
  Search,
  Upload,
  MoreHorizontal,
  Plane,
  Clock,
  MapPin,
  User,
  Car,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  RefreshCw,
  Trash2,
  CalendarIcon,
  Download,
  Ban,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getOrders, getDrivers, updateOrder, updateDriver, cancelDispatch } from "@/lib/store"
import type { Order, OrderStatus } from "@/lib/types"
import { VEHICLE_TYPE_OPTIONS, VEHICLE_TYPE_COLORS } from "@/lib/types"
import { OrderImportDialog } from "@/components/order-import-dialog"

const statusConfig: Record<OrderStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  0: { label: "待排单", variant: "secondary" },
  1: { label: "已分配", variant: "default" },
  2: { label: "进行中", variant: "default" },
  3: { label: "已完成", variant: "outline" },
  4: { label: "已取消", variant: "destructive" },
  5: { label: "空单", variant: "outline" },
}

const serviceTypeConfig: Record<string, { border: string; text: string; bg: string }> = {
  "接机/站": { border: "border-sky-500",     text: "text-sky-400",     bg: "bg-sky-500/10" },
  "送机/站": { border: "border-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10" },
  "包车":    { border: "border-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" },
  "市内约车": { border: "border-violet-500",  text: "text-violet-400",  bg: "bg-violet-500/10" },
}

function ServiceTypeBadge({ value, charterHours }: { value: string; charterHours?: string }) {
  const cfg = serviceTypeConfig[value]
  const needsCharterConfirm = value === "包车" && !charterHours
  if (!cfg) return <span className="text-xs text-muted-foreground">{value || "-"}</span>
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium w-fit ${cfg.border} ${cfg.text} ${cfg.bg}`}>
        {value}{charterHours ? `·${charterHours}h` : ""}
      </span>
      {needsCharterConfirm && (
        <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 w-fit">
          待确认时长
        </span>
      )}
    </div>
  )
}

type FlightStatusType = "on_time" | "delayed" | "cancelled" | "landed" | "unknown"
interface FlightStatus { status: FlightStatusType; message: string; delayMinutes: number }

function FlightStatusBadge({ fs }: { fs: FlightStatus }) {
  if (fs.status === "on_time")   return <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/15 text-green-400">正常</span>
  if (fs.status === "delayed")   return <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">延误{fs.delayMinutes}分</span>
  if (fs.status === "cancelled") return <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/15 text-red-400">取消</span>
  if (fs.status === "landed")    return <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400">已落地</span>
  return null
}

const METADATA_LABELS: Record<string, string> = {
  serviceType: "服务类型", serviceCity: "服务城市", airportCode: "三字码",
  passengerCount: "人数", submittedAt: "下单时间",
  vehiclePlate: "车号", driverPhone: "司机电话", driverGroup: "司机分组",
  actualVehicleType: "实际车型", tripNo: "架次",
  kilometers: "公里数", currency: "货币", singleTripFee: "单程费", signFee: "举牌费",
  extraKmFee: "超公里费", nightFee: "夜间服务费", babyBedFee: "婴儿座椅费",
  childSeatFee: "儿童座椅费", holidayAdjustment: "节假日调价", selfAdjustment: "自主调价",
  pickupDropoffPoint: "上下车点费", supplierOrderNo: "供应商订单",
  serviceStandard: "服务标准", signService: "举牌服务", singleService: "单程服务", remarks: "备注",
}

// 费用明细中始终展示的字段（无值显示0）
const FEE_ALWAYS_SHOW = new Set([
  "kilometers", "currency", "singleTripFee", "signFee", "extraKmFee",
  "nightFee", "babyBedFee", "childSeatFee", "holidayAdjustment", "selfAdjustment",
  "pickupDropoffPoint", "supplierOrderNo",
])

const METADATA_GROUPS = [
  { label: "基本信息", keys: ["serviceCity", "airportCode", "submittedAt"] },
  { label: "费用明细", keys: ["kilometers", "currency", "singleTripFee", "signFee", "extraKmFee", "nightFee", "babyBedFee", "childSeatFee", "holidayAdjustment", "selfAdjustment", "pickupDropoffPoint", "supplierOrderNo"] },
  { label: "司机/车辆", keys: ["vehiclePlate", "driverPhone", "driverGroup", "actualVehicleType", "tripNo"] },
  { label: "其他", keys: ["signService", "singleService", "remarks"] },
]

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [vehicleFilter, setVehicleFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [cancelAllOpen, setCancelAllOpen] = useState(false)
  const [flightStatuses, setFlightStatuses] = useState<Map<string, FlightStatus>>(new Map())
  const [loadingFlights, setLoadingFlights] = useState(false)
  const [coordFixOpen, setCoordFixOpen] = useState(false)
  const [coordFixOrderId, setCoordFixOrderId] = useState("")
  const [coordFixPickupAddress, setCoordFixPickupAddress] = useState("")
  const [coordFixDropoffAddress, setCoordFixDropoffAddress] = useState("")
  const [coordFixLoading, setCoordFixLoading] = useState(false)
  const [coordFixError, setCoordFixError] = useState("")
  const [coordFixHint, setCoordFixHint] = useState("")
  const pageSize = 50

  useEffect(() => {
    async function load() {
      const [orderData, driverData] = await Promise.all([getOrders(), getDrivers()])
      setOrders(orderData)
      setDrivers(driverData.map((d) => ({ id: d.id, name: d.name })))
    }
    load()
  }, [])

  const filteredOrders = useMemo(() => {
    const dateStr = dateFilter ? format(dateFilter, "yyyy-MM-dd") : ""
    return orders
      .filter(order => {
        const q = searchQuery.toLowerCase()
        const matchesSearch = !q ||
          order.orderNo.toLowerCase().includes(q) ||
          (order.flightNo && order.flightNo.toLowerCase().includes(q))

        const matchesStatus = statusFilter === "all" || order.status === Number(statusFilter)
        const matchesVehicle = vehicleFilter === "all" || order.reqVehicleType === vehicleFilter
        const matchesDate = !dateStr || order.flightDate === dateStr

        return matchesSearch && matchesStatus && matchesVehicle && matchesDate
      })
      .sort((a, b) => {
        const dtA = `${a.flightDate} ${a.pickupTime || "00:00"}`
        const dtB = `${b.flightDate} ${b.pickupTime || "00:00"}`
        return dtA.localeCompare(dtB)
      })
  }, [orders, searchQuery, statusFilter, vehicleFilter, dateFilter])

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage])

  const totalPages = Math.ceil(filteredOrders.length / pageSize)

  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    const todayOrders = orders.filter(o => o.flightDate === today)
    return {
      total: orders.length,
      today: todayOrders.length,
      pending: orders.filter(o => o.status === 0).length,
      inProgress: orders.filter(o => o.status === 1 || o.status === 2).length,
    }
  }, [orders])

  function isBadCoord(order: Order) {
    return !order.pickupLat || !order.pickupLng || !order.dropoffLat || !order.dropoffLng
  }

  const badCoordOrders = useMemo(() => {
    return orders.filter(isBadCoord)
  }, [orders])

  const selectedCoordFixOrder = useMemo(() => {
    return badCoordOrders.find((o) => o.id === coordFixOrderId) || null
  }, [badCoordOrders, coordFixOrderId])

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
      if (data?.lat && data?.lng) return { lat: data.lat, lng: data.lng }
    } catch {}
    return null
  }

  const openCoordFixDialog = () => {
    if (badCoordOrders.length === 0) return
    const first = badCoordOrders[0]
    setCoordFixOrderId(first.id)
    setCoordFixPickupAddress(first.pickupAddress || "")
    setCoordFixDropoffAddress(first.dropoffAddress || "")
    setCoordFixError("")
    setCoordFixHint("")
    setCoordFixOpen(true)
  }

  const handleCoordFixOrderChange = (orderId: string) => {
    setCoordFixOrderId(orderId)
    const order = badCoordOrders.find((o) => o.id === orderId)
    setCoordFixPickupAddress(order?.pickupAddress || "")
    setCoordFixDropoffAddress(order?.dropoffAddress || "")
    setCoordFixError("")
    setCoordFixHint("")
  }

  const handleResolveAndSaveCoord = async () => {
    if (!selectedCoordFixOrder) return
    setCoordFixLoading(true)
    setCoordFixError("")
    setCoordFixHint("")
    try {
      const [pickupCoord, dropoffCoord] = await Promise.all([
        geocodeAddr(coordFixPickupAddress.trim()),
        geocodeAddr(coordFixDropoffAddress.trim()),
      ])
      if (!pickupCoord && !dropoffCoord) {
        setCoordFixError("上下车地址都未解析成功，请补充更完整的中文地址后重试。")
        return
      }

      const updates: Partial<Order> = {
        pickupAddress: coordFixPickupAddress.trim(),
        dropoffAddress: coordFixDropoffAddress.trim(),
      }
      if (pickupCoord) {
        updates.pickupLat = pickupCoord.lat
        updates.pickupLng = pickupCoord.lng
      }
      if (dropoffCoord) {
        updates.dropoffLat = dropoffCoord.lat
        updates.dropoffLng = dropoffCoord.lng
      }

      await updateOrder(selectedCoordFixOrder.id, updates)
      const fresh = await getOrders()
      setOrders(fresh)
      const remaining = fresh.filter(isBadCoord)

      if (remaining.length === 0) {
        setCoordFixOpen(false)
        return
      }

      const next = remaining.find((o) => o.id === selectedCoordFixOrder.id) || remaining[0]
      setCoordFixOrderId(next.id)
      setCoordFixPickupAddress(next.pickupAddress || "")
      setCoordFixDropoffAddress(next.dropoffAddress || "")
      setCoordFixHint("已保存。若仍显示为坏坐标，说明仍有一侧地址未成功解析。")
    } finally {
      setCoordFixLoading(false)
    }
  }

  const getDriverName = (driverId?: string) => {
    if (!driverId) return "-"
    const driver = drivers.find(d => d.id === driverId)
    return driver?.name || "-"
  }

  const handleCancelOrder = async (orderId: string) => {
    await updateOrder(orderId, { status: 4 })
    setOrders(await getOrders())
  }

  const handleVehicleTypeChange = async (orderId: string, newType: string) => {
    await updateOrder(orderId, { reqVehicleType: newType })
    setOrders(await getOrders())
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    // 全选/取消全选所有筛选结果（跨页），方便大批量删除
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredOrders.map(o => o.id)))
    }
  }

  const handleBatchDelete = async () => {
    await fetch('/api/orders/batch-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    setSelectedIds(new Set())
    setBatchDeleteOpen(false)
    setBatchMode(false)
    setOrders(await getOrders())
  }

  const handleCancelDispatch = async (orderId: string) => {
    await cancelDispatch(orderId)
    setOrders(await getOrders())
  }

  const handleCancelAllDispatches = async () => {
    const toCancel = orders.filter(o => o.status === 1)
    // collect unique driverIds before clearing
    const affectedDriverIds = [...new Set(toCancel.map(o => o.driverId).filter(Boolean) as string[])]
    await Promise.all(toCancel.map(o => cancelDispatch(o.id)))
    // reset affected drivers back to available
    await Promise.all(affectedDriverIds.map(id => updateDriver(id, { status: "available" })))
    setOrders(await getOrders())
    setCancelAllOpen(false)
  }

  const handleSetCharterHours = async (orderId: string, hours: 4 | 8, currentMeta: string) => {
    const meta = currentMeta ? JSON.parse(currentMeta) : {}
    meta["包车时长"] = String(hours)
    await updateOrder(orderId, { metadata: JSON.stringify(meta) })
    setOrders(await getOrders())
  }


  const refreshFlightStatuses = async () => {
    setLoadingFlights(true)
    const keys = new Set(
      filteredOrders
        .filter(o => o.flightNo)
        .map(o => `${o.flightNo}|${o.flightDate}`)
    )
    const newStatuses = new Map(flightStatuses)
    await Promise.all(
      Array.from(keys).map(async key => {
        const [flightNo, date] = key.split("|")
        try {
          const res = await fetch(`/api/flights/status?flightNo=${encodeURIComponent(flightNo)}&date=${date}`)
          const data = await res.json()
          newStatuses.set(key, data)
        } catch {}
      })
    )
    setFlightStatuses(new Map(newStatuses))
    setLoadingFlights(false)
  }

  const handleExport = async () => {
    const { Workbook } = await import("exceljs")
    const dispatched = orders
      .slice()
      .sort((a, b) => `${a.flightDate} ${a.pickupTime}`.localeCompare(`${b.flightDate} ${b.pickupTime}`))
    const allDrivers = await getDrivers()

    const headers = [
      "订单号","预订车型","服务类型","服务城市","服务日期","三字码","人数","下单时间",
      "航班号","上车点","下车点","车号","司机","司机电话","司机分组","实际车型",
      "架次","公里数","服务标准","举牌服务","备注",
    ]
    const rows = dispatched.map(order => {
      const meta: Record<string, string> = order.metadata ? JSON.parse(order.metadata) : {}
      const driver = allDrivers.find(d => d.id === order.driverId)
      const serviceDate = order.flightDate && order.pickupTime
        ? `${order.flightDate} ${order.pickupTime}:00`
        : order.flightDate || ""
      return [
        order.orderNo,
        order.reqVehicleType,
        meta["服务类型"] || meta["serviceType"] || "",
        meta["serviceCity"] || "",
        serviceDate,
        meta["airportCode"] || "",
        meta["passengerCount"] || "",
        meta["submittedAt"] || "",
        order.flightNo || "",
        order.pickupAddress || "",
        order.dropoffAddress || "",
        meta["vehiclePlate"] || driver?.vehiclePlate || "",
        order.driverName || driver?.name || "",
        meta["driverPhone"] || driver?.phone || "",
        meta["driverGroup"] || "",
        meta["actualVehicleType"] || order.reqVehicleType || "",
        meta["tripNo"] || "",
        meta["kilometers"] || "",
        meta["serviceStandard"] || "",
        meta["signService"] || "",
        meta["remarks"] || "",
      ]
    })

    const workbook = new Workbook()
    const worksheet = workbook.addWorksheet("礼宾车账单")
    worksheet.addRows([headers, ...rows])
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `排单结果_${format(new Date(), "yyyyMMdd")}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setSearchQuery("")
    setStatusFilter("all")
    setVehicleFilter("all")
    setDateFilter(undefined)
    setCurrentPage(1)
  }

  const hasActiveFilters = searchQuery || statusFilter !== "all" || vehicleFilter !== "all" || dateFilter

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">订单管理</h1>
          <p className="text-muted-foreground">管理所有接送机订单</p>
        </div>
        <div className="flex items-center gap-2">
          {batchMode ? (
            <>
              {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={() => setBatchDeleteOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除选中 ({selectedIds.size})
                </Button>
              )}
              <Button variant="outline" onClick={() => { setBatchMode(false); setSelectedIds(new Set()) }}>
                取消
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setBatchMode(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              批量删除
            </Button>
          )}
          {orders.some(o => o.status === 1) && (
            <Button variant="outline" onClick={() => setCancelAllOpen(true)}>
              <Ban className="mr-2 h-4 w-4" />
              取消全部派单
            </Button>
          )}
          <Button variant="outline" onClick={refreshFlightStatuses} disabled={loadingFlights}>
            {loadingFlights ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            刷新航班
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            导出排单
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            导入订单
          </Button>
          <Button variant="outline" onClick={openCoordFixDialog} disabled={badCoordOrders.length === 0}>
            <MapPin className="mr-2 h-4 w-4" />
            修复坏坐标{badCoordOrders.length > 0 ? ` (${badCoordOrders.length})` : ""}
          </Button>
          <Button asChild>
            <Link href="/orders/create">
              <Plus className="mr-2 h-4 w-4" />
              新建订单
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">全部订单</CardTitle>
            <Plane className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">今日订单</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">待排单</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">进行中</CardTitle>
            <Car className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.inProgress}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charter hours warning */}
      {(() => {
        const pending = orders.filter(o => {
          const m = o.metadata ? JSON.parse(o.metadata) : {}
          return (m["服务类型"] === "包车" || m.serviceType === "包车") && !m["包车时长"]
        })
        if (pending.length === 0) return null
        return (
          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3">
            <span className="text-orange-400 text-sm font-medium shrink-0">⚠ 以下包车订单未选择时长，无法参与派单：</span>
            <div className="flex flex-wrap gap-2">
              {pending.map(o => (
                <button
                  key={o.id}
                  onClick={() => { setSearchQuery(o.orderNo); setCurrentPage(1) }}
                  className="text-xs px-2 py-0.5 rounded border border-orange-500/50 text-orange-300 hover:bg-orange-500/20 transition-colors font-mono"
                >
                  {o.orderNo}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Upgrade reminder: orders auto-converted from 商务型 → 普通商务型 */}
      {(() => {
        const upgradeable = orders.filter(o => {
          if (o.reqVehicleType !== "普通商务型") return false
          try { const m = JSON.parse(o.metadata || "{}"); return m["原车型"] === "商务型" } catch { return false }
        })
        if (upgradeable.length === 0) return null
        return (
          <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3">
            <span className="text-blue-400 text-sm font-medium">
              ℹ {upgradeable.length} 条订单已从商务型自动归入普通商务型，如需升级为豪华商务型请在订单中操作
            </span>
          </div>
        )
      })()}

      {badCoordOrders.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-amber-300">
            {badCoordOrders.length} 条订单坐标不完整，建议手动修正地址并重新解析，避免派单距离评分不准。
          </div>
          <Button size="sm" variant="outline" onClick={openCoordFixDialog}>
            <MapPin className="mr-2 h-4 w-4" />
            打开修复窗口
          </Button>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索订单号、航班号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="订单状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(statusConfig).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="车型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部车型</SelectItem>
                  {VEHICLE_TYPE_OPTIONS.map(type => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${VEHICLE_TYPE_COLORS[type]}`} />
                        {type}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={setDateFilter}
                    locale={zhCN}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-4 w-4" />
                  清除筛选
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table className="w-full min-w-[1200px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 shrink-0">
                  <Checkbox
                    checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                    onCheckedChange={toggleSelectAll}
                    className={cn("border-muted-foreground/60", !batchMode && "invisible")}
                  />
                </TableHead>
                <TableHead className="min-w-[140px]">订单号</TableHead>
                <TableHead className="min-w-[130px]">航班/时间</TableHead>
                <TableHead className="min-w-[240px]">地点</TableHead>
                <TableHead className="min-w-[120px]">车型</TableHead>
                <TableHead className="min-w-[100px]">服务类型</TableHead>
                <TableHead className="min-w-[48px]">人数</TableHead>
                <TableHead className="min-w-[80px]">司机</TableHead>
                <TableHead className="min-w-[72px]">状态</TableHead>
                <TableHead className="min-w-[48px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    暂无订单数据
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((order) => {
                  const isExpanded = expandedOrderId === order.id
                  const meta: Record<string, string> = order.metadata ? JSON.parse(order.metadata) : {}
                  const hasExtra = Object.keys(meta).length > 0
                  return (
                    <React.Fragment key={order.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => !batchMode && setExpandedOrderId(isExpanded ? null : order.id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelect(order.id)}
                            className={cn("border-muted-foreground/60", !batchMode && "invisible")}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                            <span className="truncate text-xs">{order.orderNo}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {order.flightNo && <span className="font-medium">{order.flightNo}</span>}
                              {(() => {
                                const key = `${order.flightNo}|${order.flightDate}`
                                const fs = flightStatuses.get(key)
                                return fs ? <FlightStatusBadge fs={fs} /> : null
                              })()}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {order.flightDate}{order.pickupTime ? ` ${order.pickupTime}` : ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs break-words leading-snug">
                              <MapPin className="inline h-3 w-3 mr-1 shrink-0" />
                              {order.pickupAddress}
                            </span>
                            <span className="text-xs text-muted-foreground break-words leading-snug">
                              → {order.dropoffAddress}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const displayType = order.reqVehicleType === "商务型" ? "普通商务型" : order.reqVehicleType
                            return (
                              <Select
                                value={displayType}
                                onValueChange={(v) => handleVehicleTypeChange(order.id, v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-[108px] border border-muted-foreground/30">
                                  <div className="flex items-center gap-1.5 overflow-hidden">
                                    <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${VEHICLE_TYPE_COLORS[displayType as keyof typeof VEHICLE_TYPE_COLORS] ?? "bg-muted"}`} />
                                    <span className="truncate">{displayType}</span>
                                  </div>
                                </SelectTrigger>
                                <SelectContent>
                                  {VEHICLE_TYPE_OPTIONS.map(t => (
                                    <SelectItem key={t} value={t} className="text-xs">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${VEHICLE_TYPE_COLORS[t]}`} />
                                        {t}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          })()}
                        </TableCell>
                        <TableCell><ServiceTypeBadge value={meta["服务类型"] || meta.serviceType || ""} charterHours={meta["包车时长"]} /></TableCell>
                        <TableCell className="text-xs">{meta.passengerCount || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {order.driverName || getDriverName(order.driverId)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusConfig[order.status].variant}>
                            {statusConfig[order.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-w-[280px]">
                              {meta.serviceStandard && (
                                <>
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground break-words whitespace-normal leading-relaxed">
                                    {meta.serviceStandard}
                                  </div>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {order.status === 0 && (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/dispatch?orderId=${order.id}`)
                                }}>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  派单
                                </DropdownMenuItem>
                              )}
                              {order.status === 1 && (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  handleCancelDispatch(order.id)
                                }}>
                                  <Ban className="mr-2 h-4 w-4" />
                                  撤销派单
                                </DropdownMenuItem>
                              )}
                              {(order.status === 1 || order.status === 2) && (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/dispatch?orderId=${order.id}&reassign=true`)
                                }}>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  改派
                                </DropdownMenuItem>
                              )}
                              {(meta["服务类型"] === "包车" || meta.serviceType === "包车") && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => { e.stopPropagation(); handleSetCharterHours(order.id, 4, order.metadata || "") }}
                                    className={!meta["包车时长"] ? "text-orange-400" : ""}
                                  >
                                    {!meta["包车时长"] && "⚠ "}包车：4 小时{meta["包车时长"] === "4" ? " ✓" : ""}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => { e.stopPropagation(); handleSetCharterHours(order.id, 8, order.metadata || "") }}
                                    className={!meta["包车时长"] ? "text-orange-400" : ""}
                                  >
                                    {!meta["包车时长"] && "⚠ "}包车：8 小时{meta["包车时长"] === "8" ? " ✓" : ""}
                                  </DropdownMenuItem>
                                </>
                              )}
                              {order.reqVehicleType === "商务型" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => { e.stopPropagation(); handleSetBusinessType(order.id, "豪华商务型", order.metadata || "") }}
                                    className={!meta["商务类型"] ? "text-yellow-400" : ""}
                                  >
                                    {!meta["商务类型"] && "⚠ "}豪华商务型{meta["商务类型"] === "豪华商务型" ? " ✓" : ""}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => { e.stopPropagation(); handleSetBusinessType(order.id, "普通商务型", order.metadata || "") }}
                                    className={!meta["商务类型"] ? "text-yellow-400" : ""}
                                  >
                                    {!meta["商务类型"] && "⚠ "}普通商务型{meta["商务类型"] === "普通商务型" ? " ✓" : ""}
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              {order.status !== 3 && order.status !== 4 && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCancelOrder(order.id)
                                  }}
                                >
                                  取消订单
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={10} className="px-6 pb-4 pt-0 max-w-0">
                            {hasExtra ? (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 pt-3 border-t border-border/30 overflow-hidden">
                                {METADATA_GROUPS.map(group => {
                                  const items = group.keys
                                    .filter(k => FEE_ALWAYS_SHOW.has(k) || meta[k])
                                    .map(k => ({ label: METADATA_LABELS[k] ?? k, value: meta[k] ?? "0" }))
                                  if (items.length === 0) return null
                                  return (
                                    <div key={group.label}>
                                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{group.label}</p>
                                      <dl className="space-y-1.5">
                                        {items.map(item => (
                                          <div key={item.label} className="flex justify-between text-xs gap-2">
                                            <dt className="text-muted-foreground shrink-0">{item.label}</dt>
                                            <dd className="font-medium text-right break-all">{item.value}</dd>
                                          </div>
                                        ))}
                                      </dl>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="pt-3 text-xs text-muted-foreground border-t border-border/30">暂无额外信息</p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {filteredOrders.length} 条记录，第 {currentPage} / {totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除确认</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedIds.size} 条订单吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={cancelAllOpen} onOpenChange={setCancelAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消全部派单</AlertDialogTitle>
            <AlertDialogDescription>
              将把所有"已分配"状态的订单重置为"待排单"，司机信息会被清空。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelAllDispatches} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认取消全部
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OrderImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={async () => setOrders(await getOrders())}
      />
      <Dialog open={coordFixOpen} onOpenChange={setCoordFixOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>修复坏坐标订单</DialogTitle>
            <DialogDescription>
              手动编辑上下车地址后重新解析并保存坐标。当前待修复 {badCoordOrders.length} 条。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">选择订单</p>
              <Select value={coordFixOrderId} onValueChange={handleCoordFixOrderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择坏坐标订单" />
                </SelectTrigger>
                <SelectContent>
                  {badCoordOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.orderNo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCoordFixOrder && (
              <>
                <div className="rounded-md border border-border/60 p-2 text-xs text-muted-foreground">
                  当前坐标：
                  上车({selectedCoordFixOrder.pickupLat?.toFixed?.(6) ?? selectedCoordFixOrder.pickupLat}, {selectedCoordFixOrder.pickupLng?.toFixed?.(6) ?? selectedCoordFixOrder.pickupLng})
                  ，下车({selectedCoordFixOrder.dropoffLat?.toFixed?.(6) ?? selectedCoordFixOrder.dropoffLat}, {selectedCoordFixOrder.dropoffLng?.toFixed?.(6) ?? selectedCoordFixOrder.dropoffLng})
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">上车地址</p>
                  <Textarea
                    value={coordFixPickupAddress}
                    onChange={(e) => setCoordFixPickupAddress(e.target.value)}
                    rows={3}
                    placeholder="请输入更完整的中文上车地址"
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">下车地址</p>
                  <Textarea
                    value={coordFixDropoffAddress}
                    onChange={(e) => setCoordFixDropoffAddress(e.target.value)}
                    rows={3}
                    placeholder="请输入更完整的中文下车地址"
                  />
                </div>
              </>
            )}
            {coordFixError && <p className="text-sm text-destructive">{coordFixError}</p>}
            {coordFixHint && <p className="text-sm text-primary">{coordFixHint}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoordFixOpen(false)} disabled={coordFixLoading}>
              关闭
            </Button>
            <Button onClick={handleResolveAndSaveCoord} disabled={coordFixLoading || !selectedCoordFixOrder}>
              {coordFixLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              重新解析并保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
