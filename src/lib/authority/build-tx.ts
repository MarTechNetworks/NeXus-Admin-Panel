/**
 * build-tx.ts — turns a set of changes into instructions, then into as few
 * transactions as the 1232-byte packet limit allows (one, in every realistic case).
 *
 * Instruction order is not cosmetic:
 *   • emergency UNPAUSE goes first, because initiate_upgrade refuses to run while
 *     the global pause is active — lifting it in the same batch has to happen before.
 *   • emergency PAUSE goes last, so a batch that reconfigures fees *and* pulls the
 *     handbrake applies the config first and then stops the world.
 * Everything else is ordered by blast radius: money, then per-collection flags,
 * then the two instructions that hand over or freeze the program itself.
 */
import { BN } from '@coral-xyz/anchor'
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type AccountMeta,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js'
import {
  accounts,
  derivePlatformFeeConfigPda,
  deriveRegistryPda,
  getProgram,
} from '../solana/program'
import { lamportsToSol, solToLamports } from './format'
import type { AuthorityChange, AuthorityDraft, AuthorityIxKind, AuthoritySnapshot } from './types'

/** Solana's hard packet limit for a serialized transaction. */
export const MAX_TX_BYTES = 1232
/** Leave room for the real blockhash/signature we swap in at send time. */
const SIZE_HEADROOM = 32

export interface AuthorityStep {
  kind: AuthorityIxKind
  label: string
  detail: string
  instruction: TransactionInstruction
  /** Which change rows this instruction carries out. */
  changeKeys: string[]
}

export interface AuthorityBatch {
  steps: AuthorityStep[]
  sizeBytes: number
}

export interface AuthorityPlan {
  steps: AuthorityStep[]
  batches: AuthorityBatch[]
  /** Size of the whole plan if it fitted in one packet — for the size meter. */
  totalBytes: number
  /** True when everything fits in a single signature, which is the design goal. */
  singleTransaction: boolean
}

export interface BuildPlanParams {
  connection: Connection
  authority: PublicKey
  snapshot: AuthoritySnapshot
  draft: AuthorityDraft
  changes: AuthorityChange[]
}

export async function buildAuthorityPlan(params: BuildPlanParams): Promise<AuthorityPlan> {
  const { connection, authority, snapshot, draft, changes } = params
  const programId = new PublicKey(snapshot.programId)
  const program = getProgram(connection, programId)
  const registry = deriveRegistryPda(programId)
  const feeConfigPda = derivePlatformFeeConfigPda(programId)

  const keysFor = (kind: AuthorityIxKind, collectionPda?: string) =>
    changes
      .filter((c) => c.instruction === kind && (!collectionPda || c.collectionPda === collectionPda))
      .map((c) => c.key)

  const has = (kind: AuthorityIxKind) => changes.some((c) => c.instruction === kind)
  const steps: AuthorityStep[] = []

  // 1 ── Lift the global pause first (see header note).
  if (has('emergency_unpause_all')) {
    steps.push({
      kind: 'emergency_unpause_all',
      label: 'Lift emergency pause',
      detail: 'Minting resumes across every registered collection.',
      changeKeys: keysFor('emergency_unpause_all'),
      instruction: await program.methods
        .emergencyUnpauseAll()
        .accountsPartial({ registry, authority })
        .instruction(),
    })
  }

  // 2 ── Platform fee config (create or retune).
  if (has('init_platform_fee_config') || has('update_platform_fee_config')) {
    const recipients = draft.recipients.map((r) => new PublicKey(r.address.trim()))
    const sharesBps = draft.recipients.map((r) => r.shareBps)
    // validateAuthority has already rejected an unparseable amount; the fallback
    // only keeps the type narrow.
    const feeLamports = solToLamports(draft.feeSol) ?? BigInt(0)
    // The program re-checks rent exemption against these accounts, in this order.
    const remaining: AccountMeta[] = recipients.map((pubkey) => ({
      pubkey,
      isSigner: false,
      isWritable: false,
    }))

    const args = [recipients, sharesBps, new BN(feeLamports.toString())] as const

    const instruction = snapshot.feeConfig.exists
      ? await program.methods
          .updatePlatformFeeConfig(...args)
          .accountsPartial({ platformFeeConfig: feeConfigPda, registry, authority })
          .remainingAccounts(remaining)
          .instruction()
      : await program.methods
          .initPlatformFeeConfig(...args)
          .accountsPartial({
            platformFeeConfig: feeConfigPda,
            registry,
            authority,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(remaining)
          .instruction()

    steps.push({
      kind: snapshot.feeConfig.exists ? 'update_platform_fee_config' : 'init_platform_fee_config',
      label: snapshot.feeConfig.exists ? 'Retune platform fee' : 'Create platform fee config',
      detail: `${lamportsToSol(feeLamports)} SOL per NFT on every mint, split across ${recipients.length} wallet${recipients.length === 1 ? '' : 's'}.`,
      changeKeys: [
        ...keysFor('init_platform_fee_config'),
        ...keysFor('update_platform_fee_config'),
      ],
      instruction,
    })
  }

  // 3 ── Per-collection fee overrides.
  for (const change of changes.filter((c) => c.instruction === 'update_platform_fee')) {
    const pda = change.collectionPda!
    const override = draft.collections[pda]
    steps.push({
      kind: 'update_platform_fee',
      label: change.label,
      detail: `${change.before} → ${change.after}`,
      changeKeys: [change.key],
      instruction: await program.methods
        .updatePlatformFee(new BN((solToLamports(override.platformFeeSol) ?? BigInt(0)).toString()))
        .accountsPartial({ collection: new PublicKey(pda), registry, authority })
        .instruction(),
    })
  }

  // 4 ── Per-collection on-chain featured flag.
  for (const change of changes.filter((c) => c.instruction === 'update_featured')) {
    const pda = change.collectionPda!
    const override = draft.collections[pda]
    steps.push({
      kind: 'update_featured',
      label: change.label,
      detail: `${change.before} → ${change.after}`,
      changeKeys: [change.key],
      instruction: await program.methods
        .updateFeatured(override.featured)
        .accountsPartial({ collection: new PublicKey(pda), registry, authority })
        .instruction(),
    })
  }

  // 5 ── Propose the next registry authority (step one of two).
  if (has('propose_registry_admin')) {
    const next = new PublicKey(draft.pendingAuthority.trim())
    steps.push({
      kind: 'propose_registry_admin',
      label: 'Propose registry authority',
      detail: `${next.toBase58()} must accept before control transfers.`,
      changeKeys: keysFor('propose_registry_admin'),
      instruction: await program.methods
        .proposeRegistryAdmin(next)
        .accountsPartial({ registry, authority })
        .instruction(),
    })
  }

  // 6 ── Upgrade timelock.
  if (has('initiate_upgrade')) {
    steps.push({
      kind: 'initiate_upgrade',
      label: 'Initiate upgrade',
      detail: `Opens the timelock; minting is blocked until it is completed or cancelled.`,
      changeKeys: keysFor('initiate_upgrade'),
      instruction: await program.methods
        .initiateUpgrade(
          new PublicKey(draft.upgrade.newProgramId.trim()),
          new BN(draft.upgrade.delaySeconds),
        )
        .accountsPartial({ registry, authority })
        .instruction(),
    })
  }
  if (has('cancel_upgrade')) {
    steps.push({
      kind: 'cancel_upgrade',
      label: 'Cancel upgrade',
      detail: 'Clears the pending upgrade and unblocks minting.',
      changeKeys: keysFor('cancel_upgrade'),
      instruction: await program.methods
        .cancelUpgrade()
        .accountsPartial({ registry, authority })
        .instruction(),
    })
  }
  if (has('complete_upgrade')) {
    steps.push({
      kind: 'complete_upgrade',
      label: 'Complete upgrade',
      detail: 'Closes the upgrade window and restores minting.',
      changeKeys: keysFor('complete_upgrade'),
      instruction: await program.methods
        .completeUpgrade()
        .accountsPartial({ registry, authority })
        .instruction(),
    })
  }

  // 7 ── Drop the handbrake last.
  if (has('emergency_pause_all')) {
    steps.push({
      kind: 'emergency_pause_all',
      label: 'Emergency pause',
      detail: 'Halts minting platform-wide until it is lifted.',
      changeKeys: keysFor('emergency_pause_all'),
      instruction: await program.methods
        .emergencyPauseAll()
        .accountsPartial({ registry, authority })
        .instruction(),
    })
  }

  const batches = packBatches(steps, authority)
  return {
    steps,
    batches,
    totalBytes: steps.length ? measure(steps.map((s) => s.instruction), authority) : 0,
    singleTransaction: batches.length <= 1,
  }
}

/**
 * Greedy packing: keep adding instructions until the serialized transaction would
 * exceed the packet limit, then start another. Order is preserved, so the
 * unpause-first / pause-last guarantee survives a split.
 */
function packBatches(steps: AuthorityStep[], feePayer: PublicKey): AuthorityBatch[] {
  const batches: AuthorityBatch[] = []
  let current: AuthorityStep[] = []

  for (const step of steps) {
    const candidate = [...current, step]
    const size = measure(candidate.map((s) => s.instruction), feePayer)
    if (size <= MAX_TX_BYTES - SIZE_HEADROOM) {
      current = candidate
      continue
    }
    if (current.length === 0) {
      // A single instruction that cannot fit on its own is not something this
      // program can produce, but never silently drop it if it ever happens.
      batches.push({ steps: candidate, sizeBytes: size })
      current = []
      continue
    }
    batches.push({
      steps: current,
      sizeBytes: measure(current.map((s) => s.instruction), feePayer),
    })
    current = [step]
  }

  if (current.length > 0) {
    batches.push({
      steps: current,
      sizeBytes: measure(current.map((s) => s.instruction), feePayer),
    })
  }
  return batches
}

/** Serialized byte length with a placeholder blockhash and unsigned signature slot. */
function measure(instructions: TransactionInstruction[], feePayer: PublicKey): number {
  const tx = new Transaction()
  tx.feePayer = feePayer
  // 32 zero bytes: a structurally valid blockhash, so the size matches the real one.
  tx.recentBlockhash = PublicKey.default.toBase58()
  instructions.forEach((ix) => tx.add(ix))
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length
}

/**
 * Assemble a signable transaction for one batch. Kept separate from the plan so
 * the review dialog can show exactly what will be signed without a blockhash
 * expiring while the operator reads it.
 */
export async function prepareBatch(
  connection: Connection,
  batch: AuthorityBatch,
  feePayer: PublicKey,
): Promise<{ transaction: Transaction; blockhash: string; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const transaction = new Transaction()
  transaction.feePayer = feePayer
  transaction.recentBlockhash = blockhash
  batch.steps.forEach((step) => transaction.add(step.instruction))
  return { transaction, blockhash, lastValidBlockHeight }
}

/**
 * Simulate before asking for a signature. Program errors carry their own logs,
 * and reading them here means the operator sees "InvalidPlatformFeeSplitSum"
 * instead of a wallet popup followed by a failed signature.
 */
export async function simulateBatch(
  connection: Connection,
  transaction: Transaction,
): Promise<{ ok: true } | { ok: false; message: string; logs: string[] }> {
  try {
    const sim = await connection.simulateTransaction(transaction)
    if (!sim.value.err) return { ok: true }
    const logs = sim.value.logs ?? []
    return {
      ok: false,
      message: explainSimulationError(sim.value.err, logs),
      logs,
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Simulation failed',
      logs: [],
    }
  }
}

/** Map the raw simulation error onto the program's own error names where possible. */
function explainSimulationError(err: unknown, logs: string[]): string {
  const named = logs.find((l) => l.includes('Error Message:'))
  if (named) return named.slice(named.indexOf('Error Message:') + 'Error Message:'.length).trim()

  const custom = logs.find((l) => /custom program error/i.test(l))
  if (custom) return custom.trim()

  return typeof err === 'string' ? err : JSON.stringify(err)
}

/** Names for the steps, used by the review dialog and the receipt. */
export const IX_LABELS: Record<AuthorityIxKind, string> = {
  init_platform_fee_config: 'init_platform_fee_config',
  update_platform_fee_config: 'update_platform_fee_config',
  update_platform_fee: 'update_platform_fee',
  update_featured: 'update_featured',
  propose_registry_admin: 'propose_registry_admin',
  initiate_upgrade: 'initiate_upgrade',
  cancel_upgrade: 'cancel_upgrade',
  complete_upgrade: 'complete_upgrade',
  emergency_pause_all: 'emergency_pause_all',
  emergency_unpause_all: 'emergency_unpause_all',
}

/** Re-export so callers can poll without importing web3 types directly. */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  // HTTP polling, same reasoning as the public site: RPC websockets are the one
  // dependency that fails silently and hangs the UI forever.
  const POLL_MS = 1_500
  const MAX_ATTEMPTS = 80

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const height = await connection.getBlockHeight('confirmed')
    if (height > lastValidBlockHeight) {
      throw new Error('Transaction expired before confirmation — nothing was applied. Try again.')
    }
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    })
    const status = value[0]
    if (status?.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`)
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error('Timed out waiting for confirmation. Check the signature in an explorer.')
}

/** Convenience for the console: does the connected wallet hold the registry key? */
export function isRegistryAuthority(
  snapshot: AuthoritySnapshot | null,
  address: string | null,
): boolean {
  if (!snapshot?.registry || !address) return false
  return snapshot.registry.authority === address
}

/** The set of collections a given wallet is the *collection* authority for. */
export function collectionsOwnedBy(snapshot: AuthoritySnapshot | null, address: string | null) {
  if (!snapshot || !address) return []
  return snapshot.collections.filter((c) => c.authority === address)
}

/** Guard used by the send flow — never build against a stale account list. */
export function isSnapshotStale(snapshot: AuthoritySnapshot | null, maxAgeMs = 120_000): boolean {
  if (!snapshot) return true
  return Date.now() - snapshot.fetchedAt > maxAgeMs
}

export function accountsTouched(plan: AuthorityPlan): string[] {
  const set = new Set<string>()
  plan.steps.forEach((step) =>
    step.instruction.keys.forEach((k) => {
      if (k.isWritable) set.add(k.pubkey.toBase58())
    }),
  )
  return [...set]
}

export { accounts }
