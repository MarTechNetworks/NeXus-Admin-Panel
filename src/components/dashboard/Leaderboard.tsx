'use client'

import { type ReactNode } from 'react'

export interface LeaderboardItem {
  id: string
  title: string
  subtitle?: string
  imageUrl?: string
  metric: ReactNode
  metricColor?: string
  progress?: { value: number; max: number; color?: string }
}

// Gold / silver / bronze for the podium, muted grey otherwise.
const RANK_COLORS: Record<number, string> = { 1: '#f59e0b', 2: '#b8b8c8', 3: '#cd7f32' }

export function Leaderboard({
  items,
  emptyLabel = 'Nothing to show yet.',
}: {
  items: LeaderboardItem[]
  emptyLabel?: string
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm" style={{ color: '#8a8a9a' }}>
        {emptyLabel}
      </div>
    )
  }

  return (
    <ul>
      {items.map((item, i) => {
        const rank = i + 1
        const pct =
          item.progress && item.progress.max > 0
            ? Math.min(100, (item.progress.value / item.progress.max) * 100)
            : null

        return (
          <li
            key={item.id}
            className="flex items-center gap-3 px-4 py-3 transition-colors"
            style={{ borderTop: i === 0 ? 'none' : '1px solid #252535' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#1a1a24')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          >
            <span
              className="w-5 shrink-0 text-center text-xs font-bold"
              style={{ color: RANK_COLORS[rank] ?? '#6a6a7a' }}
            >
              {rank}
            </span>

            <Avatar title={item.title} imageUrl={item.imageUrl} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium" style={{ color: '#ffffff' }}>
                  {item.title}
                </p>
                <span
                  className="shrink-0 text-sm font-semibold"
                  style={{ color: item.metricColor ?? '#b8b8c8' }}
                >
                  {item.metric}
                </span>
              </div>
              {item.subtitle && (
                <p className="truncate text-xs" style={{ color: '#8a8a9a' }}>
                  {item.subtitle}
                </p>
              )}
              {pct != null && (
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: '#1a1a24' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: item.progress!.color ?? '#00d4ff' }}
                  />
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Avatar({ title, imageUrl }: { title: string; imageUrl?: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
  }
  return (
    <span
      className="bg-gradient-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
      style={{ color: '#0a0a0f' }}
    >
      {title.charAt(0).toUpperCase()}
    </span>
  )
}
