/**
 * chain-config.ts — the backend is the config authority, here too.
 *
 * GET /api/solana/config hands back the program id, RPC url and platform wallet
 * the deployment is actually running against. Nothing chain-related is hardcoded
 * in this app; switching networks is a backend env change.
 */
import { Connection } from '@solana/web3.js'

export interface ChainConfig {
  network: 'localnet' | 'devnet' | 'testnet' | 'mainnet-beta'
  rpcUrl: string
  commitment: 'processed' | 'confirmed' | 'finalized'
  programId: string
  mplCoreProgramId: string
  allowlistProgramId: string
  platformFeeBps: number
  freeMintPlatformFeeLamports: number
  freeMintPlatformFeeSol: number
  platformWallet: string
  platformFeeSplit?: Array<{ address: string; shareBps: number }>
  feeModel: 'additive' | 'subtractive'
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

let cached: ChainConfig | null = null
let inFlight: Promise<ChainConfig> | null = null

export async function getChainConfig(): Promise<ChainConfig> {
  if (cached) return cached
  if (!inFlight) inFlight = fetchChainConfig()
  try {
    cached = await inFlight
    return cached
  } finally {
    inFlight = null
  }
}

export function clearChainConfigCache() {
  cached = null
  inFlight = null
}

async function fetchChainConfig(): Promise<ChainConfig> {
  const res = await fetch(`${API_BASE}/api/solana/config`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(
      `Could not load chain config (${res.status} ${res.statusText}). ` +
        'Check NEXT_PUBLIC_API_URL and that the backend is reachable.',
    )
  }
  const json = await res.json()
  if (!json?.success || !json?.data) {
    throw new Error('Unexpected /api/solana/config response shape')
  }
  return json.data as ChainConfig
}

// One Connection per rpcUrl for the tab's lifetime — creating a new Connection
// per render would drop the RPC's internal request coalescing on the floor.
const connections = new Map<string, Connection>()

export function getConnection(cfg: ChainConfig): Connection {
  const key = `${cfg.rpcUrl}|${cfg.commitment}`
  let conn = connections.get(key)
  if (!conn) {
    conn = new Connection(cfg.rpcUrl, cfg.commitment)
    connections.set(key, conn)
  }
  return conn
}
