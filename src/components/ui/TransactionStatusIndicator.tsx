import { cn } from '@/lib/utils'
import type { TransactionStatus } from '@/lib/types'

interface TransactionStatusIndicatorProps {
  status: TransactionStatus
  label?: string
  className?: string
}

const statusConfig: Record<
  TransactionStatus,
  { dot: string; text: string; label: string }
> = {
  pending: {
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Pending',
  },
  confirming: {
    dot: 'bg-blue-500 animate-pulse',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Confirming',
  },
  confirmed: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'Confirmed',
  },
  failed: {
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    label: 'Failed',
  },
}

export function TransactionStatusIndicator({
  status,
  label,
  className,
}: TransactionStatusIndicatorProps) {
  const config = statusConfig[status] ?? statusConfig.pending
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium',
        config.text,
        className
      )}
    >
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', config.dot)}
        aria-hidden
      />
      {label ?? config.label}
    </span>
  )
}
