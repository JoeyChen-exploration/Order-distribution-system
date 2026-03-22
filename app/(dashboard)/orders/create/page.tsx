"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { createOrder } from "@/lib/store"
import type { VehicleType } from "@/lib/types"

export default function CreateOrderPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [charterHours, setCharterHours] = useState<4 | 8>(4)
  const [formData, setFormData] = useState({
    passengerName: "",
    passengerPhone: "",
    serviceType: "",
    serviceDate: "",
    serviceTime: "",
    pickupLocation: "",
    dropoffLocation: "",
    vehicleType: "" as VehicleType | "",
    flightNumber: "",
    passengerCount: "1",
    notes: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.passengerName.trim()) {
      newErrors.passengerName = "请输入乘客姓名"
    }
    
    if (!formData.passengerPhone.trim()) {
      newErrors.passengerPhone = "请输入联系电话"
    } else if (!/^1[3-9]\d{9}$/.test(formData.passengerPhone)) {
      newErrors.passengerPhone = "手机号格式不正确"
    }
    
    if (!formData.serviceType) {
      newErrors.serviceType = "请选择服务类型"
    }
    
    if (!formData.serviceDate) {
      newErrors.serviceDate = "请选择服务日期"
    }
    
    if (!formData.serviceTime) {
      newErrors.serviceTime = "请选择服务时间"
    }
    
    if (!formData.pickupLocation.trim()) {
      newErrors.pickupLocation = "请输入上车地点"
    }
    
    if (!formData.dropoffLocation.trim()) {
      newErrors.dropoffLocation = "请输入下车地点"
    }
    
    if (!formData.vehicleType) {
      newErrors.vehicleType = "请选择车型"
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) return
    
    setIsSubmitting(true)
    
    try {
      const meta: Record<string, string> = {}
      if (formData.serviceType) meta["服务类型"] = formData.serviceType
      if (formData.serviceType === "包车") meta["包车时长"] = String(charterHours)
      if (formData.passengerCount) meta["passengerCount"] = formData.passengerCount
      if (formData.notes) meta["remarks"] = formData.notes

      await createOrder({
        orderNo: `MAN-${Date.now()}`,
        passengerName: formData.passengerName,
        passengerPhone: formData.passengerPhone,
        flightNo: formData.flightNumber || "",
        flightDate: formData.serviceDate,
        pickupTime: formData.serviceTime,
        pickupAddress: formData.pickupLocation,
        pickupLat: 0, pickupLng: 0,
        dropoffAddress: formData.dropoffLocation,
        dropoffLat: 0, dropoffLng: 0,
        reqVehicleType: (formData.vehicleType || "舒适型") as VehicleType,
        status: 0,
        isEmergency: false,
        importBatchId: null,
        metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : undefined,
      })
      
      router.push("/orders")
    } catch (error) {
      console.error("Failed to create order:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">新建订单</h1>
          <p className="text-muted-foreground">手动创建接送机订单</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">
          {/* Passenger Info */}
          <Card>
            <CardHeader>
              <CardTitle>乘客信息</CardTitle>
              <CardDescription>填写乘客的基本联系信息</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>乘客姓名 *</FieldLabel>
                    <Input
                      placeholder="请输入乘客姓名"
                      value={formData.passengerName}
                      onChange={(e) => updateField("passengerName", e.target.value)}
                      className={errors.passengerName ? "border-destructive" : ""}
                    />
                    {errors.passengerName && (
                      <p className="text-xs text-destructive">{errors.passengerName}</p>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>联系电话 *</FieldLabel>
                    <Input
                      placeholder="请输入手机号"
                      value={formData.passengerPhone}
                      onChange={(e) => updateField("passengerPhone", e.target.value)}
                      className={errors.passengerPhone ? "border-destructive" : ""}
                    />
                    {errors.passengerPhone && (
                      <p className="text-xs text-destructive">{errors.passengerPhone}</p>
                    )}
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>乘客人数</FieldLabel>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={formData.passengerCount}
                      onChange={(e) => updateField("passengerCount", e.target.value)}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Service Info */}
          <Card>
            <CardHeader>
              <CardTitle>服务信息</CardTitle>
              <CardDescription>选择服务类型和时间</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>服务类型 *</FieldLabel>
                    <Select
                      value={formData.serviceType}
                      onValueChange={(value) => updateField("serviceType", value)}
                    >
                      <SelectTrigger className={errors.serviceType ? "border-destructive" : ""}>
                        <SelectValue placeholder="选择服务类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="接机/站">接机/站</SelectItem>
                        <SelectItem value="送机/站">送机/站</SelectItem>
                        <SelectItem value="包车">包车</SelectItem>
                        <SelectItem value="市内约车">市内约车</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.serviceType && (
                      <p className="text-xs text-destructive">{errors.serviceType}</p>
                    )}
                    {formData.serviceType === "包车" && (
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">包车时长：</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCharterHours(4)}
                            className={`text-xs px-3 py-1.5 rounded border transition-colors ${charterHours === 4 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                          >
                            4 小时
                          </button>
                          <button
                            type="button"
                            onClick={() => setCharterHours(8)}
                            className={`text-xs px-3 py-1.5 rounded border transition-colors ${charterHours === 8 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                          >
                            8 小时
                          </button>
                        </div>
                      </div>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>航班号</FieldLabel>
                    <Input
                      placeholder="例如 CA1234"
                      value={formData.flightNumber}
                      onChange={(e) => updateField("flightNumber", e.target.value.toUpperCase())}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>服务日期 *</FieldLabel>
                    <Input
                      type="date"
                      value={formData.serviceDate}
                      onChange={(e) => updateField("serviceDate", e.target.value)}
                      className={errors.serviceDate ? "border-destructive" : ""}
                    />
                    {errors.serviceDate && (
                      <p className="text-xs text-destructive">{errors.serviceDate}</p>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>服务时间 *</FieldLabel>
                    <Input
                      type="time"
                      value={formData.serviceTime}
                      onChange={(e) => updateField("serviceTime", e.target.value)}
                      className={errors.serviceTime ? "border-destructive" : ""}
                    />
                    {errors.serviceTime && (
                      <p className="text-xs text-destructive">{errors.serviceTime}</p>
                    )}
                  </Field>
                </div>
                <Field>
                  <FieldLabel>车型要求 *</FieldLabel>
                  <Select
                    value={formData.vehicleType}
                    onValueChange={(value) => updateField("vehicleType", value)}
                  >
                    <SelectTrigger className={errors.vehicleType ? "border-destructive" : ""}>
                      <SelectValue placeholder="选择车型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="舒适型">舒适型</SelectItem>
                      <SelectItem value="豪华型">豪华型</SelectItem>
                      <SelectItem value="商务型">商务型</SelectItem>
                      <SelectItem value="经济型">经济型</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.vehicleType && (
                    <p className="text-xs text-destructive">{errors.vehicleType}</p>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Location Info */}
          <Card>
            <CardHeader>
              <CardTitle>地点信息</CardTitle>
              <CardDescription>填写上下车地点</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>上车地点 *</FieldLabel>
                  <Input
                    placeholder="请输入详细的上车地点"
                    value={formData.pickupLocation}
                    onChange={(e) => updateField("pickupLocation", e.target.value)}
                    className={errors.pickupLocation ? "border-destructive" : ""}
                  />
                  {errors.pickupLocation && (
                    <p className="text-xs text-destructive">{errors.pickupLocation}</p>
                  )}
                </Field>
                <Field>
                  <FieldLabel>下车地点 *</FieldLabel>
                  <Input
                    placeholder="请输入详细的下车地点"
                    value={formData.dropoffLocation}
                    onChange={(e) => updateField("dropoffLocation", e.target.value)}
                    className={errors.dropoffLocation ? "border-destructive" : ""}
                  />
                  {errors.dropoffLocation && (
                    <p className="text-xs text-destructive">{errors.dropoffLocation}</p>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card>
            <CardHeader>
              <CardTitle>其他信息</CardTitle>
              <CardDescription>选填项</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>备注</FieldLabel>
                  <Textarea
                    placeholder="其他需要说明的事项..."
                    value={formData.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    rows={3}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建订单
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
