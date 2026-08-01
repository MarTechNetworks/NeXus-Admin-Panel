'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { Button } from '@/components/ui/Button'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') ?? '/dashboard'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      router.replace(from)
    } catch {
      setError('Invalid credentials')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a24 50%, #111118 100%)' }}
    >
      {/* Glow orbs */}
      <div
        className="pointer-events-none fixed"
        style={{
          top: '-20%',
          left: '-10%',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,255,0.04) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none fixed"
        style={{
          bottom: '-20%',
          right: '-10%',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/nexuslogo_nobg.png"
            alt="NeXus Launchpad"
            width={220}
            height={73}
            priority
            className="logo-pulse h-16 w-auto"
          />
          <p className="mt-3 text-sm font-medium" style={{ color: '#8a8a9a' }}>
            Admin Dashboard
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(17, 17, 24, 0.85)',
            border: '1px solid #252535',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          <h2 className="mb-1 text-lg font-semibold" style={{ color: '#ffffff' }}>
            Sign in
          </h2>
          <p className="mb-6 text-sm" style={{ color: '#8a8a9a' }}>
            Enter your credentials to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="rounded-lg px-3 py-2.5 text-sm"
                role="alert"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: '#b8b8c8' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: '#b8b8c8' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base"
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-xs" style={{ color: '#8a8a9a' }}>
            Owner console — authorized administrators only.
          </p>
        </div>
      </div>
    </div>
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
