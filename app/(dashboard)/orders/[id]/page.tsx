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
  FileText,
  RefreshCw,
  X,
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
import { getOrderById, getDrivers, updateOrder, updateDriver } from "@/lib/store"
import type { Order, Driver, OrderStatus } from "@/lib/types"
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, VEHICLE_TYPE_LABELS } from "@/lib/types"
import { cn } from "@/lib/utils"

const statusVariant: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  0: "secondary",
  1: "default",
  2: "default",
  3: "outline",
  4: "destructive",
  5: "outline",
}

const statusFlow: OrderStatus[] = [0, 1, 2, 3]

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([])
  const [showReassignDialog, setShowReassignDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState("")
  const [cancelReason, setCancelReason] = useState("")

  const loadData = async () => {
    const [orderData, allDrivers] = await Promise.all([getOrderById(id), getDrivers()])
    if (orderData) {
      setOrder(orderData)
      if (orderData.driverId) {
        setDriver(allDrivers.find(d => d.id === orderData.driverId) || null)
      }
    }
    setAvailableDrivers(allDrivers.filter(d => d.status === "available"))
  }

  useEffect(() => { loadData() }, [id])

  if (!order) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">订单不存在</p>
      </div>
    )
  }

  const handleReassign = async () => {
    if (!selectedDriverId) return
    if (order.driverId) {
      await updateDriver(order.driverId, { status: "available" })
    }
    await updateDriver(selectedDriverId, { status: "busy" })
    await updateOrder(order.id, {
      driverId: selectedDriverId,
      status: order.status === 0 ? 1 : order.status,
    })
    await loadData()
    setShowReassignDialog(false)
    setSelectedDriverId("")
  }

  const handleCancel = async () => {
    if (order.driverId) {
      await updateDriver(order.driverId, { status: "available" })
    }
    await updateOrder(order.id, {
      status: 4,
      cancelReason,
      cancelTime: new Date().toISOString(),
    })
    await loadData()
    setShowCancelDialog(false)
    setCancelReason("")
  }

  const currentStatusIndex = statusFlow.indexOf(order.status)
  const canModify = order.status !== 3 && order.status !== 4 && order.status !== 5

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{order.orderNo}</h1>
              <Badge variant={statusVariant[order.status]}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
              {order.isEmergency && <Badge variant="destructive">紧急</Badge>}
            </div>
            <p className="text-muted-foreground">
              {order.flightDate} {order.pickupTime} · 航班 {order.flightNo}
            </p>
          </div>
        </div>
        {canModify && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowReassignDialog(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {order.driverId ? "改派司机" : "派单"}
            </Button>
            <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
              <X className="mr-2 h-4 w-4" />
              取消订单
            </Button>
          </div>
        )}
      </div>

      {/* Status Timeline */}
      {order.status !== 4 && order.status !== 5 && (
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                        isCurrent
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                          : isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      {index < statusFlow.length - 1 && (
                        <div className={`flex-1 h-0.5 ${index < currentStatusIndex ? "bg-primary" : "bg-muted"}`} />
                      )}
                    </div>
                    <span className={`mt-2 text-xs ${isCurrent ? "font-medium text-primary" : "text-muted-foreground"}`}>
                      {ORDER_STATUS_LABELS[status]}
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
                <p className="text-sm text-muted-foreground">航班号</p>
                <p className="font-medium flex items-center gap-1">
                  <Plane className="h-4 w-4" />
                  {order.flightNo}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">接车时间</p>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {order.flightDate} {order.pickupTime}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">车型要求</p>
                <p className="font-medium flex items-center gap-1">
                  <Car className="h-4 w-4" />
                  {VEHICLE_TYPE_LABELS[order.reqVehicleType]}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">接车地点</p>
                <p className="font-medium flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  {order.pickupAddress}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">目的地</p>
                <p className="font-medium flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  {order.dropoffAddress}
                </p>
              </div>
            </div>

            {order.cancelReason && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">取消原因</p>
                  <p className="text-sm text-destructive">{order.cancelReason}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Passenger & Driver */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                乘客信息
              </CardTitle>
            </CardHeader>
            <CardContent>
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
              <CardDescription>{driver ? "已分配司机" : "暂未分配司机"}</CardDescription>
            </CardHeader>
            <CardContent>
              {driver ? (
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
                    <p className="text-sm text-muted-foreground">
                      {driver.vehiclePlate} · {VEHICLE_TYPE_LABELS[driver.vehicleType]}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Car className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground mb-4">暂未分配司机</p>
                  {canModify && (
                    <Button onClick={() => setShowReassignDialog(true)}>立即派单</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                操作记录
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
            <DialogDescription>选择一位可用的司机</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="选择司机" />
              </SelectTrigger>
              <SelectContent>
                {availableDrivers.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">暂无可用司机</div>
                ) : (
                  availableDrivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} · {d.vehiclePlate} ({VEHICLE_TYPE_LABELS[d.vehicleType]})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassignDialog(false)}>取消</Button>
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
            <DialogDescription>确定要取消此订单吗？此操作不可撤销。</DialogDescription>
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
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>返回</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason.trim()}>
              确认取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
