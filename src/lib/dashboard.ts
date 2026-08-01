import {
  Activity,
  CheckCircle2,
  PauseCircle,
  Play,
  RefreshCw,
  Rocket,
  Settings as SettingsIcon,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

// Status → accent color, shared by the status donut and any status badges.
export const STATUS_COLORS: Record<string, string> = {
  minting: '#10b981',
  ready: '#00d4ff',
  completed: '#7c3aed',
  preparing: '#3b82f6',
  paused: '#f59e0b',
  draft: '#6a6a7a',
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#6a6a7a'
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// Map a dotted activity action (e.g. "collection.deployed") to an icon, accent
// color and a human verb for the activity feed.
export function actionVisual(action: string): { icon: LucideIcon; color: string; verb: string } {
  const a = (action ?? '').toLowerCase()
  if (a.includes('deploy')) return { icon: Rocket, color: '#00d4ff', verb: 'deployed' }
  if (a.includes('featur')) return { icon: Star, color: '#f59e0b', verb: 'featured' }
  if (a.includes('sync')) return { icon: RefreshCw, color: '#7c3aed', verb: 'synced' }
  if (a.includes('pause')) return { icon: PauseCircle, color: '#f59e0b', verb: 'paused' }
  if (a.includes('resume') || a.includes('restore')) return { icon: Play, color: '#10b981', verb: 'resumed' }
  if (a.includes('complet')) return { icon: CheckCircle2, color: '#10b981', verb: 'completed' }
  if (a.includes('delet') || a.includes('remove')) return { icon: Trash2, color: '#ef4444', verb: 'removed' }
  if (a.includes('setting') || a.includes('config') || a.includes('update')) {
    return { icon: SettingsIcon, color: '#8a8a9a', verb: 'updated' }
  }
  // Fallback: humanize the last segment of the dotted action.
  const verb = a.split('.').pop()?.replace(/_/g, ' ') || 'activity'
  return { icon: Activity, color: '#8a8a9a', verb }
}

// Time-of-day greeting. Pass the current hour from the caller so it can be
// computed after mount (avoids SSR/CSR hydration mismatch).
export function timeGreeting(hour: number): string {
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// `makeSeries()` lived here: a synthesized micro-trend used to give KPI
// sparklines a shape when no timeseries was available. It was decorative data
// presented in the same visual language as measured data, so it is gone.
// Sparklines now render only from the fee ledger, and StatCard falls back to a
// plain text sub-label when there is nothing real to draw.
