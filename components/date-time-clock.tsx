'use client'

import { useEffect, useState } from 'react'

export function DateTimeClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!now) return null

  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const weekStr = now.toLocaleDateString('zh-CN', { weekday: 'long' })

  const timeStr = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-mono tabular-nums text-sidebar-foreground font-semibold tracking-wide">
        {timeStr}
      </span>
      <span className="text-xs text-sidebar-foreground/60">
        {dateStr} {weekStr}
      </span>
    </div>
  )
}
