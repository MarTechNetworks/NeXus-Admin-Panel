'use client'

import { SidebarProvider } from '@/components/layout/SidebarContext'
import { ProtectedRoute } from '@/lib/auth/ProtectedRoute'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <ProtectedRoute>{children}</ProtectedRoute>
    </SidebarProvider>
  )
}
