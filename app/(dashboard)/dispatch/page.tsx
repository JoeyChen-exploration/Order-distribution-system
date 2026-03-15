"use client"

import { useState, useEffect, useMemo } from "react"
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
import { getOrders, getDrivers, updateOrder, updateDriver } from "@/lib/store"
import { runDispatchAlgorithm, batchDispatch, type DispatchResult } from "@/lib/dispatch-engine"
import type { Order, Driver } from "@/lib/types"

const vehicleTypeColors: Record<string, string> = {
  "舒适型": "bg-blue-500",
  "豪华型": "bg-amber-500",
  "商务型": "bg-purple-500",
  "经济型": "bg-green-500",
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
    return list
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

  const handleSingleDispatch = (order: Order) => {
    // 同时包含 available 和 busy 司机（busy 司机可排未来时段的单，时间冲突由算法检查）
    const candidateDrivers = drivers.filter(d => d.status === "available" || d.status === "busy")
    const result = runDispatchAlgorithm(order, candidateDrivers, allOrders)
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

  const handleBatchDispatch = async () => {
    if (selectedOrders.size === 0) return
    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    const ordersToDispatch = filteredOrders.filter(o => selectedOrders.has(o.id))
    const candidateDrivers = drivers.filter(d => d.status === "available" || d.status === "busy")
    const results = batchDispatch(ordersToDispatch, candidateDrivers, allOrders)
    setBatchResults(results)
    setIsProcessing(false)
  }

  const handleConfirmDispatch = async (orderId: string, driverId: string) => {
    await updateDriver(driverId, { status: "busy" })
    await updateOrder(orderId, { driverId, status: 1 })

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
    // 先清空面板和模式，再异步执行派单（避免确认后面板重新渲染空列表）
    const toDispatch = Array.from(batchResults.entries())
      .filter(([, result]) => result.bestMatch)
      .map(([orderId, result]) => ({ orderId, driverId: result.bestMatch!.driverId }))
    setBatchResults(null)
    setBatchMode(false)
    setSelectedOrders(new Set())
    for (const { orderId, driverId } of toDispatch) {
      await updateDriver(driverId, { status: "busy" })
      await updateOrder(orderId, { driverId, status: 1 })
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
                  <p className="font-medium mb-1">缺坐标的订单（{coordWarning.badOrders.length} 条）</p>
                  <ul className="space-y-0.5 max-h-32 overflow-auto">
                    {coordWarning.badOrders.map(o => (
                      <li key={o.id} className="font-mono">
                        {o.orderNo} <span className="text-warning/50">· {o.flightDate} {o.pickupTime}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {coordWarning.badDrivers.length > 0 && (
                <div>
                  <p className="font-medium mb-1">缺坐标的司机（{coordWarning.badDrivers.length} 位）</p>
                  <ul className="space-y-0.5 max-h-32 overflow-auto">
                    {coordWarning.badDrivers.map(d => (
                      <li key={d.id}>
                        {d.name} <span className="text-warning/50">· {d.homeAddress || "无住址"}</span>
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
                    {isProcessing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
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
                <TableHead className="w-[160px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
                        <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${vehicleTypeColors[order.reqVehicleType] ?? "bg-muted"}`} />
                        {order.reqVehicleType}
                      </div>
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
                    <SelectItem value="舒适型">舒适型</SelectItem>
                    <SelectItem value="豪华型">豪华型</SelectItem>
                    <SelectItem value="商务型">商务型</SelectItem>
                    <SelectItem value="经济型">经济型</SelectItem>
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
                          <span className="text-muted-foreground">{driver.vehicleType}</span>
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
