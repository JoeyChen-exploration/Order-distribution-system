"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Plane,
  Clock,
  MapPin,
  User,
  Car,
  Phone,
  Briefcase,
  Users,
  FileText,
  RefreshCw,
  X,
  Edit,
  History,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { store } from "@/lib/store"
import type { Order, Driver, OrderStatus } from "@/lib/types"

const statusConfig: Record<OrderStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  pending: { label: "待派单", variant: "secondary", color: "bg-yellow-500" },
  assigned: { label: "已派单", variant: "default", color: "bg-blue-500" },
  accepted: { label: "已接单", variant: "default", color: "bg-blue-500" },
  in_progress: { label: "进行中", variant: "default", color: "bg-primary" },
  completed: { label: "已完成", variant: "outline", color: "bg-green-500" },
  cancelled: { label: "已取消", variant: "destructive", color: "bg-destructive" },
}

const serviceTypeLabels: Record<string, string> = {
  pickup: "接机",
  dropoff: "送机",
}

const vehicleTypeLabels: Record<string, string> = {
  sedan: "轿车",
  suv: "SUV",
  van: "商务车",
  luxury: "豪华车",
}

const statusFlow: OrderStatus[] = ["pending", "assigned", "accepted", "in_progress", "completed"]

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [showReassignDialog, setShowReassignDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState("")
  const [cancelReason, setCancelReason] = useState("")

  useEffect(() => {
    const orderData = store.getOrders().find(o => o.id === id)
    if (orderData) {
      setOrder(orderData)
      if (orderData.driverId) {
        const driverData = store.getDrivers().find(d => d.id === orderData.driverId)
        setDriver(driverData || null)
      }
    }
    setDrivers(store.getDrivers().filter(d => d.status === "available"))
  }, [id])

  if (!order) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">订单不存在</p>
      </div>
    )
  }

  const handleReassign = () => {
    if (!selectedDriverId) return
    
    // Release old driver
    if (order.driverId) {
      store.updateDriver(order.driverId, { status: "available" })
    }
    
    // Assign new driver
    store.updateDriver(selectedDriverId, { status: "busy" })
    store.updateOrder(order.id, { 
      driverId: selectedDriverId,
      status: order.status === "pending" ? "assigned" : order.status,
    })
    
    // Refresh
    const updatedOrder = store.getOrders().find(o => o.id === id)
    if (updatedOrder) {
      setOrder(updatedOrder)
      const newDriver = store.getDrivers().find(d => d.id === selectedDriverId)
      setDriver(newDriver || null)
    }
    
    setShowReassignDialog(false)
    setSelectedDriverId("")
  }

  const handleCancel = () => {
    // Release driver
    if (order.driverId) {
      store.updateDriver(order.driverId, { status: "available" })
    }
    
    store.updateOrder(order.id, { 
      status: "cancelled",
      notes: order.notes ? `${order.notes}\n取消原因：${cancelReason}` : `取消原因：${cancelReason}`,
    })
    
    const updatedOrder = store.getOrders().find(o => o.id === id)
    if (updatedOrder) {
      setOrder(updatedOrder)
    }
    
    setShowCancelDialog(false)
    setCancelReason("")
  }

  const currentStatusIndex = statusFlow.indexOf(order.status)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
              <Badge variant={statusConfig[order.status].variant}>
                {statusConfig[order.status].label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {serviceTypeLabels[order.serviceType]} · {order.serviceDate} {order.serviceTime}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!["completed", "cancelled"].includes(order.status) && (
            <>
              <Button variant="outline" onClick={() => setShowReassignDialog(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {order.driverId ? "改派司机" : "派单"}
              </Button>
              <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
                <X className="mr-2 h-4 w-4" />
                取消订单
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {order.status !== "cancelled" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              {statusFlow.map((status, index) => {
                const isActive = index <= currentStatusIndex
                const isCurrent = status === order.status
                return (
                  <div key={status} className="flex flex-col items-center flex-1">
                    <div className="flex items-center w-full">
                      {index > 0 && (
                        <div className={`flex-1 h-0.5 ${isActive ? "bg-primary" : "bg-muted"}`} />
                      )}
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                          isCurrent
                            ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                            : isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {index + 1}
                      </div>
                      {index < statusFlow.length - 1 && (
                        <div className={`flex-1 h-0.5 ${index < currentStatusIndex ? "bg-primary" : "bg-muted"}`} />
                      )}
                    </div>
                    <span className={`mt-2 text-xs ${isCurrent ? "font-medium text-primary" : "text-muted-foreground"}`}>
                      {statusConfig[status].label}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Order Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              订单信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">服务类型</p>
                <p className="font-medium flex items-center gap-1">
                  <Plane className="h-4 w-4" />
                  {serviceTypeLabels[order.serviceType]}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">服务时间</p>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {order.serviceDate} {order.serviceTime}
                </p>
              </div>
              {order.flightNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">航班号</p>
                  <p className="font-medium">{order.flightNumber}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">车型要求</p>
                <p className="font-medium flex items-center gap-1">
                  <Car className="h-4 w-4" />
                  {vehicleTypeLabels[order.vehicleType]}
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">上车地点</p>
                <p className="font-medium flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  {order.pickupLocation}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">下车地点</p>
                <p className="font-medium flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  {order.dropoffLocation}
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">乘客人数</p>
                <p className="font-medium flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {order.passengerCount} 人
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">行李数量</p>
                <p className="font-medium flex items-center gap-1">
                  <Briefcase className="h-4 w-4" />
                  {order.luggageCount} 件
                </p>
              </div>
            </div>
            
            {order.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">备注</p>
                  <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                </div>
              </>
            )}
            
            {order.specialRequirements && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">特殊要求</p>
                <p className="text-sm">{order.specialRequirements}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Passenger & Driver Info */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                乘客信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-lg">{order.passengerName}</p>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {order.passengerPhone}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                司机信息
              </CardTitle>
              <CardDescription>
                {driver ? "已分配司机" : "暂未分配司机"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {driver ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Car className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-lg">{driver.name}</p>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {driver.phone}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <p className="text-sm text-muted-foreground">车牌号</p>
                      <p className="font-medium">{driver.licensePlate}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">车型</p>
                      <p className="font-medium">{driver.vehicleBrand} {driver.vehicleModel}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">车辆颜色</p>
                      <p className="font-medium">{driver.vehicleColor}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">车辆类型</p>
                      <p className="font-medium">{vehicleTypeLabels[driver.vehicleType]}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Car className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground mb-4">暂未分配司机</p>
                  <Button onClick={() => setShowReassignDialog(true)}>
                    立即派单
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                订单记录
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">创建时间</span>
                  <span>{new Date(order.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">更新时间</span>
                  <span>{new Date(order.updatedAt).toLocaleString("zh-CN")}</span>
                </div>
                {order.importBatchId && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">导入批次</span>
                    <span className="font-mono text-xs">{order.importBatchId}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reassign Dialog */}
      <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{order.driverId ? "改派司机" : "派单"}</DialogTitle>
            <DialogDescription>
              选择一位可用的司机来执行此订单
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="选择司机" />
              </SelectTrigger>
              <SelectContent>
                {drivers.filter(d => d.vehicleType === order.vehicleType).length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    没有符合车型要求的可用司机
                  </div>
                ) : (
                  drivers
                    .filter(d => d.vehicleType === order.vehicleType)
                    .map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} - {d.licensePlate} ({vehicleTypeLabels[d.vehicleType]})
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
            {drivers.filter(d => d.vehicleType === order.vehicleType).length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                提示：当前没有 {vehicleTypeLabels[order.vehicleType]} 类型的可用司机
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassignDialog(false)}>
              取消
            </Button>
            <Button onClick={handleReassign} disabled={!selectedDriverId}>
              确认{order.driverId ? "改派" : "派单"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>取消订单</DialogTitle>
            <DialogDescription>
              确定要取消此订单吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="请输入取消原因..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              返回
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason.trim()}>
              确认取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
