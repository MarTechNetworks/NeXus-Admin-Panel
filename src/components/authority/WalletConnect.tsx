'use client'

/**
 * WalletConnect — the connect button and its picker modal.
 *
 * Everything on this page is signed by a key in a browser extension, so the
 * connect control is treated as a primary action in the hero rather than a
 * header afterthought: one button, one modal, and once connected it collapses
 * to the address that will actually sign.
 */
import { useState } from 'react'
import { Check, ChevronRight, Download, LogOut, Wallet } from 'lucide-react'
import { Modal } from '@/components/modals/Modal'
import { Button } from '@/components/ui/Button'
import { useWallet } from '@/lib/solana/wallet'
import { shortAddress } from '@/lib/authority/format'

export function WalletButton() {
  const { wallets, walletId, address, connect, disconnect, connecting, error } = useWallet()
  const [open, setOpen] = useState(false)

  if (address) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1"
        style={{ background: 'var(--success-soft)', border: '1px solid rgba(16,185,129,0.3)' }}
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: 'rgba(16,185,129,0.16)', color: 'var(--accent-success)' }}
        >
          <Check className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <span className="leading-tight">
          <span
            className="block font-mono text-xs font-semibold"
            style={{ color: 'var(--text-primary)' }}
            title={address}
          >
            {shortAddress(address, 4, 4)}
          </span>
          <span className="block text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>
            {walletId ?? 'wallet'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void disconnect()}
          className="ml-1 rounded-md p-2 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-error)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          aria-label="Disconnect wallet"
          title="Disconnect"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="primary"
        leftIcon={<Wallet className="h-4 w-4" />}
        isLoading={connecting}
        onClick={() => setOpen(true)}
      >
        Connect authority wallet
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Connect a wallet">
        <div className="space-y-2">
          {wallets.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={connecting}
              onClick={() => {
                if (!w.installed) {
                  window.open(w.url, '_blank', 'noopener')
                  return
                }
                void connect(w.id).then(() => setOpen(false))
              }}
              className="panel-subtle flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors disabled:opacity-60"
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-line)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
            >
              <span className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  <Wallet className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {w.name}
                  </span>
                  <span
                    className="block text-[11px]"
                    style={{ color: w.installed ? 'var(--accent-success)' : 'var(--text-muted)' }}
                  >
                    {w.installed ? 'Detected' : 'Not installed'}
                  </span>
                </span>
              </span>
              {w.installed ? (
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
              ) : (
                <Download className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              )}
            </button>
          ))}

          {error && (
            <p className="pt-1 text-xs" style={{ color: 'var(--accent-error)' }}>
              {error}
            </p>
          )}
          <p className="pt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            The console only ever asks for a signature — it never sees your key, and no transaction
            is sent without you approving it in the wallet.
          </p>
        </div>
      </Modal>
    </>
  )
}
