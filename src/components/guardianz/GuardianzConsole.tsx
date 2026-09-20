'use client'

/**
 * GuardianzConsole — the BlockChain GuardianZ creator's two signatures.
 *
 * Distinct from the authority console next door: that one signs with the *platform*
 * registry key against our own program on the configured cluster. This one signs with
 * the *collection creator's* key (`Fbfr8aJG…`) against Metaplex's programs on
 * **mainnet**, regardless of what the rest of the app points at. So it has its own
 * Umi, its own RPC, and a gate that is the connected wallet's address rather than an
 * admin role.
 *
 * What it does, in order — each step reads its done/not-done state from the chain:
 *
 *   1. Reclaim the collection's UpdateDelegate from LaunchMyNFT's PDA. One
 *      instruction, ~0.00001 SOL. Core will not attach a candy machine while their
 *      program holds it.
 *   2. Create the Core Candy Machine + Guard for the remaining supply. The creator
 *      signs as collection authority (Core requires it) **and as payer**, so the rent
 *      deposit goes from his wallet straight into the candy machine — nobody in
 *      between, refundable to him when the mint is over.
 *
 * After that the upload of the remaining items is ours (an ops-wallet script), and
 * the public mint page opens on its own when the chain shows every item loaded.
 *
 * Thawing the collection is deliberately not a step here — see admin-actions.ts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Boxes,
  CheckCircle2,
  Circle,
  ExternalLink,
  KeyRound,
  Loader2,
  Shield,
  Snowflake,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { WalletButton } from '@/components/authority/WalletConnect'
import { AddressChip, Callout, ChainValue, Section } from '@/components/authority/primitives'
import { useWallet } from '@/lib/solana/wallet'
import { shortAddress } from '@/lib/authority/format'
import { CREATOR_WALLET, GUARDIANZ_COLLECTION, LMN_CONFIG_PDA } from '@/lib/guardianz/constants'
import { OPS_WALLET } from '@/lib/guardianz/candy-machine'
import { createCandyMachine, reclaimUpdateDelegate } from '@/lib/guardianz/admin-actions'
import type { MigrationStatus } from '@/lib/guardianz/migration-status'
import { walletUmi } from '@/lib/guardianz/umi'

type StepId = 'reclaim' | 'create'

interface SignedEntry {
  step: StepId
  signature: string
  candyMachine?: string
}

const tx = (sig: string) => `https://solscan.io/tx/${sig}`
const acct = (a: string) => `https://solscan.io/account/${a}`

async function fetchStatus(): Promise<MigrationStatus> {
  const res = await fetch('/api/guardianz/status', { cache: 'no-store' })
  if (!res.ok) throw new Error(`status ${res.status}`)
  return (await res.json()) as MigrationStatus
}

export function GuardianzConsole() {
  const wallet = useWallet()
  const status = useQuery({ queryKey: ['guardianz-status'], queryFn: fetchStatus, refetchInterval: 30_000 })

  const [busy, setBusy] = useState<StepId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signed, setSigned] = useState<SignedEntry[]>([])

  const s = status.data
  const col = s?.collection ?? null
  const isCreator = !!wallet.address && wallet.address === CREATOR_WALLET
  const remaining = col?.remaining ?? 0

  // Switching to a different account mid-flow is exactly how the wrong key signs;
  // clear any stale error the moment the address changes.
  useEffect(() => setError(null), [wallet.address])

  const reclaimDone = !!col && !col.updateDelegateHeldByLmn
  const createDone = !!s?.candyMachine
  const createBlocked = !col
    ? 'Chain unreadable.'
    : !reclaimDone
      ? 'Sign step 1 first.'
      : !OPS_WALLET
        ? 'NEXT_PUBLIC_GUARDIANZ_OPS_WALLET is not configured on this deployment — nothing to assign as operator.'
        : null

  const run = useCallback(
    async (id: StepId) => {
      if (!isCreator || !wallet.publicKey) return
      setBusy(id)
      setError(null)
      try {
        const umi = walletUmi(wallet)
        if (id === 'reclaim') {
          const { signature } = await reclaimUpdateDelegate(umi)
          setSigned((l) => [...l, { step: id, signature }])
        } else {
          const { signature, candyMachine } = await createCandyMachine(umi, { itemsAvailable: remaining })
          setSigned((l) => [...l, { step: id, signature, candyMachine }])
        }
        await status.refetch()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(/reject|denied|cancel/i.test(msg) ? 'Cancelled in the wallet.' : msg.split('\n')[0].slice(0, 300))
      } finally {
        setBusy(null)
      }
    },
    [isCreator, wallet, remaining, status],
  )

  const walletTone = useMemo(() => {
    if (!wallet.address) return { tone: 'default' as const, text: 'No wallet connected' }
    if (isCreator) return { tone: 'success' as const, text: 'Collection update authority' }
    return { tone: 'warning' as const, text: 'Not the collection authority' }
  }, [wallet.address, isCreator])

  return (
    <div className="space-y-6">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="card px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              BlockChain GuardianZ — creator actions
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              Two signatures from the collection&apos;s update authority, on <strong>mainnet</strong>. Nothing here
              sends SOL to anyone but a Metaplex program account you control, and every step is read back from the
              chain before it is shown as done.
            </p>
          </div>
          <WalletButton />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ChainValue
            label="Connected wallet"
            value={wallet.address ? shortAddress(wallet.address, 6, 6) : '—'}
            mono
            tone={walletTone.tone}
            title={wallet.address ?? undefined}
          />
          <ChainValue label="Role" value={walletTone.text} tone={walletTone.tone} />
          <ChainValue
            label="Required"
            value={shortAddress(CREATOR_WALLET, 6, 6)}
            mono
            title={CREATOR_WALLET}
          />
        </div>

        {wallet.address && !isCreator && (
          <div className="mt-4">
            <Callout level="warning">
              Only <span className="font-mono">{shortAddress(CREATOR_WALLET, 6, 6)}</span> can sign these steps.
              Switch to that account in the wallet to continue.
            </Callout>
          </div>
        )}
      </div>

      {/* ── Collection, live ────────────────────────────────────────────── */}
      <Section
        title="Collection"
        description="Read from mainnet on every load. This is the state the two steps act on."
        icon={<Shield className="h-5 w-5" />}
        aside={
          <a
            href={acct(GUARDIANZ_COLLECTION)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--accent)' }}
          >
            Solscan <ExternalLink className="h-3 w-3" />
          </a>
        }
      >
        {status.isLoading ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Reading mainnet…
          </p>
        ) : !col ? (
          <Callout level="danger">Could not read the collection: {s?.error ?? status.error?.message ?? 'unknown'}</Callout>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ChainValue label="Collection" value={shortAddress(GUARDIANZ_COLLECTION, 6, 6)} mono title={GUARDIANZ_COLLECTION} />
            <ChainValue
              label="Update authority"
              value={col.updateAuthorityIsCreator ? `${shortAddress(col.updateAuthority, 6, 6)} · you` : shortAddress(col.updateAuthority, 6, 6)}
              mono
              tone={col.updateAuthorityIsCreator ? 'success' : 'warning'}
              title={col.updateAuthority}
            />
            <ChainValue label="Minted / supply" value={`${col.numMinted.toLocaleString()} / ${col.totalSupply.toLocaleString()}`} />
            <ChainValue
              label="UpdateDelegate held by"
              value={col.updateDelegateHeldByLmn ? 'LaunchMyNFT PDA' : col.updateDelegateAuthority}
              mono={!col.updateDelegateHeldByLmn}
              tone={col.updateDelegateHeldByLmn ? 'warning' : 'success'}
              title={col.updateDelegateHeldByLmn ? LMN_CONFIG_PDA : col.updateDelegateAuthority}
            />
            <ChainValue
              label="Transfers"
              value={
                col.frozen ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Snowflake className="h-3.5 w-3.5" /> Frozen
                    {col.freezeHeldByLmn ? ' · LaunchMyNFT holds the switch' : ''}
                  </span>
                ) : (
                  'Open'
                )
              }
              tone={col.frozen ? 'warning' : 'success'}
            />
            <ChainValue
              label="Candy machine"
              value={
                s?.candyMachine ? (
                  <a href={acct(s.candyMachine.address)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {shortAddress(s.candyMachine.address, 6, 6)} · {s.candyMachine.itemsLoaded.toLocaleString()}/
                    {s.candyMachine.itemsAvailable.toLocaleString()} loaded
                  </a>
                ) : (
                  'none yet'
                )
              }
              mono={!!s?.candyMachine}
              tone={s?.candyMachine ? (s.candyMachine.fullyLoaded ? 'success' : 'warning') : 'default'}
            />
          </div>
        )}
      </Section>

      {/* ── The two steps ───────────────────────────────────────────────── */}
      <Section
        title="Steps"
        description="Each one is a single wallet signature. A step already done on-chain shows as signed and cannot be repeated."
        icon={<KeyRound className="h-5 w-5" />}
      >
        <ol className="space-y-3">
          <Step
            index={1}
            title="Reclaim mint permission"
            done={reclaimDone}
            busy={busy === 'reclaim'}
            disabled={!isCreator || reclaimDone || busy !== null || !col}
            onSign={() => run('reclaim')}
            what={`Revokes LaunchMyNFT's authority on the collection's UpdateDelegate plugin (${shortAddress(LMN_CONFIG_PDA, 4, 4)}). It falls back to you.`}
            why="Core will not let a candy machine attach to the collection while their program holds this."
            cost="~0.00001 SOL transaction fee"
          />
          <Step
            index={2}
            title="Create the candy machine"
            done={createDone}
            busy={busy === 'create'}
            disabled={!isCreator || createDone || busy !== null || !!createBlocked}
            blocked={createDone ? null : createBlocked}
            onSign={() => run('create')}
            what={`Creates a Metaplex Core Candy Machine for the ${remaining.toLocaleString()} remaining items, priced at 0.25 SOL to your wallet, with NeXus (${OPS_WALLET ? shortAddress(OPS_WALLET, 4, 4) : 'ops wallet'}) as operator so we can upload the items.`}
            why="You sign as the collection authority (required by Core) and as payer, so the rent deposit goes from your wallet straight into the candy machine account. It is refundable to you when the mint is over."
            cost="~0.55 SOL deposit (refundable) + fee"
          />
        </ol>

        {error && (
          <div className="mt-4">
            <Callout level="danger">{error}</Callout>
          </div>
        )}

        {signed.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {signed.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--accent-success)' }} />
                {l.step === 'reclaim' ? 'Reclaimed' : 'Candy machine created'}
                <a href={tx(l.signature)} target="_blank" rel="noreferrer" className="font-mono" style={{ color: 'var(--accent)' }}>
                  {shortAddress(l.signature, 6, 6)}
                </a>
                {l.candyMachine && <AddressChip address={l.candyMachine} label="CM" />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── What happens next ───────────────────────────────────────────── */}
      <Section
        title="After step 2"
        icon={<Boxes className="h-5 w-5" />}
        description="The rest is on NeXus and needs nothing from you."
      >
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <li>NeXus uploads the remaining items into the candy machine — about 160 transactions, a few minutes.</li>
          <li>
            The public mint page opens by itself once the chain shows every item loaded. Buyers pay 0.25 SOL to your
            wallet plus a flat platform fee, and mint directly through Metaplex&apos;s program.
          </li>
          <li>When the mint is finished, the candy machine&apos;s rent deposit is withdrawn back to your wallet.</li>
        </ol>
        <div className="mt-4">
          <Callout level="info">
            The transfer freeze on the collection is not touched by any of this. LaunchMyNFT&apos;s panel can still
            lift it whenever you decide to; minting works either way.
          </Callout>
        </div>
      </Section>
    </div>
  )
}

function Step({
  index,
  title,
  done,
  busy,
  disabled,
  blocked,
  onSign,
  what,
  why,
  cost,
}: {
  index: number
  title: string
  done: boolean
  busy: boolean
  disabled: boolean
  blocked?: string | null
  onSign: () => void
  what: string
  why: string
  cost: string
}) {
  return (
    <li
      className="panel-subtle flex flex-wrap items-start justify-between gap-4 px-4 py-4"
      style={done ? { borderColor: 'rgba(16,185,129,0.3)' } : undefined}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 shrink-0" style={{ color: done ? 'var(--accent-success)' : 'var(--text-muted)' }}>
          {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <span className="mr-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Step {index}
            </span>
            {title}
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {what}
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {why}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {cost}
          </p>
          {blocked && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--accent-warning)' }}>
              {blocked}
            </p>
          )}
        </div>
      </div>
      <Button
        variant={done ? 'secondary' : 'primary'}
        size="sm"
        disabled={disabled}
        onClick={onSign}
        leftIcon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
      >
        {busy ? 'Waiting for wallet…' : done ? 'Signed' : 'Sign'}
      </Button>
    </li>
  )
}
