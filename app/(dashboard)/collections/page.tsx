'use client'

import { useState, type ReactNode } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { SkeletonKpi } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/modals/ConfirmDialog'
import {
  useCollections,
  useAdminStats,
  useAdminUpdateCollection,
  useAdminDeleteCollection,
  useTriggerSync,
} from '@/lib/api/hooks'
import { formatRelativeTime } from '@/lib/utils'
import type { Collection, CollectionStatus } from '@/lib/types'
import {
  Search,
  LayoutGrid,
  List,
  Star,
  Users,
  Layers,
  Sparkles,
  Flame,
  ExternalLink,
  Pause,
  Play,
  Trash2,
  ImageOff,
} from 'lucide-react'

// ── Design tokens (match revenue / dashboard) ───────────────────────────────
const CYAN = '#00d4ff'
const PURPLE = '#7c3aed'
const GREEN = '#10b981'
const AMBER = '#f59e0b'
const RED = '#ef4444'
const BLUE = '#3b82f6'
const GRID = '#252535'
const TEXT = '#ffffff'
const SUB = '#8a8a9a'
const SUB2 = '#b8b8c8'

const STATUS_ACCENT: Record<CollectionStatus, string> = {
  draft: SUB,
  preparing: BLUE,
  ready: CYAN,
  minting: GREEN,
  completed: PURPLE,
  paused: AMBER,
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'minting', label: 'Minting' },
  { value: 'completed', label: 'Completed' },
  { value: 'paused', label: 'Paused' },
]

const PAGE_SIZE = 12

// IPFS gateway — mirrors the Frontend so ipfs:// artwork actually loads in a browser.
const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://ipfs-gateway.nexus-web3.com/ipfs/'

/** Converts ipfs:// URIs to HTTP gateway URLs; passes through normal URLs. */
function resolveUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('ipfs://')) return `${IPFS_GATEWAY}${url.slice(7)}`
  return url
}

function truncateAddress(addr: string) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Deterministic dark gradient seeded from a string — used as artwork fallback. */
function gradientFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const a = h % 360
  const b = (a + 65) % 360
  return `linear-gradient(135deg, hsl(${a} 65% 24%), hsl(${b} 70% 13%))`
}

function initials(name: string): string {
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

function fmtPrice(price?: number): string {
  return price != null && price > 0 ? `${price} SOL` : 'Free'
}

// ── Small presentational pieces ─────────────────────────────────────────────

function Artwork({
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

function StatusPill({ status, glass = false }: { status: CollectionStatus; glass?: boolean }) {
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

function MintProgress({
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

function PriceChip({ price }: { price?: number }) {
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

function FeaturedStar({
  featured,
  onClick,
  floating = false,
}: {
  featured: boolean
  onClick: () => void
  floating?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={featured ? 'Remove from featured' : 'Add to featured'}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
      style={
        floating
          ? { background: 'rgba(10,10,15,0.55)', backdropFilter: 'blur(8px)', border: `1px solid ${GRID}` }
          : undefined
      }
    >
      <Star
        className="h-4 w-4"
        style={{ color: featured ? AMBER : SUB }}
        fill={featured ? AMBER : 'none'}
      />
    </button>
  )
}

function IconAction({
  title,
  color,
  href,
  onClick,
  children,
}: {
  title: string
  color: string
  href?: string
  onClick?: () => void
  children: ReactNode
}) {
  const cls =
    'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#1f1f2e]'
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        onClick={(e) => e.stopPropagation()}
        className={cls}
        style={{ color }}
      >
        {children}
      </a>
    )
  }
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cls}
      style={{ color }}
    >
      {children}
    </button>
  )
}

function RowActions({
  col,
  onPauseResume,
  onDelete,
}: {
  col: Collection
  onPauseResume: (col: Collection) => void
  onDelete: (col: Collection) => void
}) {
  const paused = col.effectiveStatus === 'paused'
  return (
    <div className="flex items-center gap-1">
      {col.mintAddress && (
        <IconAction
          title="View on Solana Explorer"
          color={CYAN}
          href={`https://explorer.solana.com/address/${col.mintAddress}`}
        >
          <ExternalLink className="h-4 w-4" />
        </IconAction>
      )}
      <IconAction
        title={paused ? 'Resume' : 'Pause'}
        color={AMBER}
        onClick={() => onPauseResume(col)}
      >
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </IconAction>
      <IconAction title="Delete" color={RED} onClick={() => onDelete(col)}>
        <Trash2 className="h-4 w-4" />
      </IconAction>
    </div>
  )
}

// ── KPI tiles ────────────────────────────────────────────────────────────────

function KpiTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode
  label: string
  value: string | number
  accent: string
}) {
  return (
    <div className="card hover-lift p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: SUB }}>
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold" style={{ color: TEXT }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${accent}1a`, border: `1px solid ${accent}33`, color: accent }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

// ── Grid card ────────────────────────────────────────────────────────────────

function CollectionCard({
  col,
  onOpen,
  onToggleFeatured,
  onPauseResume,
  onDelete,
}: {
  col: Collection
  onOpen: (col: Collection) => void
  onToggleFeatured: (col: Collection) => void
  onPauseResume: (col: Collection) => void
  onDelete: (col: Collection) => void
}) {
  const accent = STATUS_ACCENT[col.effectiveStatus] ?? SUB
  const seed = col.slug || col.name
  return (
    <div
      className="card hover-lift cursor-pointer overflow-hidden"
      onClick={() => onOpen(col)}
    >
      {/* Cover */}
      <div className="relative">
        <Artwork
          src={col.bannerUrl || col.imageUrl}
          seed={seed}
          label={col.name}
          className="h-36 w-full"
          textClass="text-3xl"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,10,15,0) 45%, rgba(10,10,15,0.55) 100%)',
          }}
        />
        <div className="absolute left-3 top-3">
          <StatusPill status={col.effectiveStatus} glass />
        </div>
        <div className="absolute right-3 top-3">
          <FeaturedStar featured={col.featured} onClick={() => onToggleFeatured(col)} floating />
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <p className="truncate text-sm font-semibold" style={{ color: TEXT }}>
          {col.name}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: SUB }}>
          {col.creator} · <span className="font-mono">{truncateAddress(col.creatorAddress)}</span>
        </p>

        <div className="mt-3">
          <MintProgress minted={col.minted} total={col.totalSupply} accent={accent} />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <PriceChip price={col.price} />
          <span className="text-xs" style={{ color: SUB }}>
            {formatRelativeTime(col.createdAt)}
          </span>
        </div>

        <div
          className="mt-3 flex items-center justify-end border-t pt-3"
          style={{ borderColor: GRID }}
        >
          <RowActions col={col} onPauseResume={onPauseResume} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="h-36 w-full animate-pulse" style={{ background: '#1f1f2e' }} />
      <div className="space-y-3 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
        <div className="h-3 w-1/2 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
        <div className="h-1.5 w-full animate-pulse rounded-full" style={{ background: '#1f1f2e' }} />
        <div className="flex justify-between">
          <div className="h-6 w-14 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
          <div className="h-6 w-16 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: 'rgba(0,212,255,0.08)', border: `1px solid ${GRID}`, color: SUB }}
      >
        <ImageOff className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium" style={{ color: TEXT }}>
        No collections found
      </p>
      <p className="mt-1 text-xs" style={{ color: SUB }}>
        Try adjusting your search or filters.
      </p>
    </div>
  )
}

// ── Detail drawer ────────────────────────────────────────────────────────────

function DrawerStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: '#0f0f16', border: `1px solid ${GRID}` }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: SUB }}>
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold" style={{ color: TEXT }}>
        {value}
      </p>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4">
      <dt className="w-32 flex-shrink-0" style={{ color: SUB }}>
        {label}
      </dt>
      <dd className={`break-all ${mono ? 'font-mono text-xs' : ''}`} style={{ color: SUB2 }}>
        {value}
      </dd>
    </div>
  )
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: SUB }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function CollectionDrawer({
  collection,
  onClose,
}: {
  collection: Collection
  onClose: () => void
}) {
  const accent = STATUS_ACCENT[collection.effectiveStatus] ?? SUB
  const seed = collection.slug || collection.name
  return (
    <Drawer open={!!collection} onClose={onClose} title={collection.name}>
      <div className="space-y-6 text-sm">
        {/* Banner header */}
        <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${GRID}` }}>
          <div className="relative">
            <Artwork
              src={collection.bannerUrl || collection.imageUrl}
              seed={seed}
              label={collection.name}
              className="h-28 w-full"
              textClass="text-3xl"
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'linear-gradient(180deg, rgba(10,10,15,0) 40%, rgba(10,10,15,0.7))' }}
            />
            <div className="absolute bottom-3 left-3 flex items-center gap-3">
              <Artwork
                src={collection.imageUrl || collection.bannerUrl}
                seed={seed}
                label={collection.name}
                className="h-12 w-12 rounded-xl"
                textClass="text-sm"
              />
              <div>
                <StatusPill status={collection.effectiveStatus} glass />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3" style={{ background: '#111118' }}>
            <DrawerStat label="Supply" value={collection.totalSupply.toLocaleString()} />
            <DrawerStat label="Minted" value={collection.minted.toLocaleString()} />
            <DrawerStat label="Price" value={fmtPrice(collection.price)} />
          </div>
          <div className="px-3 pb-3" style={{ background: '#111118' }}>
            <MintProgress
              minted={collection.minted}
              total={collection.totalSupply}
              accent={accent}
            />
          </div>
        </div>

        <DrawerSection title="Identity">
          <dl className="space-y-2">
            <Row label="Slug" value={collection.slug} mono />
            <Row label="Creator" value={collection.creator} />
            <Row label="Creator Address" value={collection.creatorAddress} mono />
            <Row label="Blockchain" value={collection.blockchain} />
          </dl>
        </DrawerSection>

        {collection.mintAddress && (
          <DrawerSection title="On-chain">
            <dl className="space-y-2">
              <Row label="Mint Address" value={collection.mintAddress} mono />
              {collection.txSignature && (
                <Row label="Tx Signature" value={`${collection.txSignature.slice(0, 20)}…`} mono />
              )}
              <div className="pt-1">
                <a
                  href={`https://explorer.solana.com/address/${collection.mintAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                  style={{ color: CYAN }}
                >
                  View on Solana Explorer <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </dl>
          </DrawerSection>
        )}

        <DrawerSection title="Economics">
          <dl className="space-y-2">
            <Row label="Price" value={fmtPrice(collection.price)} />
            <Row
              label="Royalty"
              value={
                collection.royaltyBasisPoints != null
                  ? `${collection.royaltyBasisPoints / 100}%`
                  : '—'
              }
            />
            <Row
              label="Platform Fee"
              value={
                collection.platformFeeBasisPoints != null
                  ? `${collection.platformFeeBasisPoints / 100}%`
                  : '—'
              }
            />
            {collection.fundReceivers && collection.fundReceivers.length > 0 && (
              <div>
                <dt style={{ color: SUB }}>Fund Receivers</dt>
                <dd className="mt-1">
                  <pre
                    className="overflow-x-auto rounded p-2 text-xs"
                    style={{ background: '#1a1a24', color: SUB2 }}
                  >
                    {JSON.stringify(collection.fundReceivers, null, 2)}
                  </pre>
                </dd>
              </div>
            )}
          </dl>
        </DrawerSection>

        {collection.phases && collection.phases.length > 0 && (
          <DrawerSection title="Mint Phases">
            <pre
              className="overflow-x-auto rounded p-2 text-xs"
              style={{ background: '#1a1a24', color: SUB2 }}
            >
              {JSON.stringify(collection.phases, null, 2)}
            </pre>
          </DrawerSection>
        )}

        {(collection.twitterUrl || collection.discordUrl || collection.websiteUrl) && (
          <DrawerSection title="Social Links">
            <div className="space-y-1">
              {collection.twitterUrl && (
                <a
                  href={collection.twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block underline"
                  style={{ color: CYAN }}
                >
                  Twitter ↗
                </a>
              )}
              {collection.discordUrl && (
                <a
                  href={collection.discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block underline"
                  style={{ color: CYAN }}
                >
                  Discord ↗
                </a>
              )}
              {collection.websiteUrl && (
                <a
                  href={collection.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block underline"
                  style={{ color: CYAN }}
                >
                  Website ↗
                </a>
              )}
            </div>
          </DrawerSection>
        )}
      </div>
    </Drawer>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  // `GET /api/collections` is keyset/cursor paginated — it hands back an opaque
  // `nextCursor` and deliberately never computes a total (see the COUNT(*) rant in
  // collections.service.ts). So there is no page count to jump around in: we keep
  // the cursor that opened each page we've visited and walk the stack.
  // cursors[0] is undefined = page 1.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [featuredOnly, setFeaturedOnly] = useState(false)
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [selected, setSelected] = useState<Collection | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Collection | null>(null)
  const [confirmPause, setConfirmPause] = useState<{
    collection: Collection
    action: 'paused' | 'ready'
  } | null>(null)

  const { data: stats, isLoading: statsLoading } = useAdminStats()
  const { data, isLoading, isFetching } = useCollections({
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status,
    // `featured: false` would mean "unfeatured only" — the toggle is on/off, so
    // send the filter only when it is on.
    featured: featuredOnly ? true : undefined,
    cursor: cursors[pageIndex],
  })

  // Any filter change invalidates the whole cursor stack: cursors are keyset
  // positions within a specific query, so replaying one against a different
  // filter set would land on the wrong rows.
  const resetPaging = () => {
    setCursors([undefined])
    setPageIndex(0)
  }

  const updateMutation = useAdminUpdateCollection()
  const deleteMutation = useAdminDeleteCollection()
  const syncMutation = useTriggerSync()

  const handleToggleFeatured = (col: Collection) => {
    updateMutation.mutate({ id: col.id, data: { featured: !col.featured } })
  }

  const handlePauseResume = (col: Collection) => {
    setConfirmPause({
      collection: col,
      action: col.effectiveStatus === 'paused' ? 'ready' : 'paused',
    })
  }

  const handleForceStatus = () => {
    if (!confirmPause) return
    updateMutation.mutate(
      { id: confirmPause.collection.id, data: { status: confirmPause.action } },
      { onSuccess: () => setConfirmPause(null) }
    )
  }

  const handleDelete = () => {
    if (!confirmDelete) return
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => setConfirmDelete(null),
    })
  }

  const handleSync = () => {
    syncMutation.mutate()
  }

  const rows = data?.data ?? []
  const nextCursor = data?.nextCursor ?? null
  const hasPrev = pageIndex > 0
  const hasNext = !!nextCursor

  const goNext = () => {
    if (!nextCursor) return
    setCursors((prev) => {
      const next = prev.slice(0, pageIndex + 1)
      next.push(nextCursor)
      return next
    })
    setPageIndex((i) => i + 1)
  }

  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1))

  const kpis = [
    { label: 'Collections', value: stats?.totalCollections ?? 0, accent: CYAN, icon: <Layers className="h-5 w-5" strokeWidth={1.75} /> },
    { label: 'Total Minted', value: stats?.totalMinted ?? 0, accent: PURPLE, icon: <Sparkles className="h-5 w-5" strokeWidth={1.75} /> },
    { label: 'Active Mints', value: stats?.activeCollections ?? 0, accent: GREEN, icon: <Flame className="h-5 w-5" strokeWidth={1.75} /> },
    { label: 'Featured', value: stats?.featuredCount ?? 0, accent: AMBER, icon: <Star className="h-5 w-5" strokeWidth={1.75} /> },
    { label: 'Creators', value: stats?.uniqueCreators ?? 0, accent: CYAN, icon: <Users className="h-5 w-5" strokeWidth={1.75} /> },
  ]

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Collections' }]}
      actions={
        <Button variant="secondary" onClick={handleSync} isLoading={syncMutation.isPending}>
          Trigger Sync
        </Button>
      }
    >
      {/* KPI summary */}
      <section className="mb-8">
        <h2
          className="mb-4 text-xs font-semibold uppercase tracking-widest"
          style={{ color: SUB }}
        >
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {statsLoading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} />)
            : kpis.map((k) => (
                <KpiTile
                  key={k.label}
                  icon={k.icon}
                  label={k.label}
                  value={k.value}
                  accent={k.accent}
                />
              ))}
        </div>
      </section>

      {/* Toolbar */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1" style={{ minWidth: 220, maxWidth: 360 }}>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: SUB }}
            />
            <input
              type="text"
              placeholder="Search collections…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPaging()
              }}
              className="input-base"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setFeaturedOnly((v) => !v)
              resetPaging()
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{
              background: featuredOnly ? 'rgba(245,158,11,0.12)' : 'transparent',
              color: featuredOnly ? AMBER : SUB,
              border: `1px solid ${featuredOnly ? 'rgba(245,158,11,0.4)' : GRID}`,
            }}
          >
            <Star className="h-3.5 w-3.5" fill={featuredOnly ? AMBER : 'none'} />
            Featured
          </button>

          <div className="ml-auto flex items-center gap-3">
            {/* Count for this page only. The list endpoint returns no total, and
                stats.totalCollections is the unfiltered platform-wide count — using
                it here would misreport every filtered view. */}
            {data && (
              <span className="text-xs" style={{ color: SUB }}>
                {rows.length} on this page
              </span>
            )}
            <div
              className="flex items-center gap-1 rounded-lg p-1"
              style={{ background: '#111118', border: `1px solid ${GRID}` }}
            >
              {([
                { v: 'grid', icon: <LayoutGrid className="h-4 w-4" /> },
                { v: 'table', icon: <List className="h-4 w-4" /> },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setView(o.v)}
                  title={o.v === 'grid' ? 'Grid view' : 'Table view'}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  style={{
                    background: view === o.v ? 'rgba(0,212,255,0.12)' : 'transparent',
                    color: view === o.v ? CYAN : SUB,
                  }}
                >
                  {o.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map((o) => {
            const active = status === o.value
            const accent = o.value === 'all' ? CYAN : STATUS_ACCENT[o.value as CollectionStatus] ?? CYAN
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setStatus(o.value)
                  resetPaging()
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: active ? `${accent}1f` : 'transparent',
                  color: active ? accent : SUB,
                  border: `1px solid ${active ? `${accent}4d` : GRID}`,
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        view === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden p-4">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 w-full animate-pulse rounded" style={{ background: '#1f1f2e' }} />
              ))}
            </div>
          </div>
        )
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((col) => (
            <CollectionCard
              key={col.id}
              col={col}
              onOpen={setSelected}
              onToggleFeatured={handleToggleFeatured}
              onPauseResume={handlePauseResume}
              onDelete={setConfirmDelete}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: GRID }}>
            <thead style={{ background: '#1a1a24' }}>
              <tr>
                {['Collection', 'Status', 'Mint Progress', 'Price', 'Featured', 'Created', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: SUB }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: GRID }}>
              {rows.map((col) => {
                const accent = STATUS_ACCENT[col.effectiveStatus] ?? SUB
                return (
                  <tr
                    key={col.id}
                    className="cursor-pointer transition-colors hover:bg-[#16161f]"
                    onClick={() => setSelected(col)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Artwork
                          src={col.imageUrl || col.bannerUrl}
                          seed={col.slug || col.name}
                          label={col.name}
                          className="h-10 w-10 shrink-0 rounded-lg"
                          textClass="text-xs"
                        />
                        <div className="min-w-0">
                          <p
                            className="max-w-[200px] truncate text-sm font-medium"
                            style={{ color: TEXT }}
                          >
                            {col.name}
                          </p>
                          <p
                            className="max-w-[200px] truncate font-mono text-xs"
                            style={{ color: SUB }}
                          >
                            {truncateAddress(col.creatorAddress)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={col.effectiveStatus} />
                    </td>
                    <td className="px-4 py-3" style={{ minWidth: 160 }}>
                      <MintProgress minted={col.minted} total={col.totalSupply} accent={accent} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm" style={{ color: SUB2 }}>
                      {fmtPrice(col.price)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <FeaturedStar
                        featured={col.featured}
                        onClick={() => handleToggleFeatured(col)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: SUB }}>
                      {formatRelativeTime(col.createdAt)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        col={col}
                        onPauseResume={handlePauseResume}
                        onDelete={setConfirmDelete}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination. No "of N" — the API returns no total, and inventing one
          would be a guess presented as a fact. */}
      {(hasPrev || hasNext) && (
        <div className="mt-6 flex items-center justify-between">
          <Button variant="secondary" onClick={goPrev} disabled={!hasPrev || isFetching}>
            Previous
          </Button>
          <span className="text-sm" style={{ color: SUB }}>
            Page {pageIndex + 1}
          </span>
          <Button variant="secondary" onClick={goNext} disabled={!hasNext || isFetching}>
            Next
          </Button>
        </div>
      )}

      {/* Detail drawer */}
      {selected && <CollectionDrawer collection={selected} onClose={() => setSelected(null)} />}

      {/* Pause / Resume confirm */}
      {confirmPause && (
        <ConfirmDialog
          open={!!confirmPause}
          onClose={() => setConfirmPause(null)}
          onConfirm={handleForceStatus}
          title={confirmPause.action === 'paused' ? 'Pause Collection' : 'Resume Collection'}
          message={
            confirmPause.action === 'paused'
              ? `Pause "${confirmPause.collection.name}"? Minting will be suspended.`
              : `Resume "${confirmPause.collection.name}"? Status will be set back to ready.`
          }
          confirmLabel={confirmPause.action === 'paused' ? 'Pause' : 'Resume'}
          variant={confirmPause.action === 'paused' ? 'danger' : 'primary'}
          isLoading={updateMutation.isPending}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          title="Delete Collection"
          message={`Permanently delete "${confirmDelete.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          isLoading={deleteMutation.isPending}
        />
      )}
    </MainLayout>
  )
}
