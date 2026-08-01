'use client'

import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonKpi, SkeletonTable } from '@/components/ui/Skeleton'
import { useAdminStats, useCollections } from '@/lib/api/hooks'
import { formatRelativeTime } from '@/lib/utils'

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useAdminStats()
  const { data: recent, isLoading: recentLoading, refetch: refetchRecent } = useCollections(
    { page: 1, pageSize: 5 }
  )

  const handleRefresh = () => {
    refetchStats()
    refetchRecent()
  }

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Dashboard' }]}
      actions={
        <Button variant="secondary" onClick={handleRefresh}>
          Refresh
        </Button>
      }
    >
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Platform Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)
          ) : (
            <>
              <KpiCard label="Total Collections" value={stats?.totalCollections ?? 0} />
              <KpiCard
                label="Active Mints"
                value={stats?.activeCollections ?? 0}
                sub="collections currently minting"
              />
              <KpiCard
                label="NFTs Minted"
                value={stats?.totalMinted ?? 0}
                sub="across all collections"
              />
              <KpiCard label="Unique Creators" value={stats?.uniqueCreators ?? 0} />
            </>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {statsLoading ? (
            Array.from({ length: 2 }).map((_, i) => <SkeletonKpi key={i} />)
          ) : (
            <>
              <KpiCard
                label="Featured Collections"
                value={stats?.featuredCount ?? 0}
                sub="shown in homepage highlights"
              />
              <KpiCard
                label="New This Week"
                value={stats?.newLast7Days ?? 0}
                sub="collections created in the last 7 days"
              />
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Recent Collections
        </h2>
        {recentLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : (
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-muted">
                <tr>
                  {['Name', 'Creator', 'Status', 'Minted / Supply', 'Created'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(recent?.data ?? []).map((col) => (
                  <tr key={col.id} className="hover:bg-surface-muted/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {col.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">
                      {col.creatorAddress.slice(0, 6)}…{col.creatorAddress.slice(-4)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={col.effectiveStatus} size="sm" />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {col.minted.toLocaleString()} / {col.totalSupply.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(col.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </MainLayout>
  )
}
