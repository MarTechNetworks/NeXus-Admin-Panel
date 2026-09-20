/**
 * guardianz-preflight.mjs — prove the creator's two transactions are valid on mainnet
 * BEFORE asking him to sign anything.
 *
 * Builds exactly what the /guardianz console builds — same SDK calls, same accounts,
 * same guard config — with a no-op signer standing in for the creator's wallet, then
 * runs each through mainnet `simulateTransaction` with signature checks off. The
 * simulation executes the real MPL Core and Candy Machine programs against the real
 * collection state, so a pass here means the only thing missing is his signature.
 *
 * Usage:
 *   NEXT_PUBLIC_GUARDIANZ_OPS_WALLET=<ops pubkey> node scripts/guardianz-preflight.mjs
 *
 * Nothing is sent. This costs nothing and can be run as often as you like.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import {
  createNoopSigner,
  generateSigner,
  publicKey,
  signerIdentity,
  sol,
  some,
} from '@metaplex-foundation/umi'
import { mplCore, revokeCollectionPluginAuthority } from '@metaplex-foundation/mpl-core'
import {
  mplCandyMachine,
  create as createCm,
  setCandyMachineAuthority,
  setCandyGuardAuthority,
  findCandyGuardPda,
} from '@metaplex-foundation/mpl-core-candy-machine'
import { Connection, VersionedTransaction } from '@solana/web3.js'

const RPC = process.env.GUARDIANZ_RPC_URL ?? process.env.NEXT_PUBLIC_GUARDIANZ_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const COLLECTION = publicKey('5Xt95jj1av4HN5jLMrQj9zZUnCdKaTHqXKkSkegyrT1K')
const CREATOR = publicKey('Fbfr8aJGfa6tZEjsFt6nLfYpqhtUnfRmsCrCjv5w5WdJ')
const METADATA_BASE = 'https://gateway.pinit.io/ipfs/QmQ83S7wpaUikQW3mj1EesMcharfnfKCJ72SReyEQ22FnA'
const OPS = process.env.NEXT_PUBLIC_GUARDIANZ_OPS_WALLET
const TOTAL_SUPPLY = 7575

if (!OPS) {
  console.error('NEXT_PUBLIC_GUARDIANZ_OPS_WALLET is required (the candy machine operator).')
  process.exit(1)
}

const umi = createUmi(RPC, 'confirmed').use(mplCore()).use(mplCandyMachine())
// The creator's wallet, minus the ability to sign. Simulation does not check signatures.
umi.use(signerIdentity(createNoopSigner(CREATOR)))
const connection = new Connection(RPC, 'confirmed')

let failed = 0

async function simulate(label, builder, extraSigners = []) {
  const built = await builder.buildWithLatestBlockhash(umi)
  // Real keypairs in the tx (e.g. the candy machine account) do sign; the creator does not.
  let partly = built
  for (const s of extraSigners) partly = await s.signTransaction(partly)
  const bytes = umi.transactions.serialize(partly)
  const vtx = VersionedTransaction.deserialize(bytes)

  const res = await connection.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true })
  const logs = res.value.logs ?? []
  const ok = res.value.err == null
  if (!ok) failed++
  console.log(`\n${ok ? '✓' : '✗'} ${label}`)
  console.log(`   ${bytes.length} bytes · ${res.value.unitsConsumed ?? '?'} CU · err ${JSON.stringify(res.value.err)}`)
  for (const l of logs) {
    if (/Instruction:|Approve|Reject|Error|failed|AnchorError/.test(l)) console.log('   ', l.replace(/^Program log: /, ''))
  }
  return ok
}

/**
 * The candy machine is created with the CREATOR as authority, because Candy Guard's
 * `wrap` step (inside `create`) must be signed by the machine's authority and only the
 * creator is signing. Ops takes over in the same transaction via the two set-authority
 * instructions — one signature from the creator, and ops ends up able to upload items
 * and manage guards. Found by simulating against mainnet; the local rehearsal missed it
 * because the creator was the operator there.
 */
async function buildCreateWithHandover(cmSigner, itemsAvailable) {
  const b = await createCm(umi, {
    candyMachine: cmSigner,
    collection: COLLECTION,
    collectionUpdateAuthority: umi.identity,
    itemsAvailable,
    authority: umi.identity.publicKey,
    isMutable: true,
    configLineSettings: some({
      prefixName: '',
      nameLength: 4,
      prefixUri: `${METADATA_BASE}/`,
      uriLength: 9,
      isSequential: false,
    }),
    guards: { solPayment: some({ lamports: sol(0.25), destination: CREATOR }) },
  })
  const guard = findCandyGuardPda(umi, { base: cmSigner.publicKey })
  return b
    .add(setCandyMachineAuthority(umi, { candyMachine: cmSigner.publicKey, newAuthority: publicKey(OPS) }))
    .add(setCandyGuardAuthority(umi, { candyGuard: guard, newAuthority: publicKey(OPS) }))
}

async function main() {
  console.log(`mainnet preflight against ${RPC}`)
  console.log(`creator ${CREATOR} (no-op signer) · ops ${OPS}`)

  // Live numbers, so the candy machine size in the simulation is the real one.
  const collAcct = await connection.getAccountInfo(new (await import('@solana/web3.js')).PublicKey(COLLECTION))
  const numMinted = collAcct.data.readUInt32LE(1 + 32 + 4 + collAcct.data.readUInt32LE(33) + 4 + collAcct.data.readUInt32LE(37 + collAcct.data.readUInt32LE(33)))
  const remaining = TOTAL_SUPPLY - numMinted
  console.log(`minted ${numMinted} → remaining ${remaining}`)

  // ── 1. Reclaim ─────────────────────────────────────────────────────────────
  await simulate(
    'Step 1 — revoke UpdateDelegate authority (creator signs)',
    revokeCollectionPluginAuthority(umi, { collection: COLLECTION, plugin: { type: 'UpdateDelegate' } }),
  )

  // ── 2. Create candy machine ────────────────────────────────────────────────
  // Note: on live mainnet this will REJECT until step 1 has actually been signed,
  // because the UpdateDelegate is still LaunchMyNFT's. That rejection is itself
  // useful — it shows the gate is real. After step 1 lands, re-run and it passes.
  const candyMachine = generateSigner(umi)
  const builder = await buildCreateWithHandover(candyMachine, remaining)
  const step2Alone = await simulate(
    'Step 2 alone — create candy machine + guard (expected to FAIL with 0x9 until step 1 has landed)',
    builder,
    [candyMachine],
  )

  // ── 1 + 2 chained ──────────────────────────────────────────────────────────
  // Simulation applies instructions in order within one transaction, so this shows
  // what step 2 does once step 1 is on-chain — without step 1 actually being on-chain.
  if (!step2Alone) {
    failed-- // the standalone rejection above is expected, not a failure of the plan
    const cm2 = generateSigner(umi)
    const chained = revokeCollectionPluginAuthority(umi, { collection: COLLECTION, plugin: { type: 'UpdateDelegate' } }).add(
      await buildCreateWithHandover(cm2, remaining),
    )
    await simulate('Step 1 → Step 2 in one transaction (what step 2 does after step 1 lands)', chained, [cm2])
  }

  console.log(`\n${failed === 0 ? 'all transactions valid on mainnet' : `${failed} would fail — see above`}`)
  process.exit(failed === 0 ? 0 : 2)
}

main().catch((e) => {
  console.error('preflight error:', e.message)
  process.exit(1)
})
