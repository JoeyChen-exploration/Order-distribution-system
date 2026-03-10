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

  // Manual dispatch state
  const [manualOrder, setManualOrder] = useState<Order | null>(null)
  const [showManualDialog, setShowManualDialog] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState<string>("")
  const [manualDriverFilter, setManualDriverFilter] = useState<"all" | "available">("available")

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
    if (!dateFilter) return pendingOrders
    const dateStr = format(dateFilter, "yyyy-MM-dd")
    return pendingOrders.filter(o => o.flightDate === dateStr)
  }, [pendingOrders, dateFilter])

  const stats = useMemo(() => {
    const availableDrivers = drivers.filter(d => d.status === "available")
    return {
      pendingCount: pendingOrders.length,
      availableDrivers: availableDrivers.length,
      selectedCount: selectedOrders.size,
    }
  }, [pendingOrders, drivers, selectedOrders])

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
    const availableDrivers = drivers.filter(d => d.status === "available")
    const result = runDispatchAlgorithm(order, availableDrivers, allOrders)
    setCurrentResult(result)
    setShowResultDialog(true)
  }

  const handleOpenManual = (order: Order) => {
    setManualOrder(order)
    setSelectedDriverId("")
    setManualDriverFilter("available")
    setShowManualDialog(true)
  }

  const handleBatchDispatch = async () => {
    if (selectedOrders.size === 0) return
    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    const ordersToDispatch = filteredOrders.filter(o => selectedOrders.has(o.id))
    const availableDrivers = drivers.filter(d => d.status === "available")
    const results = batchDispatch(ordersToDispatch, availableDrivers, allOrders)
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

  const handleConfirmAllBatch = () => {
    if (!batchResults) return
    batchResults.forEach((result, orderId) => {
      if (result.bestMatch) {
        handleConfirmDispatch(orderId, result.bestMatch.driverId)
      }
    })
    setBatchResults(null)
  }

  const manualDriverList = useMemo(() => {
    if (manualDriverFilter === "available") return drivers.filter(d => d.status === "available")
    return drivers
  }, [drivers, manualDriverFilter])

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
                          <Badge variant="destructive">无匹配司机</Badge>
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
          <div className="flex items-center justify-between">
            <CardTitle>待派单列表</CardTitle>
            <div className="flex items-center gap-2">
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
              <Button
                onClick={handleBatchDispatch}
                disabled={selectedOrders.size === 0 || isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                批量智能派单 ({selectedOrders.size})
              </Button>
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
                    className="border-muted-foreground/60"
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
                        className="border-muted-foreground/60"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{order.orderNo}</TableCell>
                    <TableCell>{order.flightNo}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{order.flightDate}</span>
                        <span className="text-xs text-muted-foreground">{order.pickupTime}</span>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>手动派单</DialogTitle>
            <DialogDescription>
              {manualOrder && `${manualOrder.orderNo} · ${manualOrder.flightDate} · ${manualOrder.reqVehicleType}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={manualDriverFilter === "available" ? "default" : "outline"}
                onClick={() => setManualDriverFilter("available")}
              >
                仅显示可用司机
              </Button>
              <Button
                size="sm"
                variant={manualDriverFilter === "all" ? "default" : "outline"}
                onClick={() => setManualDriverFilter("all")}
              >
                全部司机
              </Button>
            </div>
            <ScrollArea className="h-[320px] border rounded-md">
              {manualDriverList.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
                  暂无可用司机
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
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                          {driver.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{driver.name}</p>
                          <p className="text-xs text-muted-foreground">{driver.phone} · {driver.vehiclePlate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-xs",
                          driver.status === "available" ? "bg-green-500/20 text-green-400" :
                          driver.status === "busy" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-gray-500/20 text-gray-400"
                        )}>
                          {driver.status === "available" ? "空闲" : driver.status === "busy" ? "忙碌" : "休息"}
                        </span>
                        <span className="text-muted-foreground">{driver.vehicleType}</span>
                        {selectedDriverId === driver.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
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
