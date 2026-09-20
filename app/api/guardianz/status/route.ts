/**
 * GET /api/guardianz/status — live migration state for the creator console.
 *
 * Read server-side against mainnet so the browser never needs the RPC for reads, and
 * so the console and the public mint page (Frontend, same `readMigrationStatus`)
 * agree on what "done" means. No caching: the whole point is to see the new state
 * right after the creator signs.
 */
import { NextResponse } from 'next/server'

import { readMigrationStatus } from '@/lib/guardianz/migration-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await readMigrationStatus()
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } })
}
