'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { useForgotPassword } from '@/lib/api/hooks'
import { AuthError, AuthField, AuthNotice, AuthShell } from '@/components/auth/AuthShell'

/**
 * Forgot password. The backend answers the same way whether or not the address
 * belongs to an admin, and so does this page — the copy is "if that address is
 * an admin", never "we sent it".
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const forgot = useForgotPassword()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    forgot.mutate({ email: email.trim() }, { onSuccess: () => setSent(true) })
  }

  const throttled = (forgot.error as { status?: number } | null)?.status === 429

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your admin email. If it belongs to an account, a reset link is on its way."
      footer={
        <Link href="/login" style={{ color: '#00d4ff' }}>
          ← Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <AuthNotice>
            If <span className="font-medium">{email.trim()}</span> is an admin account, a reset link has been sent.
            It works for 30 minutes. Check spam if it does not arrive within a minute or two.
          </AuthNotice>
          <Button variant="secondary" className="w-full" onClick={() => setSent(false)}>
            Send another
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {forgot.error && (
            <AuthError>
              {throttled
                ? 'Too many reset requests. Wait 15 minutes and try again.'
                : 'Could not send the request. Try again in a moment.'}
            </AuthError>
          )}
          <AuthField id="email" label="Email">
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base"
              required
              autoFocus
            />
          </AuthField>
          <Button type="submit" variant="primary" className="w-full mt-2" isLoading={forgot.isPending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
