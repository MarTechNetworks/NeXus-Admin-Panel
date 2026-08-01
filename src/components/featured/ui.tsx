'use client'

// Featured-local presentational kit. These tokens + helpers are intentionally
// DUPLICATED from collections/page.tsx so the Featured redesign can ship without
// touching the (working) Collections page. Keep visuals in sync by eye.

import { useState } from 'react'
import type { CollectionStatus } from '@/lib/types'

// ── Design tokens (match revenue / dashboard / collections) ──────────────────
export const CYAN = '#00d4ff'
export const PURPLE = '#7c3aed'
export const GREEN = '#10b981'
export const AMBER = '#f59e0b'
export const RED = '#ef4444'
export const BLUE = '#3b82f6'
export const GRID = '#252535'
export const TEXT = '#ffffff'
export const SUB = '#8a8a9a'
export const SUB2 = '#b8b8c8'

// Rank medal colors — gold / silver / bronze for ranks 1‑3, grey below.
export const RANK_COLORS = ['#f59e0b', '#b8b8c8', '#cd7f32'] as const
export function rankColor(rank: number): string {
  return RANK_COLORS[rank - 1] ?? '#6a6a7a'
}

export const STATUS_ACCENT: Record<CollectionStatus, string> = {
  draft: SUB,
  preparing: BLUE,
  ready: CYAN,
  minting: GREEN,
  completed: PURPLE,
  paused: AMBER,
}

// IPFS gateway — mirrors the Frontend so ipfs:// artwork actually loads.
export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://ipfs-gateway.nexus-web3.com/ipfs/'

/** Converts ipfs:// URIs to HTTP gateway URLs; passes through normal URLs. */
export function resolveUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('ipfs://')) return `${IPFS_GATEWAY}${url.slice(7)}`
  return url
}

export function truncateAddress(addr: string) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Deterministic dark gradient seeded from a string — used as artwork fallback. */
export function gradientFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const a = h % 360
  const b = (a + 65) % 360
  return `linear-gradient(135deg, hsl(${a} 65% 24%), hsl(${b} 70% 13%))`
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

export function fmtPrice(price?: number): string {
  return price != null && price > 0 ? `${price} SOL` : 'Free'
}

// ── Presentational pieces ────────────────────────────────────────────────────

export function Artwork({
  src,
  seed,
  label,
  className,
  textClass = 'text-lg',
}: {
  src?: string
  seed: string
  label: string
  className?: string
  textClass?: string
}) {
  const [errored, setErrored] = useState(false)
  const resolved = resolveUrl(src)
  const showImg = !!resolved && !errored
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className ?? ''}`}
      style={{ background: gradientFor(seed) }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt=""
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className={`font-bold ${textClass}`}
          style={{ color: 'rgba(255,255,255,0.9)', letterSpacing: '0.04em' }}
        >
          {initials(label)}
        </span>
      )}
    </div>
  )
}

export function StatusPill({ status, glass = false }: { status: CollectionStatus; glass?: boolean }) {
  const accent = STATUS_ACCENT[status] ?? SUB
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium capitalize"
      style={{
        background: glass ? 'rgba(10,10,15,0.55)' : `${accent}1a`,
        color: glass ? '#ffffff' : accent,
        border: `1px solid ${accent}59`,
        backdropFilter: glass ? 'blur(8px)' : undefined,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
      />
      {status}
    </span>
  )
}

export function MintProgress({
  minted,
  total,
  accent,
}: {
  minted: number
  total: number
  accent: string
}) {
  const pct = total > 0 ? Math.min(100, Math.round((minted / total) * 100)) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span style={{ color: SUB }}>
          {minted.toLocaleString()} / {total.toLocaleString()}
        </span>
        <span style={{ color: TEXT, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: '#1a1a24' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: accent,
            boxShadow: `0 0 8px ${accent}80`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}

export function PriceChip({ price }: { price?: number }) {
  const free = price == null || price <= 0
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold"
      style={{
        background: free ? '#1a1a24' : 'rgba(0,212,255,0.10)',
        color: free ? SUB2 : CYAN,
        border: `1px solid ${free ? GRID : 'rgba(0,212,255,0.28)'}`,
      }}
    >
      {fmtPrice(price)}
    </span>
  )
}

/** Small green "Live" pulse badge — mirrors the public site's minting indicator. */
export function LiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{
        background: 'rgba(16,185,129,0.15)',
        color: GREEN,
        border: '1px solid rgba(16,185,129,0.35)',
        boxShadow: '0 0 12px rgba(16,185,129,0.25)',
      }}
    >
      <span className="relative flex h-2 w-2">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping"
          style={{ background: GREEN }}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: GREEN }} />
      </span>
      Live
    </span>
  )
}
