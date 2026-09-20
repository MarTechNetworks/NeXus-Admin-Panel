'use client'

import { useState, type ReactNode } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useContractStatus,
  useHealthCheck,
  useIpfsHealth,
  useSolanaConfig,
  useSolanaNetwork,
} from '@/lib/api/hooks'
import { formatDate } from '@/lib/utils'
import { Check, Copy, RefreshCw } from 'lucide-react'

/**
 * Platform page.
 *
 * This replaced a "Settings" page that read three endpoints
 * (/api/admin/settings/{general,security,api-keys}) which do not exist in the
 * backend — site name, timezone, 2FA toggle, API key list, all invented, none
 * editable, no save button anywhere.
 *
 * Everything here is read from live backend endpoints. It is deliberately
 * read-only: the platform's real configuration is env-driven (PROGRAM_ID,
 * MPL_CORE_PROGRAM_ID, PLATFORM_WALLET, …) and lives in
 * /var/www/nexus-backend/.env on the VPS. A console form that appeared to edit
 * those would be lying about where the source of truth is.
 */

const TEXT = '#ffffff'
const SUB = '#8a8a9a'
const GRID = '#252535'
const CYAN = '#00d4ff'
const GREEN = '#10b981'
const AMBER = '#f59e0b'
const RED = '#ef4444'

type Tab = 'chain' | 'services'

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  )
}

/** Maps the backend's status vocabulary onto a colour. */
function toneFor(state: string | undefined): string {
  switch (state) {
    case 'ok':
    case 'connected':
    case 'up':
      return GREEN
    case 'partial':
    case 'degraded':
      return AMBER
    case 'error':
    case 'disconnected':
    case 'down':
      return RED
    default:
      return SUB
  }
}

function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="card mb-4 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" style={{ color: TEXT }}>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs" style={{ color: SUB }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** A label/value row. `mono` for addresses; long values get a copy button. */
function Row({
  label,
  value,
  mono,
  copyable,
  tone,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  copyable?: string
  tone?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!copyable) return
    try {
      await navigator.clipboard.writeText(copyable)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard is unavailable over plain http or without permission. The value
      // is on screen and selectable either way, so this is not worth an alert.
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5"
      style={{ background: '#0a0a0f', border: `1px solid ${GRID}` }}
    >
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: SUB }}>
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`truncate text-sm ${mono ? 'font-mono text-xs' : 'font-medium'}`}
          style={{ color: tone ?? TEXT }}
          title={typeof value === 'string' ? value : undefined}
        >
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label}`}
            className="shrink-0 rounded p-1 transition-colors"
            style={{ color: copied ? GREEN : SUB }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </span>
    </div>
  )
}

function Rows({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  )
}

function Unreachable({ what }: { what: string }) {
  return (
    <div
      className="rounded-lg px-3 py-3 text-sm"
      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
    >
      {what} did not respond. It is either down or unreachable from the backend.
    </div>
  )
}

export default function PlatformPage() {
  const [tab, setTab] = useState<Tab>('chain')

  const config = useSolanaConfig()
  const network = useSolanaNetwork()
  const contracts = useContractStatus()
  const health = useHealthCheck()
  const ipfs = useIpfsHealth()

  function refreshAll() {
    config.refetch()
    network.refetch()
    contracts.refetch()
    health.refetch()
    ipfs.refetch()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chain', label: 'Chain & program' },
    { id: 'services', label: 'Services' },
  ]

  const cfg = config.data

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Platform' }]}
      actions={
        <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={refreshAll}>
          Refresh
        </Button>
      }
    >
      <p className="mb-5 text-sm" style={{ color: SUB }}>
        Live configuration and service state, read from the backend. This page is read-only — these values come
        from the backend&apos;s environment (<span className="font-mono text-xs">/var/www/nexus-backend/.env</span>)
        and change by redeploying, not from here.
      </p>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="shrink-0 md:w-48" aria-label="Platform sections">
          <ul className="space-y-0.5">
            {tabs.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-150"
                  style={
                    tab === t.id
                      ? { background: 'rgba(0, 212, 255, 0.08)', color: CYAN, borderLeft: `2px solid ${CYAN}` }
                      : { background: 'transparent', color: SUB, borderLeft: '2px solid transparent' }
                  }
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {tab === 'chain' && (
            <>
              <Card
                title="Chain configuration"
                subtitle="GET /api/solana/config — the same object the public frontend keys off"
              >
                {config.isLoading ? (
                  <Loading rows={6} />
                ) : config.isError || !cfg ? (
                  <Unreachable what="The backend config endpoint" />
                ) : (
                  <Rows>
                    <Row label="Network" value={cfg.network} />
                    <Row label="RPC URL" value={cfg.rpcUrl} mono copyable={cfg.rpcUrl} />
                    <Row label="Commitment" value={cfg.commitment} />
                    <Row label="Launchpad program" value={cfg.programId} mono copyable={cfg.programId} />
                    <Row
                      label="MPL Core program"
                      value={cfg.mplCoreProgramId}
                      mono
                      copyable={cfg.mplCoreProgramId}
                    />
                    <Row label="Platform wallet" value={cfg.platformWallet} mono copyable={cfg.platformWallet} />
                    <Row
                      label="Platform fee"
                      value={`${cfg.platformFeeSol} SOL per NFT (${cfg.platformFeeLamports.toLocaleString()} lamports, ${cfg.feeType ?? 'flat'}, ${cfg.feeModel}) — every mint, free or paid`}
                      tone={CYAN}
                    />
                  </Rows>
                )}
              </Card>

              <Card title="Program deployment" subtitle="GET /api/solana/contracts/status">
                {contracts.isLoading ? (
                  <Loading rows={2} />
                ) : contracts.isError || !contracts.data ? (
                  <Unreachable what="The contract status endpoint" />
                ) : (
                  <Rows>
                    <Row label="Reported network" value={contracts.data.network} />
                    {Object.entries(contracts.data.contracts ?? {}).map(([name, c]) => (
                      <Row
                        key={name}
                        label={name.replace(/_/g, ' ')}
                        tone={c.deployed ? GREEN : RED}
                        value={
                          <span className="inline-flex items-center gap-2">
                            <Dot color={c.deployed ? GREEN : RED} />
                            {c.deployed ? 'Deployed' : 'NOT DEPLOYED'}
                          </span>
                        }
                        copyable={c.programId}
                      />
                    ))}
                  </Rows>
                )}
              </Card>

              <Card title="Live chain state" subtitle="GET /api/solana/network — refreshes every 30s">
                {network.isLoading ? (
                  <Loading rows={4} />
                ) : network.isError || !network.data ? (
                  <Unreachable what="The Solana RPC" />
                ) : (
                  <Rows>
                    <Row label="Solana core" value={network.data.version} mono />
                    <Row label="Slot" value={network.data.slot.toLocaleString()} />
                    <Row label="Block height" value={network.data.blockHeight.toLocaleString()} />
                    <Row label="Devnet" value={network.data.isDevnet ? 'Yes' : 'No'} />
                  </Rows>
                )}
              </Card>
            </>
          )}

          {tab === 'services' && (
            <>
              <Card
                title="Backend services"
                subtitle="GET /health — always HTTP 200, the state is in the body"
              >
                {health.isLoading ? (
                  <Loading rows={4} />
                ) : health.isError || !health.data ? (
                  <Unreachable what="The backend" />
                ) : (
                  <Rows>
                    <Row
                      label="Overall"
                      tone={toneFor(health.data.status)}
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Dot color={toneFor(health.data.status)} />
                          {health.data.status}
                        </span>
                      }
                    />
                    <Row
                      label="PostgreSQL"
                      tone={toneFor(health.data.database)}
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Dot color={toneFor(health.data.database)} />
                          {health.data.database}
                        </span>
                      }
                    />
                    <Row
                      label="Solana RPC"
                      tone={toneFor(health.data.solana)}
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Dot color={toneFor(health.data.solana)} />
                          {health.data.solana}
                        </span>
                      }
                    />
                    <Row
                      label="Redis"
                      tone={toneFor(health.data.redis)}
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Dot color={toneFor(health.data.redis)} />
                          {health.data.redis}
                        </span>
                      }
                    />
                    <Row label="Checked" value={formatDate(health.data.timestamp)} />
                  </Rows>
                )}
                {health.data?.redis === 'disconnected' && (
                  <p className="mt-3 text-xs" style={{ color: AMBER }}>
                    Redis is fail-open by design: the API keeps serving without it, but caching{' '}
                    <em>and rate limiting</em> are both bypassed while it is down.
                  </p>
                )}
              </Card>

              <Card title="IPFS node" subtitle="GET /api/ipfs/health — 503 when the node is unreachable">
                {ipfs.isLoading ? (
                  <Loading rows={3} />
                ) : ipfs.isError || !ipfs.data ? (
                  <Unreachable what="The IPFS node" />
                ) : (
                  <Rows>
                    <Row
                      label="Status"
                      tone={ipfs.data.ready ? GREEN : RED}
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Dot color={ipfs.data.ready ? GREEN : RED} />
                          {ipfs.data.ready ? 'Ready' : 'Not ready'}
                        </span>
                      }
                    />
                    <Row label="Node ID" value={ipfs.data.nodeId} mono copyable={ipfs.data.nodeId} />
                    <Row label="Agent" value={ipfs.data.agentVersion} mono />
                  </Rows>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
