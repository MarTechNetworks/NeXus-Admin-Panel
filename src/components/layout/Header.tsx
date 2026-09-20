'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu as MenuIcon,
  Search,
  Settings as SettingsIcon,
  User as UserIcon,
} from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { useSidebar } from './SidebarContext'
import { cn } from '@/lib/utils'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/collections': 'Collections',
  '/featured': 'Featured',
  '/revenue': 'Revenue',
  '/users': 'Users',
  '/settings': 'Settings',
  '/logs': 'Audit Log',
  '/account': 'Account',
}

export function Header({
  title,
  searchPlaceholder = 'Search...',
}: {
  title?: string
  searchPlaceholder?: string
}) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { setMobileOpen } = useSidebar()
  const [search, setSearch] = useState('')
  const displayTitle = title ?? pageTitles[pathname ?? ''] ?? 'Nexus Admin'

  return (
    <header className="sticky top-0 z-30">
      {/* Gradient accent bar — mirrors the Frontend header */}
      <div
        style={{
          height: '2px',
          background:
            'linear-gradient(90deg, transparent 0%, var(--accent) 24%, var(--accent-secondary) 52%, var(--accent) 78%, transparent 100%)',
          opacity: 0.7,
        }}
      />
      <div
        className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:gap-4 md:px-6"
        style={{
          background: 'rgba(8, 9, 13, 0.78)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <div className="flex min-w-0 items-center gap-1">
          {/* Hamburger — opens the drawer on mobile */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-2 rounded-lg p-2 transition-colors duration-150 md:hidden"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Open menu"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          <h1 className="truncate text-xl font-bold md:text-2xl" style={{ color: 'var(--text-primary)' }}>
            {displayTitle}
          </h1>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 max-w-md ml-auto md:gap-3">
        <div className="relative hidden max-w-xs sm:block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base py-1.5 pl-8 text-sm"
            aria-label="Search"
          />
        </div>

        {/* Notifications */}
        <button
          type="button"
          className="rounded-lg p-2 transition-colors duration-150"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}
          aria-label="Notifications"
        >
          <span className="relative inline-flex">
            <Bell className="h-5 w-5" />
            <span
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--accent)', boxShadow: '0 0 10px rgba(56,189,248,0.7)' }}
            />
          </span>
        </button>

        {/* User menu */}
        <Menu as="div" className="relative">
          <Menu.Button
            className="flex items-center gap-2 rounded-lg p-1.5 transition-colors duration-150 focus:outline-none"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            aria-label="User menu"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-line)' }}
            >
              {user?.displayName?.charAt(0)?.toUpperCase() ?? 'U'}
            </span>
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
          </Menu.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Menu.Items
              className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl py-1 focus:outline-none"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-primary)', boxShadow: '0 20px 50px rgba(0,0,0,0.42)' }}
            >
              {user?.displayName && (
                <div className="px-4 py-2 mb-1" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{user.displayName}</p>
                  <p className="text-xs capitalize" style={{ color: 'var(--text-tertiary)' }}>{user.role?.replace('_', ' ')}</p>
                </div>
              )}
              <Menu.Item>
                {({ active }) => (
                  <Link
                    href="/account"
                    className={cn('flex items-center gap-2 px-4 py-2 text-sm transition-colors duration-100')}
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', background: active ? 'var(--bg-hover)' : 'transparent' }}
                  >
                    <UserIcon className="h-4 w-4" />
                    Account &amp; security
                  </Link>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <Link
                    href="/settings"
                    className={cn('flex items-center gap-2 px-4 py-2 text-sm transition-colors duration-100')}
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', background: active ? 'var(--bg-hover)' : 'transparent' }}
                  >
                    <SettingsIcon className="h-4 w-4" />
                    Platform
                  </Link>
                )}
              </Menu.Item>
              <div style={{ height: '1px', background: 'var(--border-primary)', margin: '4px 0' }} />
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={logout}
                    className={cn('flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors duration-100')}
                    style={{ color: active ? 'var(--accent-error)' : '#f87171', background: active ? 'var(--bg-hover)' : 'transparent' }}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
        </div>
      </div>
    </header>
  )
}
