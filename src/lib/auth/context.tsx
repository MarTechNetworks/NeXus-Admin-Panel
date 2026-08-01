'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, getToken, setToken } from '../api/client'
import { endpoints } from '../api/endpoints'
import type { AdminRole, AuthUser, Permission } from '../types'

// Map each backend role to the legacy permission strings the UI already checks.
// super_admin gets everything; the others are scoped per the RBAC design.
const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    'collections:read', 'collections:write', 'creators:read', 'infrastructure:read',
    'settings:read', 'settings:write', 'logs:read', 'users:read', 'users:write',
    'api_keys:manage', 'revenue:read',
  ],
  finance: ['collections:read', 'creators:read', 'infrastructure:read', 'settings:read', 'logs:read', 'revenue:read'],
  moderator: ['collections:read', 'collections:write', 'creators:read', 'logs:read', 'revenue:read'],
  read_only: ['collections:read', 'creators:read', 'infrastructure:read', 'settings:read', 'logs:read', 'revenue:read'],
}

interface AuthContextValue {
  user: AuthUser | null
  role: AdminRole | null
  isAuthenticated: boolean
  isLoading: boolean
  hasPermission: (permission: string) => boolean
  hasRole: (...roles: AdminRole[]) => boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore the session on mount: if we hold a token, ask the backend who we are.
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    api
      .get<AuthUser>(endpoints.auth.me)
      .then((u) => setUser(u))
      .catch(() => {
        setToken(null)
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false
      return ROLE_PERMISSIONS[user.role]?.includes(permission as Permission) ?? false
    },
    [user]
  )

  const hasRole = useCallback(
    (...roles: AdminRole[]) => {
      if (!user) return false
      return user.role === 'super_admin' || roles.includes(user.role)
    },
    [user]
  )

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; expiresIn: number; user: AuthUser }>(
      endpoints.auth.login,
      { email, password }
    )
    setToken(res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: !!user,
      isLoading,
      hasPermission,
      hasRole,
      login,
      logout,
    }),
    [user, isLoading, hasPermission, hasRole, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
