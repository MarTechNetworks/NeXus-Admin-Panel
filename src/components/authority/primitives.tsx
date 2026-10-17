'use client'

/**
 * primitives.tsx — the small building blocks the authority sections share.
 *
 * The design contract for the whole console lives here: a field that differs
 * from chain state gets an accent rail and a revert affordance, and nothing else
 * on the page moves. That way "what have I changed?" is answerable at a glance,
 * from anywhere on the page, without opening the review dialog.
 */
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, RotateCcw, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { shortAddress } from '@/lib/authority/format'

// ── Section card ─────────────────────────────────────────────────────────────

export function Section({
  id,
  title,
  description,
  icon,
  changedCount = 0,
  tone = 'default',
  aside,
  children,
}: {
  id?: string
  title: string
  description?: ReactNode
  icon?: ReactNode
  changedCount?: number
  tone?: 'default' | 'danger'
  aside?: ReactNode
  children: ReactNode
}) {
  const accent = tone === 'danger' ? 'var(--accent-error)' : 'var(--accent)'
  const accentLine = tone === 'danger' ? 'rgba(239,68,68,0.34)' : 'var(--accent-line)'

  return (
    <section
      id={id}
      className="card scroll-mt-24 overflow-hidden"
      style={
        tone === 'danger'
          ? { borderColor: 'rgba(239, 68, 68, 0.28)' }
          : changedCount > 0
            ? { borderColor: 'var(--accent-line)', boxShadow: 'var(--tw-shadow, none), 0 0 0 1px rgba(56,189,248,0.12)' }
            : undefined
      }
    >
      <header
        className="flex flex-wrap items-start justify-between gap-3 px-6 py-5"
        style={{
          borderBottom: '1px solid var(--border-primary)',
          background:
            tone === 'danger'
              ? 'linear-gradient(135deg, rgba(239,68,68,0.06), transparent 60%)'
              : changedCount > 0
                ? 'linear-gradient(135deg, rgba(56,189,248,0.06), transparent 60%)'
                : undefined,
        }}
      >
        <div className="flex items-start gap-3.5">
          {icon && (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                color: accent,
                border: `1px solid ${accentLine}`,
              }}
            >
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h2>
            {description && (
              <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {aside}
          {changedCount > 0 && <ChangedPill count={changedCount} />}
        </div>
      </header>
      <div className="p-6">{children}</div>
    </section>
  )
}

export function ChangedPill({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
      style={{
        background: 'var(--accent)',
        color: '#08090d',
        boxShadow: '0 8px 20px rgba(56,189,248,0.24)',
      }}
    >
      {count} unsaved
    </span>
  )
}

// ── Field row ────────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  changed,
  onRevert,
  error,
  htmlFor,
  children,
  trailing,
}: {
  label: string
  hint?: ReactNode
  changed?: boolean
  onRevert?: () => void
  error?: string
  htmlFor?: string
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div
      className="rounded-lg px-4 py-3.5 transition-colors"
      style={{
        borderLeft: `2px solid ${changed ? 'var(--accent)' : 'var(--border-primary)'}`,
        background: changed ? 'rgba(56, 189, 248, 0.05)' : 'rgba(8, 9, 13, 0.4)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: changed ? 'var(--accent)' : 'var(--text-tertiary)' }}
        >
          {label}
        </label>
        <div className="flex items-center gap-2">
          {trailing}
          {changed && onRevert && <RevertButton onClick={onRevert} />}
        </div>
      </div>
      <div className="mt-2">{children}</div>
      {hint && (
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--accent-error)' }}>
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

export function RevertButton({ onClick, label = 'Undo' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
      style={{ color: 'var(--text-tertiary)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
    >
      <RotateCcw className="h-3 w-3" />
      {label}
    </button>
  )
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  id,
  invalid,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
  id?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      id={id}
      className={cn('input-base', mono && 'font-mono text-xs', className)}
      style={invalid ? { borderColor: 'var(--accent-error)' } : undefined}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Percent input that stores basis points. Shares are bps on chain; the owner
 * thinks in percent. Doing the conversion in one component keeps a stray
 * `× 100` out of the rest of the code.
 */
export function PercentInput({
  value,
  onChange,
  max = 10_000,
  id,
  invalid,
  disabled,
}: {
  value: number
  onChange: (bps: number) => void
  max?: number
  id?: string
  invalid?: boolean
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        className="input-base w-24 pr-7 text-right text-sm"
        style={invalid ? { borderColor: 'var(--accent-error)' } : undefined}
        value={Number.isFinite(value) ? value / 100 : 0}
        min={0}
        max={max / 100}
        step={1}
        disabled={disabled}
        onChange={(e) => {
          const pct = Number(e.target.value)
          if (!Number.isFinite(pct)) return
          onChange(Math.round(pct * 100))
        }}
      />
      <span
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        %
      </span>
    </div>
  )
}

// ── Read-only chain values ───────────────────────────────────────────────────
//
// The authority console stopped using these in the "Fees & minting" rebuild,
// but the GuardianZ console still does — keep them here, not in either page.

export function ChainValue({
  label,
  value,
  mono,
  tone,
  title,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  tone?: 'default' | 'success' | 'warning' | 'danger'
  title?: string
}) {
  const color =
    tone === 'success'
      ? 'var(--accent-success)'
      : tone === 'warning'
        ? 'var(--accent-warning)'
        : tone === 'danger'
          ? 'var(--accent-error)'
          : 'var(--text-primary)'
  return (
    <div className="panel-subtle px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p
        className={cn('mt-1 text-sm font-medium', mono && 'font-mono text-xs')}
        style={{ color }}
        title={title}
      >
        {value}
      </p>
    </div>
  )
}

export function AddressChip({ address, label }: { address: string; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px]"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
      title={address}
    >
      {label && <span style={{ color: 'var(--text-muted)' }}>{label}</span>}
      {shortAddress(address, 6, 6)}
    </span>
  )
}

// ── Callouts ─────────────────────────────────────────────────────────────────

export function Callout({
  level = 'info',
  children,
}: {
  level?: 'info' | 'success' | 'warning' | 'danger'
  children: ReactNode
}) {
  const palette = {
    info: { color: 'var(--accent)', bg: 'var(--accent-soft)', border: 'var(--accent-line)', Icon: Info },
    // Used for "this landed on chain" confirmations, which were reading as neutral info
    // next to the warnings they sit beside.
    success: {
      color: 'var(--accent-success)',
      bg: 'rgba(34, 197, 94, 0.1)',
      border: 'rgba(34, 197, 94, 0.28)',
      Icon: CheckCircle2,
    },
    warning: {
      color: 'var(--accent-warning)',
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.28)',
      Icon: AlertTriangle,
    },
    danger: {
      color: 'var(--accent-error)',
      bg: 'var(--danger-soft)',
      border: 'rgba(239, 68, 68, 0.28)',
      Icon: ShieldAlert,
    },
  }[level]

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs leading-relaxed"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color }}
    >
      <palette.Icon className="mt-px h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
