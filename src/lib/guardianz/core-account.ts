/**
 * Minimal MPL Core account decoders — CollectionV1, AssetV1, and the plugin registry.
 *
 * Why hand-rolled instead of `@metaplex-foundation/mpl-core`: that package pulls in the
 * whole Umi stack, and all this page needs is four numbers and two booleans off two
 * account types. Every offset below was verified byte-for-byte against the live
 * GuardianZ accounts on mainnet before being written down.
 *
 * ── Account layout (Borsh, little-endian) ─────────────────────────────────────────
 *
 * CollectionV1:
 *   u8   key = 5
 *   [32] update_authority
 *   u32  name length + bytes
 *   u32  uri length + bytes
 *   u32  num_minted
 *   u32  current_size
 *   u8   key = 3 (PluginHeader)
 *   u64  plugin_registry_offset  → absolute offset of the registry within the account
 *   ...  plugin data blobs
 *   u8   key = 4 (PluginRegistry) at plugin_registry_offset
 *   u32  record count
 *   ...  records: { u8 plugin_type, Authority, u64 offset }
 *
 * AssetV1 is the same idea: key = 1, owner, then an *enum* update authority
 * (0 None / 1 Address / 2 Collection) rather than a bare pubkey.
 *
 * The subtlety that costs an hour if you miss it: a registry record's `offset` points at
 * a Borsh-serialised `Plugin` **enum**, so the first byte there is the variant tag and
 * the payload starts one byte later. Reading the payload at `offset` yields plausible
 * nonsense — a 609% royalty with 258 creators, in our case.
 */
import { PublicKey } from '@solana/web3.js'

/** `Plugin` enum variant tags, in mpl-core declaration order. */
export const PLUGIN_TYPE = {
  Royalties: 0,
  FreezeDelegate: 1,
  BurnDelegate: 2,
  TransferDelegate: 3,
  UpdateDelegate: 4,
  PermanentFreezeDelegate: 5,
  Attributes: 6,
  PermanentTransferDelegate: 7,
  PermanentBurnDelegate: 8,
  Edition: 9,
  MasterEdition: 10,
} as const

/** Who a plugin answers to. `Address` carries a pubkey; the rest are bare tags. */
export type PluginAuthority =
  | { kind: 'None' }
  | { kind: 'Owner' }
  | { kind: 'UpdateAuthority' }
  | { kind: 'Address'; address: PublicKey }

export interface PluginRecord {
  type: number
  authority: PluginAuthority
  /** Absolute offset of the Borsh `Plugin` enum — variant tag first, payload after. */
  offset: number
}

export interface Royalties {
  basisPoints: number
  creators: { address: PublicKey; percentage: number }[]
}

export interface CoreCollection {
  updateAuthority: PublicKey
  name: string
  uri: string
  numMinted: number
  currentSize: number
  plugins: PluginRecord[]
  royalties: Royalties | null
  /**
   * `null` when the collection carries no PermanentFreezeDelegate at all. `true` means
   * every asset in the collection is non-transferable right now — which is exactly the
   * state GuardianZ has been stuck in, and why its Magic Eden page shows no listings.
   */
  permanentlyFrozen: boolean | null
  /** Authority on the PermanentFreezeDelegate, i.e. who can thaw. */
  freezeAuthority: PluginAuthority | null
  /** Authority on the UpdateDelegate — the permission a mint needs. */
  updateDelegateAuthority: PluginAuthority | null
  /** Extra delegates appended to the UpdateDelegate plugin. Empty on GuardianZ today. */
  additionalDelegates: PublicKey[]
}

/** A cursor that reads Borsh primitives forward through a buffer. */
class Reader {
  constructor(
    private readonly buf: Buffer,
    public pos = 0,
  ) {}

  u8(): number {
    return this.buf[this.pos++]
  }

  u16(): number {
    const v = this.buf.readUInt16LE(this.pos)
    this.pos += 2
    return v
  }

  u32(): number {
    const v = this.buf.readUInt32LE(this.pos)
    this.pos += 4
    return v
  }

  u64(): number {
    const v = this.buf.readBigUInt64LE(this.pos)
    this.pos += 8
    // Offsets and counters here are account-sized; Number is exact well past any of them.
    return Number(v)
  }

  pubkey(): PublicKey {
    const v = new PublicKey(this.buf.subarray(this.pos, this.pos + 32))
    this.pos += 32
    return v
  }

  string(): string {
    const len = this.u32()
    const v = this.buf.subarray(this.pos, this.pos + len).toString('utf8')
    this.pos += len
    return v
  }

  authority(): PluginAuthority {
    const tag = this.u8()
    if (tag === 0) return { kind: 'None' }
    if (tag === 1) return { kind: 'Owner' }
    if (tag === 2) return { kind: 'UpdateAuthority' }
    return { kind: 'Address', address: this.pubkey() }
  }
}

function readRoyalties(buf: Buffer, offset: number): Royalties {
  // +1 skips the `Plugin::Royalties` variant tag.
  const r = new Reader(buf, offset + 1)
  const basisPoints = r.u16()
  const count = r.u32()
  const creators: Royalties['creators'] = []
  for (let i = 0; i < count; i++) {
    creators.push({ address: r.pubkey(), percentage: r.u8() })
  }
  return { basisPoints, creators }
}

export function decodeCoreCollection(data: Buffer): CoreCollection {
  const r = new Reader(data)
  const key = r.u8()
  if (key !== 5) {
    throw new Error(`Not a CollectionV1 account (key ${key}).`)
  }

  const updateAuthority = r.pubkey()
  const name = r.string()
  const uri = r.string()
  const numMinted = r.u32()
  const currentSize = r.u32()

  // A collection with no plugins simply ends here — no header, no registry.
  const plugins: PluginRecord[] = []
  let royalties: Royalties | null = null
  let permanentlyFrozen: boolean | null = null
  let freezeAuthority: PluginAuthority | null = null
  let updateDelegateAuthority: PluginAuthority | null = null
  let additionalDelegates: PublicKey[] = []

  if (r.pos < data.length && data[r.pos] === 3) {
    r.u8() // PluginHeader key
    const registryOffset = r.u64()

    const reg = new Reader(data, registryOffset)
    reg.u8() // PluginRegistry key
    const count = reg.u32()
    for (let i = 0; i < count; i++) {
      plugins.push({ type: reg.u8(), authority: reg.authority(), offset: reg.u64() })
    }

    for (const p of plugins) {
      if (p.type === PLUGIN_TYPE.Royalties) {
        royalties = readRoyalties(data, p.offset)
      } else if (p.type === PLUGIN_TYPE.PermanentFreezeDelegate) {
        // Payload is a single bool, one byte past the variant tag.
        permanentlyFrozen = data[p.offset + 1] === 1
        freezeAuthority = p.authority
      } else if (p.type === PLUGIN_TYPE.UpdateDelegate) {
        updateDelegateAuthority = p.authority
        const d = new Reader(data, p.offset + 1)
        const n = d.u32()
        additionalDelegates = Array.from({ length: n }, () => d.pubkey())
      }
    }
  }

  return {
    updateAuthority,
    name,
    uri,
    numMinted,
    currentSize,
    plugins,
    royalties,
    permanentlyFrozen,
    freezeAuthority,
    updateDelegateAuthority,
    additionalDelegates,
  }
}

export interface CoreAsset {
  owner: PublicKey
  /** `Collection` on every GuardianZ asset — which is why one key governs all 1,361. */
  updateAuthority: { kind: 'None' | 'Address' | 'Collection'; address: PublicKey | null }
  name: string
  uri: string
}

export function decodeCoreAsset(data: Buffer): CoreAsset {
  const r = new Reader(data)
  const key = r.u8()
  if (key !== 1) {
    throw new Error(`Not an AssetV1 account (key ${key}).`)
  }
  const owner = r.pubkey()
  const tag = r.u8()
  const kind = tag === 0 ? 'None' : tag === 1 ? 'Address' : 'Collection'
  const address = tag === 0 ? null : r.pubkey()
  return { owner, updateAuthority: { kind, address }, name: r.string(), uri: r.string() }
}

/** True when `authority` is an explicit `Address` equal to `pubkey`. */
export function authorityIs(authority: PluginAuthority | null, pubkey: string): boolean {
  return authority?.kind === 'Address' && authority.address.toBase58() === pubkey
}

/** Human label for an authority, for rendering. */
export function describeAuthority(authority: PluginAuthority | null): string {
  if (!authority) return 'none'
  if (authority.kind === 'Address') return authority.address.toBase58()
  return authority.kind
}
