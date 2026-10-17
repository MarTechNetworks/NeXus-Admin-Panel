/**
 * Hand the Candy Guard's authority to the collection's update authority.
 *
 * The guard authority is the only key the program accepts for `updateCandyGuard`, which
 * is what writes mint phases, prices, per-wallet caps and whitelists. It started on the
 * ops wallet for one reason: Candy Guard's `wrap` step, inside `create`, must be signed
 * by the machine's authority, and the only signer at creation was the creator — so the
 * machine was created under him and handed to ops in the same transaction, which is what
 * let us upload 6,216 config lines without asking him for 156 signatures.
 *
 * That reason is spent. The upload is complete, so ops no longer needs to sign anything
 * for config lines, and the creator should hold the key that governs his own mint's
 * terms rather than reaching us to change a price.
 *
 * ── What this does NOT move ───────────────────────────────────────────────────────
 * The candy machine's own authority stays with ops. It is separate
 * (`setCandyMachineAuthority`), and it is what closes the account at the end of the mint
 * and returns the ~0.545 SOL rent deposit. That should go back to the creator too, but
 * only once the mint is finished — handing it over now would let the account be closed
 * mid-mint, which would end the drop and strand the remaining items.
 *
 * Signed by the current guard authority, which is ops. After this runs, ops can no
 * longer edit phases and the creator can.
 */
import { readFileSync } from 'node:fs'

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'
import {
  mplCandyMachine,
  setCandyGuardAuthority,
  safeFetchCandyGuard,
  fetchCandyMachine,
} from '@metaplex-foundation/mpl-core-candy-machine'

const RPC = process.env.GUARDIANZ_RPC_URL
const KEYPAIR = process.env.GUARDIANZ_OPS_KEYPAIR
const CM = process.env.GUARDIANZ_CANDY_MACHINE ?? '885b7rPH66YrDhpUcBUA1nNRebhuxVuxndrKyzh4r9Wj'

/**
 * The collection's update authority — MarTech's wallet, the one that signed both steps
 * and paid the rent deposit. Verified live: `updateAuthorityIsCreator: true`.
 */
const NEW_AUTHORITY = 'Fbfr8aJGfa6tZEjsFt6nLfYpqhtUnfRmsCrCjv5w5WdJ'

if (!KEYPAIR) throw new Error('GUARDIANZ_OPS_KEYPAIR is required — the current guard authority.')

const umi = createUmi(RPC, 'confirmed').use(mplCandyMachine())
umi.use(
  keypairIdentity(
    umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR, 'utf8')))),
  ),
)

const cm = await fetchCandyMachine(umi, publicKey(CM))
const guardAddress = cm.mintAuthority // the Candy Guard PDA wrapping this machine
const guard = await safeFetchCandyGuard(umi, guardAddress)
if (!guard) throw new Error(`no candy guard at ${guardAddress}`)

console.log('candy machine   :', CM)
console.log('candy guard     :', guardAddress)
console.log('signing as      :', umi.identity.publicKey)
console.log('guard authority :', guard.authority)
console.log('new authority   :', NEW_AUTHORITY)
console.log('machine authority stays:', cm.authority, '(for the final withdraw)')
console.log('')

if (guard.authority.toString() === NEW_AUTHORITY) {
  console.log('Already set — nothing to do.')
  process.exit(0)
}
if (guard.authority.toString() !== umi.identity.publicKey.toString()) {
  throw new Error(
    `This wallet is not the guard authority (${guard.authority}); only that key can transfer it.`,
  )
}

const { signature } = await setCandyGuardAuthority(umi, {
  candyGuard: guardAddress,
  newAuthority: publicKey(NEW_AUTHORITY),
}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } })

console.log('sent:', base58.deserialize(signature)[0])

// Read it back rather than trusting the send.
const after = await safeFetchCandyGuard(umi, guardAddress)
console.log('')
console.log('--- on-chain now ---')
console.log('guard authority :', after?.authority.toString())
console.log('matches target  :', after?.authority.toString() === NEW_AUTHORITY ? 'YES' : 'NO')
console.log('explorer        : https://solscan.io/tx/' + base58.deserialize(signature)[0])
