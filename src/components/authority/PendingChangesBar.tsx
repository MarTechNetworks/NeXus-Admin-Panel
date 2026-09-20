'use client'

/**
 * PendingChangesBar — the console's save surface.
 *
 * It docks to the bottom of the viewport as soon as anything is edited, because
 * the alternative (a Save button per card) is what produces six wallet popups
 * for one intent. The count it shows is the count that gets signed.
 */
import { AlertTriangle, PenLine, Trash2 } from 'lucide-react'
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

  return (
    <div className="pointer-events-none sticky bottom-5 z-30 mt-8 flex justify-center px-2">
      <div
        className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5"
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
        <div className="flex items-center gap-3">
          {blocked && (
            <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-error)' }} strokeWidth={1.75} />
          )}
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight" style={{ color: '#ffffff' }}>
              {pluralize(changes.length, 'unsaved change')}
            </p>
            <p
              className="mt-0.5 text-xs"
              style={{ color: blocked ? 'var(--accent-error)' : 'var(--text-tertiary)' }}
            >
              {blocked
                ? `Fix ${pluralize(errors, 'problem')} above first`
                : canSign
                  ? 'One approval in your wallet'
                  : 'Connect the owner wallet to save'}
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
            leftIcon={<PenLine className="h-4 w-4" />}
            onClick={onReview}
            disabled={blocked || !canSign}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}
