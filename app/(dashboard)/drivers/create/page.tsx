'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { createDriver } from '@/lib/store'
import type { VehicleType, DriverStatus } from '@/lib/types'
import { VEHICLE_TYPE_LABELS } from '@/lib/types'
import { ArrowLeft, Save } from 'lucide-react'

export default function CreateDriverPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    vehicleType: '舒适型' as VehicleType,
    vehiclePlate: '',
    homeAddress: '',
    homeLat: 39.9042,
    homeLng: 116.4074,
    dailyOrderLimit: 8,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

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
      createDriver({
        name: formData.name,
        phone: formData.phone,
        vehicleType: formData.vehicleType,
        vehiclePlate: formData.vehiclePlate.toUpperCase(),
        homeAddress: formData.homeAddress,
        homeLat: formData.homeLat,
        homeLng: formData.homeLng,
        status: 'available' as DriverStatus,
        dailyOrderCount: 0,
        dailyOrderLimit: formData.dailyOrderLimit,
        currentLat: formData.homeLat,
        currentLng: formData.homeLng,
      })

      router.push('/drivers')
    } catch (error) {
      console.error('创建司机失败:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回司机列表
        </Link>
        <h1 className="text-2xl font-bold text-foreground">新增司机</h1>
        <p className="text-muted-foreground">录入司机基本信息</p>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>司机信息</CardTitle>
          <CardDescription>请填写司机的基本信息和车辆信息</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="name">姓名 *</FieldLabel>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="请输入司机姓名"
                  />
                  {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="phone">手机号 *</FieldLabel>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="请输入11位手机号"
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
                      <SelectValue placeholder="选择车辆类型" />
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
                    placeholder="例如：京A12345"
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
                  placeholder="请输入司机常驻地址"
                />
                {errors.homeAddress && <p className="text-sm text-destructive mt-1">{errors.homeAddress}</p>}
              </Field>

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
                <p className="text-xs text-muted-foreground mt-1">建议设置为 8 单/天</p>
              </Field>
            </FieldGroup>

            <div className="flex items-center gap-4 mt-6 pt-6 border-t border-border/50">
              <Button type="submit" disabled={isSubmitting}>
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? '保存中...' : '保存'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                取消
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
