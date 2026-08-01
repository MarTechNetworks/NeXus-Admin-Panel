'use client'

/**
 * AuthorityConsole — the page body.
 *
 * Hero and KPI row up top (same shape as the dashboard), then a jump rail beside
 * a column of section cards, with the commit surface docked at the bottom. The
 * rail carries a badge per section that has staged changes, which answers "I
 * edited something three screens up, what was it?" without scrolling back.
 *
 * Read-only is a first-class state, not a broken one: with no wallet, or with
 * the wrong wallet, everything still renders with live chain values and the
 * inputs are disabled.
 */
import { useEffect, useState } from 'react'
import { AlertCircle, Coins, KeyRound, LayoutGrid, Loader2, Siren } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHeading } from '@/components/dashboard/SectionHeading'
import { Skeleton, SkeletonKpi } from '@/components/ui/Skeleton'
import { getChainConfig } from '@/lib/solana/chain-config'
import { useAuthorityConsole } from '@/lib/authority/useAuthorityConsole'
import { Callout } from './primitives'
import { PendingChangesBar } from './PendingChangesBar'
import { RegistryHeader } from './RegistryHeader'
import { ReviewDialog } from './ReviewDialog'
import { PlatformFeeSection } from './sections/PlatformFeeSection'
import { EmergencySection } from './sections/EmergencySection'
import { CollectionsSection } from './sections/CollectionsSection'
import { GovernanceSection } from './sections/GovernanceSection'
import type { AuthorityGroup } from '@/lib/authority/types'

const NAV: { id: string; label: string; groups: AuthorityGroup[]; Icon: typeof Coins }[] = [
  { id: 'fees', label: 'Platform fee', groups: ['fees', 'recipients'], Icon: Coins },
  { id: 'collections', label: 'Collections', groups: ['collections'], Icon: LayoutGrid },
  { id: 'emergency', label: 'Emergency', groups: ['emergency'], Icon: Siren },
  { id: 'governance', label: 'Governance', groups: ['admin', 'upgrade'], Icon: KeyRound },
]

export function AuthorityConsole() {
  const state = useAuthorityConsole()
  const [reviewOpen, setReviewOpen] = useState(false)
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

  const countFor = (groups: AuthorityGroup[]) =>
    changes.filter((c) => groups.includes(c.group)).length

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading && !snapshot) {
    return (
      <div>
        <div className="card mb-6 p-6">
          <div className="flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Reading registry state from the cluster…
            </p>
          </div>
          <div className="mt-5 space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonKpi key={i} />
          ))}
        </div>
      </div>
    )
  }

  // ── Load failure ─────────────────────────────────────────────────────────
  if (loadError || !snapshot) {
    return (
      <div className="card p-8 text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: 'var(--danger-soft)', color: 'var(--accent-error)' }}
        >
          <AlertCircle className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h2 className="mt-4 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Could not read on-chain state
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {loadError ?? 'No snapshot available.'}
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => void state.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
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
            There is no registry account at{' '}
            <span className="font-mono">{snapshot.registryPda}</span> for program{' '}
            <span className="font-mono">{snapshot.programId}</span>. Run{' '}
            <code>initialize_registry</code> before this console can do anything.
          </Callout>
        </div>
      )}

      <SectionHeading
        actions={
          changes.length > 0 ? (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-line)' }}
            >
              {changes.length} staged
            </span>
          ) : undefined
        }
      >
        Adjustable settings
      </SectionHeading>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Jump rail */}
        <nav className="shrink-0 lg:w-52" aria-label="Authority sections">
          <div className="lg:sticky lg:top-6">
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {NAV.map(({ id, label, groups, Icon }) => {
                const count = countFor(groups)
                return (
                  <li key={id} className="shrink-0">
                    <a
                      href={`#${id}`}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150"
                      style={{
                        background: count > 0 ? 'var(--accent-soft)' : 'transparent',
                        color: count > 0 ? 'var(--accent)' : 'var(--text-tertiary)',
                        borderLeft: `2px solid ${count > 0 ? 'var(--accent)' : 'transparent'}`,
                      }}
                      onMouseEnter={(e) => {
                        if (count === 0) {
                          e.currentTarget.style.background = 'var(--bg-hover)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (count === 0) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-tertiary)'
                        }
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span className="whitespace-nowrap">{label}</span>
                      {count > 0 && (
                        <span
                          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                          style={{ background: 'var(--accent)', color: '#08090d' }}
                        >
                          {count}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>

        {/* Sections */}
        <div className="min-w-0 flex-1 space-y-6">
          <PlatformFeeSection state={state} />
          <CollectionsSection state={state} />
          <EmergencySection state={state} />
          <GovernanceSection state={state} />
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
