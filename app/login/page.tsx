'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { Button } from '@/components/ui/Button'
import { AuthError, AuthField, AuthNotice, AuthShell } from '@/components/auth/AuthShell'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') ?? '/dashboard'
  // /reset-password and /verify-email land here with a one-line reason to show.
  const notice = searchParams.get('notice')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      router.replace(from)
    } catch (err) {
      // 429 is the only failure worth distinguishing: the password may well be
      // right, and "Invalid credentials" would send the owner off to reset it.
      setError(
        (err as { status?: number }).status === 429
          ? 'Too many attempts. Wait a few minutes and try again.'
          : 'Invalid credentials'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your credentials to continue"
      footer="Owner console — authorized administrators only."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {notice === 'password-reset' && <AuthNotice>Password updated. Sign in with the new one.</AuthNotice>}
        {notice === 'email-verified' && <AuthNotice>Email confirmed. Sign in with the new address.</AuthNotice>}
        {error && <AuthError>{error}</AuthError>}

        <AuthField id="email" label="Email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
            required
          />
        </AuthField>

        <AuthField id="password" label="Password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-base"
            required
          />
        </AuthField>

        <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isLoading}>
          Sign in
        </Button>

        <p className="text-center text-xs">
          <Link href="/forgot-password" style={{ color: '#00d4ff' }}>
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary for static generation.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
