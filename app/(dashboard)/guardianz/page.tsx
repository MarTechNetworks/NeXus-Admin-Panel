'use client'

/**
 * /guardianz — the BlockChain GuardianZ creator console.
 *
 * Like /authority, this page signs on-chain with a browser wallet instead of writing
 * to the backend. Unlike it, the key that matters is not a platform role but one
 * specific wallet — the collection's update authority — and the cluster is always
 * mainnet. Both gates apply: an admin login to reach the page, and that wallet to
 * make any button do anything.
 */
import { MainLayout } from '@/components/layout/MainLayout'
import { GuardianzConsole } from '@/components/guardianz/GuardianzConsole'
import { WalletProvider } from '@/lib/solana/wallet'
import { useAuth } from '@/lib/auth/context'

export default function GuardianzPage() {
  const { hasPermission, isLoading } = useAuth()

  return (
    <MainLayout breadcrumbs={[{ label: 'GuardianZ' }]}>
      {isLoading ? null : hasPermission('collections:write') ? (
        <WalletProvider>
          <GuardianzConsole />
        </WalletProvider>
      ) : (
        <div className="card p-6">
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Not available for your role
          </h1>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            This console signs mainnet transactions for the GuardianZ collection and is limited to
            admins who can manage collections.
          </p>
        </div>
      )}
    </MainLayout>
  )
}
