'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useSidebar } from './SidebarContext'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: ReactNode
  title?: string
  searchPlaceholder?: string
  breadcrumbs?: { label: string; href?: string }[]
  actions?: ReactNode
  className?: string
}

export function MainLayout({
  children,
  title,
  searchPlaceholder,
  breadcrumbs,
  actions,
  className,
}: MainLayoutProps) {
  const { collapsed } = useSidebar()

  return (
    <div className="min-h-screen text-text-primary">
      <Sidebar />
      <div
        className={cn(
          'flex flex-col transition-[margin] duration-200',
          collapsed ? 'md:ml-16' : 'md:ml-[16rem]'
        )}
      >
        <Header title={title} searchPlaceholder={searchPlaceholder} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {(breadcrumbs?.length ?? 0) > 0 && (
            <nav aria-label="Breadcrumb" className="mb-4">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
                {breadcrumbs?.map((b, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-border-primary">/</span>}
                    {b.href ? (
                      <Link
                        href={b.href}
                        className="transition-colors duration-150 hover:text-text-primary"
                      >
                        {b.label}
                      </Link>
                    ) : (
                      <span className="text-text-secondary">{b.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {actions && (
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}
          <div className={className}>{children}</div>
        </main>
      </div>
    </div>
  )
}
