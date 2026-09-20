'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useResetPassword } from '@/lib/api/hooks'
import { AuthError, AuthField, AuthShell, errorMessage } from '@/components/auth/AuthShell'

// Mirrors @MinLength(8) on ResetPasswordDto.
const MIN_PASSWORD = 8

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const reset = useResetPassword()

  const mismatch = confirm.length > 0 && confirm !== password
  const valid = token.length >= 32 && password.length >= MIN_PASSWORD && password === confirm

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    reset.mutate(
      { token, newPassword: password },
      { onSuccess: () => router.replace('/login?notice=password-reset') }
    )
  }

  if (!token) {
    return (
      <AuthShell
        title="Reset link missing"
        subtitle="This page only works from the link in a password-reset email."
        footer={
          <Link href="/forgot-password" style={{ color: '#00d4ff' }}>
            Request a new link
          </Link>
        }
      >
        <span />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="This signs out every other session on the account."
      footer={
        <Link href="/login" style={{ color: '#00d4ff' }}>
          ← Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {reset.error && (
          <AuthError>
            {errorMessage(reset.error, 'This link is invalid or has expired.')}{' '}
            <Link href="/forgot-password" style={{ color: '#f87171', textDecoration: 'underline' }}>
              Request a new one.
            </Link>
          </AuthError>
        )}

        <AuthField id="password" label="New password">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-base"
            minLength={MIN_PASSWORD}
            required
            autoFocus
          />
        </AuthField>

        <AuthField id="confirm" label="Confirm new password">
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-base"
            required
          />
          {mismatch && (
            <p className="mt-1 text-xs" style={{ color: '#f87171' }}>
              Passwords do not match.
            </p>
          )}
        </AuthField>

        <p className="text-xs" style={{ color: '#8a8a9a' }}>
          At least {MIN_PASSWORD} characters. Use a password manager — this account controls the platform.
        </p>

        <Button type="submit" variant="primary" className="w-full mt-2" disabled={!valid} isLoading={reset.isPending}>
          Set new password
        </Button>
      </form>
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  // useSearchParams() requires a Suspense boundary for static generation.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
