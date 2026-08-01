'use client'

import { type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Sparkline } from './Sparkline'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  /** Accent color for the icon chip + sparkline (hex). */
  accent?: string
  valueColor?: string
  /** Optional honest sub-label shown under the value when there's no sparkline. */
  sub?: string
  /** Optional real trend chip — only pass when the percentage is real. */
  trend?: { value: number; label?: string }
  /** Optional sparkline series. */
  spark?: number[]
  sparkGradientId?: string
}

export function StatCard({
  icon: Icon,
  label,
  value,
  accent = '#00d4ff',
  valueColor = '#ffffff',
  sub,
  trend,
  spark,
  sparkGradientId,
}: StatCardProps) {
  const up = (trend?.value ?? 0) >= 0
  const trendTone = up ? 'var(--accent-success)' : 'var(--accent-error)'
  const trendBg = up ? 'var(--success-soft)' : 'var(--danger-soft)'
  const hasSpark = !!spark && spark.length > 1 && !!sparkGradientId

  return (
    <div className="card hover-lift p-5">
      <div className="flex items-start justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accent} 34%, transparent)`,
            color: accent,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 28px color-mix(in srgb, ${accent} 12%, transparent)`,
          }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        {trend && (
          <span
            className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-semibold"
            style={{ background: trendBg, color: trendTone }}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {up ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>

      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: valueColor }}>
        {value}
      </p>

      {hasSpark ? (
        <div className="mt-3">
          <Sparkline data={spark!} color={accent} gradientId={sparkGradientId!} height={36} />
        </div>
      ) : sub ? (
        <p className="mt-2 text-xs text-text-tertiary">
          {sub}
        </p>
      ) : null}
    </div>
  )
}
