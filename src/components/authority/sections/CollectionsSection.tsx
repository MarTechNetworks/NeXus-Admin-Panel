'use client'

/**
 * CollectionsSection — per-collection overrides the registry authority owns.
 *
 * Two fields per collection, both gated on the registry key rather than the
 * creator's: the platform fee for that collection, and the on-chain `featured`
 * flag. Every row that differs from chain state becomes its own instruction in
 * the same transaction, so re-pricing a dozen collections is still one signature.
 *
 * The on-chain flag is deliberately not wired to the Featured page: that one
 * orders the homepage from the database, this one is the flag the program itself
 * stores. They are allowed to differ, and pretending otherwise would hide it.
 */
import { useMemo, useState } from 'react'
import { ChevronDown, LayoutGrid, Search, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { gradientFor, resolveUrl } from '@/components/featured/ui'
import { Callout, Section, TextInput } from '../primitives'
import { formatSolAmount, lamportsToSol, shortAddress, solToLamports } from '@/lib/authority/format'
import { COLLECTION_STATUS_LABELS, MAX_PLATFORM_FEE_LAMPORTS } from '@/lib/solana/program'
import type { AuthorityConsoleState } from '@/lib/authority/useAuthorityConsole'
import type { UnreadableCollection } from '@/lib/authority/types'

const PAGE_SIZE = 25

export function CollectionsSection({ state }: { state: AuthorityConsoleState }) {
  const { snapshot, draft, patchCollection, changes, issues, isAuthority } = state
  const [query, setQuery] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)
  // Seeded from the global config so "apply the platform default to everything
  // shown" is one click, which is the common reason to bulk-edit at all.
  const [bulkFeeSol, setBulkFeeSol] = useState(() =>
    snapshot ? lamportsToSol(snapshot.feeConfig.feeLamports) : '0.01',
  )

  const changedKeys = useMemo(
    () => new Set(changes.filter((c) => c.collectionPda).map((c) => c.key)),
    [changes],
  )
  const changedCount = changes.filter((c) => c.group === 'collections').length

  const rows = useMemo(() => {
    if (!snapshot || !draft) return []
    const q = query.trim().toLowerCase()
    return snapshot.collections.filter((c) => {
      if (onlyChanged) {
        const touched =
          changedKeys.has(`collection:${c.pda}:fee`) || changedKeys.has(`collection:${c.pda}:featured`)
        if (!touched) return false
      }
      if (!q) return true
      return (
        (c.name ?? '').toLowerCase().includes(q) ||
        c.pda.toLowerCase().includes(q) ||
        c.mint.toLowerCase().includes(q)
      )
    })
  }, [snapshot, draft, query, onlyChanged, changedKeys])

  if (!snapshot || !draft) return null
  const disabled = !isAuthority
  const groupIssues = issues.filter((i) => i.group === 'collections' && i.level === 'warning' && !i.key)

  const bulkFeeValid = (() => {
    const l = solToLamports(bulkFeeSol)
    return l != null && l <= BigInt(MAX_PLATFORM_FEE_LAMPORTS)
  })()
  const applyBulkFee = () => {
    if (!bulkFeeValid) return
    rows.forEach((c) => patchCollection(c.pda, { platformFeeSol: bulkFeeSol }))
  }

  return (
    <Section
      id="collections"
      title="Per-collection overrides"
      description="Collection.platform_fee_lamports and Collection.featured are registry-authority fields — the creator cannot change either. The fee is frozen at creation, so changing the global default above does not touch these rows; this is where a live collection gets repriced. Everything else on a collection belongs to its own authority."
      icon={<LayoutGrid className="h-4 w-4" />}
      changedCount={changedCount}
      aside={
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {snapshot.collections.length} on chain
        </span>
      }
    >
      {snapshot.unreadableCollections.length > 0 && (
        <UnreadableCollections rows={snapshot.unreadableCollections} programId={snapshot.programId} />
      )}

      {snapshot.collections.length === 0 ? (
        <Callout level="info">
          {snapshot.unreadableCollections.length > 0
            ? 'Every collection in the registry predates the current program build. Deploy one from the public site and it will appear here.'
            : 'The registry lists no collections yet. Deploy one from the public site and it will appear here.'}
        </Callout>
      ) : (
        <>
          {/* Controls */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                className="input-base pl-8 text-sm"
                placeholder="Filter by name or address"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setVisible(PAGE_SIZE)
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Clear filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              variant={onlyChanged ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setOnlyChanged((v) => !v)}
            >
              Staged only
            </Button>
          </div>

          {/* Bulk fee — only worth showing when there is more than one row in view */}
          {!disabled && rows.length > 1 && (
            <div className="panel-subtle mb-3 flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Set fee for all {rows.length} shown
              </span>
              <div className="flex w-36 items-center gap-2">
                <TextInput
                  value={bulkFeeSol}
                  onChange={setBulkFeeSol}
                  placeholder="0.01"
                  invalid={!bulkFeeValid}
                />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>SOL</span>
              </div>
              <Button variant="secondary" size="sm" onClick={applyBulkFee} disabled={!bulkFeeValid}>
                Apply
              </Button>
            </div>
          )}

          {/* Table */}
          <div
            className="overflow-x-auto rounded-lg"
            style={{ border: '1px solid var(--border-primary)', background: 'rgba(8, 9, 13, 0.5)' }}
          >
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  {['Collection', 'Supply', 'Status', 'Platform fee', 'Featured'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, visible).map((c) => {
                  const override = draft.collections[c.pda]
                  if (!override) return null
                  const feeChanged = changedKeys.has(`collection:${c.pda}:fee`)
                  const featuredChanged = changedKeys.has(`collection:${c.pda}:featured`)
                  const rowChanged = feeChanged || featuredChanged

                  return (
                    <tr
                      key={c.pda}
                      style={{
                        borderBottom: '1px solid var(--border-primary)',
                        background: rowChanged ? 'rgba(56, 189, 248, 0.05)' : undefined,
                      }}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-8 w-1 shrink-0 rounded-full"
                            style={{ background: rowChanged ? 'var(--accent)' : 'transparent' }}
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {resolveUrl(c.imageUrl) ? (
                            <img
                              src={resolveUrl(c.imageUrl)}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-lg object-cover"
                              style={{ border: '1px solid var(--border-primary)' }}
                            />
                          ) : (
                            <span
                              className="h-9 w-9 shrink-0 rounded-lg"
                              style={{ background: gradientFor(c.pda), border: '1px solid var(--border-primary)' }}
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                              {c.name ?? shortAddress(c.pda, 6, 4)}
                            </p>
                            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }} title={c.pda}>
                              {shortAddress(c.pda, 6, 6)}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {c.minted.toLocaleString()} / {c.maxSupply.toLocaleString()}
                      </td>

                      <td className="px-3 py-2.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: 'var(--bg-tertiary)',
                            color: c.status === 5 ? 'var(--accent-warning)' : 'var(--text-secondary)',
                          }}
                        >
                          {COLLECTION_STATUS_LABELS[c.status] ?? `status ${c.status}`}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <TextInput
                              value={override.platformFeeSol}
                              onChange={(value) => patchCollection(c.pda, { platformFeeSol: value })}
                              placeholder="0.01"
                              invalid={solToLamports(override.platformFeeSol) == null}
                              disabled={disabled}
                            />
                          </div>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {feeChanged ? `was ${formatSolAmount(c.platformFeeLamports)}` : 'SOL / NFT'}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => patchCollection(c.pda, { featured: !override.featured })}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          style={{
                            background: override.featured ? 'var(--accent-soft)' : 'var(--bg-tertiary)',
                            color: override.featured ? 'var(--accent)' : 'var(--text-tertiary)',
                            border: `1px solid ${featuredChanged ? 'var(--accent)' : 'transparent'}`,
                          }}
                        >
                          <Star
                            className="h-3 w-3"
                            fill={override.featured ? 'currentColor' : 'none'}
                          />
                          {override.featured ? 'Featured' : 'Off'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {rows.length === 0 && (
              <p className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                No collections match that filter.
              </p>
            )}
          </div>

          {visible < rows.length && (
            <div className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, rows.length - visible)} more of {rows.length}
              </Button>
            </div>
          )}
        </>
      )}

      {groupIssues.length > 0 && (
        <div className="mt-3 space-y-2">
          {groupIssues.map((issue, i) => (
            <Callout key={i} level="warning">
              {issue.message}
            </Callout>
          ))}
        </div>
      )}
    </Section>
  )
}

/**
 * Registry entries the current program build cannot deserialize. They are listed
 * rather than dropped because the registry's collection count includes them and
 * the operator would otherwise see "36 collections" above a table of 3. There is
 * nothing to stage here: the program rejects these accounts too, so an
 * `update_featured` or `update_platform_fee` at one of them would revert.
 */
function UnreadableCollections({ rows, programId }: { rows: UnreadableCollection[]; programId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4">
      <Callout level="warning">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-left font-medium"
          aria-expanded={open}
        >
          <span className="flex-1">
            {rows.length} {rows.length === 1 ? 'collection' : 'collections'} in the registry cannot be read by the current
            program build and cannot be edited from here.
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : undefined }}
          />
        </button>
        <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>
          They were created before program <span className="font-mono">{shortAddress(programId, 4, 4)}</span> changed
          the Collection account layout. The program has no instruction to remove a registry entry, so they stay
          listed; if they matter, redeploy them as new collections and soft-delete the old rows in the database.
        </p>
      </Callout>

      {open && (
        <ul
          className="mt-2 max-h-72 divide-y overflow-y-auto rounded-lg text-xs"
          style={{
            border: '1px solid var(--border-primary)',
            background: 'rgba(8, 9, 13, 0.5)',
            borderColor: 'var(--border-primary)',
          }}
        >
          {rows.map((row) => (
            <li key={row.pda} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {row.name ?? shortAddress(row.pda, 6, 4)}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }} title={row.pda}>
                {shortAddress(row.pda, 6, 6)}
              </span>
              {row.mint && (
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }} title={row.mint}>
                  mint {shortAddress(row.mint, 4, 4)}
                </span>
              )}
              <span className="basis-full text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {row.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
