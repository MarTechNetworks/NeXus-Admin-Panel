import type { AuditEntry } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'
import { actionVisual } from '@/lib/dashboard'

/**
 * Renders entries from the append-only audit log (`GET /api/admin/audit`).
 *
 * This used to render a separate `ActivityLog` type fed by `/api/activity`, an
 * endpoint that does not exist in the backend — the feed only ever had content
 * in mock mode. The audit log is the real record of who did what.
 */

/** Best available human label for what an entry acted on. */
function resourceLabel(item: AuditEntry): string | null {
  const meta = item.metadata ?? {}
  const name = meta.name ?? meta.slug
  if (typeof name === 'string' && name) return name
  if (item.targetId) return item.targetId.slice(0, 8)
  return item.targetType ?? null
}

export function ActivityFeed({
  items,
  emptyLabel = 'No recent activity.',
}: {
  items: AuditEntry[]
  emptyLabel?: string
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm" style={{ color: '#8a8a9a' }}>
        {emptyLabel}
      </div>
    )
  }

  return (
    <ul className="px-4 pt-4">
      {items.map((item, i) => {
        const { icon: Icon, color, verb } = actionVisual(item.action)
        const last = i === items.length - 1
        const resource = resourceLabel(item)

        return (
          <li key={item.id} className="flex gap-3">
            {/* Icon node + connecting rail */}
            <div className="flex flex-col items-center">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${color}1a`, border: `1px solid ${color}33`, color }}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              {!last && <span className="w-px flex-1" style={{ background: '#252535', minHeight: 14 }} />}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm" style={{ color: '#ffffff' }}>
                  {/* Entries recorded by background jobs have no actor. */}
                  <span className="font-medium">{item.actorEmail ?? 'System'}</span>{' '}
                  <span style={{ color: '#b8b8c8' }}>{verb}</span>
                  {resource && (
                    <>
                      {' '}
                      <span className="font-medium" style={{ color }}>
                        {resource}
                      </span>
                    </>
                  )}
                </p>
                <span className="shrink-0 text-xs" style={{ color: '#6a6a7a' }}>
                  {formatRelativeTime(item.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs" style={{ color: '#8a8a9a' }}>
                <span className="font-mono">{item.action}</span>
                {item.ip && <> · {item.ip}</>}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
