'use client'

import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  strokeWidth?: number
  /** Must be unique per rendered instance to avoid SVG gradient id collisions. */
  gradientId: string
}

export function Sparkline({
  data,
  color = '#00d4ff',
  height = 40,
  strokeWidth = 2,
  gradientId,
}: SparklineProps) {
  // A single point (or none) has no trend to draw — keep the footprint without a flat-line artifact.
  if (!data || data.length < 2) return <div style={{ height }} aria-hidden />

  const chartData = data.map((v, i) => ({ i, v }))

  return (
    <div style={{ height, width: '100%' }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={strokeWidth}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
