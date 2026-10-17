/**
 * Umi for the GuardianZ creator console — mainnet, always.
 *
 * GuardianZ is a live mainnet collection, so this builds its own Umi on GuardianZ's
 * cluster and sends through it. The wallet only ever *signs*: a Phantom still set to
 * devnet will show a simulation warning but the transaction lands on mainnet because
 * that is where we submit it.
 *
 * Which endpoint carries the bytes is guardianz/rpc.ts's problem — it routes through
 * the backend's probed pool whenever the platform is on mainnet, so a public node that
 * refuses browsers no longer takes this console down with it.
 *
 * The signer is built from this app's own `useWallet()` (src/lib/solana/wallet.tsx),
 * which exposes exactly the two things Umi's wallet-adapter signer needs — a public
 * key and `signTransaction` — so no @solana/wallet-adapter dependency is pulled in.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { mplCore } from '@metaplex-foundation/mpl-core'
import { mplCandyMachine } from '@metaplex-foundation/mpl-core-candy-machine'
import type { Umi } from '@metaplex-foundation/umi'
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'

import { guardianzConnection } from '@/lib/guardianz/rpc'

/** The subset of the admin wallet context that a signer needs. */
export interface SigningWallet {
  publicKey: PublicKey | null
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>
}

/** Read-only Umi. No identity; fine for fetches. */
export function readUmi(): Umi {
  return createUmi(guardianzConnection()).use(mplCore()).use(mplCandyMachine())
}

/** Umi that signs with the connected admin wallet. */
export function walletUmi(wallet: SigningWallet): Umi {
  if (!wallet.publicKey) throw new Error('No wallet connected')
  return readUmi().use(
    walletAdapterIdentity({
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => {
        const out: T[] = []
        for (const tx of txs) out.push(await wallet.signTransaction(tx))
        return out
      },
    }),
  )
}
