"use client"

import { useState, useCallback, useRef } from "react"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { createOrder } from "@/lib/store"

// ─── 常量 ────────────────────────────────────────────────────────────────────

const AMAP_KEY = "4751969b1d68252aa828223bf04c3e3a"

const FIELD_MAP: Record<string, string> = {
  "订单号": "orderNo", "预订车型": "reqVehicleType",
  "服务城市": "serviceCity", "服务日期": "flightDate",
  "三字码": "airportCode", "人数": "passengerCount",
  "下单时间": "submittedAt", "航班号": "flightNo",
  "上车点": "pickupAddress", "下车点": "dropoffAddress",
  "车号": "vehiclePlate", "司机": "driverName",
  "司机电话": "driverPhone", "司机分组": "driverGroup",
  "实际车型": "actualVehicleType", "架次": "tripNo",
  "公里数": "kilometers", "货币": "currency",
  "超公里费": "extraKmFee", "夜间服务费": "nightFee",
  "婴儿床费用": "babyBedFee", "儿童座椅费用": "childSeatFee",
  "单程费": "singleTripFee", "举牌费": "signFee",
  "举牌服务": "signService", "上下车点": "pickupDropoffPoint",
  "节假日调价": "holidayAdjustment", "自主调价": "selfAdjustment",
  "供应商订单": "supplierOrderNo", "服务标准": "serviceStandard",
  "单程服务": "singleService", "备注": "remarks",
}

const VEHICLE_MAP: Record<string, string> = {
  "舒适型": "舒适型", "豪华型": "豪华型", "商务型": "商务型", "经济型": "经济型",
}

const CORE_FIELDS = new Set([
  "orderNo", "reqVehicleType", "flightDate", "flightNo",
  "pickupAddress", "dropoffAddress", "driverName",
  "passengerName", "passengerPhone", "pickupTime", "isEmergency",
])

// ─── 工具函数 ────────────────────────────────────────────────────────────────

// 常见英文地址别名 → 中文（高德只支持中文地址）
const ADDR_ALIAS: Record<string, string> = {
  "pudong international airport": "上海浦东国际机场",
  "pudong airport": "上海浦东国际机场",
  "shanghai pudong airport": "上海浦东国际机场",
  "pvg airport": "上海浦东国际机场",
  "hongqiao international airport": "上海虹桥国际机场",
  "hongqiao airport": "上海虹桥国际机场",
  "shanghai hongqiao airport": "上海虹桥国际机场",
  "sha airport": "上海虹桥国际机场",
  "shanghai railway station": "上海火车站",
  "shanghai south railway station": "上海南站",
  "shanghai hongqiao railway station": "上海虹桥站",
}

async function tryGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${AMAP_KEY}&city=上海`
    )
    const data = await res.json()
    if (data.status === "1" && data.geocodes?.length > 0) {
      const [lng, lat] = data.geocodes[0].location.split(",").map(Number)
      return { lat, lng }
    }
  } catch {}
  return null
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  if (!address) return { lat: 0, lng: 0 }
  const lower = address.toLowerCase()

  // 1. 别名表匹配（英文地标快速映射）
  for (const [key, chinese] of Object.entries(ADDR_ALIAS)) {
    if (lower.includes(key)) {
      const r = await tryGeocode(chinese)
      if (r) return r
    }
  }

  // 2. 直接尝试完整地址
  const r1 = await tryGeocode(address)
  if (r1) return r1

  // 3. 回退：按逗号拆分，从最后一段往前试（最后一段通常是酒店/地标名）
  const parts = address.split(",").map(p => p.trim()).filter(p => p.length > 3)
  for (let i = parts.length - 1; i >= 0; i--) {
    const r = await tryGeocode(parts[i])
    if (r) return r
  }

  return { lat: 0, lng: 0 }
}

interface ParsedRow {
  rowIndex: number
  data: Record<string, string | number | boolean>
  errors: string[]
  isValid: boolean
}

function validateRow(data: Record<string, string | number | boolean>, rowIndex: number): ParsedRow {
  const errors: string[] = []
  if (!data.orderNo) errors.push("缺少订单号")
  if (!data.flightDate) errors.push("缺少服务日期")
  if (!data.pickupAddress) errors.push("缺少上车点")
  if (!data.dropoffAddress) errors.push("缺少下车点")
  if (!data.reqVehicleType) errors.push("缺少预订车型")
  if (data.flightDate && !/^\d{4}-\d{2}-\d{2}/.test(String(data.flightDate)))
    errors.push("服务日期格式不正确")
  if (data.reqVehicleType && !["舒适型", "豪华型", "商务型", "经济型"].includes(String(data.reqVehicleType)))
    errors.push(`车型无效："${data.reqVehicleType}"`)
  return { rowIndex, data, errors, isValid: errors.length === 0 }
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function OrderImportDialog({ open, onOpenChange, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const [result, setResult] = useState<{ success: number; failed: number; geoFailed: string[] } | null>(null)

  const reset = () => {
    setFile(null)
    setParsedRows([])
    setIsParsing(false)
    setIsImporting(false)
    setProgress(0)
    setProgressLabel("")
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleClose = () => {
    if (isImporting) return // 导入中不允许关闭
    reset()
    onOpenChange(false)
  }

  const processFile = useCallback(async (f: File) => {
    setIsParsing(true)
    setParsedRows([])
    setResult(null)
    try {
      const buffer = await f.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array", cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number | boolean | Date)[][]
      if (rows.length < 2) return

      const headers = rows[0].map(h => String(h).trim())
      const mappedHeaders = headers.map(h => FIELD_MAP[h] || h)
      const parsed: ParsedRow[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (row.every(cell => String(cell).trim() === "")) continue
        const data: Record<string, string | number | boolean> = {}
        mappedHeaders.forEach((header, idx) => {
          const raw = row[idx]
          let value: string
          if (raw instanceof Date) {
            const cst = new Date(raw.getTime() + 8 * 3600 * 1000)
            const pad = (n: number) => String(n).padStart(2, "0")
            value = `${cst.getUTCFullYear()}-${pad(cst.getUTCMonth() + 1)}-${pad(cst.getUTCDate())} ${pad(cst.getUTCHours())}:${pad(cst.getUTCMinutes())}`
          } else {
            value = String(raw ?? "").trim()
          }
          if (header === "reqVehicleType") value = VEHICLE_MAP[value] || value
          if (value) data[header] = value
        })
        if (data.flightDate) {
          const parts = String(data.flightDate).split(/[\sT]/)
          data.flightDate = parts[0]
          if (parts[1] && !data.pickupTime) data.pickupTime = parts[1].slice(0, 5)
        }
        parsed.push(validateRow(data, i))
      }
      setParsedRows(parsed)
    } finally {
      setIsParsing(false)
    }
  }, [])

  const handleFileSelect = (f: File) => {
    setFile(f)
    processFile(f)
  }

  const handleImport = async () => {
    const valid = parsedRows.filter(r => r.isValid)
    if (valid.length === 0) return
    setIsImporting(true)
    setProgress(0)
    let success = 0, failed = 0
    const geoFailed: string[] = []

    for (let i = 0; i < valid.length; i++) {
      setProgressLabel(`正在地理编码 ${i + 1} / ${valid.length}，请勿关闭…`)
      try {
        const d = valid[i].data
        const extra: Record<string, string> = {}
        for (const [k, v] of Object.entries(d)) {
          if (!CORE_FIELDS.has(k) && v !== "" && v !== undefined && v !== false)
            extra[k] = String(v)
        }
        const pickupAddr = String(d.pickupAddress || "")
        const dropoffAddr = String(d.dropoffAddress || "")
        const [pickupCoord, dropoffCoord] = await Promise.all([
          geocodeAddress(pickupAddr),
          geocodeAddress(dropoffAddr),
        ])
        const orderNo = String(d.orderNo || `IMP-${Date.now()}-${i}`)
        if (!pickupCoord.lat || !dropoffCoord.lat) {
          geoFailed.push(orderNo)
        }
        await createOrder({
          orderNo,
          passengerName: String(d.passengerName || ""),
          passengerPhone: String(d.passengerPhone || ""),
          flightNo: String(d.flightNo || ""),
          flightDate: String(d.flightDate || ""),
          pickupTime: String(d.pickupTime || ""),
          pickupAddress: pickupAddr,
          pickupLat: pickupCoord.lat, pickupLng: pickupCoord.lng,
          dropoffAddress: dropoffAddr,
          dropoffLat: dropoffCoord.lat, dropoffLng: dropoffCoord.lng,
          reqVehicleType: String(d.reqVehicleType || "舒适型") as "舒适型" | "豪华型" | "商务型" | "经济型",
          status: 0,
          driverName: d.driverName ? String(d.driverName) : undefined,
          isEmergency: Boolean(d.isEmergency),
          importBatchId: null,
          metadata: Object.keys(extra).length > 0 ? JSON.stringify(extra) : undefined,
        })
        success++
      } catch {
        failed++
      }
      setProgress(Math.round(((i + 1) / valid.length) * 100))
    }

    setProgressLabel("")
    setResult({ success, failed, geoFailed })
    setIsImporting(false)
    if (success > 0) onSuccess()
  }

  const validCount = parsedRows.filter(r => r.isValid).length
  const invalidCount = parsedRows.filter(r => !r.isValid).length

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose() }}>
      <DialogContent
        className="w-[90vw] max-w-5xl max-h-[85vh] flex flex-col"
        // 导入中禁止通过 Escape 或外部点击关闭
        onEscapeKeyDown={e => { if (isImporting) e.preventDefault() }}
        onPointerDownOutside={e => { if (isImporting) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle>导入订单</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* ── 导入中状态 ── */}
          {isImporting && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{progressLabel}</p>
              <div className="w-full max-w-sm">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-right text-muted-foreground mt-1">{progress}%</p>
              </div>
              <p className="text-xs text-muted-foreground/60">导入过程中请勿关闭或刷新页面</p>
            </div>
          )}

          {/* ── 完成状态 ── */}
          {!isImporting && result && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3 rounded-md bg-primary/10 border border-primary/20 p-4">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <p className="font-medium">导入完成</p>
                  <p className="text-sm text-muted-foreground">
                    成功 <strong>{result.success}</strong> 条
                    {result.failed > 0 && `，失败 ${result.failed} 条`}
                    {result.geoFailed.length > 0 && `，${result.geoFailed.length} 条坐标未能解析`}
                  </p>
                </div>
              </div>
              {result.geoFailed.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-3 space-y-2">
                  <p className="text-sm font-medium text-warning/90 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    以下订单地址无法被高德解析（可能为英文地址），距离评分将不准确：
                  </p>
                  <ul className="space-y-1 max-h-40 overflow-auto">
                    {result.geoFailed.map(no => (
                      <li key={no} className="text-xs font-mono text-warning/80">{no}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">建议手动派单，或将地址改为中文后重新导入</p>
                </div>
              )}
            </div>
          )}

          {/* ── 文件选择 + 预览 ── */}
          {!isImporting && !result && (
            <>
              {/* 拖放区 */}
              <div
                className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
                onDragOver={e => e.preventDefault()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    <span className="font-medium text-sm">{file.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); setFile(null); setParsedRows([]) }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">点击或拖拽 CSV / XLSX 文件到此处</p>
                  </>
                )}
              </div>

              {/* 解析中 */}
              {isParsing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在解析文件…
                </div>
              )}

              {/* 预览表格 */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">共 {parsedRows.length} 条，</span>
                    <span className="text-primary">{validCount} 条有效</span>
                    {invalidCount > 0 && <span className="text-destructive">{invalidCount} 条有错误</span>}
                  </div>
                  <div className="rounded-md border overflow-y-auto max-h-[280px]">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[40px]">行</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[28px]"></th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">订单号</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">车型</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">服务日期</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">航班号</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground max-w-[120px]">上车点</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">错误</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {parsedRows.map(row => (
                          <tr key={row.rowIndex} className={row.isValid ? "" : "bg-destructive/5"}>
                            <td className="px-3 py-2 text-muted-foreground">{row.rowIndex + 1}</td>
                            <td className="px-3 py-2">
                              {row.isValid
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                : <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                            </td>
                            <td className="px-3 py-2 font-mono">{String(row.data.orderNo || "-")}</td>
                            <td className="px-3 py-2">{String(row.data.reqVehicleType || "-")}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{String(row.data.flightDate || "-")}{row.data.pickupTime ? ` ${row.data.pickupTime}` : ""}</td>
                            <td className="px-3 py-2">{String(row.data.flightNo || "-")}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate" title={String(row.data.pickupAddress || "")}>
                              {String(row.data.pickupAddress || "-")}
                            </td>
                            <td className="px-3 py-2">
                              {row.errors.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {row.errors.map((e, i) => (
                                    <Badge key={i} variant="destructive" className="text-xs px-1 py-0">{e}</Badge>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    导入时将自动调用高德地理编码填充经纬度，每条约需 1-2 秒
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            {result ? "关闭" : "取消"}
          </Button>
          {!result && !isImporting && (
            <Button onClick={handleImport} disabled={validCount === 0 || isParsing}>
              <Upload className="mr-2 h-4 w-4" />
              导入 {validCount} 条订单
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
