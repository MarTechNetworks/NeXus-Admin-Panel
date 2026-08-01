'use client'

import { useState } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { SkeletonKpi } from '@/components/ui/Skeleton'
import {
  useRevenueSummary,
  useRevenueByCollection,
  useRevenueByCreator,
  useRevenueTimeseries,
} from '@/lib/api/hooks'
import { api } from '@/lib/api/client'
import { endpoints } from '@/lib/api/endpoints'
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

function fmtSol(n?: number | null): string {
  if (n == null) return '—'
  if (n === 0) return '0 SOL'
  const decimals = Math.abs(n) < 1 ? 4 : 2
  return `${n.toLocaleString(undefined, { maximumFractionDigits: decimals })} SOL`
}

const tooltipStyle = {
  background: '#111118',
  border: `1px solid ${GRID}`,
  borderRadius: 8,
  color: '#ffffff',
  fontSize: 12,
}

export default function RevenuePage() {
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('day')
  const [exporting, setExporting] = useState(false)

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useRevenueSummary()
  const { data: series, isLoading: seriesLoading } = useRevenueTimeseries({ bucket })
  const { data: byCollection, isLoading: byColLoading } = useRevenueByCollection(50)
  const { data: byCreator, isLoading: byCreatorLoading } = useRevenueByCreator()

  async function handleExport() {
    setExporting(true)
    try {
      const csv = await api.get<string>(endpoints.revenue.exportCsv)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'platform-fee-revenue.csv'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const topCollections = (byCollection ?? [])
    .filter((c) => c.feeRevenue > 0)
    .slice(0, 8)
    .map((c) => ({ name: c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name, feeRevenue: c.feeRevenue }))

  const kpis = [
    { label: 'All-time fee revenue', value: fmtSol(summary?.allTimeRevenue), sub: 'Platform cut, all collections' },
    { label: 'Last 30 days', value: fmtSol(summary?.last30d), sub: 'From the fee ledger' },
    { label: 'Last 7 days', value: fmtSol(summary?.last7d), sub: `Today: ${fmtSol(summary?.last24h)}` },
    {
      label: 'Treasury balance',
      value: fmtSol(summary?.treasuryBalance),
      sub:
        summary?.treasuryDrift == null
          ? 'RPC unavailable'
          : `Drift vs accrued: ${fmtSol(summary.treasuryDrift)}`,
    },
  ]

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Revenue' }]}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refetchSummary()}>
            Refresh
          </Button>
          <Button variant="primary" onClick={handleExport} isLoading={exporting}>
            Export CSV
          </Button>
        </div>
      }
    >
      {/* KPIs */}
      <section className="mb-8">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
          Platform Fee Revenue
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)
            : kpis.map((kpi, i) => (
                <div key={i} className="card p-5">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#8a8a9a' }}>
                    {kpi.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold" style={{ color: '#ffffff' }}>
                    {kpi.value}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: '#8a8a9a' }}>
                    {kpi.sub}
                  </p>
                </div>
              ))}
        </div>
        {summary && (
          <p className="mt-3 text-xs" style={{ color: '#6a6a7a' }}>
            Treasury wallet <span style={{ color: '#b8b8c8' }}>{summary.treasuryWallet}</span> · default fee{' '}
            {(summary.defaultFeeBps / 100).toFixed(2)}% · {summary.paidCollections} paid /{' '}
            {summary.freeCollections} free collections
          </p>
        )}
      </section>

      {/* Revenue over time */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
            Revenue Over Time
          </h2>
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
        </div>
        <div className="card p-4" style={{ height: 320 }}>
          {seriesLoading ? (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: '#8a8a9a' }}>
              Loading…
            </div>
          ) : !series || series.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm" style={{ color: '#8a8a9a' }}>
              <p>No revenue recorded yet.</p>
              <p className="mt-1 text-xs" style={{ color: '#6a6a7a' }}>
                The ledger fills as the sync observes new mints. All-time totals above are exact regardless.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CYAN} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CYAN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: '#8a8a9a', fontSize: 11 }}
                  tickFormatter={(v: any) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  stroke={GRID}
                />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 11 }} stroke={GRID} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v: any) => new Date(v).toLocaleString()}
                  formatter={(value: any) => [fmtSol(Number(value)), 'Fee revenue']}
                />
                <Area type="monotone" dataKey="feeRevenue" stroke={CYAN} strokeWidth={2} fill="url(#revFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Top collections + free/paid split */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2" style={{ height: 320 }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
            Top Collections by Fee Revenue
          </h3>
          {byColLoading ? (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: '#8a8a9a' }}>Loading…</div>
          ) : topCollections.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: '#8a8a9a' }}>No paid mints yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="88%">
              <BarChart data={topCollections} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#8a8a9a', fontSize: 10 }} stroke={GRID} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 11 }} stroke={GRID} width={48} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [fmtSol(Number(value)), 'Fee revenue']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="feeRevenue" fill={PURPLE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-4" style={{ height: 320 }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
            Paid vs Free Collections
          </h3>
          {summary ? (
            <ResponsiveContainer width="100%" height="88%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Paid', value: summary.paidCollections },
                    { name: 'Free', value: summary.freeCollections },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  <Cell fill={GREEN} />
                  <Cell fill={AMBER} />
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : null}
          <div className="flex justify-center gap-4 text-xs" style={{ color: '#8a8a9a' }}>
            <span><span style={{ color: GREEN }}>●</span> Paid {summary?.paidCollections ?? '—'}</span>
            <span><span style={{ color: AMBER }}>●</span> Free {summary?.freeCollections ?? '—'}</span>
          </div>
        </div>
      </section>

      {/* By collection table */}
      <section className="mb-8">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
          Revenue by Collection
        </h2>
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: GRID }}>
            <thead style={{ background: '#1a1a24' }}>
              <tr>
                {['Collection', 'Creator', 'Minted', 'Price', 'Fee %', 'Fee Revenue'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a8a9a' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: GRID }}>
              {byColLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: '#8a8a9a' }}>Loading…</td></tr>
              ) : (byCollection ?? []).length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: '#8a8a9a' }}>No collections.</td></tr>
              ) : (
                (byCollection ?? []).map((c) => (
                  <tr key={c.id} style={{ color: '#b8b8c8' }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: '#ffffff' }}>{c.name}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: '#8a8a9a' }}>{c.creator}</td>
                    <td className="px-4 py-3 text-sm">{c.minted}{c.totalSupply ? ` / ${c.totalSupply}` : ''}</td>
                    <td className="px-4 py-3 text-sm">{c.price ? fmtSol(c.price) : 'Free'}</td>
                    <td className="px-4 py-3 text-sm">{(c.platformFeeBps / 100).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: c.feeRevenue > 0 ? GREEN : '#8a8a9a' }}>{fmtSol(c.feeRevenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* By creator table */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
          Revenue by Creator
        </h2>
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: GRID }}>
            <thead style={{ background: '#1a1a24' }}>
              <tr>
                {['Creator', 'Wallet', 'Collections', 'Minted', 'Fee Revenue'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a8a9a' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: GRID }}>
              {byCreatorLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#8a8a9a' }}>Loading…</td></tr>
              ) : (byCreator ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#8a8a9a' }}>No creators.</td></tr>
              ) : (
                (byCreator ?? []).map((c) => (
                  <tr key={c.creatorAddress} style={{ color: '#b8b8c8' }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: '#ffffff' }}>{c.displayName || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#8a8a9a' }}>{c.creatorAddress.slice(0, 6)}…{c.creatorAddress.slice(-4)}</td>
                    <td className="px-4 py-3 text-sm">{c.collectionCount}</td>
                    <td className="px-4 py-3 text-sm">{c.totalMinted}</td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: c.feeRevenue > 0 ? GREEN : '#8a8a9a' }}>{fmtSol(c.feeRevenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </MainLayout>
  )
}
