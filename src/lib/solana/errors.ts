/**
 * Telling "the person closed the wallet" apart from "the thing actually failed".
 *
 * Every console in this app used to decide that with `/reject|denied|cancel/i` against
 * the error message, which matches far more than it means to: "Transaction rejected by
 * the program", a guard that denied a save, an RPC that declined a request — anything
 * whose text happens to contain those letters. All of them were reported as "cancelled
 * in the wallet", so a real failure was not merely mislabelled: its message was thrown
 * away and there was nothing left to debug from. A save that opened the wallet and then
 * instantly claimed to be cancelled was exactly this.
 *
 * A genuine rejection is narrow and well-known. Wallets send EIP-1193 code 4001, or say
 * so in words — the phrases below cover Phantom, Solflare, Backpack and the wallet
 * adapter's own errors. Anything else is a real error and must reach the operator whole.
 */

/** Phrasings wallets actually use when a person declines. Matched case-insensitively. */
const REJECTION_PHRASES = [
  'user rejected',
  'user denied',
  'user cancelled',
  'user canceled',
  'rejected the request',
  'request rejected',
  'cancelled by the user',
  'canceled by the user',
  'cancelled by user',
  'declined by user',
  'approval denied',
  'was not confirmed by the user',
  // Phantom's desktop extension when its window is dismissed mid-prompt.
  'plugin closed',
]

export function isUserCancellation(e: unknown): boolean {
  // EIP-1193's "user rejected request". Wallets send it as a numeric code, and it is the
  // only signal here that does not depend on anyone's choice of wording.
  if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 4001) {
    return true
  }

  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return REJECTION_PHRASES.some(phrase => msg.includes(phrase))
}
