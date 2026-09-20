'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'

/**
 * The full-screen frame around every signed-out page: login, forgot password,
 * reset password, verify email. One place for the gradient, the glow orbs, the
 * logo and the glass card, so the four pages cannot drift apart.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
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
            {title}
          </h2>
          {subtitle && (
            <p className="mb-6 text-sm" style={{ color: '#8a8a9a' }}>
              {subtitle}
            </p>
          )}

          {children}

          {footer && (
            <div className="mt-4 text-xs" style={{ color: '#8a8a9a' }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The red inline error box the login form uses. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm"
      role="alert"
      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
    >
      {children}
    </div>
  )
}

/** Its green counterpart, for "check your inbox" and "done" states. */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm"
      role="status"
      style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}
    >
      {children}
    </div>
  )
}

export function AuthField({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium" style={{ color: '#b8b8c8' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

/** The api client throws a plain { message, status } object, not an Error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (!err) return ''
  const m = (err as { message?: unknown }).message
  if (Array.isArray(m)) return m.join(', ')
  return typeof m === 'string' && m ? m : fallback
}
