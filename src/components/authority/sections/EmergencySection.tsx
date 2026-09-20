'use client'

/**
 * EmergencySection — the platform-wide handbrake.
 *
 * One boolean on the registry that every `mint` instruction checks first. The
 * card always leads with what the chain says right now; a staged flip shows as
 * "…when you save" next to it rather than replacing it, so the owner never
 * reads "Paused" on a platform that is still selling. The batch builder orders
 * an unpause before the rest of the transaction and a pause after it, so a save
 * that both reconfigures and halts does the configuring while it still can.
 */
import { Siren } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout, RevertButton, Section } from '../primitives'
import { formatUnixTime } from '@/lib/authority/format'
import type { AuthorityConsoleState } from '@/lib/authority/useAuthorityConsole'

export function EmergencySection({ state }: { state: AuthorityConsoleState }) {
  const { snapshot, draft, patchDraft, revertChange, changes, issues, isAuthority } = state
  if (!snapshot?.registry || !draft) return null

  const changed = changes.some((c) => c.key === 'emergencyPause')
  const warnings = issues.filter((i) => i.group === 'emergency')
  const live = !snapshot.registry.emergencyPause
  const tone = live ? 'var(--accent-success)' : 'var(--accent-error)'

  return (
    <Section
      id="emergency"
      title="Minting"
      icon={<Siren className="h-4 w-4" />}
      tone={draft.emergencyPause ? 'danger' : 'default'}
      changedCount={changed ? 1 : 0}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3 shrink-0">
            {live && !changed && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: tone }}
              />
            )}
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: tone }} />
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {live ? 'Live on every collection' : 'Paused on every collection'}
              {changed && (
                <span
                  className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-line)' }}
                >
                  {draft.emergencyPause ? 'pauses when you save' : 'resumes when you save'}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {live
                ? 'Pause only for a real incident — every buyer sees it immediately.'
                : `Paused since ${formatUnixTime(snapshot.registry.emergencyPauseTime)}. Resuming reopens every collection that is not paused by its own creator.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {changed ? (
            <RevertButton onClick={() => revertChange('emergencyPause')} />
          ) : live ? (
            <Button
              variant="danger"
              disabled={!isAuthority}
              onClick={() => patchDraft({ emergencyPause: true })}
            >
              Pause all minting
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!isAuthority}
              onClick={() => patchDraft({ emergencyPause: false })}
            >
              Resume minting
            </Button>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {warnings.map((issue, i) => (
            <Callout key={i} level={issue.level === 'error' ? 'danger' : 'warning'}>
              {issue.message}
            </Callout>
          ))}
        </div>
      )}
    </Section>
  )
}
