'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  ChevronsLeft,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  ScrollText,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { useSidebar } from './SidebarContext'

const navItems: { href: string; label: string; icon: LucideIcon; permission?: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/collections', label: 'Collections', icon: LayoutGrid, permission: 'collections:read' },
  { href: '/featured', label: 'Featured', icon: Star, permission: 'collections:write' },
  { href: '/revenue', label: 'Revenue', icon: TrendingUp, permission: 'revenue:read' },
  // On-chain, not database — signing happens here, so it sits above the DB-only pages.
  { href: '/authority', label: 'Fees & minting', icon: KeyRound, permission: 'settings:write' },
  // The GuardianZ creator console: mainnet, signed by the collection's own wallet.
  { href: '/guardianz', label: 'GuardianZ', icon: ShieldCheck, permission: 'collections:write' },
  { href: '/users', label: 'Users', icon: Users, permission: 'users:read' },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings:read' },
  { href: '/logs', label: 'Activity', icon: ScrollText, permission: 'logs:read' },
]

export function Sidebar() {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar()
  const { hasPermission } = useAuth()
  const pathname = usePathname()

  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  )

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  return (
    <>
      {/* Backdrop — mobile only, behind the drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col transition-[transform,width] duration-200',
        // Width: full drawer on mobile; collapse only applies on desktop
        collapsed ? 'w-sidebar md:w-sidebar-collapsed' : 'w-sidebar',
        // Off-canvas on mobile unless opened; always on-screen at md+
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'md:translate-x-0'
      )}
      style={{ background: 'rgba(15, 17, 24, 0.9)', borderRight: '1px solid var(--border-primary)', backdropFilter: 'blur(18px)' }}
      aria-label="Primary navigation"
    >
      {/* Logo row */}
      <div
        className="flex h-14 shrink-0 items-center justify-between px-4"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/nexuslogo_nobg.png"
              alt="NeXus Launchpad"
              width={130}
              height={43}
              priority
              className="logo-pulse h-8 w-auto"
            />
            <span className="chip-accent rounded px-1.5 py-0.5 text-xs font-semibold">
              Admin
            </span>
          </Link>
        )}
        {/* Collapse toggle — desktop only */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden rounded-lg p-2 transition-colors duration-150 md:block"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronsLeft className={cn('h-5 w-5 transition-transform', collapsed && 'rotate-180')} />
        </button>

        {/* Close drawer — mobile only */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-2 transition-colors duration-150 md:hidden"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Close menu"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {visibleItems.map((item) => {
          const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                collapsed && 'justify-center'
              )}
              style={
                isActive
                  ? {
                      background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.13), rgba(139, 92, 246, 0.06))',
                      color: 'var(--accent)',
                      borderLeft: '2px solid var(--accent)',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 26px rgba(56, 189, 248, 0.08)',
                    }
                  : {
                      color: 'var(--text-tertiary)',
                      borderLeft: '2px solid transparent',
                    }
              }
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'
                }
              }}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom version tag */}
      {!collapsed && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Nexus Admin v1.0</p>
        </div>
      )}
    </aside>
    </>
  )
}
