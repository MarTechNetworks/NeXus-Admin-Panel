/**
 * Umi for the GuardianZ creator console — mainnet, always.
 *
 * Everything else in this app reads its cluster from `/api/solana/config`, which is
 * devnet. GuardianZ is a live mainnet collection, so this builds its own Umi against
 * `NEXT_PUBLIC_GUARDIANZ_RPC_URL` and sends through it. The wallet only ever *signs*:
 * a Phantom still set to devnet will show a simulation warning but the transaction
 * lands on mainnet because that is where we submit it.
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

import { GUARDIANZ_RPC_URL } from '@/lib/guardianz/constants'

/** The subset of the admin wallet context that a signer needs. */
export interface SigningWallet {
  publicKey: PublicKey | null
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>
}

/** Read-only Umi. No identity; fine for fetches. */
export function readUmi(): Umi {
  return createUmi(GUARDIANZ_RPC_URL, 'confirmed').use(mplCore()).use(mplCandyMachine())
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
