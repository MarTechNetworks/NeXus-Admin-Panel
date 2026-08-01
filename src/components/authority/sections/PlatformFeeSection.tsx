'use client'

/**
 * PlatformFeeSection — the PlatformFeeConfig PDA: what the platform takes and
 * who it goes to.
 *
 * Two numbers and up to four wallets, but it is the highest-consequence card on
 * the page: it prices every mint on the platform from the next block onward. So
 * the section shows the live value beside every input, totals the shares as you
 * type, and flags a recipient that is not rent exempt — the one mistake here
 * that fails the transaction after signing rather than before.
 */
import { Coins, Plus, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BpsInput, Callout, Field, Section, TextInput } from '../primitives'
import {
  bpsToPercent,
  formatSolAmount,
  isValidAddress,
  lamportsToSol,
  shortAddress,
} from '@/lib/authority/format'
import { MAX_PLATFORM_FEE_BPS, MAX_PLATFORM_FEE_RECIPIENTS } from '@/lib/solana/program'
import type { AuthorityConsoleState } from '@/lib/authority/useAuthorityConsole'

export function PlatformFeeSection({ state }: { state: AuthorityConsoleState }) {
  const { snapshot, draft, patchDraft, revertChange, changes, issues, rent, isAuthority } = state
  if (!snapshot || !draft) return null

  const disabled = !isAuthority
  const changed = (key: string) => changes.some((c) => c.key === key)
  const errorFor = (key: string) =>
    issues.find((i) => i.level === 'error' && i.key === key)?.message
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
      description="The global PlatformFeeConfig PDA. Applies to every collection that does not carry its own override, from the next mint onward — it never touches mints that already happened."
      icon={<Coins className="h-4 w-4" />}
      changedCount={changedCount}
    >
      {!snapshot.feeConfig.exists && (
        <div className="mb-4 space-y-2">
          <Callout level="warning">
            No fee-config PDA exists yet on this cluster, so mints fall back to the single platform
            wallet. The values below are seeded from the backend&apos;s current defaults — creating
            the account (<span className="font-mono">init_platform_fee_config</span>, rent paid by
            the authority) reproduces today&apos;s behaviour on chain rather than changing it.
          </Callout>
          <Button
            variant={draft.createFeeConfig ? 'primary' : 'secondary'}
            size="sm"
            disabled={disabled}
            onClick={() => patchDraft({ createFeeConfig: !draft.createFeeConfig })}
          >
            {draft.createFeeConfig ? 'Staged for creation — click to unstage' : 'Stage PDA creation'}
          </Button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Field
          label="Paid-mint fee"
          htmlFor="defaultFeeBps"
          changed={changed('defaultFeeBps')}
          onRevert={() => revertChange('defaultFeeBps')}
          error={errorFor('defaultFeeBps')}
          hint={
            <>
              Charged on top of the creator&apos;s price (additive model), so the creator always
              receives their full ask. On chain now:{' '}
              <span className="font-mono">{bpsToPercent(snapshot.feeConfig.defaultFeeBps)}</span>.
              Program cap {bpsToPercent(MAX_PLATFORM_FEE_BPS)}.
            </>
          }
        >
          <BpsInput
            id="defaultFeeBps"
            value={draft.defaultFeeBps}
            onChange={(bps) => patchDraft({ defaultFeeBps: bps })}
            max={MAX_PLATFORM_FEE_BPS}
            invalid={!!errorFor('defaultFeeBps')}
            disabled={disabled}
          />
        </Field>

        <Field
          label="Free-mint flat fee"
          htmlFor="freeMintFee"
          changed={changed('freeMintFee')}
          onRevert={() => revertChange('freeMintFee')}
          error={errorFor('freeMintFee')}
          hint={
            <>
              A percentage of zero is zero, so zero-price collections pay this fixed amount per NFT
              instead. On chain now:{' '}
              <span className="font-mono">{formatSolAmount(snapshot.feeConfig.freeMintFeeLamports)}</span>.
            </>
          }
        >
          <div className="flex items-center gap-2">
            <TextInput
              id="freeMintFee"
              value={draft.freeMintFeeSol}
              onChange={(value) => patchDraft({ freeMintFeeSol: value })}
              placeholder="0.01"
              invalid={!!errorFor('freeMintFee')}
              disabled={disabled}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              SOL
            </span>
          </div>
        </Field>
      </div>

      {/* ── Recipients ─────────────────────────────────────────────────── */}
      <div className="mt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Fee recipients
            </h3>
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
            >
              {draft.recipients.length}/{MAX_PLATFORM_FEE_RECIPIENTS}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={splitEvenly} disabled={disabled || draft.recipients.length === 0}>
              Split evenly
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={addRecipient}
              disabled={disabled || draft.recipients.length >= MAX_PLATFORM_FEE_RECIPIENTS}
            >
              Add
            </Button>
          </div>
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
              No recipients. The program rejects an empty list — add at least one wallet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
              {draft.recipients.map((row, index) => {
                const address = row.address.trim()
                const valid = isValidAddress(address)
                const rentRow = rentFor(address)
                const onChainRow = snapshot.feeConfig.recipients[index]
                return (
                  <li key={index} className="flex flex-wrap items-start gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <TextInput
                        mono
                        value={row.address}
                        onChange={(value) => setRecipient(index, { address: value })}
                        placeholder="Recipient wallet address"
                        invalid={!!address && !valid}
                        disabled={disabled}
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        {onChainRow ? (
                          <span style={{ color: 'var(--text-muted)' }}>
                            on chain: {shortAddress(onChainRow.address, 4, 4)} ·{' '}
                            {bpsToPercent(onChainRow.shareBps)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--accent)' }}>new recipient</span>
                        )}
                        {address && !valid && (
                          <span style={{ color: 'var(--accent-error)' }}>invalid address</span>
                        )}
                        {rentRow && !rentRow.rentExempt && (
                          <span style={{ color: 'var(--accent-error)' }}>
                            not rent exempt ({lamportsToSol(rentRow.lamports)} SOL) — fund it first
                          </span>
                        )}
                        {rentRow?.rentExempt && (
                          <span style={{ color: 'var(--accent-success)' }}>
                            funded ({lamportsToSol(rentRow.lamports)} SOL)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-32 shrink-0">
                      <BpsInput
                        value={row.shareBps}
                        onChange={(bps) => setRecipient(index, { shareBps: bps })}
                        max={10_000}
                        disabled={disabled}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRecipient(index)}
                      disabled={disabled}
                      className="mt-1 rounded p-1.5 transition-colors disabled:opacity-40"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-error)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      aria-label={`Remove recipient ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div
            className="flex items-center justify-between px-3 py-2.5"
            style={{ borderTop: '1px solid var(--border-primary)' }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Total share
            </span>
            <span
              className="font-mono text-xs font-semibold"
              style={{ color: totalOk ? 'var(--accent-success)' : 'var(--accent-error)' }}
            >
              {bpsToPercent(totalBps)} ({totalBps} / 10000 bps)
            </span>
          </div>
        </div>

        {changed('recipients') && (
          <button
            type="button"
            onClick={() => revertChange('recipients')}
            className="mt-2 text-[11px] underline-offset-2 hover:underline"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Revert recipients to chain state
          </button>
        )}
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
