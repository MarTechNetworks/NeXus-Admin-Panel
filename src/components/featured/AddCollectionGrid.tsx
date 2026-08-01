'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Star } from 'lucide-react'
import type { Collection } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Artwork, PriceChip, StatusPill, GRID, SUB, TEXT } from './ui'

const PAGE = 12

function CandidateCard({
  collection: c,
  onFeature,
  pending,
}: {
  collection: Collection
  onFeature: (c: Collection) => void
  pending: boolean
}) {
  const status = c.effectiveStatus ?? c.status
  return (
    <div className="card hover-lift overflow-hidden">
      <div className="relative">
        <Artwork
          src={c.bannerUrl || c.imageUrl}
          seed={c.slug || c.name}
          label={c.name}
          className="h-28 w-full"
          textClass="text-2xl"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(10,10,15,0) 45%, rgba(10,10,15,0.55) 100%)' }}
        />
        <div className="absolute left-2 top-2">
          <StatusPill status={status} glass />
        </div>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold" style={{ color: TEXT }}>
          {c.name}
        </p>
        <p className="truncate text-xs" style={{ color: SUB }}>
          {c.creator}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <PriceChip price={c.price} />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            isLoading={pending}
            onClick={() => onFeature(c)}
          >
            Feature
          </Button>
        </div>
      </div>
    </div>
  )
}

function SkeletonCandidate() {
  return (
    <div className="card overflow-hidden">
      <div className="h-28 w-full animate-pulse" style={{ background: '#1f1f2e' }} />
      <div className="space-y-2 p-3">
        <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
        <div className="h-3 w-1/2 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
        <div className="flex justify-between pt-1">
          <div className="h-6 w-12 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
          <div className="h-6 w-16 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
        </div>
      </div>
    </div>
  )
}

export function AddCollectionGrid({
  candidates,
  onFeature,
  search,
  onSearchChange,
  isLoading,
  pendingId,
}: {
  candidates: Collection[]
  onFeature: (c: Collection) => void
  search: string
  onSearchChange: (s: string) => void
  isLoading: boolean
  pendingId?: string | null
}) {
  const [visible, setVisible] = useState(PAGE)

  // Reset the window whenever the search term changes.
  useEffect(() => {
    setVisible(PAGE)
  }, [search])

  const shown = candidates.slice(0, visible)

  return (
    <div>
      <div className="mb-4 relative" style={{ maxWidth: 360 }}>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: SUB }}
        />
        <input
          type="text"
          placeholder="Search collections to feature…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input-base"
          style={{ paddingLeft: '2.25rem' }}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCandidate key={i} />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
          <span
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid ${GRID}`, color: '#f59e0b' }}
          >
            <Star className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium" style={{ color: TEXT }}>
            {search ? 'No collections match your search' : 'Nothing to add'}
          </p>
          <p className="mt-1 text-xs" style={{ color: SUB }}>
            {search
              ? 'Try a different name or clear the search.'
              : 'All loaded collections are already featured.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((c) => (
              <CandidateCard
                key={c.id}
                collection={c}
                onFeature={onFeature}
                pending={pendingId === c.id}
              />
            ))}
          </div>
          {candidates.length > visible && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>
                Show more ({candidates.length - visible})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
