import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ChartCardProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** Fixed height (px) applied to the body — use for charts. Omit for auto-height content. */
  height?: number
  /** Render the body edge-to-edge (no card padding) — use for lists/feeds that pad their own rows. */
  flush?: boolean
  className?: string
  children: ReactNode
}

export function ChartCard({
  title,
  subtitle,
  actions,
  height,
  flush,
  className,
  children,
}: ChartCardProps) {
  return (
    <div className={cn('card', flush ? '' : 'p-4', className)}>
      <div
        className={cn('flex items-center justify-between gap-2', flush ? 'px-4 py-3' : 'mb-3')}
        style={flush ? { borderBottom: '1px solid var(--border-primary)' } : undefined}
      >
        <div className="min-w-0">
          <h3 className="eyebrow truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-text-tertiary">
              {subtitle}
            </p>
          )}
        </div>
        {actions}
      </div>
      <div style={height ? { height } : undefined}>{children}</div>
    </div>
  )
}
