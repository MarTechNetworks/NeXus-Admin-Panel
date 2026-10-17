/**
 * rpc.ts — how GuardianZ reaches mainnet.
 *
 * GuardianZ used to dial `GUARDIANZ_RPC_URL` directly, defaulting to
 * `https://api.mainnet-beta.solana.com`, because the rest of the app was pointed at devnet and a
 * devnet connection here would report the collection as nonexistent. That default is the one
 * endpoint a browser cannot use: Solana's public node answers this origin with
 * `403 Access forbidden` on every call, which surfaced on the console as
 * "failed to get recent blockhash: Error: 403".
 *
 * So the bytes now go through the same pool everything else uses — the backend probes the known
 * mainnet endpoints and publishes the ones that answer a browser, and `rpcPoolFetch` fails over
 * between them. The original safety rule still holds and is why this is a function and not a
 * constant: the pool is adopted **only** when the backend reports `mainnet-beta`. If the platform
 * is ever pointed back at devnet, GuardianZ keeps its own endpoint rather than inheriting one
 * that would answer every lookup with "no such collection".
 *
 * An explicitly configured `GUARDIANZ_RPC_URL` (a paid endpoint) is a human vouching for an
 * endpoint and is left alone — it is dialled directly, with no pool and no failover.
 */
import { Connection } from '@solana/web3.js'

import { getChainConfig } from '@/lib/solana/chain-config'
import { rpcPoolFetch } from '@/lib/solana/rpc-pool'
import { GUARDIANZ_RPC_URL } from '@/lib/guardianz/constants'

/** Whether an endpoint was named in env, mirroring how constants.ts resolves it. */
const PINNED = Boolean(
  process.env.GUARDIANZ_RPC_URL ?? process.env.NEXT_PUBLIC_GUARDIANZ_RPC_URL,
)

/** Resolved once per tab: is the configured cluster the one GuardianZ lives on? */
let onMainnet: Promise<boolean> | null = null

function poolIsMainnet(): Promise<boolean> {
  // getChainConfig() is what hands the endpoint list to the pool, so this also configures it.
  onMainnet ??= getChainConfig()
    .then((cfg) => cfg.network === 'mainnet-beta')
    .catch(() => false)
  return onMainnet
}

/**
 * The `fetch` behind every GuardianZ connection. Async by nature, so it can wait for the config
 * on the first call and route every later one without blocking.
 */
export const guardianzFetch: typeof fetch = async (input, init) => {
  if (!PINNED && (await poolIsMainnet())) return rpcPoolFetch(input, init)
  return fetch(input, init)
}

/**
 * A Connection on GuardianZ's cluster. `GUARDIANZ_RPC_URL` stays the endpoint string — wallets
 * read `connection.rpcEndpoint` to decide which chain they are signing for — while the pool
 * decides where the bytes actually go.
 */
export function guardianzConnection(): Connection {
  return new Connection(GUARDIANZ_RPC_URL, { commitment: 'confirmed', fetch: guardianzFetch })
}