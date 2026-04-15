"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  History,
  Loader2,
  Download,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { VEHICLE_TYPE_COLORS } from "@/lib/types"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"

interface DispatchHistoryItem {
  orderId: string
  orderNo: string
  flightNo: string
  flightDate: string
  pickupTime: string
  pickupAddress: string
  dropoffAddress: string
  reqVehicleType: string
  serviceType?: string
  matched: boolean
  driverId?: string
  driverName?: string
  driverPhone?: string
  vehiclePlate?: string
  vehicleType?: string
  score?: number
  failReason?: string
}

interface DispatchHistoryRecord {
  id: string
  createdAt: string
  totalOrders: number
  matched: number
  unmatched: number
  items: DispatchHistoryItem[]
}

const serviceTypeConfig: Record<string, { border: string; text: string; bg: string }> = {
  "接机/站": { border: "border-sky-500",     text: "text-sky-400",     bg: "bg-sky-500/10" },
  "送机/站": { border: "border-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10" },
  "包车":    { border: "border-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" },
  "市内约车": { border: "border-violet-500",  text: "text-violet-400",  bg: "bg-violet-500/10" },
}

function ServiceTypeBadge({ value }: { value?: string }) {
  if (!value) return null
  const cfg = serviceTypeConfig[value]
  if (!cfg) return <span className="text-xs text-muted-foreground">{value}</span>
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium ${cfg.border} ${cfg.text} ${cfg.bg}`}>
      {value}
    </span>
  )
}

function MatchRateBar({ matched, total }: { matched: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((matched / total) * 100)
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-medium tabular-nums", pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400")}>
        {pct}%
      </span>
    </div>
  )
}

export default function DispatchHistoryPage() {
  const [records, setRecords] = useState<DispatchHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/dispatch-history")
      .then(r => r.json())
      .then(data => { setRecords(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const exportCsv = (rec: DispatchHistoryRecord) => {
    const headers = ["订单号", "航班号", "服务日期", "上车时间", "上车点", "目的地", "预订车型", "服务类型", "匹配状态", "司机姓名", "司机电话", "车牌号", "实际车型", "评分", "失败原因"]
    const rows = rec.items.map(i => [
      i.orderNo, i.flightNo, i.flightDate, i.pickupTime,
      i.pickupAddress, i.dropoffAddress, i.reqVehicleType,
      i.serviceType ?? "",
      i.matched ? "已匹配" : "未匹配",
      i.driverName ?? "", i.driverPhone ?? "", i.vehiclePlate ?? "",
      i.vehicleType ?? "",
      i.score !== undefined ? i.score.toFixed(1) : "",
      i.failReason ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`))
    const csv = "\ufeff" + [headers, ...rows].map(r => r.join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    a.download = `派单结果_${rec.createdAt.slice(0, 10)}.csv`
    a.click()
  }

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">派单历史</h1>
        <p className="text-muted-foreground">每次批量确认派单后自动保存</p>
      </div>

      {records.length === 0 && (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <History className="w-10 h-10 opacity-30" />
            <p className="text-sm">暂无派单记录</p>
            <p className="text-xs opacity-60">每次在排单控制台点击「一键全部确认」后，派单结果会自动保存到此处</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {records.map((rec) => {
          const isOpen = expanded.has(rec.id)
          const date = new Date(rec.createdAt)
          const matchedItems = rec.items.filter(i => i.matched)
          const unmatchedItems = rec.items.filter(i => !i.matched)

          return (
            <Card key={rec.id} className="border-border/50 bg-card/50 overflow-hidden">
              {/* Header row */}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Date / time */}
                  <div className="min-w-[140px]">
                    <p className="text-sm font-medium text-foreground">
                      {format(date, "yyyy-MM-dd", { locale: zhCN })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(date, "HH:mm:ss", { locale: zhCN })}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 flex-wrap flex-1">
                    <Badge variant="outline" className="text-xs font-mono">
                      共 {rec.totalOrders} 单
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {rec.matched} 已匹配
                    </div>
                    {rec.unmatched > 0 && (
                      <div className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="w-3.5 h-3.5" />
                        {rec.unmatched} 未匹配
                      </div>
                    )}
                    <MatchRateBar matched={rec.matched} total={rec.totalOrders} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={() => exportCsv(rec)}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      导出 CSV
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-8 px-3"
                      onClick={() => toggle(rec.id)}
                    >
                      {isOpen ? (
                        <><ChevronUp className="w-4 h-4 mr-1" />收起</>
                      ) : (
                        <><ChevronDown className="w-4 h-4 mr-1" />展开详情</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Detail table */}
              {isOpen && (
                <CardContent className="pt-0">
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40 bg-muted/30">
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground w-5">&nbsp;</th>
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">订单号</th>
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">航班 / 时间</th>
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">上车点 → 目的地</th>
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">车型</th>
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">服务类型</th>
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">司机 / 车牌</th>
                          <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">评分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Matched first */}
                        {matchedItems.map(item => (
                          <tr key={item.orderId} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                            <td className="py-2 px-3">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            </td>
                            <td className="py-2 px-3 font-mono text-xs text-foreground">{item.orderNo}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              <span className="text-foreground">{item.flightNo}</span>
                              <br />
                              <span>{item.flightDate} {item.pickupTime}</span>
                            </td>
                            <td className="py-2 px-3 text-xs max-w-[200px]">
                              <p className="truncate text-foreground">{item.pickupAddress}</p>
                              <p className="truncate text-muted-foreground">→ {item.dropoffAddress}</p>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className={cn("inline-block w-2 h-2 rounded-sm shrink-0", VEHICLE_TYPE_COLORS[item.reqVehicleType as keyof typeof VEHICLE_TYPE_COLORS] ?? "bg-muted")} />
                                <span className="text-xs">{item.reqVehicleType}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <ServiceTypeBadge value={item.serviceType} />
                            </td>
                            <td className="py-2 px-3 text-xs">
                              <p className="text-foreground font-medium">{item.driverName}</p>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span className={cn("inline-block w-1.5 h-1.5 rounded-sm shrink-0", VEHICLE_TYPE_COLORS[item.vehicleType as keyof typeof VEHICLE_TYPE_COLORS] ?? "bg-muted")} />
                                <span>{item.vehiclePlate}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-xs font-mono text-primary">
                              {item.score !== undefined ? item.score.toFixed(1) : "—"}
                            </td>
                          </tr>
                        ))}
                        {/* Unmatched */}
                        {unmatchedItems.map(item => (
                          <tr key={item.orderId} className="border-b border-border/20 hover:bg-muted/20 transition-colors opacity-60">
                            <td className="py-2 px-3">
                              <XCircle className="w-3.5 h-3.5 text-red-500" />
                            </td>
                            <td className="py-2 px-3 font-mono text-xs text-foreground">{item.orderNo}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              <span className="text-foreground">{item.flightNo}</span>
                              <br />
                              <span>{item.flightDate} {item.pickupTime}</span>
                            </td>
                            <td className="py-2 px-3 text-xs max-w-[200px]">
                              <p className="truncate text-foreground">{item.pickupAddress}</p>
                              <p className="truncate text-muted-foreground">→ {item.dropoffAddress}</p>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className={cn("inline-block w-2 h-2 rounded-sm shrink-0", VEHICLE_TYPE_COLORS[item.reqVehicleType as keyof typeof VEHICLE_TYPE_COLORS] ?? "bg-muted")} />
                                <span className="text-xs">{item.reqVehicleType}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <ServiceTypeBadge value={item.serviceType} />
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground" colSpan={2}>
                              {item.failReason || "无可用司机"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
