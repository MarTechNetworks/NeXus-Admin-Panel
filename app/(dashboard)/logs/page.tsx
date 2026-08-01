'use client'

import { useState } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/tables/DataTable'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { useAuditLog } from '@/lib/api/hooks'
import { formatDate } from '@/lib/utils'
import type { AuditEntry } from '@/lib/types'

const PAGE_SIZE = 25

export default function LogsPage() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')

  const { data, isLoading, error, refetch } = useAuditLog({
    page,
    pageSize: PAGE_SIZE,
    action: actionFilter || undefined,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const columns = [
    { key: 'createdAt', header: 'Time', render: (row: AuditEntry) => formatDate(row.createdAt) },
    { key: 'actorEmail', header: 'Actor', render: (row: AuditEntry) => row.actorEmail ?? 'system' },
    { key: 'action', header: 'Action' },
    {
      key: 'target',
      header: 'Target',
      render: (row: AuditEntry) =>
        row.targetType ? `${row.targetType}${row.targetId ? ` · ${row.targetId.slice(0, 8)}` : ''}` : '—',
    },
    { key: 'ip', header: 'IP', render: (row: AuditEntry) => row.ip ?? '—' },
  ]

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Audit Log' }]}
      actions={
        <Button variant="secondary" onClick={() => refetch()}>
          Refresh
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-4">
        <input
          type="search"
          placeholder="Filter by action (e.g. collection.featured)..."
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value)
            setPage(1)
          }}
          className="input-base max-w-sm"
          aria-label="Filter by action"
        />
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
        >
          {(error as Error).message}
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={10} cols={5} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            keyExtractor={(row) => row.id}
            emptyMessage="No audit entries yet"
          />
          {data && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm" style={{ color: '#8a8a9a' }}>
              <span>
                Page {data.page} of {totalPages} ({data.total} total)
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </MainLayout>
  )
}
