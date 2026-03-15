"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  Download,
  ArrowLeft,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { createOrder } from "@/lib/store"

const AMAP_KEY = "4751969b1d68252aa828223bf04c3e3a"

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  if (!address) return { lat: 0, lng: 0 }
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
  return { lat: 0, lng: 0 }
}

interface ParsedRow {
  rowIndex: number
  data: Record<string, string | number | boolean>
  errors: string[]
  isValid: boolean
}

// 列名映射：中文表头 -> 字段名
// 对应礼宾车账单 Excel 格式（列 A-AF）
const fieldMapping: Record<string, string> = {
  // 核心订单字段
  "订单号": "orderNo",
  "预订车型": "reqVehicleType",
  "服务城市": "serviceCity",
  "服务日期": "flightDate",
  "三字码": "airportCode",
  "人数": "passengerCount",
  "下单时间": "submittedAt",
  "航班号": "flightNo",
  "上车点": "pickupAddress",
  "下车点": "dropoffAddress",
  "车号": "vehiclePlate",
  // 司机信息
  "司机": "driverName",
  "司机电话": "driverPhone",
  "司机分组": "driverGroup",
  "实际车型": "actualVehicleType",
  "架次": "tripNo",
  // 费用字段
  "公里数": "kilometers",
  "货币": "currency",
  "超公里费": "extraKmFee",
  "夜间服务费": "nightFee",
  "婴儿床费用": "babyBedFee",
  "儿童座椅费用": "childSeatFee",
  "单程费": "singleTripFee",
  "举牌费": "signFee",
  "举牌服务": "signService",
  "上下车点": "pickupDropoffPoint",
  "节假日调价": "holidayAdjustment",
  "自主调价": "selfAdjustment",
  // 其他
  "供应商订单": "supplierOrderNo",
  "服务标准": "serviceStandard",
  "单程服务": "singleService",
  "备注": "remarks",
}

const vehicleTypeMapping: Record<string, string> = {
  // 标准名称直接保留
  "舒适型": "舒适型",
  "豪华型": "豪华型",
  "商务型": "商务型",
  "经济型": "经济型",
}

export default function OrderImportPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)

  const validateRow = (data: Record<string, string | number | boolean>, rowIndex: number): ParsedRow => {
    const errors: string[] = []

    if (!data.orderNo) errors.push("缺少订单号")
    if (!data.flightDate) errors.push("缺少服务日期")
    if (!data.pickupAddress) errors.push("缺少上车点")
    if (!data.dropoffAddress) errors.push("缺少下车点")
    if (!data.reqVehicleType) errors.push("缺少预订车型")

    if (data.flightDate && !/^\d{4}-\d{2}-\d{2}/.test(String(data.flightDate))) {
      errors.push("服务日期格式不正确，应为 YYYY-MM-DD")
    }
    if (data.reqVehicleType && !["舒适型", "豪华型", "商务型", "经济型"].includes(String(data.reqVehicleType))) {
      errors.push(`车型无效："${data.reqVehicleType}"，应为 舒适型/豪华型/商务型/经济型`)
    }

    return { rowIndex, data, errors, isValid: errors.length === 0 }
  }

  const processFile = useCallback(async (f: File) => {
    setIsProcessing(true)
    setImportResult(null)
    try {
      const buffer = await f.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      // header: 1 返回二维数组
      const rows: (string | number | boolean | Date)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

      if (rows.length < 2) throw new Error("文件内容不足")

      const headers = rows[0].map(h => String(h).trim())
      const mappedHeaders = headers.map(h => fieldMapping[h] || h)

      const parsed: ParsedRow[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        // Skip completely empty rows
        if (row.every(cell => String(cell).trim() === "")) continue

        const data: Record<string, string | number | boolean> = {}
        mappedHeaders.forEach((header, idx) => {
          const raw = row[idx]
          let value: string
          if (raw instanceof Date) {
            // 转为中国时间 (UTC+8)
            const cst = new Date(raw.getTime() + 8 * 60 * 60 * 1000)
            const pad = (n: number) => String(n).padStart(2, "0")
            const dateStr = `${cst.getUTCFullYear()}-${pad(cst.getUTCMonth() + 1)}-${pad(cst.getUTCDate())}`
            const timeStr = `${pad(cst.getUTCHours())}:${pad(cst.getUTCMinutes())}`
            value = `${dateStr} ${timeStr}`
          } else {
            value = String(raw ?? "").trim()
          }
          if (header === "reqVehicleType") value = vehicleTypeMapping[value] || value
          if (value) data[header] = value
        })

        // 从"服务日期"（含日期和时间，如 "2026-03-06 00:15"）中拆分出 flightDate 和 pickupTime
        if (data.flightDate) {
          const dateTimeStr = String(data.flightDate)
          const parts = dateTimeStr.split(/[\sT]/)
          data.flightDate = parts[0]  // YYYY-MM-DD
          // 如果 pickupTime 未单独映射，从日期时间字段中提取
          if (parts[1] && !data.pickupTime) {
            data.pickupTime = parts[1].slice(0, 5)  // HH:MM
          }
        }

        parsed.push(validateRow(data, i))
      }
      setParsedRows(parsed)
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); processFile(f) }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) {
      setFile(f); processFile(f)
    }
  }

  const handleImport = async () => {
    const valid = parsedRows.filter(r => r.isValid)
    if (valid.length === 0) return
    setIsProcessing(true)
    setImportProgress(0)

    let success = 0
    let failed = 0

    const CORE_FIELDS = new Set([
      "orderNo", "reqVehicleType", "flightDate", "flightNo",
      "pickupAddress", "dropoffAddress", "driverName",
      "passengerName", "passengerPhone", "pickupTime", "isEmergency",
    ])

    for (let i = 0; i < valid.length; i++) {
      try {
        const d = valid[i].data
        // collect extra xlsx fields into metadata
        const extra: Record<string, string> = {}
        for (const [k, v] of Object.entries(d)) {
          if (!CORE_FIELDS.has(k) && v !== "" && v !== undefined && v !== false) {
            extra[k] = String(v)
          }
        }
        // 并发地理编码上下车点
        const pickupAddr = String(d.pickupAddress || "")
        const dropoffAddr = String(d.dropoffAddress || "")
        const [pickupCoord, dropoffCoord] = await Promise.all([
          geocodeAddress(pickupAddr),
          geocodeAddress(dropoffAddr),
        ])
        await createOrder({
          orderNo: String(d.orderNo || `IMP-${Date.now()}-${i}`),
          passengerName: String(d.passengerName || ""),
          passengerPhone: String(d.passengerPhone || ""),
          flightNo: String(d.flightNo || ""),
          flightDate: String(d.flightDate || ""),
          pickupTime: String(d.pickupTime || ""),
          pickupAddress: pickupAddr,
          pickupLat: pickupCoord.lat,
          pickupLng: pickupCoord.lng,
          dropoffAddress: dropoffAddr,
          dropoffLat: dropoffCoord.lat,
          dropoffLng: dropoffCoord.lng,
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
      setImportProgress(Math.round(((i + 1) / valid.length) * 100))
    }

    setImportResult({ success, failed })
    setIsProcessing(false)
  }

  const downloadTemplate = () => {
    const headers = [
      "订单号", "预订车型", "服务类型", "服务城市", "服务日期",
      "三字码", "人数", "下单时间", "航班号", "上车点", "下车点", "车号",
      "司机", "司机电话", "司机分组", "实际车型", "架次",
      "公里数", "货币", "超公里费", "夜间服务费", "婴儿床费用", "儿童座椅费用",
      "单程费", "上下车点", "节假日调价", "自主调价",
      "供应商订单", "服务标准", "单程服务", "备注"
    ]
    const sample = [
      [
        "CO20260306EXAMPLE", "舒适型", "接机/站", "上海市", "2026-03-06",
        "PVG", "1", "2026-03-01 10:00:00", "MU5220",
        "上海浦东国际机场-2号航站楼-P2停车楼",
        "上海市徐汇区零陵路789弄之1-19号创世纪花园",
        "", "", "", "", "", "",
        "40", "CNY", "0", "0", "0", "0", "0", "0", "0", "0", "", "", "否", ""
      ],
    ]
    const csv = [headers, ...sample].map(r => r.join(",")).join("\n")
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "礼宾车账单导入模板.csv"
    a.click()
  }

  const validCount = parsedRows.filter(r => r.isValid).length
  const invalidCount = parsedRows.filter(r => !r.isValid).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">导入订单</h1>
          <p className="text-muted-foreground">批量导入礼宾车账单 CSV 格式的订单数据</p>
        </div>
      </div>

      {importResult && (
        <Alert variant={importResult.failed > 0 ? "destructive" : "default"} className="border-primary/50">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>导入完成</AlertTitle>
          <AlertDescription>
            成功导入 {importResult.success} 条订单{importResult.failed > 0 && `，失败 ${importResult.failed} 条`}
          </AlertDescription>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => router.push("/orders")}>查看订单列表</Button>
            <Button size="sm" variant="outline" onClick={() => router.push("/dispatch")}>前往派单</Button>
          </div>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>上传文件</CardTitle>
          <CardDescription>支持 CSV 格式文件，列格式参照礼宾车账单</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input id="file-input" type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileChange} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setFile(null); setParsedRows([]) }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">点击或拖拽文件到此处</p>
                <p className="text-sm text-muted-foreground">支持 CSV 格式</p>
              </>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              下载导入模板
            </Button>
            <p className="text-xs text-muted-foreground">
              必填：订单号、服务日期、上车点、下车点、预订车型
            </p>
          </div>
        </CardContent>
      </Card>

      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>数据预览</CardTitle>
                <CardDescription>
                  共 {parsedRows.length} 条，
                  <span className="text-primary">{validCount} 条有效</span>
                  {invalidCount > 0 && <span className="text-destructive">，{invalidCount} 条有错误</span>}
                </CardDescription>
              </div>
              {isProcessing && importProgress > 0 && (
                <div className="w-48">
                  <Progress value={importProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1 text-right">{importProgress}%</p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">行</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>订单号</TableHead>
                    <TableHead>预订车型</TableHead>
                    <TableHead>服务日期</TableHead>
                    <TableHead>航班号</TableHead>
                    <TableHead>上车点</TableHead>
                    <TableHead>下车点</TableHead>
                    <TableHead>司机</TableHead>
                    <TableHead>错误信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row) => (
                    <TableRow key={row.rowIndex} className={row.isValid ? "" : "bg-destructive/5"}>
                      <TableCell>{row.rowIndex + 1}</TableCell>
                      <TableCell>
                        {row.isValid
                          ? <CheckCircle2 className="h-4 w-4 text-primary" />
                          : <AlertCircle className="h-4 w-4 text-destructive" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{String(row.data.orderNo || "-")}</TableCell>
                      <TableCell>
                        {String(row.data.reqVehicleType || "-")}
                      </TableCell>
                      <TableCell>{String(row.data.flightDate || "-")}</TableCell>
                      <TableCell>{String(row.data.flightNo || "-")}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">{String(row.data.pickupAddress || "-")}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">{String(row.data.dropoffAddress || "-")}</TableCell>
                      <TableCell>{String(row.data.driverName || "-")}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {row.errors.map((err, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">{err}</Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">仅导入有效数据，错误行将被跳过</p>
              <Button onClick={handleImport} disabled={validCount === 0 || isProcessing}>
                {isProcessing
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />导入中...</>
                  : <><Upload className="mr-2 h-4 w-4" />导入 {validCount} 条订单</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
