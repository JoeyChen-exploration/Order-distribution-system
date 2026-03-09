'use client'

import { useEffect, useState, useRef } from 'react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { getDrivers, updateDriver, deleteDriver } from '@/lib/store'
import type { Driver, DriverStatus } from '@/lib/types'
import { DRIVER_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Phone,
  Car,
  MapPin,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react'

const STATUS_COLORS: Record<DriverStatus, string> = {
  available: 'bg-green-500/20 text-green-400 border-green-500/30',
  busy: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  off_duty: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  on_leave: 'bg-red-500/20 text-red-400 border-red-500/30',
}

interface ImportResult {
  successRows: number
  errorRows: number
  errors: { row: number; field: string; message: string }[]
  detectedHeaders?: string[]
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [vehicleFilter, setVehicleFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null)

  // xlsx import state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDrivers = async () => {
    const data = await getDrivers()
    setDrivers(data)
  }

  useEffect(() => {
    loadDrivers()
  }, [])

  useEffect(() => {
    let result = drivers

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        d =>
          d.name.toLowerCase().includes(query) ||
          d.phone.includes(query) ||
          d.vehiclePlate.toLowerCase().includes(query)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter)
    }

    if (vehicleFilter !== 'all') {
      result = result.filter(d => d.vehicleType === vehicleFilter)
    }

    setFilteredDrivers(result)
  }, [drivers, searchQuery, statusFilter, vehicleFilter])

  const handleStatusChange = async (driverId: string, newStatus: DriverStatus) => {
    await updateDriver(driverId, { status: newStatus })
    await loadDrivers()
  }

  const handleDelete = async () => {
    if (driverToDelete) {
      await deleteDriver(driverToDelete.id)
      await loadDrivers()
      setDeleteDialogOpen(false)
      setDriverToDelete(null)
    }
  }

  const confirmDelete = (driver: Driver) => {
    setDriverToDelete(driver)
    setDeleteDialogOpen(true)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportResult(null)
    }
  }

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('importedBy', 'admin')
      const res = await fetch('/api/drivers/import', { method: 'POST', body: formData })
      const result: ImportResult = await res.json()
      setImportResult(result)
      if (result.successRows > 0) await loadDrivers()
    } finally {
      setImporting(false)
    }
  }

  const handleImportDialogClose = () => {
    setImportDialogOpen(false)
    setImportFile(null)
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">司机管理</h1>
          <p className="text-muted-foreground">管理司机档案和状态</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            导入 Excel
          </Button>
          <Link href="/drivers/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              新增司机
            </Button>
          </Link>
        </div>
      </div>

      {/* 筛选区 */}
      <Card className="border-border/50 bg-card/50 mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索姓名、电话、车牌..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(DRIVER_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="车型筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部车型</SelectItem>
                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 司机列表 */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>司机列表</CardTitle>
          <CardDescription>共 {filteredDrivers.length} 名司机</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">司机信息</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">车辆信息</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">今日工作量</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">状态</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map(driver => (
                  <tr
                    key={driver.id}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                          {driver.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{driver.name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {driver.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-foreground">{driver.vehiclePlate}</p>
                          <p className="text-sm text-muted-foreground">
                            {VEHICLE_TYPE_LABELS[driver.vehicleType]}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{
                              width: `${Math.min((driver.dailyOrderCount / driver.dailyOrderLimit) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {driver.dailyOrderCount}/{driver.dailyOrderLimit}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Select
                        value={driver.status}
                        onValueChange={(value) => handleStatusChange(driver.id, value as DriverStatus)}
                      >
                        <SelectTrigger className={cn(
                          'w-[100px] h-8 text-xs border',
                          STATUS_COLORS[driver.status as DriverStatus]
                        )}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(DRIVER_STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/drivers/${driver.id}`} className="flex items-center">
                              <Edit className="w-4 h-4 mr-2" />
                              编辑
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/drivers/${driver.id}`} className="flex items-center">
                              <MapPin className="w-4 h-4 mr-2" />
                              查看位置
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => confirmDelete(driver)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filteredDrivers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* xlsx 导入对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={handleImportDialogClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>导入司机 Excel</DialogTitle>
            <DialogDescription>
              支持 .xlsx / .xls 格式，首行为表头
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 格式说明 */}
            <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-sm">
              <p className="font-medium mb-2">必填列（表头名称）：</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground text-xs">
                <span>• 司机</span>
                <span>• 司机电话</span>
                <span>• 车型（舒适型/豪华型/商务型/经济型）</span>
                <span>• 车号</span>
              </div>
              <p className="font-medium mt-2 mb-1">可选列：</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground text-xs">
                <span>• 住（常驻区域）</span>
                <span>• 班次</span>
                <span>• 做单时间</span>
                <span>• 日单上限（默认 10）</span>
              </div>
            </div>

            {/* 上传区 */}
            {!importResult ? (
              <div
                className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {importFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="w-6 h-6 text-primary" />
                    <span className="font-medium">{importFile.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setImportFile(null) }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">点击选择文件或拖放到此处</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx / .xls</p>
                  </div>
                )}
              </div>
            ) : (
              /* 导入结果 */
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-md bg-green-500/10 border border-green-500/20 p-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <span className="text-sm">成功导入 <strong>{importResult.successRows}</strong> 条记录</span>
                </div>
                {importResult.detectedHeaders && importResult.detectedHeaders.length > 0 && (
                  <div className="rounded-md bg-muted/30 border border-border/50 p-3">
                    <p className="text-xs font-medium mb-1">检测到的列名（共 {importResult.detectedHeaders.length} 列）：</p>
                    <p className="text-xs text-muted-foreground break-all">{importResult.detectedHeaders.join(" | ")}</p>
                  </div>
                )}
                {importResult.errorRows > 0 && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                      <span className="text-sm font-medium text-destructive">{importResult.errorRows} 条失败</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                      {importResult.errors.map((e, i) => (
                        <li key={i}>
                          {e.row > 0 ? `第 ${e.row} 行` : ''} [{e.field}] {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleImportDialogClose}>
              {importResult ? '关闭' : '取消'}
            </Button>
            {!importResult && (
              <Button onClick={handleImport} disabled={!importFile || importing}>
                {importing ? '导入中...' : '开始导入'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除司机 {driverToDelete?.name} 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
