'use client'

/**
 * PhaseEditor — GuardianZ mint phases and whitelists, edited live.
 *
 * One click here rewrites the Candy Guard's whole group set in a single transaction. It
 * takes effect on the very next mint: no redeploy, no re-upload of the 6,214 config
 * lines, no signature from the collection creator. That is the property this whole screen
 * exists to expose — "adjust the phases and the whitelist, now, from the panel".
 *
 * ── What is on chain and what is not ──────────────────────────────────────────────
 * On chain, per phase: the six-byte label, start, end, price, per-wallet cap, and a
 * 32-byte Merkle root of the whitelist. Off chain, in the backend sidecar: the wallet list
 * behind that root (the chain stores only the root, and buyers need the list to build a
 * proof) and the buyer-facing name, because six bytes is not a name.
 *
 * A save is therefore two writes, chain first — see `phase-store.ts` for the ordering and
 * what a half-failure looks like.
 *
 * ── Three things the UI has to be honest about ────────────────────────────────────
 * 1. **Who signs.** Not the creator and not "an admin" — the candy *guard's* authority,
 *    read off the account (`setCandyGuardAuthority` hands it to the ops wallet at
 *    creation). The save button is dead until that exact wallet is connected, because the
 *    alternative is a wallet prompt that always ends in a program error.
 * 2. **A root whose list we do not hold.** Perfectly possible — someone set a root from a
 *    script, or the sidecar was restored from a different environment. The phase still
 *    mints for nobody, because a proof cannot be built, and the card says exactly that
 *    rather than showing an empty box that looks like a public phase.
 * 3. **Phases run concurrently.** Two live at once is a feature, not a mistake to warn
 *    about: the buyer picks a tab on the mint page. The editor orders phases for display
 *    only — nothing in the program reads the order, and a mint names its phase by label.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Users,
  Wand2,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Callout, ChainValue, Field, Section, TextInput } from '@/components/authority/primitives'
import { shortAddress } from '@/lib/authority/format'
import { useWallet } from '@/lib/solana/wallet'
import { walletUmi } from '@/lib/guardianz/umi'
import {
  DESCRIPTION_MAX,
  DISPLAY_NAME_MAX,
  emptyPhase,
  extractWallets,
  merkleRootHex,
  parseWallets,
  phasesFromChain,
  savePhases,
  validatePhases,
  withDerivedLabels,
  type GuardGroupSummary,
  type PhaseDraft,
} from '@/lib/guardianz/guard-groups'
import { fetchSidecar, saveSidecar } from '@/lib/guardianz/phase-store'

/**
 * Unsaved work survives a reload.
 *
 * Someone pastes four thousand addresses, the tab reloads, and without this the list is
 * gone. Same reasoning as the create wizard's draft (`nexus-create-draft`). Cleared the
 * moment a save lands, so the chain is the only thing left to trust.
 */
const DRAFT_KEY = 'nexus-guardianz-phases'

const acct = (a: string) => `https://solscan.io/account/${a}`
const tx = (s: string) => `https://solscan.io/tx/${s}`

export interface PhaseEditorProps {
  /** The live groups, read server-side. Empty = the guard has no groups at all. */
  groups: GuardGroupSummary[]
  /** The Candy Guard account to write to. Null until the candy machine exists. */
  candyGuard: string | null
  /** The wallet that must sign. Null when the guard could not be read. */
  guardAuthority: string | null
  /** Price of the default guard set, when there are no groups yet. */
  defaultPriceLamports: number | null
  /** Re-read the chain after a successful save. */
  onSaved: () => void
}

// ── Small helpers ───────────────────────────────────────────────────────────────────

type Window = 'live' | 'upcoming' | 'ended' | 'always'

function windowOf(draft: PhaseDraft): Window {
  const now = Date.now()
  const start = draft.startsAt ? Date.parse(draft.startsAt) : null
  const end = draft.endsAt ? Date.parse(draft.endsAt) : null
  if (start && !Number.isNaN(start) && now < start) return 'upcoming'
  if (end && !Number.isNaN(end) && now >= end) return 'ended'
  return start || end ? 'live' : 'always'
}

const WINDOW_LABEL: Record<Window, string> = {
  live: 'Live now',
  upcoming: 'Upcoming',
  ended: 'Ended',
  always: 'Always open',
}

const WINDOW_TONE: Record<Window, 'success' | 'warning' | 'default'> = {
  live: 'success',
  upcoming: 'warning',
  ended: 'default',
  always: 'success',
}

/** Compare drafts by the fields that actually travel, so `key` churn is not a change. */
function fingerprint(drafts: PhaseDraft[]): string {
  return JSON.stringify(
    drafts.map((d) => [
      d.label.trim(),
      d.displayName.trim(),
      d.description.trim(),
      d.startsAt,
      d.endsAt,
      d.priceSol.trim(),
      d.maxPerWallet.trim(),
      parseWallets(d.allowlistRaw).wallets,
      d.unknownRootHex ?? '',
    ]),
  )
}

function CopyButton({ value, title }: { value: string; title?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={title ?? 'Copy'}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
      style={{ color: done ? 'var(--accent-success, #22c55e)' : 'var(--text-tertiary)' }}
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

/**
 * A datetime field whose whole surface opens the calendar.
 *
 * `<input type="datetime-local">` only opens its picker from the little icon at the far
 * right — clicking the text puts a caret in the month segment, which reads as a broken
 * control. `showPicker()` is the supported way to ask for it, so clicking or focusing
 * anywhere opens the calendar while typing still works for anyone who prefers the keyboard.
 *
 * It throws when the browser has no picker, or when called without a user gesture; both
 * are fine and leave a perfectly usable text field, so the throw is swallowed.
 */
function DateTimeInput({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
}) {
  const open = (el: HTMLInputElement) => {
    try {
      el.showPicker()
    } catch {
      /* no picker here — the field still types */
    }
  }

  return (
    <input
      id={id}
      type="datetime-local"
      className="input-base w-full cursor-pointer text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => open(e.currentTarget)}
      onFocus={(e) => open(e.currentTarget)}
      onKeyDown={(e) => {
        // Space and Enter are how a keyboard user asks a control to open.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open(e.currentTarget)
        }
      }}
    />
  )
}

/**
 * The two starts people actually pick: now, or the top of the next hour.
 *
 * Offered only while the field is empty, because the common case for a phase being added
 * mid-launch is "open it now" and typing a full datetime for that is absurd.
 */
function QuickDateButtons({ onPick }: { onPick: (value: string) => void }) {
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const nextHour = () => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
    return d
  }

  return (
    <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--accent)' }}>
      <button type="button" onClick={() => onPick(fmt(new Date()))}>
        Now
      </button>
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <button type="button" onClick={() => onPick(fmt(nextHour()))}>
        Next hour
      </button>
    </span>
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 6,
  mono,
  id,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  mono?: boolean
  id?: string
}) {
  return (
    <textarea
      id={id}
      className={`input-base w-full resize-y ${mono ? 'font-mono text-[11px] leading-relaxed' : 'text-xs'}`}
      rows={rows}
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ── Whitelist field ─────────────────────────────────────────────────────────────────

/**
 * The whitelist half of a phase.
 *
 * Public and allowlisted are one control, not two: an empty list *is* a public phase (no
 * `allowList` guard at all), so a separate checkbox would be a second source of truth
 * about the same thing. The radio pair writes the textarea, and the textarea is what the
 * save reads.
 *
 * A file input sits next to it because real lists arrive as a 5,000-line CSV from a
 * snapshot tool, and pasting that into a browser textarea is not something to ask of
 * someone twice.
 */
function WhitelistField({
  draft,
  onChange,
}: {
  draft: PhaseDraft
  onChange: (patch: Partial<PhaseDraft>) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [lastImport, setLastImport] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const parsed = useMemo(() => parseWallets(draft.allowlistRaw), [draft.allowlistRaw])
  const root = useMemo(
    () => (parsed.wallets.length > 0 ? merkleRootHex(parsed.wallets) : ''),
    [parsed.wallets],
  )
  const isAllowlist = draft.allowlistRaw.trim().length > 0 || !!draft.unknownRootHex

  /**
   * Take a file and leave the field holding a clean, editable list.
   *
   * Addresses are extracted (CSV columns, JSON objects, plain text — see
   * `extractWallets`), merged with whatever is already in the field, de-duplicated, and
   * written back one per line. The result is still a textarea someone can edit by hand;
   * importing a file is a way to fill it, not a different mode.
   *
   * Duplicates are removed rather than reported, because a list assembled from two
   * snapshots overlapping is the normal case and "47 duplicates" is not a problem anyone
   * wants to go and fix by hand. What was cleaned is summarised once, under the field.
   */
  const importFiles = async (files: File[]) => {
    setFileError(null)
    try {
      const chunks: string[] = []
      for (const file of files) chunks.push(await file.text())

      const before = parsed.wallets.length
      const merged = extractWallets([draft.allowlistRaw, ...chunks].filter(Boolean).join('\n'))

      if (merged.wallets.length === 0) {
        setFileError(
          `No Solana addresses found in ${files.map((f) => f.name).join(', ')}. A column of base58 addresses is all it needs — CSV, JSON or a plain list.`,
        )
        return
      }

      onChange({ allowlistRaw: merged.wallets.join('\n'), unknownRootHex: undefined })

      const added = merged.wallets.length - before

      /**
       * Only near-misses are worth mentioning.
       *
       * Every other cell in a CSV — the header words, the amount and rank columns — is an
       * "invalid entry" to the parser, and a file with five holders would otherwise report
       * "13 lines skipped", which reads as *lost wallets*. A token long enough to have been
       * meant as an address is the only skip anyone needs to check.
       */
      const nearMisses = merged.invalid.filter((e) => e.value.length >= 20).length

      const notes = [
        `${files.length === 1 ? files[0].name : `${files.length} files`}: +${added.toLocaleString()} new`,
        merged.duplicates > 0 ? `${merged.duplicates.toLocaleString()} duplicate${merged.duplicates === 1 ? '' : 's'} removed` : null,
        nearMisses > 0 ? `${nearMisses.toLocaleString()} skipped — not a valid address` : null,
      ].filter(Boolean)
      setLastImport(notes.join(' · '))
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  /** Rewrite the field as its own clean list: unique, one per line, nothing else dropped. */
  const tidy = () => {
    setFileError(null)
    const removed = parsed.duplicates
    onChange({ allowlistRaw: parsed.wallets.join('\n') })
    setLastImport(
      removed > 0
        ? `${removed.toLocaleString()} duplicate${removed === 1 ? '' : 's'} removed`
        : 'List is already clean',
    )
  }

  return (
    <div
      className="rounded-lg px-4 py-3.5"
      style={{
        borderLeft: `2px solid ${isAllowlist ? 'var(--accent)' : 'var(--border-primary)'}`,
        background: 'rgba(8, 9, 13, 0.4)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: isAllowlist ? 'var(--accent)' : 'var(--text-tertiary)' }}
        >
          Who may mint this phase
        </span>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              checked={!isAllowlist}
              onChange={() => onChange({ allowlistRaw: '', unknownRootHex: undefined })}
            />
            Anyone (public)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={isAllowlist} onChange={() => fileRef.current?.focus()} />
            Whitelisted wallets
          </label>
        </div>
      </div>

      {draft.unknownRootHex && (
        <div className="mt-3">
          <Callout level="warning">
            This phase has a whitelist on chain
            {' ('}
            <span className="font-mono">{draft.unknownRootHex.slice(0, 12)}…</span>
            {') '}
            whose wallet list is not stored here, so no proof can be built and{' '}
            <strong>nobody can mint it</strong>. Paste the list below to restore it, or switch the phase to
            public. Saving without doing either keeps the root exactly as it is.
          </Callout>
        </div>
      )}

      {/* Drop target wraps the textarea itself: dragging a snapshot export onto the list
          is the gesture people try first, and a separate dropzone would be a second place
          to put the same thing. */}
      <div
        className="relative mt-3"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const files = Array.from(e.dataTransfer.files ?? [])
          if (files.length > 0) void importFiles(files)
        }}
      >
        <TextArea
          value={draft.allowlistRaw}
          onChange={(v) => onChange({ allowlistRaw: v, unknownRootHex: v.trim() ? undefined : draft.unknownRootHex })}
          placeholder={
            'Paste addresses, or drop a CSV / JSON export here.\n\nOne per line — commas, semicolons and tabs work too.\n7xKX…\n9aBc…'
          }
          rows={6}
          mono
        />
        {dragging && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-xs font-semibold"
            style={{
              border: '2px dashed var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              color: 'var(--accent)',
            }}
          >
            Drop to add these wallets
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        <span style={{ color: 'var(--text-secondary)' }}>
          <Users className="mr-1 inline h-3 w-3" />
          {parsed.wallets.length.toLocaleString()} wallet{parsed.wallets.length === 1 ? '' : 's'}
        </span>
        {/* Typed or pasted duplicates are offered for removal rather than removed as you
            type — rewriting a textarea under someone's cursor is hostile. An import does
            clean itself, because nobody is mid-sentence in a dropped file. */}
        {parsed.duplicates > 0 && (
          <button
            type="button"
            onClick={tidy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            style={{ color: 'var(--accent)' }}
            title="Rewrite the list without the repeats"
          >
            <Wand2 className="h-3 w-3" />
            Remove {parsed.duplicates.toLocaleString()} duplicate{parsed.duplicates === 1 ? '' : 's'}
          </button>
        )}
        {parsed.invalid.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange({ allowlistRaw: parsed.wallets.join('\n') })
              setLastImport(`${parsed.invalid.length.toLocaleString()} line(s) that were not addresses removed`)
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            style={{ color: 'var(--accent-error)' }}
            title={`Line ${parsed.invalid[0].line}: "${parsed.invalid[0].value.slice(0, 24)}"`}
          >
            <AlertTriangle className="h-3 w-3" />
            Remove {parsed.invalid.length} bad line{parsed.invalid.length === 1 ? '' : 's'}
          </button>
        )}
        {root && (
          <span className="inline-flex items-center gap-1.5 font-mono" style={{ color: 'var(--text-muted)' }}>
            root {root.slice(0, 12)}…
            <CopyButton value={root} title="Copy the Merkle root" />
          </span>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
          style={{ color: 'var(--accent)' }}
        >
          <Upload className="h-3 w-3" /> Import CSV / JSON
        </button>
        {draft.allowlistRaw.trim() && (
          <button
            type="button"
            onClick={() => {
              onChange({ allowlistRaw: '' })
              setLastImport(null)
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Trash2 className="h-3 w-3" /> Clear list
          </button>
        )}
      </div>

      {lastImport && !fileError && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <Check className="mr-1 inline h-3 w-3" />
          {lastImport}
        </p>
      )}

      {fileError && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--accent-error)' }}>
          {fileError}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".txt,.csv,.tsv,.json,text/plain,text/csv,application/json"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) void importFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── One phase ───────────────────────────────────────────────────────────────────────

function PhaseCard({
  draft,
  index,
  total,
  problems,
  onChange,
  onRemove,
  onMove,
}: {
  draft: PhaseDraft
  index: number
  total: number
  problems: string[]
  onChange: (patch: Partial<PhaseDraft>) => void
  onRemove: () => void
  onMove: (by: -1 | 1) => void
}) {
  const state = windowOf(draft)
  const price = Number(draft.priceSol)
  const isFree = !draft.priceSol.trim() || price === 0

  return (
    <li
      className="rounded-xl"
      style={{
        border: `1px solid ${problems.length > 0 ? 'rgba(239,68,68,0.35)' : 'var(--border-primary)'}`,
        background: 'rgba(12, 14, 20, 0.5)',
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold"
            style={{ background: 'var(--accent-line)', color: 'var(--accent)' }}
          >
            {index + 1}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {draft.displayName.trim() || draft.label.trim() || 'Untitled phase'}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{
              background:
                WINDOW_TONE[state] === 'success'
                  ? 'rgba(34,197,94,0.14)'
                  : WINDOW_TONE[state] === 'warning'
                    ? 'rgba(245,158,11,0.14)'
                    : 'rgba(148,163,184,0.12)',
              color:
                WINDOW_TONE[state] === 'success'
                  ? '#22c55e'
                  : WINDOW_TONE[state] === 'warning'
                    ? '#f59e0b'
                    : 'var(--text-tertiary)',
            }}
          >
            {WINDOW_LABEL[state]}
          </span>
          {draft.mintLimitId != null && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }} title="Per-wallet counter namespace on chain. Kept across saves so nobody's count resets.">
              counter #{draft.mintLimitId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            title="Move up (display order only)"
            className="rounded p-1 disabled:opacity-30"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            title="Move down (display order only)"
            className="rounded p-1 disabled:opacity-30"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove this phase"
            className="rounded p-1"
            style={{ color: 'var(--accent-error)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5 p-4">
        <Field
          label="Phase name"
          htmlFor={`display-${draft.key}`}
          hint={
            <>
              Shown on the mint page&apos;s phase tab.
              {draft.label && (
                <>
                  {' '}
                  On chain it is stored as <span className="font-mono">{draft.label}</span> — the program
                  allows six bytes, so it is shortened automatically
                  {draft.labelLocked ? ' and, for a phase that is already live, never changed' : ''}.
                </>
              )}
            </>
          }
        >
          <TextInput
            id={`display-${draft.key}`}
            value={draft.displayName}
            onChange={(v) => onChange({ displayName: v.slice(0, DISPLAY_NAME_MAX) })}
            placeholder="DawG Pound"
          />
        </Field>

        <Field
          label="Description"
          htmlFor={`desc-${draft.key}`}
          hint="One or two sentences under the tab — who this phase is for."
        >
          <TextArea
            id={`desc-${draft.key}`}
            value={draft.description}
            onChange={(v) => onChange({ description: v.slice(0, DESCRIPTION_MAX) })}
            placeholder="Original mint terms, carried across from LaunchMyNFT."
            rows={2}
          />
        </Field>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field
            label="Starts"
            htmlFor={`start-${draft.key}`}
            hint="Your local time. Blank = open from the moment it is saved."
            trailing={
              draft.startsAt ? (
                <button
                  type="button"
                  onClick={() => onChange({ startsAt: '' })}
                  className="text-[10px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Clear
                </button>
              ) : (
                <QuickDateButtons onPick={(v) => onChange({ startsAt: v })} />
              )
            }
          >
            <DateTimeInput
              id={`start-${draft.key}`}
              value={draft.startsAt}
              onChange={(v) => onChange({ startsAt: v })}
            />
          </Field>
          <Field
            label="Ends"
            htmlFor={`end-${draft.key}`}
            hint="Blank = open-ended. It does NOT close when the next phase opens — phases run concurrently."
            trailing={
              draft.endsAt ? (
                <button
                  type="button"
                  onClick={() => onChange({ endsAt: '' })}
                  className="text-[10px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Clear
                </button>
              ) : null
            }
          >
            <DateTimeInput
              id={`end-${draft.key}`}
              value={draft.endsAt}
              onChange={(v) => onChange({ endsAt: v })}
            />
          </Field>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field
            label="Price"
            htmlFor={`price-${draft.key}`}
            hint={
              isFree
                ? 'Free mint — the buyer still pays the flat platform fee and network rent.'
                : 'Paid to the creator. The flat platform fee is added on top at mint time.'
            }
            trailing={<span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>SOL</span>}
          >
            {/* Placeholder is 0, not 0.25. A greyed-out price reads as a default that
                will be used, and an empty field here means a FREE phase — so suggesting
                the old mint's 0.25 invited someone to leave it blank believing they had
                set it. Zero is what blank actually does. */}
            <TextInput
              id={`price-${draft.key}`}
              value={draft.priceSol}
              onChange={(v) => onChange({ priceSol: v })}
              placeholder="0"
              mono
            />
          </Field>
          <Field
            label="Max per wallet"
            htmlFor={`max-${draft.key}`}
            hint="Counted per phase, on chain. Blank = unlimited."
          >
            <TextInput
              id={`max-${draft.key}`}
              value={draft.maxPerWallet}
              onChange={(v) => onChange({ maxPerWallet: v })}
              placeholder="unlimited"
              mono
            />
          </Field>
        </div>

        <WhitelistField draft={draft} onChange={onChange} />

        {problems.length > 0 && (
          <ul className="space-y-1">
            {problems.map((p) => (
              <li key={p} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--accent-error)' }}>
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

// ── The editor ──────────────────────────────────────────────────────────────────────

export function PhaseEditor({
  groups,
  candyGuard,
  guardAuthority,
  defaultPriceLamports,
  onSaved,
}: PhaseEditorProps) {
  const wallet = useWallet()
  const sidecar = useQuery({ queryKey: ['guardianz-sidecar'], queryFn: fetchSidecar, staleTime: 15_000 })

  const [drafts, setDrafts] = useState<PhaseDraft[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ signature: string; sidecarFailed: string | null } | null>(null)

  /**
   * The chain's version of the form, which is also what "discard" means.
   *
   * Rebuilt whenever the chain or the sidecar changes, never while someone is typing —
   * drafts are only initialised from it, and `resetToChain` is the one way back.
   */
  const fromChain = useMemo(
    () => phasesFromChain(groups, sidecar.data?.data.allowlists ?? {}, sidecar.data?.data.phases ?? []),
    [groups, sidecar.data],
  )

  // First paint: prefer a draft left behind by an interrupted edit, else the chain.
  useEffect(() => {
    if (drafts !== null || sidecar.isLoading) return
    try {
      const stored = localStorage.getItem(DRAFT_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as PhaseDraft[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Through the same derivation as an edit, so a draft written before labels were
          // generated — or one whose name was changed and never saved — starts consistent
          // instead of showing one label and writing another.
          setDrafts(withDerivedLabels(parsed))
          return
        }
      }
    } catch {
      // A corrupt draft is not worth a broken page.
    }
    setDrafts(fromChain)
  }, [drafts, fromChain, sidecar.isLoading])

  // Keep the scratchpad current, so a reload mid-edit loses nothing.
  useEffect(() => {
    if (!drafts) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
    } catch {
      // Private mode, quota, whatever — the editor still works.
    }
  }, [drafts])

  const list = drafts ?? []
  const problems = useMemo(() => validatePhases(list), [list])
  const problemsByIndex = useMemo(() => {
    const byIndex = new Map<number, string[]>()
    for (const p of problems) {
      if (p.index < 0) continue
      byIndex.set(p.index, [...(byIndex.get(p.index) ?? []), p.message])
    }
    return byIndex
  }, [problems])
  const globalProblems = problems.filter((p) => p.index < 0).map((p) => p.message)

  const dirty = drafts !== null && fingerprint(list) !== fingerprint(fromChain)
  const isSigner = !!wallet.address && !!guardAuthority && wallet.address === guardAuthority

  /**
   * Every edit goes through here, and every edit re-derives the six-byte labels.
   *
   * Keeping it in one place is what lets the label be a generated field rather than a
   * typed one: rename a phase, add one, remove one, and the labels in state are always
   * the labels that would be written — so validation, the uniqueness check and the hint
   * under the name field are reading the same strings the transaction will carry.
   * Phases already on chain keep theirs (`labelLocked`).
   */
  const updateDrafts = useCallback(
    (next: (prev: PhaseDraft[]) => PhaseDraft[]) => {
      setDrafts((prev) => withDerivedLabels(next(prev ?? [])))
      setSaved(null)
    },
    [],
  )

  const patch = useCallback(
    (index: number, p: Partial<PhaseDraft>) => {
      updateDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...p } : d)))
    },
    [updateDrafts],
  )

  const move = useCallback((index: number, by: -1 | 1) => {
    setDrafts((prev) => {
      const next = [...(prev ?? [])]
      const to = index + by
      if (to < 0 || to >= next.length) return next
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
  }, [])

  const resetToChain = useCallback(() => {
    setDrafts(fromChain)
    setError(null)
    setSaved(null)
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }, [fromChain])

  /**
   * The save. Chain first, sidecar second — see `phase-store.ts`.
   *
   * A sidecar failure after a good signature is reported but not treated as a failed
   * save, because the phases *are* live at that point. Pretending otherwise would invite
   * a second signature for something already done.
   */
  const save = useCallback(async () => {
    if (!candyGuard || !isSigner || !drafts) return
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const umi = walletUmi(wallet)
      const { signature, mintLimitIds } = await savePhases(umi, candyGuard, drafts)

      // Fold the allocated counter ids back in, so a second save in the same session
      // carries them instead of allocating again.
      const withIds = drafts.map((d, i) => ({ ...d, mintLimitId: mintLimitIds[i] }))
      setDrafts(withIds)

      let sidecarFailed: string | null = null
      try {
        await saveSidecar(withIds)
      } catch (e) {
        sidecarFailed =
          typeof e === 'object' && e && 'message' in e
            ? String((e as { message: unknown }).message)
            : String(e)
      }

      setSaved({ signature, sidecarFailed })
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
      await sidecar.refetch()
      onSaved()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/reject|denied|cancel/i.test(msg) ? 'Cancelled in the wallet.' : msg.split('\n')[0].slice(0, 300))
    } finally {
      setBusy(false)
    }
  }, [candyGuard, drafts, isSigner, onSaved, sidecar, wallet])

  // ── Why the save button might be dead, in the order the user should hear it ──
  const blocked = !candyGuard
    ? 'No candy machine yet, so there is no guard to write to. Build the phases here — they are kept — then create the candy machine in step 2 and press save; it is one signature from the ops wallet.'
    : !guardAuthority
      ? 'The candy guard could not be read, so there is no way to know which wallet may sign.'
      : !wallet.address
        ? 'Connect the wallet that holds the candy guard authority.'
        : !isSigner
          ? `Connected as ${shortAddress(wallet.address, 4, 4)}, but only ${shortAddress(guardAuthority, 4, 4)} may change the phases.`
          : problems.length > 0
            ? 'Fix the problems listed above first.'
            : !dirty
              ? 'Nothing has changed.'
              : null

  const walletCount = list.reduce((n, d) => n + parseWallets(d.allowlistRaw).wallets.length, 0)

  return (
    <Section
      title="Mint phases & whitelists"
      description={
        <>
          Phases are Candy Guard groups: each one its own window, price, per-wallet cap and whitelist, and
          buyers pick between the ones that are open. Saving rewrites all of them in a single transaction that
          applies to the next mint — no redeploy, no re-upload.
        </>
      }
      icon={<Layers className="h-5 w-5" />}
      changedCount={dirty ? 1 : 0}
      aside={
        candyGuard ? (
          <a
            href={acct(candyGuard)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--accent)' }}
          >
            Guard <ExternalLink className="h-3 w-3" />
          </a>
        ) : null
      }
    >
      {/* ── Who signs, and what the chain says right now ──────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ChainValue
          label="Signing wallet"
          value={
            guardAuthority
              ? isSigner
                ? `${shortAddress(guardAuthority, 5, 5)} · connected`
                : shortAddress(guardAuthority, 5, 5)
              : '—'
          }
          mono
          tone={isSigner ? 'success' : guardAuthority ? 'warning' : 'default'}
          title={guardAuthority ?? undefined}
        />
        <ChainValue
          label="Phases on chain"
          value={
            groups.length > 0
              ? `${groups.length} group${groups.length === 1 ? '' : 's'}`
              : defaultPriceLamports != null
                ? `none — flat ${(defaultPriceLamports / 1e9).toFixed(2)} SOL`
                : 'none'
          }
          tone={groups.length > 0 ? 'success' : 'warning'}
        />
        <ChainValue
          label="Whitelisted wallets"
          value={walletCount > 0 ? walletCount.toLocaleString() : 'none — all public'}
        />
      </div>

      {groups.length === 0 && candyGuard && (
        <div className="mt-4">
          <Callout level="info">
            The guard has no groups, so every buyer mints on the default guard set
            {defaultPriceLamports != null ? ` at ${(defaultPriceLamports / 1e9).toFixed(2)} SOL` : ''} with no
            window and no cap. The first save here replaces that with the phases below — which is also what
            lets the mint page show tabs at all.
          </Callout>
        </div>
      )}

      {sidecar.data?.error && (
        <div className="mt-4">
          <Callout level="warning">
            Could not read the stored wallet lists ({sidecar.data.error}). Phase terms below are the chain&apos;s
            and are correct; whitelists will show as &quot;not stored here&quot; until the backend answers again.
            Saving in this state keeps every root exactly as it is.
          </Callout>
        </div>
      )}

      {/* ── The phases ───────────────────────────────────────────────────── */}
      {drafts === null ? (
        <p className="mt-5 text-xs" style={{ color: 'var(--text-muted)' }}>
          Reading phases…
        </p>
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {list.map((draft, i) => (
              <PhaseCard
                key={draft.key}
                draft={draft}
                index={i}
                total={list.length}
                problems={problemsByIndex.get(i) ?? []}
                onChange={(p) => patch(i, p)}
                onRemove={() => updateDrafts((prev) => prev.filter((_, idx) => idx !== i))}
                onMove={(by) => move(i, by)}
              />
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                updateDrafts((prev) => [...prev, emptyPhase()])
              }}
            >
              Add phase
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={resetToChain}
              >
                Discard changes
              </Button>
            )}
          </div>
        </>
      )}

      {globalProblems.length > 0 && (
        <div className="mt-4">
          <Callout level="warning">{globalProblems.join(' ')}</Callout>
        </div>
      )}

      {/* ── Save ─────────────────────────────────────────────────────────── */}
      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4"
        style={{ borderTop: '1px solid var(--border-primary)' }}
      >
        <div className="max-w-xl text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <CalendarClock className="mr-1 inline h-3 w-3" />
          One signature writes every phase above. Times are sent as absolute instants, so they mean the same
          thing to a buyer in another timezone as they do on this screen.
        </div>
        <Button
          onClick={() => void save()}
          isLoading={busy}
          disabled={!!blocked || busy}
          title={blocked ?? 'Write these phases on chain'}
        >
          {busy ? 'Waiting for the wallet…' : 'Save phases on chain'}
        </Button>
      </div>

      {blocked && !busy && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {blocked}
        </p>
      )}

      {error && (
        <div className="mt-3">
          <Callout level="danger">{error}</Callout>
        </div>
      )}

      {saved && (
        <div className="mt-3 space-y-2">
          <Callout level="success">
            Phases are live.{' '}
            <a href={tx(saved.signature)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {shortAddress(saved.signature, 8, 8)}
            </a>
          </Callout>
          {saved.sidecarFailed && (
            <Callout level="warning">
              The on-chain phases saved, but storing the wallet lists failed ({saved.sidecarFailed}). Allowlist
              phases cannot be minted until that succeeds — press save again; it is safe to repeat.
            </Callout>
          )}
        </div>
      )}
    </Section>
  )
}