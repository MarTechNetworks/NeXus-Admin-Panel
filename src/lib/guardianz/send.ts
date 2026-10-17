/**
 * How GuardianZ sends a transaction and decides whether it worked.
 *
 * Umi's `sendAndConfirm` ties the answer to the blockhash's lifetime: when the chain
 * moves past `lastValidBlockHeight` it throws
 *
 *     Signature <sig> has expired: block height exceeded.
 *
 * That sentence describes the *client's* deadline, not the transaction's fate. It has
 * now been wrong three times in a row on this console — step 1, step 2 and the first
 * phase save all finalized on chain while the operator was looking at a red box. The
 * wallet submits through its own RPC, so the transaction is already in flight before our
 * polling begins; when our endpoint is slow, rate-limited, or refuses browser requests
 * outright, the deadline passes and umi reports a failure that never happened.
 *
 * Reporting a success as a failure is not cosmetic here. Step 2 creates an account and
 * charges a ~0.55 SOL deposit, so an operator who believes the error and signs again
 * ends up with two candy machines and two deposits. This module exists so that nobody
 * has to make that judgement from a message that cannot tell the difference.
 *
 * ── What it does instead ──────────────────────────────────────────────────────────
 * Send once, then ask the chain about that signature until it answers:
 *
 *   - a status with `error` set      → a real failure, thrown with the chain's own error
 *   - a status with `error` null     → success, at `confirmed` or better
 *   - no status before the deadline  → UNKNOWN, and it says so in those words
 *
 * The third case is deliberately not called a failure. A transaction that has not been
 * seen yet may still land; the only safe instruction is "check before you retry", and
 * the error carries the signature and an explorer link so that check takes seconds.
 *
 * **It never resends.** Umi's retry is what makes a double-charge possible, and no
 * action here is cheap enough to repeat blindly.
 */
import type { TransactionBuilder, TransactionSignature, Umi } from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'

/** How often to ask. Fast enough to feel immediate, slow enough not to draw a 429. */
const POLL_INTERVAL_MS = 1_500

/**
 * How long to keep asking. A blockhash is good for ~60–90s, but a transaction already
 * accepted by the network can take longer to surface on a congested or rate-limited
 * endpoint, and waiting is free next to a duplicate 0.55 SOL deposit.
 */
const TIMEOUT_MS = 120_000

export interface SentTransaction {
  /** base58, ready to paste into an explorer. */
  signature: string
  /** The slot it landed in, once known. */
  slot: number | null
  commitment: 'processed' | 'confirmed' | 'finalized' | null
}

/** Thrown when the chain has not reported on a signature before the deadline. */
export class TransactionUnknownError extends Error {
  readonly signature: string

  constructor(signature: string, waitedMs: number) {
    super(
      `Could not confirm ${signature} within ${Math.round(waitedMs / 1000)}s. ` +
        'It may still land — DO NOT sign again until you have checked. ' +
        `https://solscan.io/tx/${signature}`,
    )
    this.name = 'TransactionUnknownError'
    this.signature = signature
  }
}

/** Thrown when the chain reports the transaction failed. Retrying is safe here. */
export class TransactionFailedError extends Error {
  readonly signature: string

  constructor(signature: string, error: unknown) {
    super(`Transaction failed on chain: ${JSON.stringify(error)} — https://solscan.io/tx/${signature}`)
    this.name = 'TransactionFailedError'
    this.signature = signature
  }
}

const toBase58 = (sig: TransactionSignature): string => base58.deserialize(sig)[0]

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Send a built transaction and wait for the chain's verdict on it.
 *
 * Replaces `builder.sendAndConfirm(umi)` everywhere in this folder. Returns only when
 * the chain has confirmed the transaction without error; otherwise throws one of the two
 * errors above, which differ in exactly the way that matters — whether retrying is safe.
 */
export async function sendAndConfirm(umi: Umi, builder: TransactionBuilder): Promise<SentTransaction> {
  const rawSignature = await builder.send(umi)
  const signature = toBase58(rawSignature)

  const startedAt = Date.now()

  while (Date.now() - startedAt < TIMEOUT_MS) {
    let status
    try {
      // `searchTransactionHistory` matters once a transaction is a few minutes old: the
      // recent-status cache is short, and without it a landed transaction reads as absent.
      ;[status] = await umi.rpc.getSignatureStatuses([rawSignature], {
        searchTransactionHistory: true,
      })
    } catch {
      // A failed poll says nothing about the transaction — only about this request.
      // Keep asking; the deadline is the only thing that ends this loop.
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    if (status) {
      if (status.error) throw new TransactionFailedError(signature, status.error)
      if (status.commitment === 'confirmed' || status.commitment === 'finalized') {
        return { signature, slot: status.slot, commitment: status.commitment }
      }
      // `processed` means seen but not voted on. It usually becomes confirmed within a
      // second or two, and treating it as done would report success for a transaction
      // that can still be dropped on a fork.
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new TransactionUnknownError(signature, Date.now() - startedAt)
}
