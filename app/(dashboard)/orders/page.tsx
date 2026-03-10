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
import { getOrders, getDrivers, updateOrder, deleteOrder } from "@/lib/store"
import type { Order, OrderStatus } from "@/lib/types"

const statusConfig: Record<OrderStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  0: { label: "待排单", variant: "secondary" },
  1: { label: "已分配", variant: "default" },
  2: { label: "进行中", variant: "default" },
  3: { label: "已完成", variant: "outline" },
  4: { label: "已取消", variant: "destructive" },
  5: { label: "空单", variant: "outline" },
}

const vehicleTypeLabels: Record<string, string> = {
  "舒适型": "舒适型",
  "豪华型": "豪华型",
  "商务型": "商务型",
  "经济型": "经济型",
}

const vehicleTypeColors: Record<string, string> = {
  "舒适型": "bg-blue-500",
  "豪华型": "bg-amber-500",
  "商务型": "bg-purple-500",
  "经济型": "bg-green-500",
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
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const pageSize = 10

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
    return orders.filter(order => {
      const q = searchQuery.toLowerCase()
      const matchesSearch = !q ||
        order.orderNo.toLowerCase().includes(q) ||
        (order.flightNo && order.flightNo.toLowerCase().includes(q))

      const matchesStatus = statusFilter === "all" || order.status === Number(statusFilter)
      const matchesVehicle = vehicleFilter === "all" || order.reqVehicleType === vehicleFilter
      const matchesDate = !dateStr || order.flightDate === dateStr

      return matchesSearch && matchesStatus && matchesVehicle && matchesDate
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

  const getDriverName = (driverId?: string) => {
    if (!driverId) return "-"
    const driver = drivers.find(d => d.id === driverId)
    return driver?.name || "-"
  }

  const handleCancelOrder = async (orderId: string) => {
    await updateOrder(orderId, { status: 4 })
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
    if (selectedIds.size === paginatedOrders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedOrders.map(o => o.id)))
    }
  }

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await deleteOrder(id)
    }
    setSelectedIds(new Set())
    setBatchDeleteOpen(false)
    setBatchMode(false)
    setOrders(await getOrders())
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
          <Button variant="outline" asChild>
            <Link href="/orders/import">
              <Upload className="mr-2 h-4 w-4" />
              导入订单
            </Link>
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
                  {Object.keys(vehicleTypeLabels).map(type => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${vehicleTypeColors[type]}`} />
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={paginatedOrders.length > 0 && selectedIds.size === paginatedOrders.length}
                    onCheckedChange={toggleSelectAll}
                    className={cn("border-muted-foreground/60", !batchMode && "invisible")}
                  />
                </TableHead>
                <TableHead className="w-[180px]">订单号</TableHead>
                <TableHead>航班/时间</TableHead>
                <TableHead>地点</TableHead>
                <TableHead>车型</TableHead>
                <TableHead>服务标准</TableHead>
                <TableHead>服务类型</TableHead>
                <TableHead>人数</TableHead>
                <TableHead>司机</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
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
                          <div className="flex flex-col">
                            {order.flightNo && <span className="font-medium">{order.flightNo}</span>}
                            <span className="text-xs text-muted-foreground">
                              {order.flightDate} {order.pickupTime}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col max-w-[200px]">
                            <span className="truncate text-xs" title={order.pickupAddress}>
                              <MapPin className="inline h-3 w-3 mr-1" />
                              {order.pickupAddress}
                            </span>
                            <span className="truncate text-xs text-muted-foreground" title={order.dropoffAddress}>
                              → {order.dropoffAddress}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${vehicleTypeColors[order.reqVehicleType] ?? "bg-muted"}`} />
                            {vehicleTypeLabels[order.reqVehicleType] ?? order.reqVehicleType}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{meta.serviceStandard || "-"}</TableCell>
                        <TableCell className="text-xs">{meta.serviceType || "-"}</TableCell>
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
                            <DropdownMenuContent align="end">
                              {order.status === 0 && (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/dispatch?orderId=${order.id}`)
                                }}>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  派单
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
                          <TableCell colSpan={11} className="px-6 pb-4 pt-0 max-w-0">
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
    </div>
  )
}
