'use client'

/**
 * EmergencySection — the platform-wide handbrake.
 *
 * One boolean on the registry that every `mint` instruction checks first. It is
 * styled as danger surface on purpose, and the batch builder always orders an
 * unpause before the rest of the transaction and a pause after it, so a batch
 * that both reconfigures and halts does the configuring while it still can.
 */
import { Ban, Siren } from 'lucide-react'
import { Callout, Field, Section, Toggle } from '../primitives'
import { formatUnixTime } from '@/lib/authority/format'
import type { AuthorityConsoleState } from '@/lib/authority/useAuthorityConsole'

export function EmergencySection({ state }: { state: AuthorityConsoleState }) {
  const { snapshot, draft, patchDraft, revertChange, changes, issues, isAuthority } = state
  if (!snapshot?.registry || !draft) return null

  const changed = changes.some((c) => c.key === 'emergencyPause')
  const warnings = issues.filter((i) => i.group === 'emergency')
  const live = snapshot.registry.emergencyPause

  return (
    <Section
      id="emergency"
      title="Emergency pause"
      description="Stops minting across every registered collection in one instruction. Collection authorities cannot override it; only this console lifts it."
      icon={<Siren className="h-4 w-4" />}
      tone={draft.emergencyPause ? 'danger' : 'default'}
      changedCount={changed ? 1 : 0}
    >
      <Field
        label="Global minting"
        changed={changed}
        onRevert={() => revertChange('emergencyPause')}
        hint={
          live
            ? `Paused since ${formatUnixTime(snapshot.registry.emergencyPauseTime)}. Turning this off resumes every collection that is not individually paused.`
            : 'Minting is live. Turn this on only for an active incident — it is visible to every buyer immediately.'
        }
      >
        <Toggle
          checked={draft.emergencyPause}
          onChange={(next) => patchDraft({ emergencyPause: next })}
          labelOn="Paused platform-wide"
          labelOff="Minting live"
          tone="danger"
          disabled={!isAuthority}
        />
      </Field>

      {warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {warnings.map((issue, i) => (
            <Callout key={i} level={issue.level === 'error' ? 'danger' : 'warning'}>
              {issue.message}
            </Callout>
          ))}
        </div>
      )}

      {live && !draft.emergencyPause && (
        <div className="mt-3">
          <Callout level="info">
            <span className="inline-flex items-center gap-1.5">
              <Ban className="h-3 w-3" />
              Staged: the pause is lifted first in the batch, before anything else runs.
            </span>
          </Callout>
        </div>
      )}
    </Section>
  )
}
