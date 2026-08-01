 'use client'

import { Crown, Medal, Plus, X } from 'lucide-react'
import type { Collection } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'
import {
  Artwork,
  LiveBadge,
  MintProgress,
  PriceChip,
  StatusPill,
  STATUS_ACCENT,
  rankColor,
  GRID,
  SUB,
  TEXT,
} from './ui'

const SCRIM = 'linear-gradient(180deg, rgba(10,10,15,0) 40%, rgba(10,10,15,0.78) 100%)'

function RankMedal({ rank }: { rank: number }) {
  const color = rankColor(rank)
  const Icon = rank === 1 ? Crown : Medal
  const label = rank === 1 ? '#1 Featured' : `#${rank}`
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold"
      style={{
        background: 'rgba(10,10,15,0.55)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${color}80`,
        color,
        boxShadow: `0 0 12px ${color}40`,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function SpotlightCard({
  collection: c,
  rank,
  variant,
  onUnfeature,
}: {
  collection: Collection
  rank: number
  variant: 'hero' | 'standard'
  onUnfeature: (c: Collection) => void
}) {
  const status = c.effectiveStatus ?? c.status
  const accent = STATUS_ACCENT[status] ?? SUB
  const isHero = variant === 'hero'
  const seed = c.slug || c.name
  return (
    <div className="card hover-lift group relative overflow-hidden">
      <div className="relative">
        <Artwork
          src={c.bannerUrl || c.imageUrl}
          seed={seed}
          label={c.name}
          className={isHero ? 'h-56 w-full' : 'h-40 w-full'}
          textClass={isHero ? 'text-5xl' : 'text-3xl'}
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />

        <div className="absolute left-3 top-3">
          <RankMedal rank={rank} />
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {status === 'minting' && <LiveBadge />}
          <StatusPill status={status} glass />
        </div>

        {/* Remove (appears on hover) */}
        <button
          type="button"
          onClick={() => onUnfeature(c)}
          title="Remove from featured"
          className="absolute bottom-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            background: 'rgba(10,10,15,0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#ef4444',
          }}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="absolute bottom-3 left-3 right-12">
          <p
            className={`truncate font-bold ${isHero ? 'text-2xl' : 'text-base'}`}
            style={{ color: TEXT }}
          >
            {c.name}
          </p>
          <p className="truncate text-xs" style={{ color: '#d4d4dd' }}>
            by {c.creator}
          </p>
        </div>
      </div>

      <div className="p-4">
        <MintProgress minted={c.minted} total={c.totalSupply} accent={accent} />
        <div className="mt-3 flex items-center justify-between">
          <PriceChip price={c.price} />
          <span className="text-xs" style={{ color: SUB }}>
            {formatRelativeTime(c.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

function EmptySlot({ onAddMore }: { onAddMore?: () => void }) {
  return (
    <button
      type="button"
      onClick={onAddMore}
      className="flex h-full min-h-[14rem] w-full flex-col items-center justify-center gap-3 rounded-xl p-6 text-center transition-colors hover:border-[#3a3a4a]"
      style={{ border: `1px dashed ${GRID}`, background: 'rgba(17,17,24,0.4)' }}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid ${GRID}`, color: '#f59e0b' }}
      >
        <Plus className="h-6 w-6" />
      </span>
      <span className="text-sm font-medium" style={{ color: TEXT }}>
        Open spotlight slot
      </span>
      <span className="text-xs" style={{ color: SUB }}>
        Feature a collection below to fill it.
      </span>
    </button>
  )
}

export function SpotlightPodium({
  collections,
  onUnfeature,
  onAddMore,
}: {
  collections: Collection[]
  onUnfeature: (c: Collection) => void
  onAddMore?: () => void
}) {
  const top = collections.slice(0, 3)
  const [first, second, third] = top

  return (
    <div className="space-y-4">
      {/* Rank 1 — wide hero */}
      {first ? (
        <SpotlightCard collection={first} rank={1} variant="hero" onUnfeature={onUnfeature} />
      ) : (
        <EmptySlot onAddMore={onAddMore} />
      )}

      {/* Ranks 2 & 3 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {second ? (
          <SpotlightCard collection={second} rank={2} variant="standard" onUnfeature={onUnfeature} />
        ) : (
          <EmptySlot onAddMore={onAddMore} />
        )}
        {third ? (
          <SpotlightCard collection={third} rank={3} variant="standard" onUnfeature={onUnfeature} />
        ) : (
          <EmptySlot onAddMore={onAddMore} />
        )}
      </div>
    </div>
  )
}
