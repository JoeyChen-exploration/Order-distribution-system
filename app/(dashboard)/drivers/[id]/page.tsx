'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { getDriverById, updateDriver, getOrders } from '@/lib/store'
import type { Driver, VehicleType, DriverStatus, Order } from '@/lib/types'
import { VEHICLE_TYPE_LABELS, DRIVER_STATUS_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ArrowLeft, Save, Phone, Car, MapPin, ClipboardList } from 'lucide-react'

export default function DriverDetailPage() {
  const router = useRouter()
  const params = useParams()
  const driverId = params.id as string

  const [driver, setDriver] = useState<Driver | null>(null)
  const [driverOrders, setDriverOrders] = useState<Order[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    vehicleType: '舒适型' as VehicleType,
    vehiclePlate: '',
    homeAddress: '',
    dailyOrderLimit: 8,
    status: 'available' as DriverStatus,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    async function load() {
      const [data, allOrders] = await Promise.all([getDriverById(driverId), getOrders()])
      if (data) {
        setDriver(data)
        setFormData({
          name: data.name,
          phone: data.phone,
          vehicleType: data.vehicleType,
          vehiclePlate: data.vehiclePlate,
          homeAddress: data.homeAddress,
          dailyOrderLimit: data.dailyOrderLimit,
          status: data.status,
        })
      }
      setDriverOrders(allOrders.filter(o => o.driverId === driverId))
    }
    load()
  }, [driverId])

  // 初始化高德地图
  useEffect(() => {
    if (!driver || !mapRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AMap = (window as any).AMap
    if (!AMap) return

    const lng = driver.currentLng || driver.homeLng || 121.4737
    const lat = driver.currentLat || driver.homeLat || 31.2304

    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy()
    }

    const map = new AMap.Map(mapRef.current, {
      zoom: 14,
      center: [lng, lat],
      mapStyle: 'amap://styles/dark',
    })
    mapInstanceRef.current = map

    new AMap.Marker({
      position: new AMap.LngLat(lng, lat),
      title: driver.name,
      map,
    })

    return () => {
      map.destroy()
      mapInstanceRef.current = null
    }
  }, [driver])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = '请输入司机姓名'
    }

    if (!formData.phone.trim()) {
      newErrors.phone = '请输入手机号'
    } else if (!/^1\d{10}$/.test(formData.phone)) {
      newErrors.phone = '请输入正确的11位手机号'
    }

    if (!formData.vehiclePlate.trim()) {
      newErrors.vehiclePlate = '请输入车牌号'
    }

    if (!formData.homeAddress.trim()) {
      newErrors.homeAddress = '请输入常驻地址'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)

    try {
      await updateDriver(driverId, {
        name: formData.name,
        phone: formData.phone,
        vehicleType: formData.vehicleType,
        vehiclePlate: formData.vehiclePlate.toUpperCase(),
        homeAddress: formData.homeAddress,
        dailyOrderLimit: formData.dailyOrderLimit,
        status: formData.status,
      })

      const updated = await getDriverById(driverId)
      if (updated) {
        setDriver(updated)
      }
      setIsEditing(false)
    } catch (error) {
      console.error('更新司机失败:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!driver) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回司机列表
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{driver.name}</h1>
            <p className="text-muted-foreground">司机详情与编辑</p>
          </div>
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)}>编辑信息</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 主要信息 */}
        <div className="lg:col-span-2">
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>
                {isEditing ? '编辑司机信息' : '查看司机档案'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form onSubmit={handleSubmit}>
                  <FieldGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="name">姓名 *</FieldLabel>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        />
                        {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="phone">手机号 *</FieldLabel>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        />
                        {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone}</p>}
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="vehicleType">车辆类型 *</FieldLabel>
                        <Select
                          value={formData.vehicleType}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, vehicleType: value as VehicleType }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="vehiclePlate">车牌号 *</FieldLabel>
                        <Input
                          id="vehiclePlate"
                          value={formData.vehiclePlate}
                          onChange={e => setFormData(prev => ({ ...prev, vehiclePlate: e.target.value }))}
                        />
                        {errors.vehiclePlate && <p className="text-sm text-destructive mt-1">{errors.vehiclePlate}</p>}
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="homeAddress">常驻地址 *</FieldLabel>
                      <Input
                        id="homeAddress"
                        value={formData.homeAddress}
                        onChange={e => setFormData(prev => ({ ...prev, homeAddress: e.target.value }))}
                      />
                      {errors.homeAddress && <p className="text-sm text-destructive mt-1">{errors.homeAddress}</p>}
                    </Field>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="dailyOrderLimit">每日接单上限</FieldLabel>
                        <Input
                          id="dailyOrderLimit"
                          type="number"
                          min={1}
                          max={20}
                          value={formData.dailyOrderLimit}
                          onChange={e => setFormData(prev => ({ ...prev, dailyOrderLimit: parseInt(e.target.value) || 8 }))}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="status">当前状态</FieldLabel>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as DriverStatus }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(DRIVER_STATUS_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  </FieldGroup>

                  <div className="flex items-center gap-4 mt-6 pt-6 border-t border-border/50">
                    <Button type="submit" disabled={isSubmitting}>
                      <Save className="w-4 h-4 mr-2" />
                      {isSubmitting ? '保存中...' : '保存'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false)
                        setFormData({
                          name: driver.name,
                          phone: driver.phone,
                          vehicleType: driver.vehicleType,
                          vehiclePlate: driver.vehiclePlate,
                          homeAddress: driver.homeAddress,
                          dailyOrderLimit: driver.dailyOrderLimit,
                          status: driver.status,
                        })
                      }}
                    >
                      取消
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-start gap-3">
                      <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">联系电话</p>
                        <p className="text-foreground">{driver.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Car className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">车辆信息</p>
                        <p className="text-foreground">{driver.vehiclePlate} · {VEHICLE_TYPE_LABELS[driver.vehicleType]}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 md:col-span-2">
                      <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">常驻地址</p>
                        <p className="text-foreground">{driver.homeAddress}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 历史订单 */}
          <Card className="border-border/50 bg-card/50 mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                历史订单
              </CardTitle>
              <CardDescription>该司机的接单记录</CardDescription>
            </CardHeader>
            <CardContent>
              {driverOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">订单号</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">乘客</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">接车时间</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverOrders.map(order => (
                        <tr key={order.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 text-sm font-mono text-foreground">{order.orderNo}</td>
                          <td className="py-3 px-4 text-sm text-foreground">{order.passengerName}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {new Date(order.pickupTime).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                              ORDER_STATUS_COLORS[order.status]
                            )}>
                              {ORDER_STATUS_LABELS[order.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">暂无订单记录</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 侧边栏 */}
        <div className="space-y-6">
          {/* 状态卡片 */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>工作状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">当前状态</p>
                <span className={cn(
                  'inline-flex items-center px-3 py-1.5 rounded text-sm font-medium border',
                  driver.status === 'available' && 'bg-green-500/20 text-green-400 border-green-500/30',
                  driver.status === 'busy' && 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                  driver.status === 'off_duty' && 'bg-gray-500/20 text-gray-400 border-gray-500/30',
                  driver.status === 'on_leave' && 'bg-red-500/20 text-red-400 border-red-500/30',
                )}>
                  {DRIVER_STATUS_LABELS[driver.status]}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">今日工作量</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${(driver.dailyOrderCount / driver.dailyOrderLimit) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {driver.dailyOrderCount}/{driver.dailyOrderLimit}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 位置信息 */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>位置信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={mapRef}
                className="w-full rounded-lg overflow-hidden border border-border/50"
                style={{ height: 240 }}
              />
              <p className="text-xs text-muted-foreground mt-2">
                {driver.currentLat && driver.currentLng
                  ? `实时位置: ${driver.currentLat.toFixed(4)}, ${driver.currentLng.toFixed(4)}`
                  : `常驻地址: ${driver.homeAddress || '未设置'}`}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
