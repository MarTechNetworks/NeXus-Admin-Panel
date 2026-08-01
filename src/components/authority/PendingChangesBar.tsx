'use client'

/**
 * PendingChangesBar — the console's commit surface.
 *
 * It docks to the bottom of the viewport as soon as anything is staged, because
 * the alternative (a Save button per card) is what produces six wallet popups
 * for one intent. The count it shows is the count that gets signed.
 */
import { AlertTriangle, Layers, PenLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { pluralize } from '@/lib/authority/format'
import type { AuthorityChange, AuthorityIssue } from '@/lib/authority/types'

export function PendingChangesBar({
  changes,
  issues,
  blocked,
  canSign,
  onDiscard,
  onReview,
}: {
  changes: AuthorityChange[]
  issues: AuthorityIssue[]
  blocked: boolean
  canSign: boolean
  onDiscard: () => void
  onReview: () => void
}) {
  if (changes.length === 0) return null

  const errors = issues.filter((i) => i.level === 'error').length
  const groups = new Set(changes.map((c) => c.instruction)).size

  return (
    <div className="pointer-events-none sticky bottom-5 z-30 mt-8 flex justify-center px-2">
      <div
        className="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4"
        style={{
          background:
            'linear-gradient(135deg, rgba(56,189,248,0.10) 0%, rgba(139,92,246,0.10) 60%, transparent 100%), rgba(13, 15, 21, 0.97)',
          border: `1px solid ${blocked ? 'rgba(239,68,68,0.45)' : 'var(--accent-line)'}`,
          backdropFilter: 'blur(20px) saturate(160%)',
          boxShadow: blocked
            ? '0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(239,68,68,0.12)'
            : '0 24px 70px rgba(0,0,0,0.55), 0 0 40px rgba(56,189,248,0.10)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: blocked ? 'rgba(239,68,68,0.14)' : 'rgba(56,189,248,0.14)',
              border: `1px solid ${blocked ? 'rgba(239,68,68,0.34)' : 'var(--accent-line)'}`,
              color: blocked ? 'var(--accent-error)' : 'var(--accent)',
            }}
          >
            {blocked ? (
              <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <Layers className="h-5 w-5" strokeWidth={1.75} />
            )}
          </span>
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight" style={{ color: '#ffffff' }}>
              {pluralize(changes.length, 'change')} staged
            </p>
            <p
              className="mt-0.5 text-xs font-medium"
              style={{ color: blocked ? 'var(--accent-error)' : 'var(--text-tertiary)' }}
            >
              {blocked
                ? `${pluralize(errors, 'problem')} to fix before signing`
                : canSign
                  ? `${pluralize(groups, 'instruction')} · one transaction · one signature`
                  : 'Connect the authority wallet to sign'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="lg"
            leftIcon={<PenLine className="h-4 w-4" />}
            onClick={onReview}
            disabled={blocked || !canSign}
          >
            Review &amp; sign
          </Button>
        </div>
      </div>
    </div>
  )
}
