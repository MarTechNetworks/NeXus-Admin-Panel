'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './context'

interface ProtectedRouteProps {
  children: ReactNode
  permission?: string
}

/** Wraps routes that require authentication; optionally checks a permission */
export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasPermission } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Wait for the session-restore probe to finish before deciding to redirect,
    // otherwise a valid session bounces to /login on every refresh.
    if (!isLoading && !isAuthenticated) {
      const from = pathname ? `/login?from=${encodeURIComponent(pathname)}` : '/login'
      router.replace(from)
    }
  }, [isAuthenticated, isLoading, router, pathname])

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm" style={{ color: '#8a8a9a' }}>Loading…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
