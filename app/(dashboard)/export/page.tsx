"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Download,
  FileSpreadsheet,
  Calendar,
  Users,
  Plane,
  BarChart3,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { getOrders, getDrivers } from "@/lib/store"
import { exportOrdersToCSV, exportBillingReport, exportDriversToCSV } from "@/lib/export-utils"
import type { Order, Driver, OrderStatus } from "@/lib/types"
import { ORDER_STATUS_LABELS } from "@/lib/types"

export default function ExportPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  
  // Order export options
  const [orderDateStart, setOrderDateStart] = useState("")
  const [orderDateEnd, setOrderDateEnd] = useState("")
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all")
  const [includeDriverInfo, setIncludeDriverInfo] = useState(true)
  
  // Billing report options
  const [billingDateStart, setBillingDateStart] = useState("")
  const [billingDateEnd, setBillingDateEnd] = useState("")
  
  useEffect(() => {
    async function load() {
      const [orderData, driverData] = await Promise.all([getOrders(), getDrivers()])
      setOrders(orderData)
      setDrivers(driverData)
    }
    load()

    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const formatDate = (d: Date) => d.toISOString().split("T")[0]
    setOrderDateStart(formatDate(firstDay))
    setOrderDateEnd(formatDate(lastDay))
    setBillingDateStart(formatDate(firstDay))
    setBillingDateEnd(formatDate(lastDay))
  }, [])
  
  const filteredOrdersPreview = useMemo(() => {
    let filtered = orders
    if (orderDateStart && orderDateEnd) {
      filtered = filtered.filter(o =>
        o.flightDate >= orderDateStart && o.flightDate <= orderDateEnd
      )
    }
    if (orderStatusFilter !== "all") {
      filtered = filtered.filter(o => o.status === Number(orderStatusFilter))
    }
    return filtered
  }, [orders, orderDateStart, orderDateEnd, orderStatusFilter])

  const billingPreview = useMemo(() => {
    const completedOrders = orders.filter(
      o => o.status === 3 &&
        o.flightDate >= billingDateStart &&
        o.flightDate <= billingDateEnd
    )
    const driverCount = new Set(completedOrders.map(o => o.driverId).filter(Boolean)).size
    return {
      orderCount: completedOrders.length,
      driverCount,
      pickupCount: 0,
      dropoffCount: 0,
    }
  }, [orders, billingDateStart, billingDateEnd])
  
  const handleExportOrders = () => {
    let filtered = orders
    
    if (orderStatusFilter !== "all") {
      filtered = filtered.filter(o => o.status === orderStatusFilter)
    }
    
    exportOrdersToCSV(filtered, drivers, {
      includeDriverInfo,
      dateRange: orderDateStart && orderDateEnd 
        ? { start: orderDateStart, end: orderDateEnd }
        : undefined,
    })
  }
  
  const handleExportBilling = () => {
    if (!billingDateStart || !billingDateEnd) return
    
    exportBillingReport(orders, drivers, {
      start: billingDateStart,
      end: billingDateEnd,
    })
  }
  
  const handleExportDrivers = () => {
    exportDriversToCSV(drivers)
  }
  
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">数据导出</h1>
        <p className="text-muted-foreground">导出订单、司机和账单数据为 Excel/CSV 格式</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        {/* Order Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane className="h-5 w-5" />
              订单数据导出
            </CardTitle>
            <CardDescription>
              导出订单列表，可按日期和状态筛选
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>开始日期</FieldLabel>
                  <Input
                    type="date"
                    value={orderDateStart}
                    onChange={(e) => setOrderDateStart(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>结束日期</FieldLabel>
                  <Input
                    type="date"
                    value={orderDateEnd}
                    onChange={(e) => setOrderDateEnd(e.target.value)}
                  />
                </Field>
              </div>
              
              <Field>
                <FieldLabel>订单状态</FieldLabel>
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-driver"
                  checked={includeDriverInfo}
                  onCheckedChange={(checked) => setIncludeDriverInfo(checked as boolean)}
                />
                <label htmlFor="include-driver" className="text-sm">
                  包含司机信息
                </label>
              </div>
              
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-muted-foreground">
                    预览：共 <span className="font-medium text-foreground">{filteredOrdersPreview.length}</span> 条订单
                  </div>
                </div>
                <Button onClick={handleExportOrders} className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  导出订单 CSV
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
        
        {/* Billing Report */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              账单报表导出
            </CardTitle>
            <CardDescription>
              按司机统计已完成订单数，用于结算
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>开始日期</FieldLabel>
                  <Input
                    type="date"
                    value={billingDateStart}
                    onChange={(e) => setBillingDateStart(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>结束日期</FieldLabel>
                  <Input
                    type="date"
                    value={billingDateEnd}
                    onChange={(e) => setBillingDateEnd(e.target.value)}
                  />
                </Field>
              </div>
              
              <div className="pt-4 border-t">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">已完成订单</p>
                    <p className="text-lg font-semibold">{billingPreview.orderCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">涉及司机</p>
                    <p className="text-lg font-semibold">{billingPreview.driverCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">接机订单</p>
                    <p className="text-lg font-semibold">{billingPreview.pickupCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">送机订单</p>
                    <p className="text-lg font-semibold">{billingPreview.dropoffCount}</p>
                  </div>
                </div>
                <Button 
                  onClick={handleExportBilling} 
                  className="w-full"
                  disabled={billingPreview.orderCount === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  导出账单报表
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
        
        {/* Driver Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              司机名册导出
            </CardTitle>
            <CardDescription>
              导出所有司机的基本信息和车辆信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                共 <span className="font-medium text-foreground">{drivers.length}</span> 名司机
              </div>
            </div>
            <Button onClick={handleExportDrivers} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              导出司机名册
            </Button>
          </CardContent>
        </Card>
        
        {/* Quick Tips */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              导出说明
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p>导出文件为 CSV 格式，可用 Excel 或 WPS 打开</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p>文件编码为 UTF-8，中文字符可正常显示</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p>账单报表仅统计"已完成"状态的订单</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p>日期筛选基于服务日期，而非创建日期</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
