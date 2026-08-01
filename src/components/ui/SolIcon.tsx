'use client'

import { useId } from 'react'

interface SolIconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * SolIcon — the canonical Solana three-bar mark rendered inline with the official
 * brand gradient (#00FFA3 → #DC1FFF). Ported from the Frontend's SolIcon.
 *
 * Each instance gets a unique gradient id via useId because SVG <defs> are
 * globally scoped — two icons sharing an id would render identically.
 */
export function SolIcon({ size = 14, className, style }: SolIconProps) {
  const uid = useId().replace(/:/g, '')
  const gradId = `sol-grad-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 397.7 311.7"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FFA3" />
          <stop offset="100%" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"
      />
      <path
        fill={`url(#${gradId})`}
        d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"
      />
      <path
        fill={`url(#${gradId})`}
        d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"
      />
    </svg>
  )
}

/**
 * SolAmount — formats a SOL value as "<number> <SolIcon>", replacing the literal
 * "SOL" label with the brand mark. Renders "—" (no icon) for null/undefined.
 */
export function SolAmount({
  value,
  size = 14,
  className,
}: {
  value?: number | null
  size?: number
  className?: string
}) {
  if (value == null) return <>—</>
  const decimals = value !== 0 && Math.abs(value) < 1 ? 4 : 2
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {value.toLocaleString(undefined, { maximumFractionDigits: decimals })}
      <SolIcon size={size} />
    </span>
  )
}
