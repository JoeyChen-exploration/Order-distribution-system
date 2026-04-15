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
import type { Driver, VehicleType, DriverStatus } from '@/lib/types'
import { VEHICLE_TYPE_OPTIONS } from '@/lib/types'
import { ArrowLeft, Save, MapPin, Loader2 } from 'lucide-react'

// 每 30 分钟一个选项，共 48 个时间点
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const city = address.match(/^[\u4e00-\u9fa5]{2,4}(?:市|省|区|县)/)?.[0]?.replace(/省|区|县/, "市") ?? "上海"
    const res = await fetch(
      `/api/geocode?address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`
    )
    const data = await res.json()
    if (data.lat && data.lng) return { lat: data.lat as number, lng: data.lng as number }
  } catch {}
  return null
}

export default function CreateDriverPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    vehicleType: '舒适型' as VehicleType,
    vehiclePlate: '',
    homeAddress: '',
    homeLat: 0,
    homeLng: 0,
    status: 'available' as DriverStatus,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [workStart, setWorkStart] = useState('')
  const [workEnd, setWorkEnd] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeStatus, setGeocodeStatus] = useState<'idle' | 'ok' | 'fail'>('idle')

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

  const handleAddressBlur = async () => {
    const addr = formData.homeAddress.trim()
    if (!addr) return
    setGeocoding(true)
    setGeocodeStatus('idle')
    const result = await geocodeAddress(addr)
    if (result) {
      setFormData(prev => ({ ...prev, homeLat: result.lat, homeLng: result.lng }))
      setGeocodeStatus('ok')
    } else {
      setGeocodeStatus('fail')
    }
    setGeocoding(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)
    setSubmitError('')

    try {
      const workingHours = workStart && workEnd ? `${workStart}-${workEnd}` : undefined
      const res = await createDriver({
        name: formData.name,
        phone: formData.phone,
        vehicleType: formData.vehicleType,
        vehiclePlate: formData.vehiclePlate.toUpperCase(),
        homeAddress: formData.homeAddress,
        homeLat: formData.homeLat,
        homeLng: formData.homeLng,
        workingHours,
        status: formData.status,
        dailyOrderCount: 0,
        currentLat: formData.homeLat,
        currentLng: formData.homeLng,
      }) as Driver & { error?: string }

      if (res?.error) {
        if (res.error.includes('vehiclePlate')) {
          // 查出已登记该车牌的司机
          const plate = formData.vehiclePlate.toUpperCase()
          const all = await fetch('/api/drivers').then(r => r.json()).catch(() => [])
          const found = Array.isArray(all) ? all.find((d: { vehiclePlate: string; name: string; phone: string }) => d.vehiclePlate === plate) : null
          setSubmitError(found
            ? `车牌号 ${plate} 已被「${found.name}」（${found.phone}）登记，请核实后填写正确车牌`
            : `车牌号 ${plate} 已被登记，请检查`)
        } else if (res.error.includes('phone')) {
          setSubmitError(`手机号 ${formData.phone} 已被其他司机登记，请核实`)
        } else {
          setSubmitError(`保存失败：${res.error}`)
        }
        return
      }

      router.push('/drivers')
    } catch (error) {
      setSubmitError(`保存失败：${String(error)}`)
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
                      {VEHICLE_TYPE_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>工作时间</FieldLabel>
                  <div className="flex items-center gap-2 mt-1">
                    <Select value={workStart} onValueChange={setWorkStart}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="开始" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIME_OPTIONS.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-sm shrink-0">—</span>
                    <Select value={workEnd} onValueChange={setWorkEnd}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="结束" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIME_OPTIONS.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {workStart && workEnd && (
                    <p className="text-xs text-green-400 mt-1">
                      {workStart}-{workEnd}{workStart > workEnd ? '（跨午夜）' : ''}
                    </p>
                  )}
                  {!workStart && !workEnd && (
                    <p className="text-xs text-muted-foreground mt-1">不选则不限工作时间</p>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="status">初始状态</FieldLabel>
                  <Select
                    value={formData.status}
                    onValueChange={v => setFormData(prev => ({ ...prev, status: v as DriverStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">在岗</SelectItem>
                      <SelectItem value="busy">忙碌</SelectItem>
                      <SelectItem value="off_duty">下线</SelectItem>
                      <SelectItem value="on_leave">请假</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="homeAddress">常驻地址 *</FieldLabel>
                <div className="relative">
                  <Input
                    id="homeAddress"
                    value={formData.homeAddress}
                    onChange={e => { setFormData(prev => ({ ...prev, homeAddress: e.target.value })); setGeocodeStatus('idle') }}
                    onBlur={handleAddressBlur}
                    placeholder="请输入司机常驻地址，失去焦点后自动解析坐标"
                  />
                  {geocoding && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  )}
                </div>
                {geocodeStatus === 'ok' && (
                  <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />坐标解析成功（{formData.homeLat.toFixed(4)}, {formData.homeLng.toFixed(4)}）
                  </p>
                )}
                {geocodeStatus === 'fail' && (
                  <p className="text-xs text-orange-400 mt-1">⚠ 坐标解析失败，地址将以 0,0 存储（影响距离评分），建议检查地址后重新输入</p>
                )}
                {errors.homeAddress && <p className="text-sm text-destructive mt-1">{errors.homeAddress}</p>}
              </Field>

            </FieldGroup>

            {submitError && (
              <p className="mt-4 text-sm text-destructive rounded border border-destructive/40 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}

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
