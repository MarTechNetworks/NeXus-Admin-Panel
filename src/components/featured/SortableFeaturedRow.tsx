'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowUp, ArrowDown, GripVertical, Trash2 } from 'lucide-react'
import type { Collection } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import {
  Artwork,
  MintProgress,
  StatusPill,
  STATUS_ACCENT,
  rankColor,
  GRID,
  SUB,
  SUB2,
  TEXT,
} from './ui'

interface SortableFeaturedRowProps {
  collection: Collection
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onUnfeature: () => void
}

export function SortableFeaturedRow({
  collection: c,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onUnfeature,
}: SortableFeaturedRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: c.id })

  const rank = index + 1
  const accent = STATUS_ACCENT[c.effectiveStatus ?? c.status] ?? SUB
  const medal = rankColor(rank)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging
      ? '0 12px 28px rgba(0,0,0,0.45), 0 0 22px rgba(0,212,255,0.14)'
      : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: '#111118', borderColor: isDragging ? '#2a2a3a' : GRID }}
      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-[#2a2a3a]"
    >
      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Drag to reorder ${c.name}`}
        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-[#8a8a9a] transition-colors hover:bg-[#1f1f2e] hover:text-white active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Rank medal */}
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold"
        style={{
          color: rank <= 3 ? '#0a0a0f' : medal,
          background: rank <= 3 ? medal : `${medal}1a`,
          border: `1px solid ${medal}${rank <= 3 ? '' : '4d'}`,
          boxShadow: rank <= 3 ? `0 0 10px ${medal}55` : undefined,
        }}
      >
        {rank}
      </span>

      {/* Artwork */}
      <Artwork
        src={c.imageUrl || c.bannerUrl}
        seed={c.slug || c.name}
        label={c.name}
        className="h-11 w-11 shrink-0 rounded-lg"
        textClass="text-sm"
      />

      {/* Name + creator */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: TEXT }}>
          {c.name}
        </p>
        <p className="truncate text-xs" style={{ color: SUB }}>
          {c.creator} · {c.minted.toLocaleString()}
          {c.totalSupply ? `/${c.totalSupply.toLocaleString()}` : ''} minted
        </p>
      </div>

      {/* Mint progress (wide screens) */}
      <div className="hidden w-40 shrink-0 lg:block">
        <MintProgress minted={c.minted} total={c.totalSupply} accent={accent} />
      </div>

      {/* Status */}
      <div className="hidden shrink-0 sm:block">
        <StatusPill status={c.effectiveStatus ?? c.status} />
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onMoveUp} disabled={index === 0} title="Move up">
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Move down"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button variant="danger" size="sm" onClick={onUnfeature} title="Remove from featured">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
