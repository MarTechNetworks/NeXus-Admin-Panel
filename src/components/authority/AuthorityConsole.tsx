'use client'

/**
 * AuthorityConsole — the page body.
 *
 * Built for the owner, not the engineer. The two things they come here for —
 * what the platform charges, and the emergency stop — are the only cards on
 * screen. Per-collection repricing, ownership transfer and program upgrades
 * still exist, but behind one "Advanced" fold, so the default view is a number,
 * a list of wallets and a button. A deep link (#collections, #governance) or an
 * unsaved edit inside the fold opens it.
 *
 * Read-only is a first-class state, not a broken one: with no wallet, or with
 * the wrong wallet, everything still renders with live chain values and the
 * inputs are disabled.
 */
import { useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { getChainConfig } from '@/lib/solana/chain-config'
import { useAuthorityConsole } from '@/lib/authority/useAuthorityConsole'
import { shortAddress } from '@/lib/authority/format'
import { Callout } from './primitives'
import { PendingChangesBar } from './PendingChangesBar'
import { RegistryHeader } from './RegistryHeader'
import { ReviewDialog } from './ReviewDialog'
import { PlatformFeeSection } from './sections/PlatformFeeSection'
import { EmergencySection } from './sections/EmergencySection'
import { CollectionsSection } from './sections/CollectionsSection'
import { GovernanceSection } from './sections/GovernanceSection'
import type { AuthorityGroup } from '@/lib/authority/types'

const ADVANCED_GROUPS: AuthorityGroup[] = ['collections', 'admin', 'upgrade']
const ADVANCED_HASHES = ['#advanced', '#collections', '#governance']

export function AuthorityConsole() {
  const state = useAuthorityConsole()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { snapshot, loading, loadError, changes, issues, blocked, isAuthority, wallet } = state

  // Custom clusters are not in the explorer's dropdown, so pass the RPC through.
  const [explorerParams, setExplorerParams] = useState('')
  useEffect(() => {
    let cancelled = false
    void getChainConfig()
      .then((cfg) => {
        if (cancelled) return
        const known = ['devnet', 'testnet', 'mainnet-beta']
        setExplorerParams(
          known.includes(cfg.network) && cfg.rpcUrl.includes('solana.com')
            ? `?cluster=${cfg.network}`
            : `?cluster=custom&customUrl=${encodeURIComponent(cfg.rpcUrl)}`,
        )
      })
      .catch(() => {
        if (!cancelled) setExplorerParams('')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A link straight to something inside the fold should not land on a closed fold.
  useEffect(() => {
    const openIfDeepLinked = () => {
      if (ADVANCED_HASHES.includes(window.location.hash)) setAdvancedOpen(true)
    }
    openIfDeepLinked()
    window.addEventListener('hashchange', openIfDeepLinked)
    return () => window.removeEventListener('hashchange', openIfDeepLinked)
  }, [])

  const advancedCount = changes.filter((c) => ADVANCED_GROUPS.includes(c.group)).length
  const advancedErrors = issues.filter(
    (i) => i.level === 'error' && ADVANCED_GROUPS.includes(i.group),
  ).length
  // An unsaved edit or a blocking error inside the fold must never be invisible.
  useEffect(() => {
    if (advancedCount > 0 || advancedErrors > 0) setAdvancedOpen(true)
  }, [advancedCount, advancedErrors])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading && !snapshot) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Reading the current settings from the chain…
          </p>
        </div>
        <div className="mt-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  // ── Load failure ─────────────────────────────────────────────────────────
  if (loadError || !snapshot) {
    return (
      <div className="card mx-auto max-w-4xl p-8 text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: 'var(--danger-soft)', color: 'var(--accent-error)' }}
        >
          <AlertCircle className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h2 className="mt-4 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Could not read the current settings
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {loadError ?? 'No data came back from the chain.'}
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => void state.reload()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <RegistryHeader
        snapshot={snapshot}
        isAuthority={isAuthority}
        connectedAddress={wallet.address}
        onReload={() => void state.reload({ keepDraft: true })}
        reloading={loading}
      />

      {!snapshot.registry && (
        <div className="mb-6">
          <Callout level="danger">
            The program has not been set up on this network yet, so there is nothing to change
            here. Deploying the first collection from the public site sets it up automatically.
          </Callout>
        </div>
      )}

      <div className="space-y-5">
        <PlatformFeeSection state={state} />
        <EmergencySection state={state} />

        {/* ── Advanced ──────────────────────────────────────────────────── */}
        <div id="advanced" className="scroll-mt-24">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-controls="advanced-panel"
            className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors"
            style={{
              border: '1px solid var(--border-primary)',
              background: advancedOpen ? 'var(--bg-tertiary)' : 'transparent',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = advancedOpen ? 'var(--bg-tertiary)' : 'transparent')
            }
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              Advanced
              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                — per-collection fees, ownership, program upgrades
              </span>
              {advancedCount > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                  style={{ background: 'var(--accent)', color: '#08090d' }}
                >
                  {advancedCount}
                </span>
              )}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 transition-transform"
              style={{ transform: advancedOpen ? 'rotate(180deg)' : undefined }}
            />
          </button>

          {advancedOpen && (
            <div id="advanced-panel" className="mt-4 space-y-5">
              <CollectionsSection state={state} />
              <GovernanceSection state={state} />
              <p className="px-1 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                program <span title={snapshot.programId}>{shortAddress(snapshot.programId, 6, 6)}</span>
                {' · '}
                registry <span title={snapshot.registryPda}>{shortAddress(snapshot.registryPda, 6, 6)}</span>
                {' · '}
                fee config{' '}
                <span title={snapshot.platformFeeConfigPda}>{shortAddress(snapshot.platformFeeConfigPda, 6, 6)}</span>
                {snapshot.feeConfig.exists ? '' : ' (not created)'}
              </p>
            </div>
          )}
        </div>
      </div>

      <PendingChangesBar
        changes={changes}
        issues={issues}
        blocked={blocked}
        canSign={isAuthority}
        onDiscard={state.discardAll}
        onReview={() => {
          setReviewOpen(true)
          void state.buildPlan()
        }}
      />

      <ReviewDialog
        open={reviewOpen}
        onClose={() => {
          setReviewOpen(false)
          state.resetSubmit()
        }}
        changes={changes}
        plan={state.plan}
        planError={state.planError}
        submit={state.submit}
        onSign={() => void state.send()}
        onDone={() => {
          setReviewOpen(false)
          state.resetSubmit()
        }}
        explorerUrl={(signature) => `https://explorer.solana.com/tx/${signature}${explorerParams}`}
      />
    </div>
  )
}
