'use client'

/**
 * wallet.tsx — a deliberately small wallet layer for the owner console.
 *
 * The public site uses @solana/wallet-adapter because it serves thousands of
 * buyers on every wallet under the sun. This app serves the handful of people
 * who hold the registry authority key, so it talks to the injected provider
 * directly: no adapter registry, no modal package, no CSS import, ~4kB.
 *
 * Supported: Phantom, Solflare, Backpack, and any provider that follows the same
 * `connect/disconnect/signTransaction` shape on `window.solana`.
 *
 * Auto-reconnect uses `connect({ onlyIfTrusted: true })`, which resolves only if
 * the site is already approved — it never pops a prompt on page load.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js'

// ── Injected provider shape ──────────────────────────────────────────────────

interface InjectedProvider {
  publicKey?: { toBytes(): Uint8Array; toString(): string } | null
  isConnected?: boolean
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toString(): string } }>
  disconnect(): Promise<void>
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>
  signAllTransactions?<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>
  on?(event: string, handler: (...args: unknown[]) => void): void
  off?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

interface WalletWindow extends Window {
  phantom?: { solana?: InjectedProvider }
  solflare?: InjectedProvider & { isSolflare?: boolean }
  backpack?: InjectedProvider
  solana?: InjectedProvider & { isPhantom?: boolean }
}

export interface WalletDefinition {
  id: string
  name: string
  /** Where to send someone who does not have it installed. */
  url: string
  resolve(win: WalletWindow): InjectedProvider | undefined
}

const WALLETS: WalletDefinition[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    url: 'https://phantom.app/download',
    resolve: (win) => win.phantom?.solana ?? (win.solana?.isPhantom ? win.solana : undefined),
  },
  {
    id: 'solflare',
    name: 'Solflare',
    url: 'https://solflare.com/download',
    resolve: (win) => win.solflare,
  },
  {
    id: 'backpack',
    name: 'Backpack',
    url: 'https://backpack.app/download',
    resolve: (win) => win.backpack,
  },
]

const LAST_WALLET_KEY = 'nexus_admin_wallet'

export interface DetectedWallet extends WalletDefinition {
  installed: boolean
}

interface WalletContextValue {
  /** Every wallet we know about, flagged with whether it is actually injected. */
  wallets: DetectedWallet[]
  /** Id of the connected wallet, or null. */
  walletId: string | null
  publicKey: PublicKey | null
  address: string | null
  connecting: boolean
  /** True once the auto-reconnect attempt has settled — gate UI on this to avoid flicker. */
  ready: boolean
  error: string | null
  connect(id: string): Promise<void>
  disconnect(): Promise<void>
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DetectedWallet[]>(
    WALLETS.map((w) => ({ ...w, installed: false })),
  )
  const [walletId, setWalletId] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const providerRef = useRef<InjectedProvider | null>(null)

  // Detect injected providers. Extensions inject asynchronously, so re-check for
  // a moment after mount rather than assuming the first read is the truth.
  useEffect(() => {
    const win = window as WalletWindow
    let cancelled = false

    const scan = () => {
      if (cancelled) return
      setWallets(WALLETS.map((w) => ({ ...w, installed: !!w.resolve(win) })))
    }

    scan()
    const timers = [100, 400, 1200].map((ms) => window.setTimeout(scan, ms))
    return () => {
      cancelled = true
      timers.forEach(window.clearTimeout)
    }
  }, [])

  const attach = useCallback((provider: InjectedProvider, id: string, key: PublicKey) => {
    providerRef.current = provider
    setWalletId(id)
    setPublicKey(key)
    localStorage.setItem(LAST_WALLET_KEY, id)
  }, [])

  const clear = useCallback(() => {
    providerRef.current = null
    setWalletId(null)
    setPublicKey(null)
    localStorage.removeItem(LAST_WALLET_KEY)
  }, [])

  const connect = useCallback(
    async (id: string) => {
      const win = window as WalletWindow
      const def = WALLETS.find((w) => w.id === id)
      const provider = def?.resolve(win)
      if (!def || !provider) {
        setError(`${def?.name ?? id} is not installed in this browser.`)
        return
      }
      setConnecting(true)
      setError(null)
      try {
        const res = await provider.connect()
        const raw = res?.publicKey?.toString() ?? provider.publicKey?.toString()
        if (!raw) throw new Error('Wallet returned no public key')
        attach(provider, id, new PublicKey(raw))
      } catch (e) {
        // Code 4001 is the standard "user rejected" — not worth a red banner.
        const msg = e instanceof Error ? e.message : 'Wallet connection failed'
        setError(/reject|denied|cancel/i.test(msg) ? null : msg)
      } finally {
        setConnecting(false)
      }
    },
    [attach],
  )

  const disconnect = useCallback(async () => {
    const provider = providerRef.current
    clear()
    try {
      await provider?.disconnect()
    } catch {
      // A provider that refuses to disconnect is still disconnected as far as
      // this app is concerned — the local state is already cleared.
    }
  }, [clear])

  // Silent reconnect on load for a wallet the user already approved.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const id = localStorage.getItem(LAST_WALLET_KEY)
      const win = window as WalletWindow
      const def = id ? WALLETS.find((w) => w.id === id) : undefined
      const provider = def?.resolve(win)
      if (!def || !provider) {
        if (!cancelled) setReady(true)
        return
      }
      try {
        const res = await provider.connect({ onlyIfTrusted: true })
        const raw = res?.publicKey?.toString() ?? provider.publicKey?.toString()
        if (raw && !cancelled) attach(provider, def.id, new PublicKey(raw))
      } catch {
        // Not trusted yet — the user connects explicitly.
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    // Give extensions a beat to inject before the trusted-connect attempt.
    const timer = window.setTimeout(run, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [attach])

  // Track account switches and in-wallet disconnects. Switching accounts while a
  // batch of pending changes is staged is exactly how you sign with the wrong key,
  // so the console re-checks authority whenever publicKey changes.
  useEffect(() => {
    const provider = providerRef.current
    if (!provider?.on) return

    const onAccountChanged = (...args: unknown[]) => {
      const next = args[0] as { toString(): string } | null | undefined
      if (!next) {
        clear()
        return
      }
      try {
        setPublicKey(new PublicKey(next.toString()))
      } catch {
        clear()
      }
    }
    const onDisconnect = () => clear()

    provider.on('accountChanged', onAccountChanged)
    provider.on('disconnect', onDisconnect)
    return () => {
      const off = provider.off ?? provider.removeListener
      off?.call(provider, 'accountChanged', onAccountChanged)
      off?.call(provider, 'disconnect', onDisconnect)
    }
  }, [walletId, clear])

  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      const provider = providerRef.current
      if (!provider) throw new Error('No wallet connected')
      return provider.signTransaction(tx)
    },
    [],
  )

  const value = useMemo<WalletContextValue>(
    () => ({
      wallets,
      walletId,
      publicKey,
      address: publicKey?.toBase58() ?? null,
      connecting,
      ready,
      error,
      connect,
      disconnect,
      signTransaction,
    }),
    [wallets, walletId, publicKey, connecting, ready, error, connect, disconnect, signTransaction],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
