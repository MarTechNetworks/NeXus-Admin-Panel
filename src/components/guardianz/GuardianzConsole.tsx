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
 * Separately, at any time: rewrite the royalty split (e.g. 7.5% across two wallets).
 * Not a numbered step — the mint does not depend on it, and step 1 does not gate it.
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
  Percent,
  Plus,
  RotateCcw,
  Shield,
  Snowflake,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { WalletButton } from '@/components/authority/WalletConnect'
import {
  AddressChip,
  Callout,
  ChainValue,
  PercentInput,
  Section,
  TextInput,
} from '@/components/authority/primitives'
import { PhaseEditor } from '@/components/guardianz/PhaseEditor'
import { useWallet } from '@/lib/solana/wallet'
import { shortAddress } from '@/lib/authority/format'
import { CREATOR_WALLET, GUARDIANZ_COLLECTION, LMN_CONFIG_PDA, ROYALTY_BPS } from '@/lib/guardianz/constants'
import { OPS_WALLET } from '@/lib/guardianz/candy-machine'
import {
  createCandyMachine,
  isValidAddress,
  reclaimUpdateDelegate,
  updateRoyaltySplit,
  validateRoyaltySplit,
  type RoyaltySplit,
} from '@/lib/guardianz/admin-actions'
import { TransactionUnknownError } from '@/lib/guardianz/send'
import type { MigrationStatus } from '@/lib/guardianz/migration-status'
import { walletUmi } from '@/lib/guardianz/umi'

type StepId = 'reclaim' | 'create'
/** The royalty split is signed from its own card, so it locks the buttons but is not a step. */
type ActionId = StepId | 'royalties'

const SIGNED_LABEL: Record<StepId, string> = {
  reclaim: 'Reclaimed',
  create: 'Candy machine created',
}

interface SignedEntry {
  step: StepId
  signature: string
  candyMachine?: string
}

const tx = (sig: string) => `https://solscan.io/tx/${sig}`
const acct = (a: string) => `https://solscan.io/account/${a}`

/** Wallet rejections read as rejections; everything else keeps its first line. */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/reject|denied|cancel/i.test(msg)) return 'Cancelled in the wallet.'
  // TransactionUnknownError already reads as an instruction and carries its own link;
  // truncating it would cut off the part that says not to sign again.
  if (e instanceof TransactionUnknownError) return msg
  return msg.split('\n')[0].slice(0, 300)
}

async function fetchStatus(): Promise<MigrationStatus> {
  const res = await fetch('/api/guardianz/status', { cache: 'no-store' })
  if (!res.ok) throw new Error(`status ${res.status}`)
  return (await res.json()) as MigrationStatus
}

export function GuardianzConsole() {
  const wallet = useWallet()
  const status = useQuery({ queryKey: ['guardianz-status'], queryFn: fetchStatus, refetchInterval: 30_000 })

  const [busy, setBusy] = useState<ActionId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signed, setSigned] = useState<SignedEntry[]>([])
  // Royalty outcomes live beside the royalty card, not in the steps log — an error from
  // a save belongs under the form that caused it, three sections away from the steps.
  const [royaltyError, setRoyaltyError] = useState<string | null>(null)
  const [royaltyTx, setRoyaltyTx] = useState<string | null>(null)

  const s = status.data
  const col = s?.collection ?? null
  const isCreator = !!wallet.address && wallet.address === CREATOR_WALLET
  const remaining = col?.remaining ?? 0
  /**
   * What the candy machine is sized to — the snapshot's entry count, not `remaining`.
   *
   * They differ by the two burned assets: `remaining` is `totalSupply - numMinted` and
   * `num_minted` never decrements, so it reads 6,214 while the pool that will be uploaded
   * holds 6,216. `itemsAvailable` cannot be changed after creation, so the smaller number
   * would strand two files behind a rent deposit the creator has already paid.
   */
  const poolSize = s?.poolSize ?? 0

  // Switching to a different account mid-flow is exactly how the wrong key signs;
  // clear any stale error the moment the address changes.
  useEffect(() => {
    setError(null)
    setRoyaltyError(null)
  }, [wallet.address])

  const reclaimDone = !!col && !col.updateDelegateHeldByLmn
  const createDone = !!s?.candyMachine
  const createBlocked = !col
    ? 'Chain unreadable.'
    : !reclaimDone
      ? 'Sign step 1 first.'
      : !OPS_WALLET
        ? 'No operator wallet configured on this deployment — nothing to assign as candy machine authority.'
        : poolSize === 0
          ? 'The snapshot of unminted items has not loaded, so there is no size to create the candy machine at. Reload before signing — itemsAvailable cannot be changed afterwards.'
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
          const { signature, candyMachine } = await createCandyMachine(umi, { itemsAvailable: poolSize })
          setSigned((l) => [...l, { step: id, signature, candyMachine }])
        }
        await status.refetch()
      } catch (e) {
        setError(friendlyError(e))
        // An unknown result is not a failure — the transaction may have landed while our
        // polling was being rate-limited. Re-read the chain so a step that worked flips
        // to "Signed" on its own rather than leaving the operator staring at red and
        // tempted to sign a second 0.55 SOL deposit.
        if (e instanceof TransactionUnknownError) await status.refetch()
      } finally {
        setBusy(null)
      }
    },
    [isCreator, wallet, poolSize, status],
  )

  /**
   * Save the royalty split. Its own path rather than a branch of `run` because it is the
   * one action here that is editable, repeatable and reported in place: the signature
   * and any failure render under the form, and the refetch that follows is what makes
   * the card re-read itself from the chain instead of trusting what was just typed.
   */
  const saveRoyalties = useCallback(
    async (split: RoyaltySplit) => {
      if (!isCreator || !wallet.publicKey) return
      setBusy('royalties')
      setRoyaltyError(null)
      setRoyaltyTx(null)
      try {
        const umi = walletUmi(wallet)
        const { signature } = await updateRoyaltySplit(umi, split, {
          pluginExists: col?.royaltyBps != null,
        })
        setRoyaltyTx(signature)
        await status.refetch()
      } catch (e) {
        setRoyaltyError(friendlyError(e))
        if (e instanceof TransactionUnknownError) await status.refetch()
      } finally {
        setBusy(null)
      }
    },
    [isCreator, wallet, col?.royaltyBps, status],
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
              Signatures from the collection&apos;s update authority, on <strong>mainnet</strong>. Nothing here
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
            what={`Creates a Metaplex Core Candy Machine sized to the ${poolSize.toLocaleString()} items still unminted${poolSize !== remaining ? ` (the collection counter says ${remaining.toLocaleString()}; two assets were burned and it does not count those back)` : ''}, priced at 0.25 SOL to your wallet, with NeXus (${shortAddress(OPS_WALLET, 4, 4)}) as operator so we can upload the items.`}
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
                {SIGNED_LABEL[l.step]}
                <a href={tx(l.signature)} target="_blank" rel="noreferrer" className="font-mono" style={{ color: 'var(--accent)' }}>
                  {shortAddress(l.signature, 6, 6)}
                </a>
                {l.candyMachine && <AddressChip address={l.candyMachine} label="CM" />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Mint phases & whitelists ────────────────────────────────────── */}
      {/* Its own signer (the candy guard's authority, i.e. the ops wallet) and its own
          save path, so it sits outside the creator's numbered steps rather than becoming
          step 3. It is also the one section here that is used after launch, repeatedly. */}
      <PhaseEditor
        groups={s?.candyMachine?.groups ?? []}
        candyGuard={s?.candyMachine?.candyGuard ?? null}
        guardAuthority={s?.candyMachine?.guardAuthority ?? null}
        defaultPriceLamports={s?.candyMachine?.priceLamports ?? null}
        onSaved={() => void status.refetch()}
      />

      {/* ── Royalties ───────────────────────────────────────────────────── */}
      <Section
        title="Royalties"
        description="Secondary-sale royalty on the collection. Every GuardianZ NFT inherits it, so a change here applies to all minted ones and everything minted later. Independent of the steps above."
        icon={<Percent className="h-5 w-5" />}
      >
        {!col ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {status.isLoading ? 'Reading mainnet…' : 'Collection unreadable.'}
          </p>
        ) : (
          <>
            {/* Keyed on the chain's own split: when the chain changes — our save, or
                someone else's — the editor is rebuilt from it rather than left showing a
                draft of a state that no longer exists. Identical state, same key, no
                remount, so a poll mid-edit does not wipe what is being typed. */}
            <RoyaltySplitCard
              key={royaltyChainKey(col.royaltyBps, col.royaltyCreators)}
              currentBps={col.royaltyBps}
              currentCreators={col.royaltyCreators}
              busy={busy === 'royalties'}
              locked={busy !== null && busy !== 'royalties'}
              blocked={
                !wallet.address
                  ? 'Connect the creator wallet to save.'
                  : !isCreator
                    ? `Only ${shortAddress(CREATOR_WALLET, 4, 4)} can change the royalty — switch to it in the wallet.`
                    : null
              }
              onSave={saveRoyalties}
            />

            {royaltyError && (
              <div className="mt-4">
                <Callout level="danger">{royaltyError}</Callout>
              </div>
            )}

            {royaltyTx && !royaltyError && (
              <div className="mt-4">
                <Callout level="success">
                  Royalties updated on every GuardianZ NFT.{' '}
                  <a href={tx(royaltyTx)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {shortAddress(royaltyTx, 8, 8)}
                  </a>
                </Callout>
              </div>
            )}
          </>
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

type RoyaltyCreator = RoyaltySplit['creators'][number]

/** A row carries a key so React tracks it across add/remove instead of by position. */
interface RoyaltyRow extends RoyaltyCreator {
  key: number
}

let rowKeySeq = 0
const newRow = (address: string, percentage: number): RoyaltyRow => ({
  key: ++rowKeySeq,
  address,
  percentage,
})

/**
 * How many wallets the editor offers. Core has no limit of its own — each one is 33
 * bytes on the collection account, paid in rent by whoever signs — but a royalty split
 * is a payout agreement, and past a handful the form is the wrong tool for it.
 */
const MAX_ROYALTY_WALLETS = 5

/** 100 across n wallets, the remainder to the first: 34/33/33, not 33/33/33. */
const evenShares = (n: number): number[] => {
  const base = Math.floor(100 / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? 100 - base * (n - 1) : base))
}

const rowsFrom = (creators: RoyaltyCreator[]): RoyaltyRow[] =>
  creators.length > 0
    ? creators.map((c) => newRow(c.address, c.percentage))
    : [newRow(CREATOR_WALLET, 100)]

/** The on-chain split's identity — the editor is rebuilt whenever this string changes. */
const royaltyChainKey = (bps: number | null, creators: RoyaltyCreator[]) =>
  `${bps ?? 'none'}|${creators.map((c) => `${c.address}:${c.percentage}`).join(',')}`

const sameSplit = (bps: number | null, a: RoyaltyCreator[], b: RoyaltySplit) =>
  bps === b.basisPoints &&
  a.length === b.creators.length &&
  a.every((c, i) => c.address === b.creators[i].address && c.percentage === b.creators[i].percentage)

/**
 * The royalty and the wallets it is paid to — one to five of them, as they are on chain.
 *
 * It opens on the chain's own split rather than a guessed shape, which is the whole
 * difference between this and what it replaced: a card that always drew two 50/50 rows
 * showed a second wallet that does not exist, started invalid ("not a valid address:
 * (empty)") and so could never be saved, and quietly proposed halving a royalty that is
 * actually paid 100% to one wallet.
 *
 * Shares are free to type and validated as a set, because the tied two-row version could
 * not express three wallets at all. The total is shown next to them, Core rejects
 * anything but exactly 100%, and `validateRoyaltySplit` says so before the wallet opens.
 */
function RoyaltySplitCard({
  currentBps,
  currentCreators,
  busy,
  locked,
  blocked,
  onSave,
}: {
  currentBps: number | null
  currentCreators: RoyaltyCreator[]
  busy: boolean
  /** Another signature is in flight — edit freely, but do not open a second wallet prompt. */
  locked: boolean
  /** Why this wallet cannot sign, if it cannot. Null means saving is allowed. */
  blocked: string | null
  onSave: (split: RoyaltySplit) => void
}) {
  const [bps, setBps] = useState(currentBps ?? ROYALTY_BPS)
  const [rows, setRows] = useState<RoyaltyRow[]>(() => rowsFrom(currentCreators))

  const split: RoyaltySplit = {
    basisPoints: bps,
    creators: rows.map((r) => ({ address: r.address.trim(), percentage: r.percentage })),
  }
  let invalid: string | null = null
  try {
    validateRoyaltySplit(split)
  } catch (e) {
    invalid = e instanceof Error ? e.message : String(e)
  }
  const unchanged = sameSplit(currentBps, currentCreators, split)
  const total = rows.reduce((n, r) => n + r.percentage, 0)

  const setAddress = (key: number, address: string) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, address } : row)))

  const setShare = (key: number, pct: number) => {
    const p = Math.min(100, Math.max(0, Math.round(pct)))
    setRows((r) => r.map((row) => (row.key === key ? { ...row, percentage: p } : row)))
  }

  /** A new wallet takes what is unallocated; when nothing is, everyone splits evenly. */
  const addRow = () =>
    setRows((r) => {
      if (r.length >= MAX_ROYALTY_WALLETS) return r
      const rest = 100 - r.reduce((n, x) => n + x.percentage, 0)
      if (rest > 0) return [...r, newRow('', rest)]
      const shares = evenShares(r.length + 1)
      return [...r, newRow('', 0)].map((row, i) => ({ ...row, percentage: shares[i] }))
    })

  /** The share of a removed wallet goes to the first one, so the total stays at 100. */
  const removeRow = (key: number) =>
    setRows((r) => {
      if (r.length <= 1) return r
      const freed = r.find((x) => x.key === key)?.percentage ?? 0
      return r
        .filter((x) => x.key !== key)
        .map((row, i) => (i === 0 ? { ...row, percentage: Math.min(100, row.percentage + freed) } : row))
    })

  const spreadEvenly = () =>
    setRows((r) => {
      const shares = evenShares(r.length)
      return r.map((row, i) => ({ ...row, percentage: shares[i] }))
    })

  const resetToChain = () => {
    setBps(currentBps ?? ROYALTY_BPS)
    setRows(rowsFrom(currentCreators))
  }

  return (
    <div className="space-y-4">
      <div className="panel-subtle px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span style={{ color: 'var(--text-muted)' }}>On-chain now: </span>
        {currentBps == null ? (
          'no royalty plugin on the collection'
        ) : (
          <>
            <strong>{currentBps / 100}%</strong>
            {currentCreators.length === 0 ? (
              <span className="ml-2" style={{ color: 'var(--text-muted)' }}>
                to nobody — no wallets listed
              </span>
            ) : (
              currentCreators.map((c) => (
                <span key={c.address} className="ml-2 font-mono" title={c.address}>
                  {shortAddress(c.address, 4, 4)} · {c.percentage}%
                </span>
              ))
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Total royalty
        </span>
        <PercentInput value={bps} onChange={setBps} max={10_000} disabled={busy} />
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          charged on every secondary sale, then shared between the wallets below
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const badAddress = row.address.trim().length > 0 && !isValidAddress(row.address.trim())
          return (
            <div key={row.key} className="flex flex-wrap items-center gap-3">
              <span className="w-16 shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                Wallet {i + 1}
              </span>
              <TextInput
                value={row.address}
                onChange={(v) => setAddress(row.key, v)}
                placeholder="Solana address"
                mono
                invalid={badAddress}
                disabled={busy}
                className="min-w-0 flex-1"
              />
              <PercentInput
                value={row.percentage * 100}
                onChange={(v) => setShare(row.key, v / 100)}
                max={10_000}
                disabled={busy}
              />
              <button
                type="button"
                aria-label={`Remove wallet ${i + 1}`}
                title={rows.length === 1 ? 'A royalty needs at least one wallet' : 'Remove this wallet'}
                disabled={busy || rows.length === 1}
                onClick={() => removeRow(row.key)}
                className="rounded-md p-1.5 transition-colors disabled:opacity-30"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          disabled={busy || rows.length >= MAX_ROYALTY_WALLETS}
          title={rows.length >= MAX_ROYALTY_WALLETS ? `Up to ${MAX_ROYALTY_WALLETS} wallets` : undefined}
          onClick={addRow}
        >
          Add wallet
        </Button>
        {rows.length > 1 && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={spreadEvenly}>
            Split evenly
          </Button>
        )}
        {!unchanged && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            disabled={busy}
            onClick={resetToChain}
          >
            Discard changes
          </Button>
        )}
        {(rows.length > 1 || total !== 100) && (
          <span
            className="ml-auto text-[11px] font-semibold"
            style={{ color: total === 100 ? 'var(--text-muted)' : 'var(--accent-warning)' }}
          >
            Shares total {total}%{total === 100 ? '' : ' — must be 100%'}
          </span>
        )}
      </div>

      {/* ── Save ─────────────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pt-4"
        style={{ borderTop: '1px solid var(--border-primary)' }}
      >
        <p
          className="max-w-xl text-[11px] leading-relaxed"
          style={{ color: invalid ? 'var(--accent-warning)' : 'var(--text-muted)' }}
        >
          {invalid ??
            (unchanged
              ? 'This is already the on-chain split — nothing to save.'
              : `Each sale pays ${bps / 100}%: ${rows
                  .map(
                    (r, i) =>
                      `${((bps * r.percentage) / 10_000).toFixed(3).replace(/\.?0+$/, '')}% to wallet ${i + 1}`,
                  )
                  .join(', ')}. One signature, ~0.00001 SOL fee plus a little rent if the list grew.`)}
        </p>
        <Button
          onClick={() => onSave(split)}
          isLoading={busy}
          disabled={busy || locked || !!blocked || !!invalid || unchanged}
          title={blocked ?? invalid ?? (unchanged ? 'Nothing has changed' : 'Write this split on chain')}
        >
          {busy ? 'Waiting for the wallet…' : 'Save royalties on chain'}
        </Button>
      </div>

      {blocked && !busy && (
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {blocked}
        </p>
      )}
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
