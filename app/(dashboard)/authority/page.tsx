'use client'

/**
 * /authority — the on-chain owner console.
 *
 * Distinct from every other page in this app: the rest read and write the
 * backend database, this one reads and writes the Solana program directly with a
 * wallet signature. Nothing here touches the API except to borrow collection
 * names.
 */
import { MainLayout } from '@/components/layout/MainLayout'
import { AuthorityConsole } from '@/components/authority/AuthorityConsole'
import { WalletProvider } from '@/lib/solana/wallet'
import { useAuth } from '@/lib/auth/context'

export default function AuthorityPage() {
  const { hasPermission, isLoading } = useAuth()

  return (
    <MainLayout breadcrumbs={[{ label: 'Fees & minting' }]}>
      {isLoading ? null : hasPermission('settings:write') ? (
        <WalletProvider>
          <AuthorityConsole />
        </WalletProvider>
      ) : (
        <div className="card p-6">
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Not available for your role
          </h1>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            This page changes platform-wide fees and can pause all minting, so it is limited to
            super admins. Ask one of them to make the change.
          </p>
        </div>
      )}
    </MainLayout>
  )
}
