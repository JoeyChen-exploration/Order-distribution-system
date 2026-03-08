"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
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
import { store } from "@/lib/store"
import type { Order, VehicleType, ServiceType } from "@/lib/types"

interface ParsedRow {
  rowIndex: number
  data: Partial<Order>
  errors: string[]
  isValid: boolean
}

const requiredFields = [
  { key: "passengerName", label: "乘客姓名" },
  { key: "passengerPhone", label: "联系电话" },
  { key: "serviceType", label: "服务类型" },
  { key: "serviceDate", label: "服务日期" },
  { key: "serviceTime", label: "服务时间" },
  { key: "pickupLocation", label: "上车地点" },
  { key: "dropoffLocation", label: "下车地点" },
  { key: "vehicleType", label: "车型" },
]

const fieldMapping: Record<string, string> = {
  "乘客姓名": "passengerName",
  "姓名": "passengerName",
  "联系电话": "passengerPhone",
  "电话": "passengerPhone",
  "手机": "passengerPhone",
  "服务类型": "serviceType",
  "类型": "serviceType",
  "服务日期": "serviceDate",
  "日期": "serviceDate",
  "服务时间": "serviceTime",
  "时间": "serviceTime",
  "上车地点": "pickupLocation",
  "接机地点": "pickupLocation",
  "出发地": "pickupLocation",
  "下车地点": "dropoffLocation",
  "送机地点": "dropoffLocation",
  "目的地": "dropoffLocation",
  "车型": "vehicleType",
  "车辆类型": "vehicleType",
  "航班号": "flightNumber",
  "航班": "flightNumber",
  "乘客人数": "passengerCount",
  "人数": "passengerCount",
  "行李数量": "luggageCount",
  "行李": "luggageCount",
  "备注": "notes",
  "特殊要求": "specialRequirements",
}

const serviceTypeMapping: Record<string, ServiceType> = {
  "接机": "pickup",
  "pickup": "pickup",
  "送机": "dropoff",
  "dropoff": "dropoff",
}

const vehicleTypeMapping: Record<string, VehicleType> = {
  "轿车": "sedan",
  "sedan": "sedan",
  "SUV": "suv",
  "suv": "suv",
  "商务车": "van",
  "van": "van",
  "豪华车": "luxury",
  "luxury": "luxury",
}

export default function OrderImportPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{
    success: number
    failed: number
    batchId?: string
  } | null>(null)

  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    return lines.map(line => {
      const result: string[] = []
      let current = ""
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === "," && !inQuotes) {
          result.push(current.trim())
          current = ""
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    })
  }

  const validateRow = (row: Partial<Order>, rowIndex: number): ParsedRow => {
    const errors: string[] = []
    
    // Check required fields
    requiredFields.forEach(field => {
      if (!row[field.key as keyof Order]) {
        errors.push(`缺少必填字段：${field.label}`)
      }
    })
    
    // Validate phone number
    if (row.passengerPhone && !/^1[3-9]\d{9}$/.test(row.passengerPhone)) {
      errors.push("手机号格式不正确")
    }
    
    // Validate date format
    if (row.serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.serviceDate)) {
      errors.push("日期格式不正确，应为YYYY-MM-DD")
    }
    
    // Validate time format
    if (row.serviceTime && !/^\d{2}:\d{2}$/.test(row.serviceTime)) {
      errors.push("时间格式不正确，应为HH:MM")
    }
    
    // Validate service type
    if (row.serviceType && !["pickup", "dropoff"].includes(row.serviceType)) {
      errors.push("服务类型无效，应为"接机"或"送机"")
    }
    
    // Validate vehicle type
    if (row.vehicleType && !["sedan", "suv", "van", "luxury"].includes(row.vehicleType)) {
      errors.push("车型无效")
    }
    
    return {
      rowIndex,
      data: row,
      errors,
      isValid: errors.length === 0,
    }
  }

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true)
    setImportResult(null)
    
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      
      if (rows.length < 2) {
        throw new Error("文件内容不足，至少需要包含表头和一行数据")
      }
      
      const headers = rows[0]
      const mappedHeaders = headers.map(h => fieldMapping[h] || h)
      
      const parsed: ParsedRow[] = []
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const rowData: Partial<Order> = {}
        
        mappedHeaders.forEach((header, index) => {
          let value = row[index] || ""
          
          // Convert service type
          if (header === "serviceType") {
            value = serviceTypeMapping[value] || value
          }
          
          // Convert vehicle type
          if (header === "vehicleType") {
            value = vehicleTypeMapping[value] || value
          }
          
          // Convert numbers
          if (["passengerCount", "luggageCount"].includes(header)) {
            const num = parseInt(value)
            if (!isNaN(num)) {
              (rowData as Record<string, unknown>)[header] = num
              return
            }
          }
          
          if (value) {
            (rowData as Record<string, unknown>)[header] = value
          }
        })
        
        parsed.push(validateRow(rowData, i))
      }
      
      setParsedRows(parsed)
    } catch (error) {
      console.error("Parse error:", error)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      processFile(selectedFile)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.name.endsWith(".xlsx"))) {
      setFile(droppedFile)
      processFile(droppedFile)
    }
  }

  const handleImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid)
    if (validRows.length === 0) return
    
    setIsProcessing(true)
    setImportProgress(0)
    
    const batchId = `BATCH-${Date.now()}`
    let successCount = 0
    let failedCount = 0
    
    for (let i = 0; i < validRows.length; i++) {
      try {
        const orderData = {
          ...validRows[i].data,
          passengerCount: validRows[i].data.passengerCount || 1,
          luggageCount: validRows[i].data.luggageCount || 0,
          importBatchId: batchId,
        } as Omit<Order, "id" | "orderNumber" | "status" | "createdAt" | "updatedAt">
        
        store.addOrder(orderData)
        successCount++
      } catch {
        failedCount++
      }
      
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100))
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    setImportResult({
      success: successCount,
      failed: failedCount,
      batchId,
    })
    setIsProcessing(false)
  }

  const downloadTemplate = () => {
    const headers = ["乘客姓名", "联系电话", "服务类型", "服务日期", "服务时间", "上车地点", "下车地点", "车型", "航班号", "乘客人数", "行李数量", "备注"]
    const sampleData = [
      ["张三", "13800138001", "接机", "2026-03-15", "14:30", "首都国际机场T3", "朝阳区CBD", "轿车", "CA1234", "2", "2", ""],
      ["李四", "13900139001", "送机", "2026-03-16", "08:00", "海淀区中关村", "大兴国际机场", "SUV", "MU5678", "4", "4", "需要儿童座椅"],
    ]
    
    const csvContent = [headers, ...sampleData].map(row => row.join(",")).join("\n")
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "订单导入模板.csv"
    a.click()
    URL.revokeObjectURL(url)
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
          <p className="text-muted-foreground">批量导入 Excel/CSV 格式的订单数据</p>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <Alert variant={importResult.failed > 0 ? "destructive" : "default"} className="border-primary/50">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>导入完成</AlertTitle>
          <AlertDescription>
            成功导入 {importResult.success} 条订单
            {importResult.failed > 0 && `，失败 ${importResult.failed} 条`}
            。批次号：{importResult.batchId}
          </AlertDescription>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => router.push("/orders")}>
              查看订单列表
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push("/dispatch")}>
              前往派单
            </Button>
          </div>
        </Alert>
      )}

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>上传文件</CardTitle>
          <CardDescription>
            支持 CSV 格式文件，最大 10MB
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                    setParsedRows([])
                  }}
                >
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
              字段：乘客姓名、联系电话、服务类型、服务日期、服务时间、上车地点、下车地点、车型、航班号（选填）
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>数据预览</CardTitle>
                <CardDescription>
                  共 {parsedRows.length} 条记录，
                  <span className="text-primary">{validCount} 条有效</span>
                  {invalidCount > 0 && (
                    <span className="text-destructive">，{invalidCount} 条有错误</span>
                  )}
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
                    <TableHead className="w-[60px]">行号</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>乘客姓名</TableHead>
                    <TableHead>联系电话</TableHead>
                    <TableHead>服务类型</TableHead>
                    <TableHead>服务日期</TableHead>
                    <TableHead>服务时间</TableHead>
                    <TableHead>车型</TableHead>
                    <TableHead>错误信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row) => (
                    <TableRow 
                      key={row.rowIndex}
                      className={row.isValid ? "" : "bg-destructive/5"}
                    >
                      <TableCell>{row.rowIndex + 1}</TableCell>
                      <TableCell>
                        {row.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell>{row.data.passengerName || "-"}</TableCell>
                      <TableCell>{row.data.passengerPhone || "-"}</TableCell>
                      <TableCell>
                        {row.data.serviceType === "pickup" ? "接机" : 
                         row.data.serviceType === "dropoff" ? "送机" : "-"}
                      </TableCell>
                      <TableCell>{row.data.serviceDate || "-"}</TableCell>
                      <TableCell>{row.data.serviceTime || "-"}</TableCell>
                      <TableCell>
                        {row.data.vehicleType === "sedan" ? "轿车" :
                         row.data.vehicleType === "suv" ? "SUV" :
                         row.data.vehicleType === "van" ? "商务车" :
                         row.data.vehicleType === "luxury" ? "豪华车" : "-"}
                      </TableCell>
                      <TableCell>
                        {row.errors.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {row.errors.map((err, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">
                                {err}
                              </Badge>
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
              <p className="text-sm text-muted-foreground">
                仅导入有效数据，错误行将被跳过
              </p>
              <Button
                onClick={handleImport}
                disabled={validCount === 0 || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    导入 {validCount} 条订单
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
