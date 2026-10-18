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
  useRevenueCredits,
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

// Individual credits are checked against an explorer, so they are shown whole. fmtSol
// rounds a sub-1 figure to 4 decimals, which turns a 0.00048 SOL fee into "0.0005" —
// fine for a headline, useless for reconciling one line against a transaction.
function fmtSolExact(n: number): string {
  return `${n.toFixed(9).replace(/0+$/, '').replace(/\.$/, '')} SOL`
}

function shortSig(sig: string): string {
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`
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
  const { data: credits, isLoading: creditsLoading } = useRevenueCredits(100)

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

  // The headline is what the fee wallets were actually paid, across every payer.
  //
  // It used to be the Collection snapshot (minted × fee), which is exact for launchpad
  // collections and structurally blind to everything else. GuardianZ mints on Metaplex's
  // Candy Machine and has no Collection row, so the page led with "0 SOL" on a day the
  // wallets had taken real fees — the only mainnet fee income there has ever been. An
  // earnings figure that cannot see an earner is not the headline.
  //
  // The accrual is kept as the fourth card, which is what it is good for: comparing what
  // the launchpad *should* have paid against what arrived.
  const unscanned = summary?.treasuryScannedAt == null
  const kpis = [
    {
      label: 'Fees received, all-time',
      value: unscanned ? '—' : fmtSol(summary?.feesReceived),
      sub: unscanned
        ? 'Not scanned yet'
        : summary!.treasuryBacklog
          ? `Catching up — at least this much · ${summary!.treasuryCredits} credits`
          : `Launchpad + GuardianZ · ${summary!.treasuryCredits} credits`,
    },
    {
      label: 'Last 30 days',
      value: unscanned ? '—' : fmtSol(summary?.feesReceived30d),
      sub: unscanned ? 'Not scanned yet' : 'Received on-chain',
    },
    {
      label: 'Last 7 days',
      value: unscanned ? '—' : fmtSol(summary?.feesReceived7d),
      sub: unscanned ? 'Not scanned yet' : `Today ${fmtSol(summary!.feesReceived24h)}`,
    },
    {
      // The snapshot, demoted. minted × the fee stored on each Collection row — an
      // estimate of what should have been paid, not a record of what was. Worth keeping
      // only as the thing the received figure is checked against.
      label: 'Accrued (estimate)',
      value: fmtSol(summary?.allTimeRevenue),
      sub: unscanned
        ? 'Minted × stored fee, per collection row'
        : `Minted × stored fee · received differs by ${fmtSol(summary!.treasuryDrift)}`,
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
          <>
            <p className="mt-3 text-xs" style={{ color: '#6a6a7a' }}>
              Default fee {summary.defaultFeeSol} SOL per NFT (flat, every mint) ·{' '}
              {summary.paidCollections} paid / {summary.freeCollections} free collections
            </p>
            {/* Per-recipient, because the split is the thing most likely to be wrong — a
                fee wallet nobody holds has already been published once on this platform,
                and an averaged total would have hidden it. */}
            <p className="mt-1 text-xs" style={{ color: '#6a6a7a' }}>
              Fee recipients:{' '}
              {summary.feeRecipients.map((r, i) => (
                <span key={r.wallet}>
                  {i > 0 && ' · '}
                  <span style={{ color: '#b8b8c8' }}>
                    {r.wallet.slice(0, 4)}…{r.wallet.slice(-4)}
                  </span>
                  {r.shareBps != null && ` ${r.shareBps / 100}%`} received {fmtSol(r.sol)}
                </span>
              ))}
            </p>
            {/* Where the money came from, and what was deliberately not counted. The
                non-revenue line exists so the exclusion is auditable: ops seeding a fee
                wallet is a real credit that is not an earning, and hiding it entirely
                would leave the next person to rediscover why the numbers differ from a
                block explorer's view of the same wallet. */}
            {summary.treasuryScannedAt != null && (
              <p className="mt-1 text-xs" style={{ color: '#6a6a7a' }}>
                {summary.feesBySource.length > 0 ? (
                  <>
                    By source:{' '}
                    {summary.feesBySource.map((s, i) => (
                      <span key={s.source}>
                        {i > 0 && ' · '}
                        {s.source} {fmtSol(s.sol)}
                      </span>
                    ))}
                  </>
                ) : (
                  'No mint fees observed on chain yet'
                )}
                {summary.nonRevenueCredits > 0 && (
                  <> · {fmtSol(summary.nonRevenueCredits)} received from non-mint transfers, not counted</>
                )}
              </p>
            )}
            {/* The old headline number, demoted to what it is. This wallet is also the
                program deploy payer, the upgrade authority and PLATFORM_AUTHORITY, so its
                balance mixes fee income with deploy funding and ops spending — it is not
                revenue and must never be presented as a treasury total again. */}
            <p className="mt-1 text-xs" style={{ color: '#6a6a7a' }}>
              Fee wallet <span style={{ color: '#b8b8c8' }}>{summary.treasuryWallet}</span> holds{' '}
              {summary.walletBalance == null ? 'unknown (RPC down)' : fmtSol(summary.walletBalance)} — a raw
              balance, not revenue: this key also pays for deploys and holds ops funds.
            </p>
          </>
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
              <p>{unscanned ? 'Not scanned yet.' : 'No fees received in this window.'}</p>
              <p className="mt-1 text-xs" style={{ color: '#6a6a7a' }}>
                {unscanned
                  ? 'The treasury scan runs every 5 minutes and fills this from the fee wallets’ own history.'
                  : 'Every mint fee the wallets were paid is plotted here, launchpad and GuardianZ alike.'}
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

      {/* Fee payments — the itemised view.

          Everything else on this page is either an aggregate or a Collection-table view,
          and a foreign Candy Machine appears in neither. So the headline could read
          "0.0096 SOL · 4 credits" with no way to find out which four. Each row carries
          its signature, which makes the whole page checkable against an explorer rather
          than something you have to take on trust.

          Non-revenue credits are listed and struck through rather than filtered out:
          they are exactly the difference between this list and the total above, and
          dropping them would make that difference unexplainable from here. */}
      <section className="mb-8">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
          Fee Payments Received
        </h2>
        <p className="mb-4 text-xs" style={{ color: '#6a6a7a' }}>
          Every credit to a fee wallet, scanned from the chain. Greyed rows are credits no mint paid —
          ops funding or refunds — which are shown for completeness and excluded from all totals.
        </p>
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: GRID }}>
            <thead style={{ background: '#1a1a24' }}>
              <tr>
                {['When', 'Source', 'Recipient', 'Amount', 'Transaction'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: '#8a8a9a' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: GRID }}>
              {creditsLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: '#8a8a9a' }}>
                    Loading…
                  </td>
                </tr>
              ) : !credits || credits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: '#8a8a9a' }}>
                    {unscanned ? 'Not scanned yet.' : 'No credits recorded.'}
                  </td>
                </tr>
              ) : (
                credits.map((c) => (
                  <tr key={`${c.signature}-${c.wallet}`} style={{ opacity: c.isRevenue ? 1 : 0.45 }}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm" style={{ color: '#b8b8c8' }}>
                      {c.blockTime ? new Date(c.blockTime).toLocaleString() : `slot ${c.slot}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          background: c.isRevenue ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                          color: c.isRevenue ? GREEN : '#8a8a9a',
                        }}
                      >
                        {c.source}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs" style={{ color: '#8a8a9a' }}>
                      {c.wallet.slice(0, 4)}…{c.wallet.slice(-4)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold" style={{ color: '#ffffff' }}>
                      {fmtSolExact(c.sol)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      <a
                        href={`https://solscan.io/tx/${c.signature}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{ color: CYAN }}
                      >
                        {shortSig(c.signature)}
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

      {/* By collection table — an estimate, not a record.

          Each row is that collection's `minted` multiplied by the fee stored on it, so
          it only matches reality where both are ours to maintain. GuardianZ is the
          counterexample on both counts: its `minted` counts every asset ever minted into
          the Core collection, thousands of which were sold on LaunchMyNFT before this
          platform existed, and its stored fee is whatever the row says rather than what
          any particular buyer paid. Fee Payments Received above is the record. */}
      <section className="mb-8">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
          Revenue by Collection
        </h2>
        <p className="mb-4 text-xs" style={{ color: '#6a6a7a' }}>
          Estimated: each collection’s minted count × the fee stored on it. For money actually
          received, see Fee Payments Received above.
        </p>
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: GRID }}>
            <thead style={{ background: '#1a1a24' }}>
              <tr>
                {['Collection', 'Creator', 'Minted', 'Price', 'Fee / NFT', 'Fee Revenue'].map((h) => (
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
                    <td className="px-4 py-3 text-sm">{fmtSol(c.platformFeeLamports / 1e9)}</td>
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
