'use client'

/**
 * RegistryHeader — hero, authority banner, and the KPI row.
 *
 * Same shape as the dashboard's hero so the page reads as part of this console
 * rather than a bolted-on tool: gradient hero with the primary action on the
 * right, then a stat row of the five facts that decide whether it is safe to
 * touch anything below.
 */
import { useState } from 'react'
import {
  Ban,
  CircleCheck,
  Coins,
  Copy,
  KeyRound,
  Layers,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/dashboard/StatCard'
import { SectionHeading } from '@/components/dashboard/SectionHeading'
import { WalletButton } from './WalletConnect'
import { bpsToPercent, formatCountdown, formatUnixTime, shortAddress } from '@/lib/authority/format'
import { UPGRADE_STATE } from '@/lib/solana/program'
import type { AuthoritySnapshot } from '@/lib/authority/types'

const CYAN = '#00d4ff'
const PURPLE = '#7c3aed'
const GREEN = '#10b981'
const AMBER = '#f59e0b'
const RED = '#ef4444'

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1_200)
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors"
      style={{
        background: 'rgba(8, 9, 13, 0.5)',
        border: '1px solid var(--border-primary)',
        color: copied ? 'var(--accent-success)' : 'var(--text-tertiary)',
      }}
      title={value}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      {shortAddress(value, 4, 4)}
      {copied ? <CircleCheck className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  )
}

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

  return (
    <>
      {/* Hero */}
      <section
        className="card mb-6 flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between"
        style={{
          background:
            'linear-gradient(135deg, rgba(0,212,255,0.07) 0%, rgba(124,58,237,0.07) 55%, transparent 100%), var(--surface)',
        }}
      >
        <div className="min-w-0">
          <p className="eyebrow">On-chain owner console</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight" style={{ color: '#ffffff' }}>
            Registry control
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Every platform-level setting the launchpad program exposes — fees, per-collection
            overrides, the emergency brake and governance — staged together and written in a single
            signed transaction.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <CopyChip label="program" value={snapshot.programId} />
            <CopyChip label="registry" value={snapshot.registryPda} />
            <span
              className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-line)' }}
            >
              {snapshot.network}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            isLoading={reloading}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={onReload}
          >
            Re-read chain
          </Button>
          <WalletButton />
        </div>
      </section>

      {/* Authority match — the single most important fact on the page */}
      <div
        className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-4"
        style={{
          borderColor: isAuthority
            ? 'rgba(16, 185, 129, 0.32)'
            : connectedAddress
              ? 'rgba(239, 68, 68, 0.32)'
              : 'var(--border-primary)',
          background: isAuthority
            ? 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent 60%), var(--surface)'
            : connectedAddress
              ? 'linear-gradient(135deg, rgba(239,68,68,0.08), transparent 60%), var(--surface)'
              : undefined,
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: isAuthority
                ? 'rgba(16,185,129,0.14)'
                : connectedAddress
                  ? 'rgba(239,68,68,0.14)'
                  : 'var(--bg-tertiary)',
              border: `1px solid ${
                isAuthority
                  ? 'rgba(16,185,129,0.34)'
                  : connectedAddress
                    ? 'rgba(239,68,68,0.34)'
                    : 'var(--border-primary)'
              }`,
              color: isAuthority ? GREEN : connectedAddress ? RED : 'var(--text-tertiary)',
            }}
          >
            {isAuthority ? (
              <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />
            )}
          </span>
          <div className="min-w-0">
            <p
              className="text-sm font-semibold"
              style={{ color: isAuthority ? GREEN : connectedAddress ? RED : 'var(--text-primary)' }}
            >
              {isAuthority
                ? 'Authority wallet connected'
                : connectedAddress
                  ? 'Wrong wallet — console is read-only'
                  : 'No wallet connected'}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {isAuthority
                ? 'Every control below is live. Changes stage locally until you sign.'
                : connectedAddress
                  ? 'This key cannot sign registry instructions. Switch to the authority wallet to make changes.'
                  : 'Chain state is shown live. Connect the authority wallet to stage changes.'}
            </p>
            {registry && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <CopyChip label="authority" value={registry.authority} />
                {connectedAddress && !isAuthority && (
                  <CopyChip label="connected" value={connectedAddress} />
                )}
              </div>
            )}
          </div>
        </div>

        {registry?.pendingAuthority && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245,158,11,0.28)',
              color: AMBER,
            }}
          >
            <KeyRound className="h-3.5 w-3.5 shrink-0" />
            <span>
              Rotation proposed to{' '}
              <span className="font-mono">{shortAddress(registry.pendingAuthority, 4, 4)}</span> —
              pending their <code>accept_registry_admin</code>
            </span>
          </div>
        )}
      </div>

      {/* KPI row */}
      <section className="mb-8">
        <SectionHeading>Chain state</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            icon={Coins}
            accent={GREEN}
            valueColor={GREEN}
            label="Paid-mint fee"
            value={bpsToPercent(snapshot.feeConfig.defaultFeeBps)}
            sub={
              snapshot.feeConfig.exists
                ? 'From the fee-config PDA'
                : 'Backend default — no PDA on chain yet'
            }
          />
          <StatCard
            icon={Users}
            accent={CYAN}
            label="Fee recipients"
            value={snapshot.feeConfig.recipients.length || '—'}
            sub={
              snapshot.feeConfig.recipients.length
                ? snapshot.feeConfig.recipients.map((r) => bpsToPercent(r.shareBps)).join(' / ')
                : 'Whole fee to the platform wallet'
            }
          />
          <StatCard
            icon={Layers}
            accent={PURPLE}
            label="Collections"
            value={registry?.collectionCount ?? 0}
            sub={`${snapshot.collections.length} readable on chain`}
          />
          <StatCard
            icon={paused ? Ban : ShieldCheck}
            accent={paused ? RED : GREEN}
            valueColor={paused ? RED : GREEN}
            label="Global minting"
            value={paused ? 'Paused' : 'Live'}
            sub={
              paused && registry?.emergencyPauseTime
                ? `Since ${formatUnixTime(registry.emergencyPauseTime)}`
                : 'Emergency brake is off'
            }
          />
          <StatCard
            icon={Timer}
            accent={upgradePending ? AMBER : CYAN}
            valueColor={upgradePending ? AMBER : '#ffffff'}
            label="Upgrade window"
            value={
              upgradePending && registry?.upgradeCompletionTime
                ? formatCountdown(registry.upgradeCompletionTime)
                : 'Idle'
            }
            sub={
              upgradePending
                ? 'Minting blocked until resolved'
                : 'No pending program upgrade'
            }
          />
        </div>
      </section>
    </>
  )
}
