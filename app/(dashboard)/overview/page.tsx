'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getDashboardStats, getOrders } from '@/lib/store'
import type { DashboardStats, Order } from '@/lib/types'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/types'
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  UserCheck,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: number
  description?: string
  icon: React.ReactNode
  trend?: string
  className?: string
}

function StatCard({ title, value, description, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('border-border/50 bg-card/50', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {(description || trend) && (
          <p className="text-xs text-muted-foreground mt-1">
            {trend && <span className="text-primary mr-1">{trend}</span>}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function RecentOrdersTable({ orders }: { orders: Order[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">订单号</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">乘客</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">航班</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">接车时间</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">状态</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
              <td className="py-3 px-4 text-sm font-mono text-foreground">{order.orderNo}</td>
              <td className="py-3 px-4 text-sm text-foreground">{order.passengerName}</td>
              <td className="py-3 px-4 text-sm text-muted-foreground">{order.flightNo}</td>
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
  )
}

export default function OverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])

  useEffect(() => {
    async function load() {
      const [statsData, orders] = await Promise.all([getDashboardStats(), getOrders()])
      setStats(statsData)
      const sorted = [...orders].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setRecentOrders(sorted.slice(0, 5))
    }
    load()
  }, [])

  if (!stats) {
    return (
      <div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">数据概览</h1>
        <p className="text-muted-foreground">实时监控订单和司机状态</p>
      </div>

      {/* 订单统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="总订单数"
          value={stats.totalOrders}
          icon={<ClipboardList className="w-5 h-5 text-muted-foreground" />}
          description="累计订单"
        />
        <StatCard
          title="待排单"
          value={stats.pendingOrders}
          icon={<Clock className="w-5 h-5 text-warning" />}
          className={stats.pendingOrders > 0 ? 'border-warning/30' : ''}
        />
        <StatCard
          title="进行中"
          value={stats.assignedOrders + stats.inProgressOrders}
          icon={<TrendingUp className="w-5 h-5 text-info" />}
        />
        <StatCard
          title="已完成"
          value={stats.completedOrders}
          icon={<CheckCircle2 className="w-5 h-5 text-primary" />}
        />
      </div>

      {/* 司机统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="司机总数"
          value={stats.totalDrivers}
          icon={<Users className="w-5 h-5 text-muted-foreground" />}
        />
        <StatCard
          title="在岗司机"
          value={stats.availableDrivers}
          icon={<UserCheck className="w-5 h-5 text-primary" />}
        />
        <StatCard
          title="忙碌中"
          value={stats.busyDrivers}
          icon={<AlertTriangle className="w-5 h-5 text-warning" />}
        />
        <StatCard
          title="已取消订单"
          value={stats.cancelledOrders}
          icon={<XCircle className="w-5 h-5 text-destructive" />}
        />
      </div>

      {/* 最近订单 */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>最近订单</CardTitle>
          <CardDescription>最新创建的5条订单</CardDescription>
        </CardHeader>
        <CardContent>
          <RecentOrdersTable orders={recentOrders} />
        </CardContent>
      </Card>
    </div>
  )
}
