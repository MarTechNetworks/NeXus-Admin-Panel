'use client'

/**
 * useAuthorityConsole — all the state the console needs, and nothing else.
 *
 * The flow it enforces: read chain → edit a draft → diff → validate → build →
 * simulate → sign once → confirm → re-read chain. Simulation before signing is
 * the important one; it turns a failed on-chain transaction into an inline error
 * message with the program's own wording, at no cost to the operator.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PublicKey, type Connection } from '@solana/web3.js'
import { api } from '../api/client'
import { endpoints } from '../api/endpoints'
import type { Collection } from '../types'
import { getChainConfig, getConnection } from '../solana/chain-config'
import { useWallet } from '../solana/wallet'
import {
  buildAuthorityPlan,
  confirmSignature,
  isRegistryAuthority,
  prepareBatch,
  simulateBatch,
  type AuthorityPlan,
} from './build-tx'
import { diffAuthority, draftFromSnapshot, hasBlockingIssue, validateAuthority, type RentReport } from './diff'
import { loadAuthoritySnapshot, checkRecipientsRentExempt, type CollectionMetaByMint } from './read-state'
import type { AuthorityDraft, AuthoritySnapshot } from './types'

export type SubmitPhase =
  | 'idle'
  | 'building'
  | 'simulating'
  | 'awaiting-signature'
  | 'sending'
  | 'confirming'
  | 'success'
  | 'error'

export interface SubmitState {
  phase: SubmitPhase
  /** Index of the batch being processed, for the rare multi-signature case. */
  batchIndex: number
  batchCount: number
  signatures: string[]
  error: string | null
  logs: string[]
}

const IDLE_SUBMIT: SubmitState = {
  phase: 'idle',
  batchIndex: 0,
  batchCount: 0,
  signatures: [],
  error: null,
  logs: [],
}

export function useAuthorityConsole() {
  const wallet = useWallet()

  const [snapshot, setSnapshot] = useState<AuthoritySnapshot | null>(null)
  const [draft, setDraft] = useState<AuthorityDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rent, setRent] = useState<RentReport>([])
  const [plan, setPlan] = useState<AuthorityPlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [submit, setSubmit] = useState<SubmitState>(IDLE_SUBMIT)
  const connectionRef = useRef<Connection | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async (opts: { keepDraft?: boolean } = {}) => {
    setLoading(true)
    setLoadError(null)
    try {
      const cfg = await getChainConfig()
      connectionRef.current = getConnection(cfg)

      // Names and thumbnails only — every editable value comes from the chain.
      const meta: CollectionMetaByMint = {}
      try {
        const rows = await api.get<Collection[] | { data: Collection[] }>(
          endpoints.collections.list,
          { params: { limit: 500 } },
        )
        const list = Array.isArray(rows) ? rows : (rows?.data ?? [])
        for (const row of list) {
          if (row.mintAddress) {
            meta[row.mintAddress] = { name: row.name, slug: row.slug, imageUrl: row.imageUrl }
          }
        }
      } catch {
        // The console works without the DB; collections just show as addresses.
      }

      const next = await loadAuthoritySnapshot(meta)
      setSnapshot(next)
      setDraft((current) => (opts.keepDraft && current ? current : draftFromSnapshot(next)))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to read on-chain state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // ── Derived ──────────────────────────────────────────────────────────────
  const changes = useMemo(
    () => (snapshot && draft ? diffAuthority(snapshot, draft) : []),
    [snapshot, draft],
  )

  const issues = useMemo(
    () => (snapshot && draft ? validateAuthority(snapshot, draft, changes, rent) : []),
    [snapshot, draft, changes, rent],
  )

  const blocked = hasBlockingIssue(issues)
  const isAuthority = isRegistryAuthority(snapshot, wallet.address)

  // ── Rent pre-flight for fee recipients ───────────────────────────────────
  // Debounced: the operator is usually mid-paste when this would otherwise fire.
  const recipientKey = draft?.recipients.map((r) => r.address.trim()).join(',') ?? ''
  useEffect(() => {
    const addresses = recipientKey
      .split(',')
      .map((a) => a.trim())
      .filter((a) => {
        if (!a) return false
        try {
          return !new PublicKey(a).equals(PublicKey.default)
        } catch {
          return false
        }
      })
    if (addresses.length === 0) {
      setRent([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      checkRecipientsRentExempt(addresses)
        .then((report) => {
          if (!cancelled) setRent(report)
        })
        .catch(() => {
          // A failed balance lookup must not block editing — the program will
          // still catch a bad recipient, we just lose the early warning.
          if (!cancelled) setRent([])
        })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [recipientKey])

  // ── Draft mutation helpers ───────────────────────────────────────────────
  const patchDraft = useCallback((patch: Partial<AuthorityDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const patchCollection = useCallback(
    (pda: string, patch: Partial<AuthorityDraft['collections'][string]>) => {
      setDraft((current) => {
        if (!current) return current
        const existing = current.collections[pda]
        if (!existing) return current
        return {
          ...current,
          collections: { ...current.collections, [pda]: { ...existing, ...patch } },
        }
      })
    },
    [],
  )

  const revertChange = useCallback(
    (key: string) => {
      if (!snapshot || !draft) return
      const fresh = draftFromSnapshot(snapshot)

      if (key.startsWith('collection:')) {
        const [, pda, field] = key.split(':')
        const original = fresh.collections[pda]
        if (!original) return
        patchCollection(
          pda,
          field === 'fee'
            ? { platformFeeSol: original.platformFeeSol }
            : { featured: original.featured },
        )
        return
      }

      switch (key) {
        case 'feeSol':
          patchDraft({ feeSol: fresh.feeSol })
          break
        case 'recipients':
          patchDraft({ recipients: fresh.recipients })
          break
        case 'initFeeConfig':
          patchDraft({ createFeeConfig: false })
          break
        case 'emergencyPause':
          patchDraft({ emergencyPause: fresh.emergencyPause })
          break
        case 'pendingAuthority':
          patchDraft({ pendingAuthority: '' })
          break
        case 'upgrade':
          patchDraft({ upgrade: fresh.upgrade })
          break
        default:
          break
      }
    },
    [snapshot, draft, patchDraft, patchCollection],
  )

  const discardAll = useCallback(() => {
    if (snapshot) setDraft(draftFromSnapshot(snapshot))
    setPlan(null)
    setPlanError(null)
    setSubmit(IDLE_SUBMIT)
  }, [snapshot])

  // ── Plan (built when the review dialog opens) ────────────────────────────
  const buildPlan = useCallback(async (): Promise<AuthorityPlan | null> => {
    const connection = connectionRef.current
    if (!connection || !snapshot || !draft || !wallet.publicKey) return null
    setPlanError(null)
    try {
      const next = await buildAuthorityPlan({
        connection,
        authority: wallet.publicKey,
        snapshot,
        draft,
        changes,
      })
      setPlan(next)
      return next
    } catch (e) {
      setPlan(null)
      setPlanError(e instanceof Error ? e.message : 'Could not build the transaction')
      return null
    }
  }, [snapshot, draft, changes, wallet.publicKey])

  // ── Submit ───────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const connection = connectionRef.current
    if (!connection || !wallet.publicKey) return
    const active = plan ?? (await buildPlan())
    if (!active || active.batches.length === 0) return

    const signatures: string[] = []
    setSubmit({
      phase: 'building',
      batchIndex: 0,
      batchCount: active.batches.length,
      signatures,
      error: null,
      logs: [],
    })

    try {
      for (let i = 0; i < active.batches.length; i++) {
        const batch = active.batches[i]
        setSubmit((s) => ({ ...s, phase: 'building', batchIndex: i }))

        const { transaction, lastValidBlockHeight } = await prepareBatch(
          connection,
          batch,
          wallet.publicKey,
        )

        setSubmit((s) => ({ ...s, phase: 'simulating' }))
        const sim = await simulateBatch(connection, transaction)
        if (!sim.ok) {
          setSubmit((s) => ({
            ...s,
            phase: 'error',
            error: `Simulation rejected the transaction: ${sim.message}`,
            logs: sim.logs,
          }))
          return
        }

        setSubmit((s) => ({ ...s, phase: 'awaiting-signature' }))
        const signed = await wallet.signTransaction(transaction)

        setSubmit((s) => ({ ...s, phase: 'sending' }))
        const signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        })
        signatures.push(signature)
        setSubmit((s) => ({ ...s, phase: 'confirming', signatures: [...signatures] }))

        await confirmSignature(connection, signature, lastValidBlockHeight)
      }

      setSubmit((s) => ({ ...s, phase: 'success', signatures: [...signatures] }))
      setPlan(null)
      // Re-read so the page shows the chain, not an optimistic guess.
      await load()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Transaction failed'
      setSubmit((s) => ({
        ...s,
        phase: 'error',
        // A wallet rejection is a decision, not a failure — say so plainly.
        error: /reject|denied|cancel/i.test(message) ? 'Signature declined in the wallet.' : message,
        signatures: [...signatures],
      }))
    }
  }, [plan, buildPlan, wallet, load])

  const resetSubmit = useCallback(() => setSubmit(IDLE_SUBMIT), [])

  return {
    // chain state
    snapshot,
    draft,
    loading,
    loadError,
    reload: load,
    // wallet
    wallet,
    isAuthority,
    // editing
    patchDraft,
    patchCollection,
    revertChange,
    discardAll,
    changes,
    issues,
    blocked,
    rent,
    // transaction
    plan,
    planError,
    buildPlan,
    send,
    submit,
    resetSubmit,
  }
}

export type AuthorityConsoleState = ReturnType<typeof useAuthorityConsole>
