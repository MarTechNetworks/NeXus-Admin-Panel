'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface SidebarContextValue {
  /** Desktop-only: narrow rail vs full sidebar */
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  /** Mobile-only: drawer open/closed (off-canvas) */
  mobileOpen: boolean
  setMobileOpen: (value: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}
