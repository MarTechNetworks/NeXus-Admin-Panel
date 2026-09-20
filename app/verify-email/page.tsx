'use client'

import { Suspense, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useVerifyEmail } from '@/lib/api/hooks'
import { useAuth } from '@/lib/auth/context'
import { AuthError, AuthNotice, AuthShell, errorMessage } from '@/components/auth/AuthShell'

/**
 * Lands from the "confirm your new email" link. Redeems the token on mount — the
 * click *is* the confirmation, there is nothing else to ask — and reports the result.
 */
function VerifyEmail() {
  const token = useSearchParams().get('token') ?? ''
  const verify = useVerifyEmail()
  const { isAuthenticated, refresh } = useAuth()
  // React 19 strict mode mounts effects twice in dev; a token is single-use.
  const fired = useRef(false)

  useEffect(() => {
    if (!token || fired.current) return
    fired.current = true
    verify.mutate(
      { token },
      {
        onSuccess: () => {
          // If the owner did this from a signed-in browser, pull the new email into the header.
          if (isAuthenticated) void refresh()
        },
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (!token) {
    return (
      <AuthShell title="Verification link missing" subtitle="This page only works from the link in the confirmation email.">
        <Link href="/login" style={{ color: '#00d4ff' }} className="text-sm">
          ← Back to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Confirming your new email">
      {verify.isPending || verify.isIdle ? (
        <p className="text-sm" style={{ color: '#8a8a9a' }}>
          One moment…
        </p>
      ) : verify.isError ? (
        <div className="space-y-4">
          <AuthError>{errorMessage(verify.error, 'This link is invalid or has expired.')}</AuthError>
          <p className="text-xs" style={{ color: '#8a8a9a' }}>
            Links last 60 minutes and only the most recent one works. Sign in and start the change again from
            your account page.
          </p>
          <Link href={isAuthenticated ? '/account' : '/login'}>
            <Button variant="secondary" className="w-full">
              {isAuthenticated ? 'Go to account' : 'Back to sign in'}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <AuthNotice>
            <span className="font-medium">{verify.data?.email}</span> is now the login email for this account.
          </AuthNotice>
          <Link href={isAuthenticated ? '/account' : '/login?notice=email-verified'}>
            <Button variant="primary" className="w-full">
              {isAuthenticated ? 'Back to account' : 'Sign in'}
            </Button>
          </Link>
        </div>
      )}
    </AuthShell>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  )
}
