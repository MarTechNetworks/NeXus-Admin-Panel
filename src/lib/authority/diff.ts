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
  MAX_PLATFORM_FEE_BPS,
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
    collections[c.pda] = { platformFeeBps: c.platformFeeBps, featured: c.featured }
  }

  return {
    defaultFeeBps: snapshot.feeConfig.defaultFeeBps,
    freeMintFeeSol: lamportsToSol(snapshot.feeConfig.freeMintFeeLamports),
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
  // The three fields below share one instruction; they are listed separately so
  // the review dialog reads like a changelog rather than "fee config changed".
  if (draft.defaultFeeBps !== snapshot.feeConfig.defaultFeeBps) {
    changes.push({
      key: 'defaultFeeBps',
      group: 'fees',
      label: 'Paid-mint platform fee',
      before: bpsToPercent(snapshot.feeConfig.defaultFeeBps),
      after: bpsToPercent(draft.defaultFeeBps),
      instruction: feeIx,
    })
  }

  const draftFreeMintLamports = solToLamports(draft.freeMintFeeSol)
  if (
    draftFreeMintLamports != null &&
    draftFreeMintLamports.toString() !== snapshot.feeConfig.freeMintFeeLamports
  ) {
    changes.push({
      key: 'freeMintFee',
      group: 'fees',
      label: 'Free-mint flat fee',
      before: formatSolAmount(snapshot.feeConfig.freeMintFeeLamports),
      after: formatSolAmount(draftFreeMintLamports.toString()),
      instruction: feeIx,
    })
  }

  if (!recipientsEqual(draft.recipients, snapshot.feeConfig.recipients)) {
    changes.push({
      key: 'recipients',
      group: 'recipients',
      label: 'Fee recipients',
      before: describeRecipients(snapshot.feeConfig.recipients),
      after: describeRecipients(draft.recipients),
      instruction: feeIx,
    })
  }

  // Creating the PDA with values that already match the backend defaults is a
  // real instruction with no field-level diff behind it, so it only appears once
  // the operator has asked for it and nothing else in this section is staged.
  if (
    !snapshot.feeConfig.exists &&
    draft.createFeeConfig &&
    changes.length === 0 &&
    draft.recipients.length > 0
  ) {
    changes.push({
      key: 'initFeeConfig',
      group: 'fees',
      label: 'Platform fee config PDA',
      before: 'not created',
      after: `created (${bpsToPercent(draft.defaultFeeBps)}, ${describeRecipients(draft.recipients)})`,
      instruction: 'init_platform_fee_config',
    })
  }

  // ── Emergency pause ──────────────────────────────────────────────────────
  const currentPause = snapshot.registry?.emergencyPause ?? false
  if (draft.emergencyPause !== currentPause) {
    changes.push({
      key: 'emergencyPause',
      group: 'emergency',
      label: 'Global emergency pause',
      before: currentPause ? 'active' : 'off',
      after: draft.emergencyPause ? 'active' : 'off',
      instruction: draft.emergencyPause ? 'emergency_pause_all' : 'emergency_unpause_all',
    })
  }

  // ── Per-collection overrides ─────────────────────────────────────────────
  for (const c of snapshot.collections) {
    const override = draft.collections[c.pda]
    if (!override) continue

    if (override.platformFeeBps !== c.platformFeeBps) {
      changes.push({
        key: `collection:${c.pda}:fee`,
        group: 'collections',
        label: `${collectionLabel(c)} — platform fee`,
        before: bpsToPercent(c.platformFeeBps),
        after: bpsToPercent(override.platformFeeBps),
        instruction: 'update_platform_fee',
        collectionPda: c.pda,
      })
    }
    if (override.featured !== c.featured) {
      changes.push({
        key: `collection:${c.pda}:featured`,
        group: 'collections',
        label: `${collectionLabel(c)} — on-chain featured flag`,
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
      label: 'Proposed registry authority',
      before: snapshot.registry?.pendingAuthority
        ? shortAddress(snapshot.registry.pendingAuthority, 6, 6)
        : 'none',
      after: shortAddress(proposed, 6, 6),
      instruction: 'propose_registry_admin',
    })
  }

  // ── Upgrade timelock ─────────────────────────────────────────────────────
  const { action, newProgramId, delaySeconds } = draft.upgrade
  if (action === 'initiate') {
    changes.push({
      key: 'upgrade',
      group: 'upgrade',
      label: 'Upgrade timelock',
      before: 'idle',
      after: `initiate → ${shortAddress(newProgramId.trim(), 6, 6)} after ${Math.round(delaySeconds / 3_600)}h`,
      instruction: 'initiate_upgrade',
    })
  } else if (action === 'cancel') {
    changes.push({
      key: 'upgrade',
      group: 'upgrade',
      label: 'Upgrade timelock',
      before: `pending → ${shortAddress(snapshot.registry?.pendingUpgradeProgram ?? '', 6, 6)}`,
      after: 'cancelled',
      instruction: 'cancel_upgrade',
    })
  } else if (action === 'complete') {
    changes.push({
      key: 'upgrade',
      group: 'upgrade',
      label: 'Upgrade timelock',
      before: `pending → ${shortAddress(snapshot.registry?.pendingUpgradeProgram ?? '', 6, 6)}`,
      after: 'completed (window closed, minting resumes)',
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
        'No registry account exists for this program id. Run initialize_registry from the deploy scripts before using this console.',
    })
    return issues
  }

  // ── Fee config ───────────────────────────────────────────────────────────
  if (feeConfigTouched) {
    if (!Number.isInteger(draft.defaultFeeBps) || draft.defaultFeeBps < 0) {
      issues.push({
        level: 'error',
        group: 'fees',
        key: 'defaultFeeBps',
        message: 'Paid-mint fee must be a whole number of basis points.',
      })
    } else if (draft.defaultFeeBps > MAX_PLATFORM_FEE_BPS) {
      issues.push({
        level: 'error',
        group: 'fees',
        key: 'defaultFeeBps',
        message: `The program caps the platform fee at ${bpsToPercent(MAX_PLATFORM_FEE_BPS)} (${MAX_PLATFORM_FEE_BPS} bps).`,
      })
    }

    if (solToLamports(draft.freeMintFeeSol) == null) {
      issues.push({
        level: 'error',
        group: 'fees',
        key: 'freeMintFee',
        message: 'Free-mint fee must be a SOL amount with at most 9 decimals.',
      })
    }

    if (draft.recipients.length === 0) {
      issues.push({
        level: 'error',
        group: 'recipients',
        message: 'At least one fee recipient is required — the program rejects an empty list.',
      })
    }
    if (draft.recipients.length > MAX_PLATFORM_FEE_RECIPIENTS) {
      issues.push({
        level: 'error',
        group: 'recipients',
        message: `PlatformFeeConfig holds at most ${MAX_PLATFORM_FEE_RECIPIENTS} recipients.`,
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
          message: `Recipient ${i + 1} is not a valid wallet address.`,
        })
        return
      }
      if (seen.has(address)) {
        issues.push({
          level: 'error',
          group: 'recipients',
          key: `recipient:${i}`,
          message: `Recipient ${i + 1} is listed twice — merge the shares instead.`,
        })
      }
      seen.add(address)
      if (!Number.isInteger(row.shareBps) || row.shareBps <= 0) {
        issues.push({
          level: 'error',
          group: 'recipients',
          key: `recipient:${i}`,
          message: `Recipient ${i + 1} needs a share above zero.`,
        })
      }
    })

    const total = draft.recipients.reduce((sum, r) => sum + (r.shareBps || 0), 0)
    if (draft.recipients.length > 0 && total !== PLATFORM_FEE_SHARE_TOTAL_BPS) {
      issues.push({
        level: 'error',
        group: 'recipients',
        message: `Shares must total exactly 100% (${PLATFORM_FEE_SHARE_TOTAL_BPS} bps). Currently ${bpsToPercent(total)}.`,
      })
    }

    // The program checks rent exemption for every recipient and fails the whole
    // transaction if one is short. Surface it here while it is still fixable.
    for (const row of rent ?? []) {
      if (!row.rentExempt && draft.recipients.some((r) => r.address.trim() === row.address)) {
        issues.push({
          level: 'error',
          group: 'recipients',
          message: `${shortAddress(row.address, 6, 6)} is not rent exempt (${lamportsToSol(row.lamports)} SOL). Fund it before saving — the program rejects the whole transaction otherwise.`,
        })
      }
    }
  }

  // ── Per-collection fee overrides ─────────────────────────────────────────
  for (const c of snapshot.collections) {
    const override = draft.collections[c.pda]
    if (!override || override.platformFeeBps === c.platformFeeBps) continue
    if (
      !Number.isInteger(override.platformFeeBps) ||
      override.platformFeeBps < 0 ||
      override.platformFeeBps > MAX_PLATFORM_FEE_BPS
    ) {
      issues.push({
        level: 'error',
        group: 'collections',
        key: `collection:${c.pda}:fee`,
        message: `${collectionLabel(c)}: fee must be between 0 and ${MAX_PLATFORM_FEE_BPS} bps.`,
      })
    }
    if (c.minted > 0) {
      issues.push({
        level: 'warning',
        group: 'collections',
        key: `collection:${c.pda}:fee`,
        message: `${collectionLabel(c)} already has ${c.minted} mint${c.minted === 1 ? '' : 's'}. The new fee applies to future mints only.`,
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
        message: 'Proposed authority is not a valid wallet address.',
      })
    } else if (proposed === snapshot.registry.authority) {
      issues.push({
        level: 'error',
        group: 'admin',
        key: 'pendingAuthority',
        message: 'That is already the current authority.',
      })
    } else {
      issues.push({
        level: 'warning',
        group: 'admin',
        message:
          'Rotation is two-step: this only records the proposal. The new wallet must call accept_registry_admin before control moves — until then you keep the key.',
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
        message: 'An upgrade is already pending. Cancel it before initiating another.',
      })
    }
    if (!isValidAddress(newProgramId.trim())) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        key: 'newProgramId',
        message: 'New program id is not a valid address.',
      })
    }
    if (delaySeconds < MIN_UPGRADE_DELAY_SECONDS || delaySeconds > MAX_UPGRADE_DELAY_SECONDS) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        key: 'upgradeDelay',
        message: 'Delay must be between 24 hours and 7 days.',
      })
    }
    // initiate_upgrade requires !emergency_pause. Unpausing in the same batch is
    // fine because the unpause instruction is ordered first; staying paused is not.
    if (snapshot.registry.emergencyPause && draft.emergencyPause) {
      issues.push({
        level: 'error',
        group: 'upgrade',
        message:
          'The platform is under emergency pause. Lift the pause in this same batch (or first) — initiate_upgrade refuses to run while it is active.',
      })
    }
    issues.push({
      level: 'warning',
      group: 'upgrade',
      message:
        'While an upgrade is pending, every mint on the platform is blocked until it is completed or cancelled.',
    })
  }

  if ((action === 'cancel' || action === 'complete') && !upgradePending) {
    issues.push({
      level: 'error',
      group: 'upgrade',
      message: 'There is no pending upgrade to ' + action + '.',
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
        message: `The timelock has not elapsed — complete_upgrade unlocks at ${formatUnixTime(snapshot.registry.upgradeCompletionTime)}.`,
      })
    }
  }

  // ── Emergency pause ──────────────────────────────────────────────────────
  if (draft.emergencyPause && !snapshot.registry.emergencyPause) {
    issues.push({
      level: 'warning',
      group: 'emergency',
      message: `This halts minting on all ${snapshot.registry.collectionCount} registered collection${snapshot.registry.collectionCount === 1 ? '' : 's'} immediately.`,
    })
  }

  if (snapshot.registry.collectionCount >= MAX_COLLECTIONS) {
    issues.push({
      level: 'warning',
      group: 'collections',
      message: `The registry is at its ${MAX_COLLECTIONS}-collection cap; new deployments will not be registered.`,
    })
  }

  return issues
}

export function hasBlockingIssue(issues: AuthorityIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
