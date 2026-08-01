'use client'

/**
 * ReviewDialog — the last screen before a signature.
 *
 * It shows three things the wallet popup cannot: the before/after of every field,
 * the instruction list in execution order, and how full the 1232-byte packet is.
 * After signing it stays open and becomes the receipt, because a signature with
 * no visible outcome is how operators end up re-running a batch they already sent.
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
  building: 'Building the transaction…',
  simulating: 'Simulating against the cluster…',
  'awaiting-signature': 'Waiting for your wallet…',
  sending: 'Broadcasting…',
  confirming: 'Waiting for confirmation…',
  success: 'Applied on chain.',
  error: 'Not applied.',
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
                className="card w-full max-w-3xl overflow-hidden"
                style={{ background: 'rgba(12, 14, 20, 0.98)' }}
              >
                {/* Header */}
                <div
                  className="flex items-start justify-between gap-4 px-6 py-4"
                  style={{ borderBottom: '1px solid var(--border-primary)' }}
                >
                  <div>
                    <Dialog.Title className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {done ? 'Changes applied' : 'Review before signing'}
                    </Dialog.Title>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {done
                        ? `${pluralize(changes.length, 'change')} written to chain.`
                        : plan
                          ? `${pluralize(changes.length, 'change')} · ${pluralize(plan.steps.length, 'instruction')} · ${
                              plan.singleTransaction
                                ? 'one signature'
                                : `${plan.batches.length} signatures`
                            }`
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
                  <h3 className="eyebrow mb-2">What changes</h3>
                  <ul
                    className="mb-5 divide-y overflow-hidden rounded-lg"
                    style={{ borderColor: 'var(--border-primary)', border: '1px solid var(--border-primary)' }}
                  >
                    {changes.map((change) => (
                      <li key={change.key} className="px-3 py-2.5" style={{ borderColor: 'var(--border-primary)' }}>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {change.label}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className="rounded px-1.5 py-0.5 font-mono"
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
                          >
                            {change.before}
                          </span>
                          <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                          <span
                            className="rounded px-1.5 py-0.5 font-mono"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                          >
                            {change.after}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>

                  {/* Instruction order */}
                  {plan && plan.steps.length > 0 && (
                    <>
                      <h3 className="eyebrow mb-2">Instructions, in execution order</h3>
                      <ol className="mb-5 space-y-1.5">
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

                      {/* Packet meter */}
                      <div className="panel-subtle px-3 py-2.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            Transaction size {largest} / {MAX_TX_BYTES} bytes
                          </span>
                          <span style={{ color: fillPct > 90 ? 'var(--accent-warning)' : 'var(--text-muted)' }}>
                            {fillPct}% full
                          </span>
                        </div>
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-full"
                          style={{ background: 'var(--bg-tertiary)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${fillPct}%`,
                              background:
                                fillPct > 90 ? 'var(--accent-warning)' : 'var(--accent)',
                            }}
                          />
                        </div>
                        {!plan.singleTransaction && (
                          <p className="mt-2 text-[11px]" style={{ color: 'var(--accent-warning)' }}>
                            Too many changes for one packet — they are split into{' '}
                            {plan.batches.length} transactions, signed in order. Stage fewer changes
                            to keep it to a single signature.
                          </p>
                        )}
                      </div>
                    </>
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
                            Explorer
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
                      ? 'Chain state has been re-read.'
                      : 'Simulated against the cluster before your wallet is asked to sign.'}
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
                          {submit.phase === 'error' ? 'Try again' : 'Sign & send'}
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
