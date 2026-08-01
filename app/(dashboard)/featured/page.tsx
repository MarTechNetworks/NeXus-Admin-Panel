'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { Check, Crown, Eye, Flame, Layers, RefreshCw, Sparkles, Star } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/dashboard/StatCard'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { SectionHeading } from '@/components/dashboard/SectionHeading'
import { SkeletonKpi } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/modals/ConfirmDialog'
import {
  useFeaturedCollections,
  useReorderFeatured,
  useAdminUpdateCollection,
  useCollections,
  useAdminStats,
} from '@/lib/api/hooks'
import type { Collection } from '@/lib/types'

import { SortableFeaturedRow } from '@/components/featured/SortableFeaturedRow'
import { SpotlightPodium } from '@/components/featured/SpotlightPodium'
import { HomepagePreview } from '@/components/featured/HomepagePreview'
import { AddCollectionGrid } from '@/components/featured/AddCollectionGrid'
import { AMBER, BLUE, CYAN, GREEN, GRID, PURPLE, SUB } from '@/components/featured/ui'

type View = 'spotlight' | 'preview'

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ── View toggle (Spotlight ⇄ Live preview) ───────────────────────────────────
function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: Array<{ v: View; label: string; icon: typeof Sparkles }> = [
    { v: 'spotlight', label: 'Spotlight', icon: Sparkles },
    { v: 'preview', label: 'Live preview', icon: Eye },
  ]
  return (
    <div
      className="flex items-center gap-1 rounded-lg p-1"
      style={{ background: '#111118', border: `1px solid ${GRID}` }}
    >
      {opts.map((o) => {
        const active = view === o.v
        const Icon = o.icon
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? 'rgba(0,212,255,0.12)' : 'transparent',
              color: active ? CYAN : SUB,
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Reorder saving indicator ─────────────────────────────────────────────────
function SavingIndicator({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: SUB }}>
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${SUB} transparent ${SUB} ${SUB}` }}
        />
        Saving order…
      </span>
    )
  }
  if (saved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: GREEN }}>
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    )
  }
  return null
}

export default function FeaturedPage() {
  const { data: featured, isLoading, refetch } = useFeaturedCollections()
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useAdminStats()
  const reorder = useReorderFeatured()
  const update = useAdminUpdateCollection()

  // Candidate search (debounced into the collections query).
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])
  const { data: allCollections, isLoading: candidatesLoading } = useCollections({
    pageSize: 50,
    search: debounced || undefined,
  })

  // Local working copy so drag/up-down feel instant; resync when server data changes.
  const [order, setOrder] = useState<Collection[]>([])
  const isDraggingRef = useRef(false)
  const lastCommittedRef = useRef<Collection[]>([])

  useEffect(() => {
    if (!featured) return
    // Don't clobber an in-progress drag or an unsettled reorder mutation.
    if (isDraggingRef.current || reorder.isPending) return
    setOrder(featured)
    lastCommittedRef.current = featured
  }, [featured, reorder.isPending])

  const [view, setView] = useState<View>('spotlight')
  const [confirmUnfeature, setConfirmUnfeature] = useState<Collection | null>(null)
  const [featuringId, setFeaturingId] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addRef = useRef<HTMLDivElement>(null)

  function flashSaved() {
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1800)
  }
  useEffect(() => {
    return () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current)
      }
    }
  }, [])

  // ── Persistence ────────────────────────────────────────────────────────────
  function persist(next: Collection[]) {
    const prev = lastCommittedRef.current
    setOrder(next)
    reorder.mutate(
      next.map((c) => c.id),
      {
        onSuccess: () => {
          lastCommittedRef.current = next
          flashSaved()
        },
        onError: () => setOrder(prev),
      }
    )
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= order.length) return
    persist(arrayMove(order, index, target))
  }

  function unfeature(c: Collection) {
    const prev = lastCommittedRef.current
    const next = order.filter((o) => o.id !== c.id)
    setOrder(next)
    lastCommittedRef.current = next
    update.mutate(
      { id: c.id, data: { featured: false } },
      { onError: () => setOrder(prev) }
    )
  }

  function feature(c: Collection) {
    setFeaturingId(c.id)
    const next = [...order, c]
    setOrder(next)
    lastCommittedRef.current = next
    update.mutate(
      { id: c.id, data: { featured: true } },
      { onSettled: () => setFeaturingId(null) }
    )
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function onDragEnd(event: DragEndEvent) {
    isDraggingRef.current = false
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.findIndex((c) => c.id === active.id)
    const newIndex = order.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    persist(arrayMove(order, oldIndex, newIndex))
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const featuredIds = useMemo(() => new Set(order.map((c) => c.id)), [order])
  const candidates = useMemo(
    () => (allCollections?.data ?? []).filter((c) => !c.featured && !featuredIds.has(c.id)),
    [allCollections, featuredIds]
  )

  const metrics = useMemo(() => {
    const count = order.length
    const minted = order.reduce((s, c) => s + (c.minted || 0), 0)
    const supply = order.reduce((s, c) => s + (c.totalSupply || 0), 0)
    const ratios = order.filter((c) => c.totalSupply > 0).map((c) => c.minted / c.totalSupply)
    const avg = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : 0
    const top = order.length ? [...order].sort((a, b) => b.minted - a.minted)[0] : undefined
    return { count, minted, supply, avg, top }
  }, [order])

  const loadingTop = isLoading || statsLoading

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Featured' }]}
      actions={
        <Button
          variant="secondary"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => {
            refetch()
            refetchStats()
          }}
        >
          Refresh
        </Button>
      }
    >
      {/* Hero */}
      <section
        className="card mb-6 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
        style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(124,58,237,0.06) 100%)' }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: AMBER }}
          >
            <Sparkles className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#ffffff' }}>
              Showcase Studio
            </h1>
            <p className="mt-1 text-sm" style={{ color: SUB }}>
              Curate what lands on the launchpad homepage. Order is prominence — drag to arrange the spotlight.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SavingIndicator saving={reorder.isPending} saved={savedFlash} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </section>

      {/* KPI row */}
      <section className="mb-8">
        <SectionHeading>Spotlight Metrics</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {loadingTop ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} />)
          ) : (
            <>
              <StatCard
                icon={Star}
                accent={AMBER}
                label="Featured"
                value={stats?.featuredCount ?? metrics.count}
                sub="on the homepage"
              />
              <StatCard
                icon={Sparkles}
                accent={PURPLE}
                label="Combined Minted"
                value={metrics.minted.toLocaleString()}
                sub="across featured"
              />
              <StatCard
                icon={Flame}
                accent={CYAN}
                label="Avg Progress"
                value={`${metrics.avg}%`}
                sub="across featured"
              />
              <StatCard
                icon={Layers}
                accent={BLUE}
                label="Featured Supply"
                value={metrics.supply.toLocaleString()}
                sub="combined supply"
              />
              <StatCard
                icon={Crown}
                accent={GREEN}
                valueColor={metrics.top ? '#ffffff' : SUB}
                label="Top Performer"
                value={
                  metrics.top ? (
                    <span className="text-lg">{truncate(metrics.top.name, 16)}</span>
                  ) : (
                    '—'
                  )
                }
                sub={metrics.top ? `${metrics.top.minted.toLocaleString()} minted` : 'No featured yet'}
              />
            </>
          )}
        </div>
      </section>

      {/* Showcase (toggled) */}
      <section className="mb-8">
        <SectionHeading actions={<ViewToggle view={view} onChange={setView} />}>
          {view === 'spotlight' ? 'Homepage Spotlight' : 'Live Homepage Preview'}
        </SectionHeading>
        {isLoading ? (
          <div className="card h-64 w-full animate-pulse" style={{ background: '#1f1f2e' }} />
        ) : view === 'spotlight' ? (
          <SpotlightPodium
            collections={order}
            onUnfeature={(c) => setConfirmUnfeature(c)}
            onAddMore={() => addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        ) : (
          <HomepagePreview collections={order} />
        )}
      </section>

      {/* Reorder list */}
      <section className="mb-8">
        <ChartCard
          flush
          title="Display Order"
          subtitle="Drag to reorder · top = most prominent"
          actions={<SavingIndicator saving={reorder.isPending} saved={savedFlash} />}
        >
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 w-full animate-pulse rounded-lg" style={{ background: '#1f1f2e' }} />
              ))}
            </div>
          ) : order.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <span
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid ${GRID}`, color: AMBER }}
              >
                <Star className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium" style={{ color: '#ffffff' }}>
                No featured collections yet
              </p>
              <p className="mt-1 text-xs" style={{ color: SUB }}>
                Feature collections below to build your homepage showcase.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragStart={() => {
                isDraggingRef.current = true
              }}
              onDragEnd={onDragEnd}
              onDragCancel={() => {
                isDraggingRef.current = false
              }}
            >
              <SortableContext items={order.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 p-3">
                  {order.map((c, i) => (
                    <SortableFeaturedRow
                      key={c.id}
                      collection={c}
                      index={i}
                      total={order.length}
                      onMoveUp={() => move(i, -1)}
                      onMoveDown={() => move(i, 1)}
                      onUnfeature={() => setConfirmUnfeature(c)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </ChartCard>
      </section>

      {/* Add to showcase */}
      <section ref={addRef}>
        <SectionHeading>Add to Showcase</SectionHeading>
        <AddCollectionGrid
          candidates={candidates}
          onFeature={feature}
          search={search}
          onSearchChange={setSearch}
          isLoading={candidatesLoading}
          pendingId={featuringId}
        />
      </section>

      {/* Unfeature confirm */}
      {confirmUnfeature && (
        <ConfirmDialog
          open={!!confirmUnfeature}
          onClose={() => setConfirmUnfeature(null)}
          onConfirm={() => {
            unfeature(confirmUnfeature)
            setConfirmUnfeature(null)
          }}
          title="Remove from Featured"
          message={`Remove "${confirmUnfeature.name}" from the homepage showcase? You can re-add it anytime.`}
          confirmLabel="Remove"
          variant="danger"
          isLoading={update.isPending}
        />
      )}
    </MainLayout>
  )
}
