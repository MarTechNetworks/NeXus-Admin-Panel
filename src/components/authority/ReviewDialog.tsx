'use client'

/**
 * ReviewDialog — the last screen before a signature.
 *
 * The owner sees one thing: a before → after list of what they changed, in the
 * same words the page used. The instruction list and the packet meter — what an
 * engineer wants when something goes wrong — sit behind a "Technical details"
 * fold so they are there without being the first thing on screen. After
 * signing the dialog stays open and becomes the receipt, because a signature
 * with no visible outcome is how people end up re-sending a save they already
 * made.
 */
import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PenLine,
  ShieldAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout } from './primitives'
import { MAX_TX_BYTES, type AuthorityPlan } from '@/lib/authority/build-tx'
import { pluralize, shortAddress } from '@/lib/authority/format'
import type { AuthorityChange } from '@/lib/authority/types'
import type { SubmitState } from '@/lib/authority/useAuthorityConsole'

const PHASE_COPY: Record<SubmitState['phase'], string> = {
  idle: '',
  building: 'Preparing…',
  simulating: 'Checking the transaction…',
  'awaiting-signature': 'Approve it in your wallet…',
  sending: 'Sending…',
  confirming: 'Waiting for the network to confirm…',
  success: 'Saved.',
  error: 'Not saved.',
}

export function ReviewDialog({
  open,
  onClose,
  changes,
  plan,
  planError,
  submit,
  onSign,
  onDone,
  explorerUrl,
}: {
  open: boolean
  onClose: () => void
  changes: AuthorityChange[]
  plan: AuthorityPlan | null
  planError: string | null
  submit: SubmitState
  onSign: () => void
  onDone: () => void
  explorerUrl: (signature: string) => string
}) {
  const busy =
    submit.phase !== 'idle' && submit.phase !== 'success' && submit.phase !== 'error'
  const done = submit.phase === 'success'
  const largest = plan?.batches.reduce((max, b) => Math.max(max, b.sizeBytes), 0) ?? 0
  const fillPct = Math.min(100, Math.round((largest / MAX_TX_BYTES) * 100))

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={busy ? () => {} : onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className="card w-full max-w-xl overflow-hidden"
                style={{ background: 'rgba(12, 14, 20, 0.98)' }}
              >
                {/* Header */}
                <div
                  className="flex items-start justify-between gap-4 px-6 py-4"
                  style={{ borderBottom: '1px solid var(--border-primary)' }}
                >
                  <div>
                    <Dialog.Title className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {done ? 'Saved' : 'Save these changes?'}
                    </Dialog.Title>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {done
                        ? `${pluralize(changes.length, 'change')} written to chain.`
                        : plan
                          ? plan.singleTransaction
                            ? 'One approval in your wallet.'
                            : `${plan.batches.length} approvals in your wallet, one after the other.`
                          : 'Preparing…'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={busy ? undefined : done ? onDone : onClose}
                    disabled={busy}
                    className="rounded p-1 transition-colors disabled:opacity-40"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
                  {planError && (
                    <div className="mb-4">
                      <Callout level="danger">{planError}</Callout>
                    </div>
                  )}

                  {/* Diff */}
                  <ul
                    className="divide-y overflow-hidden rounded-lg"
                    style={{ borderColor: 'var(--border-primary)', border: '1px solid var(--border-primary)' }}
                  >
                    {changes.map((change) => (
                      <li key={change.key} className="px-3 py-2.5" style={{ borderColor: 'var(--border-primary)' }}>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {change.label}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className="rounded px-1.5 py-0.5"
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
                          >
                            {change.before}
                          </span>
                          <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                          <span
                            className="rounded px-1.5 py-0.5 font-medium"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                          >
                            {change.after}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>

                  {plan && !plan.singleTransaction && (
                    <div className="mt-3">
                      <Callout level="warning">
                        Too many changes to fit in one transaction — your wallet will ask{' '}
                        {plan.batches.length} times, in order. Save fewer changes at once to keep it to one.
                      </Callout>
                    </div>
                  )}

                  {/* Engineer's view, folded */}
                  {plan && plan.steps.length > 0 && (
                    <details className="mt-4">
                      <summary
                        className="cursor-pointer select-none text-[11px] font-medium"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Technical details
                      </summary>
                      <ol className="mt-2 space-y-1.5">
                        {plan.steps.map((step, i) => (
                          <li
                            key={`${step.kind}-${i}`}
                            className="panel-subtle flex items-start gap-3 px-3 py-2"
                          >
                            <span
                              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px]"
                              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
                            >
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
                                {step.kind}
                              </p>
                              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                                {step.detail}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Transaction size {largest} / {MAX_TX_BYTES} bytes ({fillPct}%).
                      </p>
                    </details>
                  )}

                  {/* Progress / result */}
                  {submit.phase !== 'idle' && (
                    <div className="mt-5 space-y-2">
                      <div
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs"
                        style={{
                          background:
                            submit.phase === 'error'
                              ? 'var(--danger-soft)'
                              : done
                                ? 'var(--success-soft)'
                                : 'var(--accent-soft)',
                          border: `1px solid ${
                            submit.phase === 'error'
                              ? 'rgba(239,68,68,0.28)'
                              : done
                                ? 'rgba(16,185,129,0.28)'
                                : 'var(--accent-line)'
                          }`,
                          color:
                            submit.phase === 'error'
                              ? 'var(--accent-error)'
                              : done
                                ? 'var(--accent-success)'
                                : 'var(--accent)',
                        }}
                      >
                        {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                        {done && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                        {submit.phase === 'error' && <ShieldAlert className="h-3.5 w-3.5 shrink-0" />}
                        <span>
                          {submit.batchCount > 1 &&
                            busy &&
                            `Transaction ${submit.batchIndex + 1} of ${submit.batchCount} — `}
                          {submit.error ?? PHASE_COPY[submit.phase]}
                        </span>
                      </div>

                      {submit.signatures.map((sig) => (
                        <div
                          key={sig}
                          className="panel-subtle flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="truncate font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                            {shortAddress(sig, 10, 10)}
                          </span>
                          <a
                            href={explorerUrl(sig)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px]"
                            style={{ color: 'var(--accent)' }}
                          >
                            View on explorer
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ))}

                      {submit.logs.length > 0 && (
                        <details className="panel-subtle px-3 py-2">
                          <summary
                            className="cursor-pointer text-[11px] font-medium"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            Program logs
                          </summary>
                          <pre
                            className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {submit.logs.join('\n')}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                  style={{ borderTop: '1px solid var(--border-primary)' }}
                >
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {done
                      ? 'The page now shows the saved values.'
                      : 'Checked against the network before your wallet asks you to approve.'}
                  </p>
                  <div className="flex items-center gap-2">
                    {done ? (
                      <Button variant="primary" onClick={onDone}>
                        Done
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={onClose} disabled={busy}>
                          Back
                        </Button>
                        <Button
                          variant="primary"
                          leftIcon={<PenLine className="h-3.5 w-3.5" />}
                          isLoading={busy}
                          disabled={busy || !plan || plan.steps.length === 0}
                          onClick={onSign}
                        >
                          {submit.phase === 'error' ? 'Try again' : 'Approve in wallet'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
