/**
 * The off-chain half of a phase save, over the backend's GuardianZ sidecar.
 *
 * Candy Guard holds the terms of every phase (price, window, per-wallet cap, allowlist
 * root) and holds them well. What it cannot hold is the wallet list behind a root — only
 * the root itself is on chain — nor a buyer-facing name, because a group label is capped
 * at six bytes. Both go here, to `/api/guardianz/config` on the backend.
 *
 * ── Order of operations, and why ──────────────────────────────────────────────────
 * The console saves the **chain first, sidecar second**. If the sidecar write fails after
 * a successful signature, the phases are live and the lists are missing: the editor says
 * so, and pressing save again fixes it (the write is idempotent — sidecar rows are keyed
 * by root, and re-signing the same groups is a no-op). The reverse order would be worse —
 * lists stored for a root that never reached the chain, and an editor that believes a
 * phase exists when it does not.
 *
 * Everything here goes through the admin API client, so it carries the session JWT and
 * inherits its 401 → /login behaviour. The backend requires moderator or above to write.
 */
import { api } from '@/lib/api/client'

import { merkleRootHex, parseWallets, type PhaseDraft, type PhaseMeta } from '@/lib/guardianz/guard-groups'

export interface AllowlistSummary {
  rootHex: string
  walletCount: number
  label: string | null
  updatedAt: string
}

export interface GuardianzSidecar {
  phases: PhaseMeta[]
  /** root hex → the wallets behind it, in the order that produced the root. */
  allowlists: Record<string, string[]>
  summaries: AllowlistSummary[]
}

const EMPTY: GuardianzSidecar = { phases: [], allowlists: {}, summaries: [] }

/**
 * Read the sidecar.
 *
 * A failure here is not fatal to the page: without it the editor still reads every
 * phase's terms off the chain, it just cannot show the wallet lists (they come back as
 * "an allowlist we do not hold"). So the caller gets empty data and a reason, rather than
 * an exception that blanks the console.
 */
export async function fetchSidecar(): Promise<{ data: GuardianzSidecar; error: string | null }> {
  try {
    const data = await api.get<GuardianzSidecar>('/api/guardianz/config')
    return {
      data: {
        phases: data?.phases ?? [],
        allowlists: data?.allowlists ?? {},
        summaries: data?.summaries ?? [],
      },
      error: null,
    }
  } catch (e) {
    const message =
      typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
    return { data: EMPTY, error: message }
  }
}

/**
 * Write the copy and the wallet lists for the phases that were just signed.
 *
 * Roots are recomputed from the same drafts the chain write used, with the same function
 * — `merkleRootHex` is `getMerkleRoot` — so what is stored is provably the list behind the
 * root the program will check proofs against.
 */
export async function saveSidecar(drafts: PhaseDraft[]): Promise<void> {
  const allowlists: { rootHex: string; wallets: string[]; label?: string }[] = []

  for (const draft of drafts) {
    const { wallets } = parseWallets(draft.allowlistRaw)
    if (wallets.length === 0) continue
    allowlists.push({ rootHex: merkleRootHex(wallets), wallets, label: draft.label.trim() || undefined })
  }

  await api.put('/api/guardianz/config', {
    phases: drafts.map((d) => ({
      label: d.label.trim(),
      displayName: d.displayName.trim() || undefined,
      description: d.description.trim() || undefined,
    })),
    allowlists,
  })
}