/**
 * format.ts — display helpers shared by the console, the diff and the review dialog.
 * Kept pure and dependency-light so the same string appears in the field, the
 * pending-changes list and the signed-transaction summary.
 */
import { PublicKey } from '@solana/web3.js'

export const LAMPORTS_PER_SOL = 1_000_000_000

/** `3AzX51…c78bt` — long enough to recognise, short enough to fit a table cell. */
export function shortAddress(address: string, lead = 4, tail = 4): string {
  if (!address) return '—'
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

export function isValidAddress(value: string): boolean {
  if (!value) return false
  try {
    // PublicKey accepts anything base58 of the right length; reject the all-zero
    // key explicitly because the program treats it as "unset" and rejects it.
    const key = new PublicKey(value.trim())
    return !key.equals(PublicKey.default)
  } catch {
    return false
  }
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`
}

export function lamportsToSol(lamports: string | number | bigint): string {
  const value = typeof lamports === 'bigint' ? lamports : BigInt(String(lamports || 0))
  const whole = value / BigInt(LAMPORTS_PER_SOL)
  const frac = value % BigInt(LAMPORTS_PER_SOL)
  if (frac === BigInt(0)) return whole.toString()
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

/** Parses a SOL string to lamports. Returns null when the input is not a number. */
export function solToLamports(sol: string): bigint | null {
  const trimmed = sol.trim()
  if (trimmed === '') return BigInt(0)
  if (!/^\d*(\.\d*)?$/.test(trimmed)) return null
  const [whole, frac = ''] = trimmed.split('.')
  if (frac.length > 9) return null
  const padded = frac.padEnd(9, '0')
  try {
    return BigInt(whole || '0') * BigInt(LAMPORTS_PER_SOL) + BigInt(padded || '0')
  } catch {
    return null
  }
}

export function formatSolAmount(lamports: string | number | bigint): string {
  return `${lamportsToSol(lamports)} SOL`
}

export function formatUnixTime(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  // The program writes i64::MIN as its "disabled" sentinel; never render that.
  if (seconds <= 0 || seconds < -8_000_000_000) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(seconds * 1000))
}

/** "in 23h 10m" / "12m ago" — for the upgrade timelock countdown. */
export function formatCountdown(targetSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const delta = targetSeconds - nowSeconds
  const abs = Math.abs(delta)
  const d = Math.floor(abs / 86_400)
  const h = Math.floor((abs % 86_400) / 3_600)
  const m = Math.floor((abs % 3_600) / 60)
  const parts = [d ? `${d}d` : '', h ? `${h}h` : '', !d && m ? `${m}m` : ''].filter(Boolean)
  const body = parts.join(' ') || 'under a minute'
  return delta >= 0 ? `in ${body}` : `${body} ago`
}

export function formatDurationSeconds(seconds: number): string {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400
    return `${days} day${days === 1 ? '' : 's'}`
  }
  const h = Math.round(seconds / 3_600)
  return `${h} hour${h === 1 ? '' : 's'}`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
