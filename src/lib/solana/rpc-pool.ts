/**
 * rpc-pool.ts — browser-side failover across the RPC endpoints the backend serves.
 *
 * A copy of Frontend/lib/solana/rpc-pool.ts, for the same reason the IDL is copied: the two apps
 * deploy separately and neither imports from the other. Change one, change both.
 *
 * The backend does the scanning: it probes every known public endpoint for this cluster and hands
 * the survivors to the browser through GET /api/solana/config as `rpcUrls`, best first, plus
 * `sendRpcUrls` — the subset it has proven will actually accept a transaction. The browser's job
 * is only to use them: try the first, and on an endpoint-level failure (network error, timeout,
 * 429, 403, a provider saying "get a key") bench it for 30s and ask the next one.
 *
 * It plugs in as the `fetch` of a web3.js Connection, so every read in read-state.ts, every
 * simulate and every signature poll gets failover without a call site changing:
 *
 *     new Connection(cfg.rpcUrl, { commitment, fetch: rpcPoolFetch })
 *
 * The endpoint string stays `cfg.rpcUrl` on purpose. Wallet-adapter derives the *signing chain*
 * from `connection.rpcEndpoint`, so moving that string would ask the owner's wallet to sign
 * against the wrong network. Only the bytes move; the identity does not.
 *
 * Why the console needs this at all: `api.mainnet-beta.solana.com` serves this backend perfectly
 * and returns 403 to the very same call from a browser. Reading the chain over one hardcoded
 * endpoint meant every account came back null, which the console honestly reported as "the
 * program has not been set up on this network yet" — about a registry that was right there.
 *
 * A node's own verdict is never retried: a failed simulation, a program error, "blockhash not
 * found" read the same on every endpoint. Only the endpoint's own failures fail over.
 */

const COOLDOWN_MS = 30_000
/** How many endpoints one call may try before the last failure goes back to the caller. */
const MAX_ATTEMPTS = 4

/** Endpoints this tab is routing over, newest config wins. */
let readUrls: string[] = []
let sendUrls: string[] = []
/** url -> timestamp until which the endpoint is benched. */
const cooldowns = new Map<string, number>()

/**
 * Point the pool at the endpoints from GET /api/solana/config. Called by getChainConfig() as soon
 * as the payload lands; until then the pool is empty and falls back to the URL the Connection was
 * built with, which is exactly the old single-RPC behaviour.
 */
export function configureRpcPool(cfg: {
  rpcUrl: string
  rpcUrls?: string[]
  sendRpcUrls?: string[]
}): void {
  readUrls = cfg.rpcUrls?.length ? [...cfg.rpcUrls] : [cfg.rpcUrl]
  // A backend that predates sendRpcUrls serves none: fall back to the canonical RPC rather than
  // guessing that a read endpoint will accept transactions.
  sendUrls = cfg.sendRpcUrls?.length ? [...cfg.sendRpcUrls] : [cfg.rpcUrl]
}

/** What the pool is doing right now — for the console when the authority page misbehaves. */
export function rpcPoolStatus() {
  const now = Date.now()
  return {
    readUrls,
    sendUrls,
    benched: [...cooldowns.entries()]
      .filter(([, until]) => until > now)
      .map(([url, until]) => ({ url, secondsLeft: Math.ceil((until - now) / 1000) })),
  }
}

/**
 * The `fetch` to hand a Connection. Signature-compatible with the global one; the URL it is called
 * with is used only as the fallback when the pool has not been configured yet.
 */
export const rpcPoolFetch: typeof fetch = async (input, init) => {
  const fallback =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const body = typeof init?.body === 'string' ? init.body : ''
  const list = candidates(methodsOf(body), fallback)

  let lastError: unknown = new Error('No RPC endpoint available')
  let lastResponse: Response | null = null

  for (const url of list.slice(0, MAX_ATTEMPTS)) {
    try {
      const res = await fetch(url, init)

      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        bench(url, `HTTP ${res.status}`)
        lastResponse = res
        continue
      }

      const text = await res.text()
      if (text.includes('"error"') && isProviderRefusal(text)) {
        bench(url, 'provider refused the method')
        lastResponse = rebuild(res, text)
        continue
      }
      return rebuild(res, text)
    } catch (err) {
      // An aborted request is the caller giving up (a cancelled poll, an unmounted component), not
      // the endpoint failing. Benching on it would punish a healthy node for a React re-render.
      if (isAbort(err)) throw err
      lastError = err
      bench(url, err)
    }
  }

  if (lastResponse) return lastResponse
  throw lastError
}

/** Endpoints to try for these methods: the send list for a send, the read list otherwise. */
function candidates(methods: string[], fallback: string): string[] {
  const pool = methods.includes('sendTransaction') ? sendUrls : readUrls
  const list = pool.length ? pool : [fallback]
  const now = Date.now()
  const ready = list.filter((url) => (cooldowns.get(url) ?? 0) <= now)
  // Everything benched at once (a flaky connection, say) is not a reason to stop trying: fall back
  // to the full list rather than returning nothing.
  return ready.length ? ready : list
}

function bench(url: string, reason: unknown) {
  cooldowns.set(url, Date.now() + COOLDOWN_MS)
  const detail = reason instanceof Error ? reason.message : String(reason)
  console.warn(`[rpc-pool] ${host(url)} benched ${COOLDOWN_MS / 1000}s: ${detail.slice(0, 160)}`)
}

/** The methods in a JSON-RPC body — web3.js batches, so this handles an array as well. */
function methodsOf(body: string): string[] {
  if (!body) return []
  try {
    const parsed = JSON.parse(body) as { method?: string } | { method?: string }[]
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list.map((p) => p?.method).filter((m): m is string => typeof m === 'string')
  } catch {
    return []
  }
}

/**
 * Whether an error body is the provider talking about itself rather than the node answering the
 * request. Only these are worth asking a different endpoint.
 */
function isProviderRefusal(text: string): boolean {
  const body = text.slice(0, 4_000)
  return /-32029|-32005|too many requests|rate limit|-32601|method not found|is not available|requires a personal token|requires an api key|must authenticate|paid plan/i.test(
    body,
  )
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : (err as { name?: string })?.name === 'AbortError'
}

/**
 * A Response whose body was read for inspection, handed back intact to the caller. The body is
 * already decoded text, so the headers describing how it *was* encoded must not travel with it.
 */
function rebuild(res: Response, text: string): Response {
  const headers = new Headers(res.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  return new Response(text, { status: res.status, statusText: res.statusText, headers })
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
