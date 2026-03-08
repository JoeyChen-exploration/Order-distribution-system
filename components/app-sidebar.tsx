'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Send,
  Settings,
  LogOut,
  Car,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

const navItems = [
  { href: '/overview', label: '数据概览', icon: LayoutDashboard },
  { href: '/orders', label: '订单管理', icon: ClipboardList },
  { href: '/drivers', label: '司机管理', icon: Users },
  { href: '/dispatch', label: '排单控制台', icon: Send },
  { href: '/settings', label: '系统设置', icon: Settings, adminOnly: true },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const filteredNavItems = navItems.filter(item => {
    if (item.adminOnly && user?.role !== 'super_admin') {
      return false
    }
    return true
  })

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <Link href="/overview" className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary/10 border border-sidebar-primary/20">
            <Car className="w-4 h-4 text-sidebar-primary" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sidebar-foreground">智行调度</span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        <ul className="space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-primary/10 text-sidebar-primary'
                      : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                  )}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User Info */}
      <div className="p-3 border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-sidebar-foreground">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/60">
              {user.role === 'super_admin' ? '超级管理员' : '调度员'}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            'w-full text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10',
            collapsed ? 'justify-center px-0' : 'justify-start'
          )}
          onClick={logout}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span className="ml-3">退出登录</span>}
        </Button>
      </div>
    </aside>
  )
}
