import { clsx, type ClassValue } from 'clsx'

/** Merge class names with Tailwind-friendly deduplication */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/** Format date for display */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

/** Format relative time (e.g. "2 hours ago") */
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}
