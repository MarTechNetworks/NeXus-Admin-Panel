'use client'

import { useState, type ReactNode } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth/context'
import { useCancelEmailChange, useChangePassword, useRequestEmailChange } from '@/lib/api/hooks'
import { errorMessage } from '@/components/auth/AuthShell'
import { formatDate } from '@/lib/utils'
import { KeyRound, Mail, ShieldCheck, X } from 'lucide-react'

/**
 * Account page — the signed-in admin's own credentials, any role.
 *
 * Exists so the owner can rotate a leaked password or move to a new email
 * without a developer touching the database. Both changes ask for the current
 * password (a stolen session token is not enough), a password change signs out
 * every other session, and an email change only lands after the new address
 * clicks a verification link — the old address is told the moment it starts.
 */

const TEXT = '#ffffff'
const SUB = '#8a8a9a'
const GRID = '#252535'
const CYAN = '#00d4ff'
const GREEN = '#10b981'
const AMBER = '#f59e0b'

// Mirrors @MinLength(8) on the backend DTOs.
const MIN_PASSWORD = 8

function Card({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="card mb-4 p-5">
      <div className="mb-4 flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'rgba(0,212,255,0.08)', color: CYAN, border: '1px solid rgba(0,212,255,0.2)' }}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold" style={{ color: TEXT }}>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs" style={{ color: SUB }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: SUB }}>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: SUB }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5"
      style={{ background: '#0a0a0f', border: `1px solid ${GRID}` }}
    >
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: SUB }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: tone ?? TEXT }}>
        {value}
      </span>
    </div>
  )
}

function Feedback({ error, success }: { error?: unknown; success?: string }) {
  if (error) {
    return (
      <p className="text-sm" role="alert" style={{ color: '#f87171' }}>
        {errorMessage(error)}
      </p>
    )
  }
  if (success) {
    return (
      <p className="text-sm" role="status" style={{ color: '#34d399' }}>
        {success}
      </p>
    )
  }
  return null
}

export default function AccountPage() {
  const { user, refresh, setSessionToken } = useAuth()

  // ── Change password ──────────────────────────────────────────────────────
  const changePassword = useChangePassword()
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwDone, setPwDone] = useState('')
  const pwMismatch = pw.confirm.length > 0 && pw.confirm !== pw.next
  const pwValid = pw.current.length > 0 && pw.next.length >= MIN_PASSWORD && pw.next === pw.confirm

  function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!pwValid) return
    setPwDone('')
    changePassword.mutate(
      { currentPassword: pw.current, newPassword: pw.next },
      {
        onSuccess: ({ token }) => {
          // The token that made this call is now void; keep this tab signed in.
          setSessionToken(token)
          setPw({ current: '', next: '', confirm: '' })
          setPwDone('Password changed. Every other session has been signed out, and a confirmation was emailed to you.')
        },
      }
    )
  }

  // ── Change email ─────────────────────────────────────────────────────────
  const requestEmail = useRequestEmailChange()
  const cancelEmail = useCancelEmailChange()
  const [em, setEm] = useState({ next: '', current: '' })
  const [emDone, setEmDone] = useState('')
  const emValid = /.+@.+\..+/.test(em.next) && em.current.length > 0

  function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!emValid) return
    setEmDone('')
    requestEmail.mutate(
      { newEmail: em.next.trim(), currentPassword: em.current },
      {
        onSuccess: async () => {
          setEm({ next: '', current: '' })
          setEmDone('Verification link sent. The change lands once it is clicked.')
          await refresh()
        },
      }
    )
  }

  function submitCancel() {
    setEmDone('')
    cancelEmail.mutate(undefined, {
      onSuccess: async () => {
        setEmDone('Pending change cancelled.')
        await refresh()
      },
    })
  }

  if (!user) return null

  return (
    <MainLayout breadcrumbs={[{ label: 'Account' }]}>
      <p className="mb-5 text-sm" style={{ color: SUB }}>
        Your own console credentials. If you think either has been compromised, change it here — no
        developer needed. Every change is written to the{' '}
        <a href="/logs" style={{ color: CYAN }}>
          audit log
        </a>{' '}
        and confirmed by email.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Card icon={<ShieldCheck className="h-4 w-4" />} title="Profile" subtitle="Who you are signed in as">
            <div className="space-y-2">
              <Row label="Name" value={user.displayName} />
              <Row label="Email" value={user.email} />
              <Row label="Role" value={user.role.replace('_', ' ')} tone={CYAN} />
              <Row label="Last sign-in" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'} />
              <Row
                label="Password changed"
                value={user.passwordChangedAt ? formatDate(user.passwordChangedAt) : 'Never'}
                tone={user.passwordChangedAt ? undefined : AMBER}
              />
            </div>
            {!user.passwordChangedAt && (
              <p className="mt-3 text-xs" style={{ color: AMBER }}>
                This account is still on the password it was created with. Set your own below.
              </p>
            )}
          </Card>

          <Card
            icon={<Mail className="h-4 w-4" />}
            title="Login email"
            subtitle="The new address must confirm before it takes over"
          >
            {user.pendingEmail ? (
              <div className="space-y-3">
                <div
                  className="rounded-lg px-3 py-3 text-sm"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}
                >
                  A verification link was sent to <span className="font-medium">{user.pendingEmail}</span>. Until it
                  is clicked you keep signing in as {user.email}. Links last 60 minutes.
                </div>
                <Feedback error={cancelEmail.error} success={emDone} />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    leftIcon={<X className="h-3.5 w-3.5" />}
                    isLoading={cancelEmail.isPending}
                    onClick={submitCancel}
                  >
                    Cancel change
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitEmail} className="space-y-4">
                <Field label="New email">
                  <input
                    type="email"
                    autoComplete="off"
                    value={em.next}
                    onChange={(e) => setEm((f) => ({ ...f, next: e.target.value }))}
                    className="input-base w-full"
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Current password" hint="Required so a stolen session cannot re-point your account.">
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={em.current}
                    onChange={(e) => setEm((f) => ({ ...f, current: e.target.value }))}
                    className="input-base w-full"
                  />
                </Field>
                <Feedback error={requestEmail.error} success={emDone} />
                <div className="flex justify-end">
                  <Button type="submit" variant="primary" disabled={!emValid} isLoading={requestEmail.isPending}>
                    Send verification link
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        <div>
          <Card
            icon={<KeyRound className="h-4 w-4" />}
            title="Password"
            subtitle="Changing it signs out every other session"
          >
            <form onSubmit={submitPassword} className="space-y-4">
              <Field label="Current password">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={pw.current}
                  onChange={(e) => setPw((f) => ({ ...f, current: e.target.value }))}
                  className="input-base w-full"
                />
              </Field>
              <Field label="New password" hint={`At least ${MIN_PASSWORD} characters. Use a password manager.`}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pw.next}
                  onChange={(e) => setPw((f) => ({ ...f, next: e.target.value }))}
                  className="input-base w-full"
                  minLength={MIN_PASSWORD}
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={(e) => setPw((f) => ({ ...f, confirm: e.target.value }))}
                  className="input-base w-full"
                />
                {pwMismatch && (
                  <span className="mt-1 block text-xs" style={{ color: '#f87171' }}>
                    Passwords do not match.
                  </span>
                )}
              </Field>
              <Feedback error={changePassword.error} success={pwDone} />
              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={!pwValid} isLoading={changePassword.isPending}>
                  Change password
                </Button>
              </div>
            </form>
          </Card>

          <section className="card p-5">
            <h2 className="text-sm font-semibold" style={{ color: TEXT }}>
              Locked out?
            </h2>
            <p className="mt-1 text-xs" style={{ color: SUB }}>
              If you ever cannot sign in, use <span style={{ color: GREEN }}>Forgot password</span> on the login
              page. A single-use reset link goes to {user.email}; it works for 30 minutes and only the newest one
              is valid.
            </p>
          </section>
        </div>
      </div>
    </MainLayout>
  )
}
