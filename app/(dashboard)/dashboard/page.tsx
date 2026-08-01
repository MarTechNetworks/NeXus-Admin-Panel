'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { SkeletonKpi } from '@/components/ui/Skeleton'
import { useAuth } from '@/lib/auth/context'
import {
  useAdminStats,
  useCollections,
  useCreators,
  useAuditLog,
  useRevenueTimeseries,
} from '@/lib/api/hooks'
import { StatCard } from '@/components/dashboard/StatCard'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { SectionHeading } from '@/components/dashboard/SectionHeading'
import { Leaderboard, type LeaderboardItem } from '@/components/dashboard/Leaderboard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { SolAmount } from '@/components/ui/SolIcon'
import { statusColor, statusLabel, timeGreeting } from '@/lib/dashboard'
import { Coins, Flame, LayoutGrid, RefreshCw, Sparkles, Star, Users } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const CYAN = '#00d4ff'
const PURPLE = '#7c3aed'
const GREEN = '#10b981'
const AMBER = '#f59e0b'
const GRID = '#252535'

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

const tooltipStyle = {
  background: '#111118',
  border: `1px solid ${GRID}`,
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data: stats, isLoading: statsLoading, refetch } = useAdminStats()
  // One page of 50 is enough for the donut and the leaderboards; this view is a
  // summary, not a browser. Deeper listing lives on /collections.
  const { data: collectionsPage } = useCollections({ pageSize: 50 })
  const { data: creators } = useCreators()
  const { data: activityPage, isLoading: activityLoading } = useAuditLog({ page: 1, pageSize: 8 })
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('day')
  const { data: series } = useRevenueTimeseries({ bucket })

  // Time-of-day greeting, computed after mount to avoid SSR/CSR hydration mismatch.
  const [greeting, setGreeting] = useState('Welcome back')
  useEffect(() => {
    setGreeting(timeGreeting(new Date().getHours()))
  }, [])

  const collections = useMemo(() => collectionsPage?.data ?? [], [collectionsPage])

  const statusDist = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of collections) {
      counts.set(c.effectiveStatus, (counts.get(c.effectiveStatus) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([name, value]) => ({
      name,
      value,
      color: statusColor(name),
    }))
  }, [collections])

  const topByMinted = useMemo(
    () => [...collections].sort((a, b) => b.minted - a.minted).slice(0, 8),
    [collections]
  )

  const topCreators = useMemo(
    () => [...(creators ?? [])].sort((a, b) => b.feeRevenue - a.feeRevenue).slice(0, 5),
    [creators]
  )

  const activity = activityPage?.data ?? []
  const useRevenueChart = !!series && series.length > 0

  // KPI sparklines come from the fee ledger or they do not appear at all.
  // They used to fall back to a synthesized curve anchored to the live value —
  // a real number wearing an invented trend, which is worse than no trend.
  // StatCard falls back to its `sub` label when `spark` is undefined.
  const revenueSpark = useRevenueChart ? series!.map((p) => p.feeRevenue) : undefined
  const mintedSpark = useRevenueChart ? series!.map((p) => p.minted) : undefined

  const collectionLeaders: LeaderboardItem[] = topByMinted.map((c) => ({
    id: c.id,
    title: c.name,
    subtitle: `by ${c.creator}`,
    imageUrl: c.imageUrl || undefined,
    metric: `${c.minted.toLocaleString()} / ${c.totalSupply.toLocaleString()}`,
    progress: { value: c.minted, max: c.totalSupply, color: statusColor(c.effectiveStatus) },
  }))

  const creatorLeaders: LeaderboardItem[] = topCreators.map((c) => ({
    id: c.creatorAddress,
    title: c.displayName || `${c.creatorAddress.slice(0, 6)}…`,
    subtitle: `${c.collectionCount} collection${c.collectionCount === 1 ? '' : 's'} · ${c.totalMinted.toLocaleString()} minted`,
    metric: <SolAmount value={c.feeRevenue} size={13} />,
    metricColor: c.feeRevenue > 0 ? GREEN : '#8a8a9a',
  }))

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Dashboard' }]}
      actions={
        <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>
          Refresh
        </Button>
      }
    >
      {/* Hero */}
      <section
        className="card mb-6 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
        style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(124,58,237,0.06) 100%)' }}
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#ffffff' }}>
            {greeting}, {user?.displayName ?? 'Operator'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#8a8a9a' }}>
            Here&apos;s what&apos;s happening across the launchpad today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Not "New Collection": collections are deployed by creators from the
              public site's /create wizard, wallet-signed. The console curates and
              moderates what already exists — it cannot mint one into being. */}
          <Link href="/collections">
            <Button variant="primary" leftIcon={<LayoutGrid className="h-4 w-4" />}>
              Manage Collections
            </Button>
          </Link>
          <Link href="/revenue">
            <Button variant="secondary">View Revenue</Button>
          </Link>
          <Link href="/featured">
            <Button variant="secondary" leftIcon={<Star className="h-4 w-4" />}>
              Featured
            </Button>
          </Link>
        </div>
      </section>

      {/* KPI grid */}
      <section className="mb-8">
        <SectionHeading>Overview</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statsLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} />)
          ) : (
            <>
              <StatCard
                icon={Coins}
                accent={GREEN}
                valueColor={GREEN}
                label="Fee Revenue"
                value={<SolAmount value={stats?.totalFeeRevenue} size={18} />}
                spark={revenueSpark}
                sparkGradientId="spark-rev"
                sub="Platform cut, all time"
              />
              <StatCard
                icon={LayoutGrid}
                accent={CYAN}
                label="Collections"
                value={stats?.totalCollections ?? '—'}
                sub={stats ? `${stats.newLast7Days} new this week` : undefined}
              />
              <StatCard
                icon={Sparkles}
                accent={PURPLE}
                label="Total Minted"
                value={stats?.totalMinted?.toLocaleString() ?? '—'}
                spark={mintedSpark}
                sparkGradientId="spark-mint"
                sub="NFTs across all drops"
              />
              <StatCard
                icon={Flame}
                accent={AMBER}
                label="Active Mints"
                value={stats?.activeCollections ?? '—'}
                sub="Currently minting"
              />
              <StatCard
                icon={Users}
                accent={CYAN}
                label="Creators"
                value={stats?.uniqueCreators ?? '—'}
                sub="Across all collections"
              />
              <StatCard
                icon={Star}
                accent={AMBER}
                label="Featured"
                value={stats?.featuredCount ?? '—'}
                sub="On the launchpad"
              />
            </>
          )}
        </div>
      </section>

      {/* Trend + status donut */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title={useRevenueChart ? 'Revenue Over Time' : 'Top Collections by Mints'}
          subtitle={
            useRevenueChart ? 'Platform fee revenue from the ledger' : 'Live mint counts across collections'
          }
          height={300}
          actions={
            useRevenueChart ? (
              <div className="flex gap-1">
                {(['day', 'week', 'month'] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBucket(b)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors"
                    style={{
                      background: bucket === b ? 'rgba(0,212,255,0.12)' : 'transparent',
                      color: bucket === b ? CYAN : '#8a8a9a',
                      border: `1px solid ${bucket === b ? 'rgba(0,212,255,0.3)' : GRID}`,
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          {useRevenueChart ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CYAN} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CYAN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: '#8a8a9a', fontSize: 11 }}
                  tickFormatter={(v: any) =>
                    new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  }
                  stroke={GRID}
                />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 11 }} stroke={GRID} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v: any) => new Date(v).toLocaleString()}
                  formatter={(value: any) => [<SolAmount key="v" value={Number(value)} size={12} />, 'Fee revenue']}
                />
                <Area type="monotone" dataKey="feeRevenue" stroke={CYAN} strokeWidth={2} fill="url(#dashRev)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : topByMinted.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: '#8a8a9a' }}>
              No collections yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topByMinted.map((c) => ({ name: truncate(c.name, 14), minted: c.minted }))}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#8a8a9a', fontSize: 10 }}
                  stroke={GRID}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 11 }} stroke={GRID} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: any) => [Number(value).toLocaleString(), 'Minted']}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="minted" fill={PURPLE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Collections by Status" subtitle={`${collections.length} total`} height={300}>
          {statusDist.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: '#8a8a9a' }}>
              No collections yet.
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <ResponsiveContainer width="100%" height="78%">
                <PieChart>
                  <Pie
                    data={statusDist}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {statusDist.map((s) => (
                      <Cell key={s.name} fill={s.color} stroke="#111118" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: any, name: any) => [value, statusLabel(String(name))]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div
                className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs"
                style={{ color: '#8a8a9a' }}
              >
                {statusDist.map((s) => (
                  <span key={s.name} className="inline-flex items-center gap-1">
                    <span style={{ color: s.color }}>●</span> {statusLabel(s.name)} {s.value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </section>

      {/* Leaderboards */}
      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <ChartCard flush title="Top Collections" subtitle="By mint progress">
          <Leaderboard items={collectionLeaders} emptyLabel="No collections yet." />
        </ChartCard>
        <ChartCard flush title="Top Creators" subtitle="By fee revenue">
          <Leaderboard items={creatorLeaders} emptyLabel="No creators yet." />
        </ChartCard>
      </section>

      {/* Recent activity */}
      <section>
        <SectionHeading
          actions={
            <Link href="/logs" className="text-xs font-medium" style={{ color: CYAN }}>
              View all
            </Link>
          }
        >
          Recent Activity
        </SectionHeading>
        <div className="card">
          {activityLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full" style={{ background: '#1f1f2e' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
                    <div className="h-2.5 w-1/2 animate-pulse rounded" style={{ background: '#1f1f2e' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ActivityFeed items={activity} />
          )}
        </div>
      </section>
    </MainLayout>
  )
}
