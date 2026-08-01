'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Monitor } from 'lucide-react'
import type { Collection } from '@/lib/types'
import { SolAmount } from '@/components/ui/SolIcon'
import {
  Artwork,
  LiveBadge,
  gradientFor,
  initials,
  GRID,
  SUB,
  SUB2,
  TEXT,
  CYAN,
} from './ui'

const SCRIM = 'linear-gradient(180deg, rgba(10,10,15,0) 35%, rgba(10,10,15,0.85) 100%)'

function statusOf(c: Collection) {
  return c.effectiveStatus ?? c.status
}

function CreatorChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
        style={{ background: gradientFor(name), color: 'rgba(255,255,255,0.9)' }}
      >
        {initials(name)}
      </span>
      <span style={{ color: '#d4d4dd' }}>{name}</span>
    </span>
  )
}

// ── Hero carousel — mirrors Frontend HeroSection (up to 5, minting-first, 5s) ──
function HeroCarousel({ collections }: { collections: Collection[] }) {
  const display = useMemo(() => {
    const minting = collections.filter((c) => statusOf(c) === 'minting')
    const others = collections.filter((c) => statusOf(c) !== 'minting')
    return [...minting, ...others].slice(0, 5)
  }, [collections])

  const n = display.length
  const [idx, setIdx] = useState(0)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    if (idx >= n && n > 0) setIdx(0)
  }, [n, idx])

  useEffect(() => {
    if (n <= 1 || hover) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 5000)
    return () => clearInterval(t)
  }, [n, hover])

  if (n === 0) return null

  const cur = Math.min(idx, n - 1)

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{ border: `1px solid ${GRID}` }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="flex motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
        style={{ transform: `translateX(-${cur * 100}%)` }}
      >
        {display.map((c) => (
          <div key={c.id} className="relative h-60 w-full shrink-0 md:h-72">
            <Artwork
              src={c.bannerUrl || c.imageUrl}
              seed={c.slug || c.name}
              label={c.name}
              className="h-full w-full"
              textClass="text-5xl"
            />
            <div className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-5">
              <div className="min-w-0">
                <h3 className="truncate text-2xl font-bold" style={{ color: TEXT }}>
                  {c.name}
                </h3>
                <div className="mt-1 text-xs">
                  <CreatorChip name={c.creator} />
                </div>
              </div>
              {statusOf(c) === 'minting' && <LiveBadge />}
            </div>
          </div>
        ))}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIdx((i) => (i === 0 ? n - 1 : i - 1))}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors hover:bg-[rgba(10,10,15,0.8)]"
            style={{ background: 'rgba(10,10,15,0.55)', backdropFilter: 'blur(8px)', border: `1px solid ${GRID}` }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => (i === n - 1 ? 0 : i + 1))}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors hover:bg-[rgba(10,10,15,0.8)]"
            style={{ background: 'rgba(10,10,15,0.55)', backdropFilter: 'blur(8px)', border: `1px solid ${GRID}` }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {display.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIdx(i)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === cur ? 20 : 6,
                  background: i === cur ? CYAN : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Featured drops grid — mirrors Frontend FeaturedDropsGrid (≤2 minting) ──────
function DropsGrid({ collections }: { collections: Collection[] }) {
  const drops = collections.filter((c) => statusOf(c) === 'minting').slice(0, 2)
  if (drops.length === 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {drops.map((c) => {
        const pct =
          c.totalSupply > 0 ? ((c.minted / c.totalSupply) * 100).toFixed(1) : '0'
        const free = c.price == null || c.price <= 0
        return (
          <div
            key={c.id}
            className="card hover-lift overflow-hidden"
            style={{ background: 'rgba(17,17,24,0.6)' }}
          >
            <div className="relative h-32 w-full">
              <Artwork
                src={c.bannerUrl || c.imageUrl}
                seed={c.slug || c.name}
                label={c.name}
                className="h-full w-full"
                textClass="text-2xl"
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="truncate text-sm font-semibold" style={{ color: TEXT }}>
                  {c.name}
                </h4>
                <LiveBadge />
              </div>
              <div className="mt-1.5 text-xs">
                <CreatorChip name={c.creator} />
              </div>

              <div
                className="mt-3 flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: '#0f0f16', border: `1px solid ${GRID}` }}
              >
                <Stat label="Price">
                  {free ? <span style={{ color: SUB2 }}>Free</span> : <SolAmount value={c.price} size={12} />}
                </Stat>
                <Divider />
                <Stat label="Minted">{pct}%</Stat>
                <Divider />
                <Stat label="Supply">{c.totalSupply.toLocaleString()}</Stat>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: SUB }}>
        {label}
      </span>
      <span className="text-xs font-semibold" style={{ color: TEXT }}>
        {children}
      </span>
    </div>
  )
}

function Divider() {
  return <span className="h-7 w-px" style={{ background: GRID }} />
}

export function HomepagePreview({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
        <span
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: 'rgba(0,212,255,0.08)', border: `1px solid ${GRID}`, color: SUB }}
        >
          <Eye className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium" style={{ color: TEXT }}>
          No featured collections to preview yet
        </p>
        <p className="mt-1 text-xs" style={{ color: SUB }}>
          Feature collections below to see how the homepage will look.
        </p>
      </div>
    )
  }

  const hasDrops = collections.some((c) => statusOf(c) === 'minting')

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Monitor className="h-4 w-4" style={{ color: SUB }} />
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: SUB }}
          >
            Homepage Preview — Hero
          </span>
        </div>
        <HeroCarousel collections={collections} />
      </div>

      {hasDrops && (
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Monitor className="h-4 w-4" style={{ color: SUB }} />
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: SUB }}
            >
              Homepage Preview — Featured Drops
            </span>
          </div>
          <DropsGrid collections={collections} />
        </div>
      )}
    </div>
  )
}
