/**
 * diff.ts — draft seeding, change detection and pre-flight validation.
 *
 * Nothing here touches the network. `diffAuthority` is the single source of
 * truth for "what will this transaction do", and `validateAuthority` reproduces
 * every `require!` in the program that we can check client-side, so the operator
 * finds out about a bad share split before signing rather than after.
 */
import {
  MAX_COLLECTIONS,
  MAX_PLATFORM_FEE_LAMPORTS,
  MAX_PLATFORM_FEE_RECIPIENTS,
  MAX_UPGRADE_DELAY_SECONDS,
  MIN_UPGRADE_DELAY_SECONDS,
  PLATFORM_FEE_SHARE_TOTAL_BPS,
  UPGRADE_STATE,
} from '../solana/program'
import {
  bpsToPercent,
  formatSolAmount,
  formatUnixTime,
  isValidAddress,
  lamportsToSol,
  shortAddress,
  solToLamports,
} from './format'
import type {
  AuthorityChange,
  AuthorityDraft,
  AuthorityIssue,
  AuthoritySnapshot,
  CollectionSnapshot,
} from './types'

/** Recipient balances from checkRecipientsRentExempt, when they have loaded. */
export type RentReport = { address: string; lamports: number; rentExempt: boolean }[]

export function draftFromSnapshot(snapshot: AuthoritySnapshot): AuthorityDraft {
  const collections: AuthorityDraft['collections'] = {}
  for (const c of snapshot.collections) {
    collections[c.pda] = { platformFeeSol: lamportsToSol(c.platformFeeLamports), featured: c.featured }
  }

  return {
    feeSol: lamportsToSol(snapshot.feeConfig.feeLamports),
    recipients: snapshot.feeConfig.recipients.map((r) => ({ ...r })),
    createFeeConfig: false,
    emergencyPause: snapshot.registry?.emergencyPause ?? false,
    collections,
    // Blank means "leave the rotation alone" — an existing pending proposal is
    // shown as chain state, not pre-filled into the field.
    pendingAuthority: '',
    upgrade: {
      action: 'none',
      newProgramId: '',
      delaySeconds: MIN_UPGRADE_DELAY_SECONDS,
    },
  }
}

/** Deep-ish equality for the recipient list: order is part of the on-chain value. */
function recipientsEqual(a: AuthorityDraft['recipients'], b: AuthorityDraft['recipients']): boolean {
  if (a.length !== b.length) return false
  return a.every((row, i) => row.address === b[i].address && row.shareBps === b[i].shareBps)
}

function describeRecipients(rows: { address: string; shareBps: number }[]): string {
  if (rows.length === 0) return 'none'
  return rows.map((r) => `${shortAddress(r.address)} ${bpsToPercent(r.shareBps)}`).join(', ')
}

function collectionLabel(c: CollectionSnapshot): string {
  return c.name || shortAddress(c.pda, 6, 4)
}

export function diffAuthority(
  snapshot: AuthoritySnapshot,
  draft: AuthorityDraft,
): AuthorityChange[] {
  const changes: AuthorityChange[] = []
  const feeIx = snapshot.feeConfig.exists
    ? ('update_platform_fee_config' as const)
    : ('init_platform_fee_config' as const)

  // ── Platform fee config ──────────────────────────────────────────────────
  // The fee and the recipients share one instruction; they are listed separately
  // so the review dialog reads like a changelog rather than "fee config changed".
  const draftFeeLamports = solToLamports(draft.feeSol)
  if (draftFeeLamports != null && draftFeeLamports.toString() !== snapshot.feeConfig.feeLamports) {
    changes.push({
      key: 'feeSol',
      group: 'fees',
      label: 'Platform fee per NFT',
      before: formatSolAmount(snapshot.feeConfig.feeLamports),
      after: formatSolAmount(draftFeeLamports.toString()),
      instruction: feeIx,
    })
  }

  if (!recipientsEqual(draft.recipients, snapshot.feeConfig.recipients)) {
    changes.push({
      key: 'recipients',
      group: 'recipients',
      label: 'Fee goes to',
      before: describeRecipients(snapshot.feeConfig.recipients),
      after: describeRecipients(draft.recipients),
      instruction: feeIx,
    })
  }

  // Publishing the on-chain fee settings with values that already match the
  // backend defaults is a real instruction with no field-level diff behind it,
  // so it only appears once the owner has asked for it and nothing else in
  // this section is staged.
  if (
    !snapshot.feeConfig.exists &&
    draft.createFeeConfig &&
    changes.length === 0 &&
    draft.recipients.length > 0
  ) {
    changes.push({
      key: 'initFeeConfig',
      group: 'fees',
      label: 'Fee settings on chain',
      before: 'not published',
      after: `published (${draft.feeSol} SOL per NFT → ${describeRecipients(draft.recipients)})`,
      instruction: 'init_platform_fee_config',
    })
  }

  // ── Emergency pause ──────────────────────────────────────────────────────
  const currentPause = snapshot.registry?.emergencyPause ?? false
  if (draft.emergencyPause !== currentPause) {
    changes.push({
      key: 'emergencyPause',
      group: 'emergency',
      label: 'Minting',
      before: currentPause ? 'paused everywhere' : 'live',
      after: draft.emergencyPause ? 'paused everywhere' : 'live',
      instruction: draft.emergencyPause ? 'emergency_pause_all' : 'emergency_unpause_all',
    })
  }

  // ── Per-collection overrides ─────────────────────────────────────────────
  for (const c of snapshot.collections) {
    const override = draft.collections[c.pda]
    if (!override) continue

    const overrideLamports = solToLamports(override.platformFeeSol)
    if (overrideLamports != null && overrideLamports.toString() !== c.platformFeeLamports) {
      changes.push({
        key: `collection:${c.pda}:fee`,
        group: 'collections',
        label: `${collectionLabel(c)} — platform fee`,
        before: formatSolAmount(c.platformFeeLamports),
        after: formatSolAmount(overrideLamports.toString()),
        instruction: 'update_platform_fee',
        collectionPda: c.pda,
      })
    }
    if (override.featured !== c.featured) {
      changes.push({
        key: `collection:${c.pda}:featured`,
        group: 'collections',
        label: `${collectionLabel(c)} — featured`,
        before: c.featured ? 'featured' : 'not featured',
        after: override.featured ? 'featured' : 'not featured',
        instruction: 'update_featured',
        collectionPda: c.pda,
      })
    }
  }

  // ── Authority rotation ───────────────────────────────────────────────────
  const proposed = draft.pendingAuthority.trim()
  if (proposed) {
    changes.push({
      key: 'pendingAuthority',
      group: 'admin',
      label: 'Transfer ownership to',
      before: snapshot.registry?.pendingAuthority
        ? `${shortAddress(snapshot.registry.pendingAuthority, 6, 6)} (waiting to accept)`
        : 'no transfer pending',
      after: `${shortAddress(proposed, 6, 6)} (once they accept)`,
      instruction: 'propose_registry_admin',
    })
  }

  // ── Upgrade timelock ─────────────────────────────────────────────────────
  const { action, newProgramId, delaySeconds } = draft.upgrade
  if (action === 'initiate') {
    changes.push({
      key: 'upgrade',
      group: 'upgrade',
      label: 'Program upgrade',
      before: 'none scheduled',
      after: `scheduled → ${shortAddress(newProgramId.trim(), 6, 6)}, completable after ${Math.round(delaySeconds / 3_600)}h (minting pauses until then)`,
      instruction: 'initiate_upgrade',
    })
  } else if (action === 'cancel') {
    changes.push({
      key: 'upgrade',
      group: 'upgrade',
      label: 'Program upgrade',
      before: `scheduled → ${shortAddress(snapshot.registry?.pendingUpgradeProgram ?? '', 6, 6)}`,
      after: 'cancelled (minting resumes)',
      instruction: 'cancel_upgrade',
    })
  } else if (action === 'complete') {
    changes.push({
      key: 'upgrade',
      group: 'upgrade',
      label: 'Program upgrade',
      before: `scheduled → ${shortAddress(snapshot.registry?.pendingUpgradeProgram ?? '', 6, 6)}`,
      after: 'completed (minting resumes)',
      instruction: 'complete_upgrade',
    })
  }

  return changes
}

export function validateAuthority(
  snapshot: AuthoritySnapshot,
  draft: AuthorityDraft,
  changes: AuthorityChange[],
  rent?: RentReport,
): AuthorityIssue[] {
  const issues: AuthorityIssue[] = []
  const touches = (kind: AuthorityChange['instruction']) =>
    changes.some((c) => c.instruction === kind)
  const feeConfigTouched =
    touches('init_platform_fee_config') || touches('update_platform_fee_config')

  if (!snapshot.registry) {
    issues.push({
      level: 'error',
      group: 'admin',
      message:
        'The program has not been set up on this network yet. Deploying the first collection from the public site sets it up automatically.',
    })
    return issues
  }

  // ── Fee config ───────────────────────────────────────────────────────────
  if (feeConfigTouched) {
    const feeLamports = solToLamports(draft.feeSol)
    if (feeLamports == null) {
      issues.push({
        level: 'error',
        group: 'fees',
        key: 'feeSol',
        message: 'Enter the fee as a SOL amount, e.g. 0.01 (up to 9 decimals).',
      })
    } else if (feeLamports > BigInt(MAX_PLATFORM_FEE_LAMPORTS)) {
      issues.push({
        level: 'error',
        group: 'fees',
        key: 'feeSol',
        message: `The most the fee can be is ${formatSolAmount(MAX_PLATFORM_FEE_LAMPORTS)} per NFT.`,
      })
    } else if (feeLamports.toString() !== snapshot.feeConfig.feeLamports && snapshot.collections.length > 0) {
      issues.push({
        level: 'warning',
        group: 'fees',
        key: 'feeSol',
        message: `Applies to collections created from now on. The ${snapshot.collections.length} existing collection${snapshot.collections.length === 1 ? '' : 's'} keep their current fee — change them under Advanced if you want them repriced too.`,
      })
    }

    if (draft.recipients.length === 0) {
      issues.push({
        level: 'error',
        group: 'recipients',
        message: 'Add at least one wallet to receive the fee.',
      })
    }
    if (draft.recipients.length > MAX_PLATFORM_FEE_RECIPIENTS) {
      issues.push({
        level: 'error',
        group: 'recipients',
        message: `Up to ${MAX_PLATFORM_FEE_RECIPIENTS} wallets can receive the fee.`,
      })
    }

    const seen = new Set<string>()
    draft.recipients.forEach((row, i) => {
      const address = row.address.trim()
      if (!isValidAddress(address)) {
        issues.push({
          level: 'error',
          group: 'recipients',
          key: `recipient:${i}`,
          message: `Wallet ${i + 1} is not a valid Solana address.`,
        })
        return
      }
      if (seen.has(address)) {
        issues.push({
          level: 'error',
          group: 'recipients',
          key: `recipient:${i}`,
          message: `Wallet ${i + 1} is listed twice — give it one combined share instead.`,
        })
      }
      seen.add(address)
      if (!Number.isInteger(row.shareBps) || row.shareBps <= 0) {
        issues.push({
          level: 'error',
          group: 'recipients',
          key: `recipient:${i}`,
          message: `Wallet ${i + 1} needs a share above 0%.`,
        })
      }
    })

    const total = draft.recipients.reduce((sum, r) => sum + (r.shareBps || 0), 0)
    if (draft.recipients.length > 0 && total !== PLATFORM_FEE_SHARE_TOTAL_BPS) {
      issues.push({
        level: 'error',
        group: 'recipients',
        message: `The shares must add up to 100% — right now they add up to ${bpsToPercent(total)}.`,
      })
    }

    // The program checks rent exemption for every recipient and fails the whole
    // transaction if one is short. Surface it here while it is still fixable.
    for (const row of rent ?? []) {
      if (!row.rentExempt && draft.recipients.some((r) => r.address.trim() === row.address)) {
        issues.push({
          level: 'error',
          group: 'recipients',
          message: `Wallet ${shortAddress(row.address, 6, 6)} is nearly empty (${lamportsToSol(row.lamports)} SOL). Send it at least 0.001 SOL before saving, or the save will fail.`,
        })
      }
    }
  }

  // ── Per-collection fee overrides ─────────────────────────────────────────
  for (const c of snapshot.collections) {
    const override = draft.collections[c.pda]
    if (!override) continue
    const overrideLamports = solToLamports(override.platformFeeSol)
    if (overrideLamports != null && overrideLamports.toString() === c.platformFeeLamports) continue
    if (overrideLamports == null || overrideLamports > BigInt(MAX_PLATFORM_FEE_LAMPORTS)) {
      issues.push({
        level: 'error',
        group: 'collections',
        key: `collection:${c.pda}:fee`,
        message: `${collectionLabel(c)}: enter a SOL amount between 0 and ${formatSolAmount(MAX_PLATFORM_FEE_LAMPORTS)}.`,
      })
      continue
    }
    if (c.minted > 0) {
      issues.push({
        level: 'warning',
        group: 'collections',
        key: `collection:${c.pda}:fee`,
        message: `${collectionLabel(c)} has already sold ${c.minted}. The new fee applies to mints from now on.`,
      })
    }
  }

  // ── Authority rotation ───────────────────────────────────────────────────
  const proposed = draft.pendingAuthority.trim()
  if (proposed) {
    if (!isValidAddress(proposed)) {
      issues.push({
        level: 'error',
        group: 'admin',
        key: 'pendingAuthority',
        message: 'That is not a valid Solana wallet address.',
      })
    } else if (proposed === snapshot.registry.authority) {
      issues.push({
        level: 'error',
        group: 'admin',
        key: 'pendingAuthority',
        message: 'That wallet is already the owner.',
      })
    } else {
      issues.push({
        level: 'warning',
        group: 'admin',
        message:
          'Nothing moves yet: the new wallet has to accept the transfer from its side. Until it does, you stay the owner.',
      })
    }
  }

  // ── Upgrade timelock ─────────────────────────────────────────────────────
  const { action, newProgramId, delaySeconds } = draft.upgrade
  const upgradePending = snapshot.registry.upgradeState === UPGRADE_STATE.Initiated

  if (action === 'initiate') {
    if (upgradePending) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        message: 'An upgrade is already scheduled. Cancel it before scheduling another.',
      })
    }
    if (!isValidAddress(newProgramId.trim())) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        key: 'newProgramId',
        message: 'That is not a valid program address.',
      })
    }
    if (delaySeconds < MIN_UPGRADE_DELAY_SECONDS || delaySeconds > MAX_UPGRADE_DELAY_SECONDS) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        key: 'upgradeDelay',
        message: 'The waiting period must be between 24 hours and 7 days.',
      })
    }
    // initiate_upgrade requires !emergency_pause. Unpausing in the same batch is
    // fine because the unpause instruction is ordered first; staying paused is not.
    if (snapshot.registry.emergencyPause && draft.emergencyPause) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        message:
          'Minting is paused platform-wide. Resume it (it can be in the same save) before scheduling an upgrade.',
      })
    }
    issues.push({
      level: 'warning',
      group: 'upgrade',
      message:
        'Nobody can mint anything on the platform until the upgrade is completed or cancelled.',
    })
  }

  if ((action === 'cancel' || action === 'complete') && !upgradePending) {
    issues.push({
      level: 'error',
      group: 'upgrade',
      message: 'There is no scheduled upgrade to ' + action + '.',
    })
  }

  if (action === 'complete' && upgradePending) {
    const ready =
      snapshot.registry.upgradeCompletionTime != null &&
      Math.floor(Date.now() / 1000) >= snapshot.registry.upgradeCompletionTime
    if (!ready) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        message: `The waiting period is not over — the upgrade can be completed from ${formatUnixTime(snapshot.registry.upgradeCompletionTime)}.`,
      })
    }
  }

  // ── Emergency pause ──────────────────────────────────────────────────────
  if (draft.emergencyPause && !snapshot.registry.emergencyPause) {
    issues.push({
      level: 'warning',
      group: 'emergency',
      message: `This stops minting on all ${snapshot.registry.collectionCount} collection${snapshot.registry.collectionCount === 1 ? '' : 's'} the moment you save. Buyers see it immediately.`,
    })
  }

  if (snapshot.registry.collectionCount >= MAX_COLLECTIONS) {
    issues.push({
      level: 'warning',
      group: 'collections',
      message: `The platform is at its ${MAX_COLLECTIONS}-collection limit; new collections cannot be deployed until that changes.`,
    })
  }

  return issues
}

export function hasBlockingIssue(issues: AuthorityIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
