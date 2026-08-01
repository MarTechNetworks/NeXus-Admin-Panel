import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 px-6 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-gray-400 dark:text-gray-500" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
