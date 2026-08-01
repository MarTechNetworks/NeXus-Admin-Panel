import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SectionHeading({
  children,
  actions,
  className,
}: {
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-center justify-between gap-2', className)}>
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8a8a9a' }}>
        {children}
      </h2>
      {actions}
    </div>
  )
}
