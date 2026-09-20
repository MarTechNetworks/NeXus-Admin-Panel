'use client'

/**
 * RegistryHeader — title row and the one line that decides whether anything on
 * the page is editable.
 *
 * Deliberately not a hero: the owner comes here to change a number or pull the
 * brake, so the header gets out of the way. Everything that used to be a KPI
 * card (fee, recipients, pause state) is now the live value inside the card
 * that edits it; the two facts that block the whole page — a platform-wide
 * pause, a pending upgrade — get a banner instead, because those are the ones
 * that explain "why can nobody mint?".
 */
import { Ban, RefreshCw, Timer } from 'lucide-react'
import { WalletButton } from './WalletConnect'
import { Callout } from './primitives'
import { formatCountdown, formatUnixTime, shortAddress } from '@/lib/authority/format'
import { UPGRADE_STATE } from '@/lib/solana/program'
import type { AuthoritySnapshot } from '@/lib/authority/types'

export function RegistryHeader({
  snapshot,
  isAuthority,
  connectedAddress,
  onReload,
  reloading,
}: {
  snapshot: AuthoritySnapshot
  isAuthority: boolean
  connectedAddress: string | null
  onReload: () => void
  reloading: boolean
}) {
  const registry = snapshot.registry
  const upgradePending = registry?.upgradeState === UPGRADE_STATE.Initiated
  const paused = registry?.emergencyPause ?? false

  const status = isAuthority
    ? { tone: 'var(--accent-success)', text: 'Owner wallet connected — changes apply when you save.' }
    : connectedAddress
      ? {
          tone: 'var(--accent-error)',
          text: `${shortAddress(connectedAddress, 4, 4)} is not the owner wallet (${shortAddress(registry?.authority ?? '', 4, 4)}). Read-only until you switch wallets.`,
        }
      : {
          tone: 'var(--text-muted)',
          text: `Read-only. Connect the owner wallet${registry ? ` (${shortAddress(registry.authority, 4, 4)})` : ''} to make changes.`,
        }

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#ffffff' }}>
            Fees &amp; minting
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            What the platform charges on every mint, and the emergency stop. Saved on chain with
            the owner wallet.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-line)' }}
            title={snapshot.programId}
          >
            {snapshot.network}
          </span>
          <button
            type="button"
            onClick={onReload}
            disabled={reloading}
            className="btn-secondary inline-flex h-9 w-9 items-center justify-center !px-0"
            aria-label="Refresh from chain"
            title="Refresh from chain"
          >
            <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
          </button>
          <WalletButton />
        </div>
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs" style={{ color: status.tone }}>
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: status.tone }} />
        {status.text}
      </p>

      {(paused || upgradePending || registry?.pendingAuthority) && (
        <div className="mt-4 space-y-2">
          {paused && (
            <Callout level="danger">
              <span className="inline-flex items-center gap-1.5">
                <Ban className="h-3 w-3" />
                Minting is paused on every collection
                {registry?.emergencyPauseTime ? ` since ${formatUnixTime(registry.emergencyPauseTime)}` : ''}.
                Resume it in the Minting card below.
              </span>
            </Callout>
          )}
          {upgradePending && (
            <Callout level="warning">
              <span className="inline-flex items-center gap-1.5">
                <Timer className="h-3 w-3" />
                A program upgrade is scheduled — nobody can mint until it is completed
                {registry?.upgradeCompletionTime
                  ? ` (possible ${formatCountdown(registry.upgradeCompletionTime)})`
                  : ''}{' '}
                or cancelled under Advanced.
              </span>
            </Callout>
          )}
          {registry?.pendingAuthority && (
            <Callout level="warning">
              Ownership transfer to{' '}
              <span className="font-mono">{shortAddress(registry.pendingAuthority, 4, 4)}</span> is
              waiting for that wallet to accept. You remain the owner until it does.
            </Callout>
          )}
        </div>
      )}
    </header>
  )
}
