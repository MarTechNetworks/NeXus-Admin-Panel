'use client'

/**
 * GovernanceSection — the two instructions that act on the program itself:
 * rotating the registry key, and the upgrade timelock.
 *
 * Both are staged into the same transaction as everything else, but they are
 * kept in their own card with danger styling because their failure modes are
 * different in kind: one hands over control, the other halts every mint on the
 * platform until it is resolved.
 */
import { AlertTriangle, KeyRound, Timer } from 'lucide-react'
import { Callout, Field, Section, TextInput } from '../primitives'
import { formatCountdown, formatUnixTime, shortAddress } from '@/lib/authority/format'
import {
  MAX_UPGRADE_DELAY_SECONDS,
  MIN_UPGRADE_DELAY_SECONDS,
  UPGRADE_STATE,
} from '@/lib/solana/program'
import type { AuthorityDraft, UpgradeAction } from '@/lib/authority/types'
import type { AuthorityConsoleState } from '@/lib/authority/useAuthorityConsole'

const DELAY_OPTIONS = [
  { value: MIN_UPGRADE_DELAY_SECONDS, label: '24 hours (minimum)' },
  { value: 2 * 86_400, label: '2 days' },
  { value: 3 * 86_400, label: '3 days' },
  { value: MAX_UPGRADE_DELAY_SECONDS, label: '7 days (maximum)' },
]

export function GovernanceSection({ state }: { state: AuthorityConsoleState }) {
  const { snapshot, draft, patchDraft, revertChange, changes, issues, isAuthority } = state
  if (!snapshot?.registry || !draft) return null

  const disabled = !isAuthority
  const registry = snapshot.registry
  const pending = registry.upgradeState === UPGRADE_STATE.Initiated
  const rotationChanged = changes.some((c) => c.key === 'pendingAuthority')
  const upgradeChanged = changes.some((c) => c.key === 'upgrade')
  const changedCount = (rotationChanged ? 1 : 0) + (upgradeChanged ? 1 : 0)

  const errorFor = (key: string) => issues.find((i) => i.level === 'error' && i.key === key)?.message
  const groupIssues = issues.filter(
    (i) => (i.group === 'admin' || i.group === 'upgrade') && !i.key,
  )

  const setUpgrade = (patch: Partial<AuthorityDraft['upgrade']>) => {
    patchDraft({ upgrade: { ...draft.upgrade, ...patch } })
  }

  const actions: { value: UpgradeAction; label: string; hint: string; available: boolean }[] = [
    { value: 'none', label: 'No change', hint: 'Leave the timelock as it is.', available: true },
    {
      value: 'initiate',
      label: 'Initiate',
      hint: 'Opens the window. Minting stops platform-wide until it closes.',
      available: !pending,
    },
    {
      value: 'complete',
      label: 'Complete',
      hint: 'Closes the window and restores minting. Only after the delay elapses.',
      available: pending,
    },
    {
      value: 'cancel',
      label: 'Cancel',
      hint: 'Abandons the pending upgrade and unblocks minting immediately.',
      available: pending,
    },
  ]

  return (
    <Section
      id="governance"
      title="Governance"
      description="Registry key rotation and the program upgrade timelock. Both are recorded on the registry account and both are two-step by design."
      icon={<KeyRound className="h-4 w-4" />}
      tone="danger"
      changedCount={changedCount}
    >
      {/* ── Authority rotation ─────────────────────────────────────────── */}
      <Field
        label="Propose new registry authority"
        htmlFor="pendingAuthority"
        changed={rotationChanged}
        onRevert={() => revertChange('pendingAuthority')}
        error={errorFor('pendingAuthority')}
        hint={
          <>
            Records a proposal only — the named wallet must call{' '}
            <code>accept_registry_admin</code> itself before control moves, which is what stops a
            typo from locking the platform out. Current authority:{' '}
            <span className="font-mono">{shortAddress(registry.authority, 6, 6)}</span>.
          </>
        }
      >
        <TextInput
          id="pendingAuthority"
          mono
          value={draft.pendingAuthority}
          onChange={(value) => patchDraft({ pendingAuthority: value })}
          placeholder="Leave empty to keep the current authority"
          invalid={!!errorFor('pendingAuthority')}
          disabled={disabled}
        />
      </Field>

      {registry.pendingAuthority && (
        <div className="mt-2">
          <Callout level="warning">
            A rotation to{' '}
            <span className="font-mono">{shortAddress(registry.pendingAuthority, 6, 6)}</span> is
            already pending. Proposing a different wallet replaces it.
          </Callout>
        </div>
      )}

      {/* ── Upgrade timelock ───────────────────────────────────────────── */}
      <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="mb-3 flex items-center gap-2">
          <Timer className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            Upgrade timelock
          </h3>
        </div>

        {pending && (
          <div className="mb-3">
            <Callout level="warning">
              Upgrade to{' '}
              <span className="font-mono">
                {shortAddress(registry.pendingUpgradeProgram ?? '', 6, 6)}
              </span>{' '}
              is pending — every mint is blocked until it completes or is cancelled. Unlocks{' '}
              {formatUnixTime(registry.upgradeCompletionTime)} (
              {registry.upgradeCompletionTime ? formatCountdown(registry.upgradeCompletionTime) : '—'}).
            </Callout>
          </div>
        )}

        <Field
          label="Action"
          changed={upgradeChanged}
          onRevert={() => revertChange('upgrade')}
        >
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const active = draft.upgrade.action === action.value
              return (
                <button
                  key={action.value}
                  type="button"
                  disabled={disabled || !action.available}
                  onClick={() => setUpgrade({ action: action.value })}
                  title={action.hint}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: active ? 'var(--danger-soft)' : 'var(--bg-tertiary)',
                    color: active ? 'var(--accent-error)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'rgba(239,68,68,0.4)' : 'var(--border-primary)'}`,
                  }}
                >
                  {action.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {actions.find((a) => a.value === draft.upgrade.action)?.hint}
          </p>
        </Field>

        {draft.upgrade.action === 'initiate' && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Field
              label="New program id"
              htmlFor="newProgramId"
              error={errorFor('newProgramId')}
              hint="The address the program will be upgraded to. This is recorded on chain; the actual deploy still happens with the Solana CLI."
            >
              <TextInput
                id="newProgramId"
                mono
                value={draft.upgrade.newProgramId}
                onChange={(value) => setUpgrade({ newProgramId: value })}
                placeholder="Program address"
                invalid={!!errorFor('newProgramId')}
                disabled={disabled}
              />
            </Field>

            <Field
              label="Delay"
              htmlFor="upgradeDelay"
              error={errorFor('upgradeDelay')}
              hint="How long the window stays open before complete_upgrade is allowed. The program enforces 24 hours to 7 days."
            >
              <select
                id="upgradeDelay"
                className="input-base text-sm"
                value={draft.upgrade.delaySeconds}
                disabled={disabled}
                onChange={(e) => setUpgrade({ delaySeconds: Number(e.target.value) })}
              >
                {DELAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      {groupIssues.length > 0 && (
        <div className="mt-4 space-y-2">
          {groupIssues.map((issue, i) => (
            <Callout key={i} level={issue.level === 'error' ? 'danger' : 'warning'}>
              <span className="inline-flex items-start gap-1.5">
                {issue.level === 'error' && <AlertTriangle className="mt-px h-3 w-3 shrink-0" />}
                {issue.message}
              </span>
            </Callout>
          ))}
        </div>
      )}
    </Section>
  )
}
