/**
 * BlockChain GuardianZ — migration constants.
 *
 * Every value here was read off Solana mainnet, not copied from a spec sheet. The
 * collection was launched through LaunchMyNFT, stalled at 1,361 of 7,575, and is
 * currently frozen for transfer — the migration moves the *remaining* mint onto NeXus
 * without touching a single existing NFT.
 *
 * ── Why this lives in its own folder ──────────────────────────────────────────────
 * This is a one-off rescue of a foreign collection on **mainnet**, while the rest of
 * the site talks to our own program on **devnet** via `/api/solana/config`. Sharing
 * `lib/solana/*` would mean teaching every helper there about "sometimes the collection
 * isn't ours and sometimes the cluster isn't the configured one" — which is how the
 * live mint flow gets broken by a migration nobody else uses. So: separate constants,
 * separate decoders, separate route. Nothing under `lib/solana/` imports from here.
 */

/**
 * The MPL Core collection asset. This is the collection's on-chain identity — the
 * thing Magic Eden and Tensor key off. Preserving it is the entire point of the
 * migration: mint into *this*, and the 6,214 new NFTs land in the same collection as
 * the existing 1,361, with the same royalties and the same market page.
 */
export const GUARDIANZ_COLLECTION = '5Xt95jj1av4HN5jLMrQj9zZUnCdKaTHqXKkSkegyrT1K'

/** Canonical MPL Core program. Really deployed on mainnet, so no override needed. */
export const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'

/**
 * The collection's `update_authority` — MarTech's wallet, confirmed by him directly
 * and matching the wallet in his LaunchMyNFT profile.
 *
 * This is the key that makes the migration possible at all: it can mint into the
 * collection, rewrite metadata on every asset, and grant or revoke plugin delegates.
 * LaunchMyNFT does not hold it.
 */
export const CREATOR_WALLET = 'Fbfr8aJGfa6tZEjsFt6nLfYpqhtUnfRmsCrCjv5w5WdJ'

/**
 * LaunchMyNFT's mint program, and the config PDA it created for this collection.
 *
 * The PDA is what actually sits in the collection's UpdateDelegate and
 * PermanentFreezeDelegate plugins — so "LaunchMyNFT controls the freeze" means, more
 * precisely, "only a program owned by `LMN_PROGRAM_ID` can sign as `LMN_CONFIG_PDA`".
 */
export const LMN_PROGRAM_ID = 'F9SixdqdmEBP5kprp2gZPZNeMmfHJRCTMFjN22dx3akf'
export const LMN_CONFIG_PDA = 'AjGm1Q5LEiZcjUkU98LMkipeZgA1q2qWuNHxEU4EorJo'

/** LaunchMyNFT's fee wallet — took 2.5% of every mint. Absent from the NeXus path. */
export const LMN_FEE_WALLET = '33nQCgievSd3jJLSWFBefH3BJRN7h6sAoS82VFFdJGF5'

/** 2.5%, as observed on a real `MintCore` transaction (0.00625 of a 0.25 SOL mint). */
export const LMN_FEE_BPS = 250

/**
 * Collection size, from LaunchMyNFT's config account and corroborated twice: the
 * metadata directory holds exactly `0.json … 7574.json`, and every JSON's description
 * reads "7575 of The BaDDest DawgZ on Da BlockChain".
 */
export const TOTAL_SUPPLY = 7575

/**
 * What LaunchMyNFT minted before the fallout. Kept as a constant only to describe the
 * migration's starting point in copy — anything that decides behaviour must read the
 * live `num_minted` off the collection account instead, because this number moves the
 * moment our own mint goes live.
 */
export const MINTED_AT_HANDOVER = 1361

/** Original mint price, from the config account: 250,000,000 lamports. */
export const ORIGINAL_PRICE_LAMPORTS = 250_000_000

/**
 * The collection's mint phases, decoded from LaunchMyNFT's config account.
 *
 * There is exactly one, and it never closed — the mint stalled, it did not end:
 *
 *   offset 323  u32 phase count      = 1
 *   offset 327  i64 start            = 1744057821  (2025-04-07T20:30:21Z)
 *   offset 335  u64 price (lamports) = 250000000
 *   offset 361  u32 len + utf8 name  = "DawG Pound"
 *
 * Continuing under the same name, price and terms is the whole point: buyers are
 * finishing the original mint, not joining a different one. So this is carried across
 * verbatim rather than replaced with a "NeXus phase".
 */
export const ORIGINAL_PHASE = {
  name: 'DawG Pound',
  /** No allowlist root is set on the phase — it is and always was a public mint. */
  phaseType: 'public' as const,
  startUnix: 1744057821,
  priceLamports: ORIGINAL_PRICE_LAMPORTS,
} as const

/** Royalty enforced by the collection's Royalties plugin: 750 bps, 100% to the creator. */
export const ROYALTY_BPS = 750

/**
 * Metadata and image bases.
 *
 * Note the shape mismatch that defines the whole reveal: `<n>.json` does **not**
 * describe token #n. `0.json` is named "2030"; the asset displayed as "3465" points at
 * `799.json`. LaunchMyNFT shuffled the reveal, so the only way to know which files are
 * still unminted is to read every minted asset's URI and diff against 0…7574. That is
 * what `scripts/guardianz-snapshot.mjs` does.
 */
export const METADATA_BASE =
  'https://gateway.pinit.io/ipfs/QmQ83S7wpaUikQW3mj1EesMcharfnfKCJ72SReyEQ22FnA'
export const IMAGE_BASE =
  'https://na-assets.pinit.io/Fbfr8aJGfa6tZEjsFt6nLfYpqhtUnfRmsCrCjv5w5WdJ/6420b293-85c4-4a7b-aaf8-c2c93671e811'

/** Highest metadata index. Files are `0.json … 7574.json` inclusive. */
export const MAX_METADATA_INDEX = TOTAL_SUPPLY - 1

/**
 * Mainnet RPC for this page only.
 *
 * The rest of the site reads its endpoint from `/api/solana/config`, which points at
 * devnet. GuardianZ is a real mainnet collection, so it needs its own endpoint and must
 * never inherit the configured one — a devnet connection here would report the
 * collection as nonexistent and the page would confidently render "not found".
 *
 * The public endpoint works but is rate-limited; set `GUARDIANZ_RPC_URL` to a paid one
 * before this page sees traffic.
 */
export const GUARDIANZ_RPC_URL =
  process.env.GUARDIANZ_RPC_URL ??
  process.env.NEXT_PUBLIC_GUARDIANZ_RPC_URL ??
  'https://api.mainnet-beta.solana.com'

/**
 * Socials for the mint page, per MarTech (2026-09-11): the collection's X account, the
 * MarTech Networks Discord and the collection website — and only those. The company
 * and platform accounts (@martechnetworks, @NeXusLaunchTech) were deliberately left off.
 */
export const COLLECTION_X_URL = 'https://x.com/BCGuardianZ'
export const DISCORD_URL = 'https://discord.com/invite/EugPqnJZ8S'
export const WEBSITE_URL = 'https://bcguardianz.xyz/'

/** Marketplace links, for the "nothing about this is hypothetical" panel. */
export const MAGIC_EDEN_URL = 'https://magiceden.io/marketplace/blockchain_guardianz'
export const SOLSCAN_COLLECTION_URL = `https://solscan.io/token/${GUARDIANZ_COLLECTION}`
