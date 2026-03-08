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
  ChevronRight,
  RefreshCw,
  Filter,
  ArrowRight,
  Loader2,
  Award,
  MapPin,
  BarChart3,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { store } from "@/lib/store"
import { runDispatchAlgorithm, batchDispatch, type DispatchScore, type DispatchResult } from "@/lib/dispatch-engine"
import type { Order, Driver } from "@/lib/types"

const vehicleTypeLabels: Record<string, string> = {
  sedan: "轿车",
  suv: "SUV",
  van: "商务车",
  luxury: "豪华车",
}

const serviceTypeLabels: Record<string, string> = {
  pickup: "接机",
  dropoff: "送机",
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
  const [dateFilter, setDateFilter] = useState("")
  
  useEffect(() => {
    const orders = store.getOrders()
    const driverList = store.getDrivers()
    
    setAllOrders(orders)
    setDrivers(driverList)
    
    // Get pending orders or orders that need reassignment
    if (isReassign && preselectedOrderId) {
      const orderToReassign = orders.find(o => o.id === preselectedOrderId)
      if (orderToReassign) {
        setPendingOrders([orderToReassign])
        setSelectedOrders(new Set([preselectedOrderId]))
      }
    } else {
      const pending = orders.filter(o => o.status === "pending")
      setPendingOrders(pending)
      
      if (preselectedOrderId) {
        setSelectedOrders(new Set([preselectedOrderId]))
      }
    }
  }, [preselectedOrderId, isReassign])
  
  const filteredOrders = useMemo(() => {
    if (!dateFilter) return pendingOrders
    return pendingOrders.filter(o => o.serviceDate === dateFilter)
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
    if (checked) {
      newSelected.add(orderId)
    } else {
      newSelected.delete(orderId)
    }
    setSelectedOrders(newSelected)
  }
  
  const handleSingleDispatch = (order: Order) => {
    const availableDrivers = drivers.filter(d => d.status === "available")
    const result = runDispatchAlgorithm(order, availableDrivers, allOrders)
    setCurrentResult(result)
    setShowResultDialog(true)
  }
  
  const handleBatchDispatch = async () => {
    if (selectedOrders.size === 0) return
    
    setIsProcessing(true)
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const ordersToDispatch = filteredOrders.filter(o => selectedOrders.has(o.id))
    const availableDrivers = drivers.filter(d => d.status === "available")
    const results = batchDispatch(ordersToDispatch, availableDrivers, allOrders)
    
    setBatchResults(results)
    setIsProcessing(false)
  }
  
  const handleConfirmDispatch = (orderId: string, driverId: string) => {
    // Update driver status
    store.updateDriver(driverId, { status: "busy" })
    
    // Update order
    store.updateOrder(orderId, { 
      driverId,
      status: "assigned",
    })
    
    // Refresh data
    const orders = store.getOrders()
    const driverList = store.getDrivers()
    setAllOrders(orders)
    setDrivers(driverList)
    setPendingOrders(orders.filter(o => o.status === "pending"))
    
    // Clear selection
    const newSelected = new Set(selectedOrders)
    newSelected.delete(orderId)
    setSelectedOrders(newSelected)
    
    // Close dialog if single dispatch
    if (currentResult?.orderId === orderId) {
      setShowResultDialog(false)
      setCurrentResult(null)
    }
    
    // Update batch results
    if (batchResults) {
      const newResults = new Map(batchResults)
      newResults.delete(orderId)
      setBatchResults(newResults.size > 0 ? newResults : null)
    }
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
            <CardTitle className="text-sm font-medium text-muted-foreground">
              待派单订单
            </CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              可用司机
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.availableDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              已选订单
            </CardTitle>
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
                <Button variant="outline" onClick={() => setBatchResults(null)}>
                  取消
                </Button>
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
                    <div 
                      key={orderId}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium">{order.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.serviceDate} {order.serviceTime} · {serviceTypeLabels[order.serviceType]}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        {result.bestMatch ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-primary/10">
                              <Award className="mr-1 h-3 w-3" />
                              {result.bestMatch.driverName}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              评分 {result.bestMatch.totalScore}
                            </span>
                          </div>
                        ) : (
                          <Badge variant="destructive">无匹配司机</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {result.bestMatch && (
                          <Button 
                            size="sm"
                            onClick={() => handleConfirmDispatch(orderId, result.bestMatch!.driverId)}
                          >
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
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
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
                    checked={
                      filteredOrders.length > 0 && 
                      filteredOrders.every(o => selectedOrders.has(o.id))
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>订单号</TableHead>
                <TableHead>服务类型</TableHead>
                <TableHead>乘客</TableHead>
                <TableHead>服务时间</TableHead>
                <TableHead>地点</TableHead>
                <TableHead>车型</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
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
                        onCheckedChange={(checked) => 
                          handleSelectOrder(order.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {serviceTypeLabels[order.serviceType]}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.passengerName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{order.serviceDate}</span>
                        <span className="text-xs text-muted-foreground">{order.serviceTime}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="truncate text-xs" title={order.pickupLocation}>
                          {order.pickupLocation}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {vehicleTypeLabels[order.vehicleType]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleSingleDispatch(order)}
                      >
                        <Zap className="mr-1 h-3 w-3" />
                        派单
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Single Dispatch Result Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>派单推荐</DialogTitle>
            <DialogDescription>
              {currentResult?.message}
            </DialogDescription>
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
                        className={`${
                          index === 0 && !rec.hasConflict 
                            ? "border-primary/50 bg-primary/5" 
                            : rec.hasConflict 
                            ? "border-warning/50 bg-warning/5" 
                            : ""
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                {index === 0 && !rec.hasConflict ? (
                                  <Award className="h-5 w-5 text-primary" />
                                ) : (
                                  <Car className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{rec.driverName}</p>
                                  {index === 0 && !rec.hasConflict && (
                                    <Badge variant="default" className="text-xs">推荐</Badge>
                                  )}
                                  {rec.hasConflict && (
                                    <Badge variant="outline" className="text-xs text-warning border-warning">
                                      有冲突
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {rec.reasons.map((reason, i) => (
                                    <span 
                                      key={i}
                                      className="text-xs text-muted-foreground"
                                    >
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
                          
                          {/* Score breakdown */}
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
                              <Progress 
                                value={100 - rec.breakdown.timeConflictPenalty} 
                                className="h-1 mt-1"
                              />
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
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
