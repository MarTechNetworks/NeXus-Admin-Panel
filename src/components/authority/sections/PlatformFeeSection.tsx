'use client'

/**
 * PlatformFeeSection — what the platform takes on every mint, and who gets it.
 *
 * One number and up to four wallets, but it is the highest-consequence card on
 * the page: the recipient split prices every mint on the platform from the next
 * block onward, and the amount is stamped on every collection created from now
 * on (existing ones keep theirs — see Advanced). So the card stays quiet until
 * something is wrong: the only per-row annotations are a bad address or a
 * wallet too empty to receive, which is the one mistake that fails after
 * signing rather than before.
 *
 * Whether the on-chain fee account exists yet is an implementation detail the
 * owner should not have to know about: the diff already emits the create
 * instruction instead of the update one when it is missing, so a first edit
 * publishes it. The "publish as-is" link covers the one case a diff cannot —
 * wanting today's defaults on chain without changing them.
 */
import { Coins, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout, Field, PercentInput, Section, TextInput } from '../primitives'
import { bpsToPercent, isValidAddress, lamportsToSol } from '@/lib/authority/format'
import { MAX_PLATFORM_FEE_RECIPIENTS } from '@/lib/solana/program'
import type { AuthorityConsoleState } from '@/lib/authority/useAuthorityConsole'

export function PlatformFeeSection({ state }: { state: AuthorityConsoleState }) {
  const { snapshot, draft, patchDraft, revertChange, changes, issues, rent, isAuthority } = state
  if (!snapshot || !draft) return null

  const disabled = !isAuthority
  const changed = (key: string) => changes.some((c) => c.key === key)
  const errorFor = (key: string) =>
    issues.find((i) => i.level === 'error' && i.key === key)?.message
  const warningFor = (key: string) =>
    issues.find((i) => i.level === 'warning' && i.key === key)?.message
  const groupErrors = issues.filter(
    (i) => i.level === 'error' && (i.group === 'fees' || i.group === 'recipients') && !i.key,
  )
  const changedCount = changes.filter((c) => c.group === 'fees' || c.group === 'recipients').length

  const totalBps = draft.recipients.reduce((sum, r) => sum + (r.shareBps || 0), 0)
  const totalOk = totalBps === 10_000
  const rentFor = (address: string) => rent.find((r) => r.address === address.trim())

  const setRecipient = (index: number, patch: Partial<{ address: string; shareBps: number }>) => {
    patchDraft({
      recipients: draft.recipients.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    })
  }

  const addRecipient = () => {
    if (draft.recipients.length >= MAX_PLATFORM_FEE_RECIPIENTS) return
    patchDraft({ recipients: [...draft.recipients, { address: '', shareBps: 0 }] })
  }

  const removeRecipient = (index: number) => {
    patchDraft({ recipients: draft.recipients.filter((_, i) => i !== index) })
  }

  /** Even split across the current rows, remainder to the first — bps must total exactly 10000. */
  const splitEvenly = () => {
    const n = draft.recipients.length
    if (n === 0) return
    const base = Math.floor(10_000 / n)
    patchDraft({
      recipients: draft.recipients.map((r, i) => ({
        ...r,
        shareBps: i === 0 ? base + (10_000 - base * n) : base,
      })),
    })
  }

  return (
    <Section
      id="fees"
      title="Platform fee"
      description="Charged to the buyer on every mint, on top of the creator's price. Free mints pay it too; the creator always gets their full price."
      icon={<Coins className="h-4 w-4" />}
      changedCount={changedCount}
    >
      {/* ── Amount ─────────────────────────────────────────────────────── */}
      <Field
        label="Fee per NFT"
        htmlFor="feeSol"
        changed={changed('feeSol')}
        onRevert={() => revertChange('feeSol')}
        error={errorFor('feeSol')}
      >
        <div className="flex items-center gap-2">
          <TextInput
            id="feeSol"
            value={draft.feeSol}
            onChange={(value) => patchDraft({ feeSol: value })}
            placeholder="0.01"
            invalid={!!errorFor('feeSol')}
            disabled={disabled}
            className="w-36 text-lg font-semibold"
          />
          <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
            SOL
          </span>
        </div>
      </Field>

      {warningFor('feeSol') && (
        <div className="mt-2">
          <Callout level="warning">{warningFor('feeSol')}</Callout>
        </div>
      )}

      {!snapshot.feeConfig.exists && (
        <p className="mt-2 px-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Not published on chain yet — this is the default the platform uses today (
          {lamportsToSol(snapshot.backendFeeLamports)} SOL). Your first save publishes it, or{' '}
          <button
            type="button"
            disabled={disabled}
            onClick={() => patchDraft({ createFeeConfig: !draft.createFeeConfig })}
            className="underline underline-offset-2 disabled:no-underline disabled:opacity-60"
            style={{ color: draft.createFeeConfig ? 'var(--accent)' : 'var(--text-tertiary)' }}
          >
            {draft.createFeeConfig ? 'publishing as-is (undo)' : 'publish it as-is'}
          </button>
          .
        </p>
      )}

      {/* ── Recipients ─────────────────────────────────────────────────── */}
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <h3
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: changed('recipients') ? 'var(--accent)' : 'var(--text-tertiary)' }}
          >
            Goes to
          </h3>
          <span
            className="text-xs font-semibold"
            style={{ color: totalOk ? 'var(--accent-success)' : 'var(--accent-error)' }}
          >
            {draft.recipients.length === 0
              ? 'No wallets'
              : totalOk
                ? 'Adds up to 100%'
                : `Adds up to ${bpsToPercent(totalBps)} — must be 100%`}
          </span>
        </div>

        <div
          className="rounded-lg"
          style={{
            border: `1px solid ${changed('recipients') ? 'var(--accent-line)' : 'var(--border-primary)'}`,
            background: changed('recipients') ? 'rgba(56, 189, 248, 0.04)' : 'rgba(8, 9, 13, 0.5)',
          }}
        >
          {draft.recipients.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              Add at least one wallet to receive the fee.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
              {draft.recipients.map((row, index) => {
                const address = row.address.trim()
                const valid = isValidAddress(address)
                const rentRow = rentFor(address)
                const problem =
                  address && !valid
                    ? 'Not a valid Solana address'
                    : rentRow && !rentRow.rentExempt
                      ? `Nearly empty (${lamportsToSol(rentRow.lamports)} SOL) — send it at least 0.001 SOL first, or the save fails`
                      : null
                return (
                  <li key={index} className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <TextInput
                        mono
                        value={row.address}
                        onChange={(value) => setRecipient(index, { address: value })}
                        placeholder="Wallet address"
                        invalid={!!problem}
                        disabled={disabled}
                      />
                      {problem && (
                        <p className="mt-1.5 text-[11px]" style={{ color: 'var(--accent-error)' }}>
                          {problem}
                        </p>
                      )}
                    </div>

                    <PercentInput
                      value={row.shareBps}
                      onChange={(bps) => setRecipient(index, { shareBps: bps })}
                      disabled={disabled}
                    />

                    <button
                      type="button"
                      onClick={() => removeRecipient(index)}
                      disabled={disabled}
                      className="rounded p-1.5 transition-colors disabled:opacity-40"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-error)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      aria-label={`Remove wallet ${index + 1}`}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            style={{ borderTop: '1px solid var(--border-primary)' }}
          >
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={addRecipient}
              disabled={disabled || draft.recipients.length >= MAX_PLATFORM_FEE_RECIPIENTS}
            >
              Add wallet
            </Button>
            <div className="flex items-center gap-3">
              {draft.recipients.length > 1 && (
                <button
                  type="button"
                  onClick={splitEvenly}
                  disabled={disabled}
                  className="text-[11px] underline-offset-2 hover:underline disabled:opacity-40"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Split evenly
                </button>
              )}
              {changed('recipients') && (
                <button
                  type="button"
                  onClick={() => revertChange('recipients')}
                  className="text-[11px] underline-offset-2 hover:underline"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Undo changes
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {groupErrors.length > 0 && (
        <div className="mt-4 space-y-2">
          {groupErrors.map((issue, i) => (
            <Callout key={i} level="danger">
              {issue.message}
            </Callout>
          ))}
        </div>
      )}
    </Section>
  )
}
