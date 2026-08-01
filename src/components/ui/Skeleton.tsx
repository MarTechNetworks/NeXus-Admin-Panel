import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md', className)}
      style={{ background: '#1f1f2e' }}
      aria-hidden
    />
  )
}

export function SkeletonKpi() {
  return (
    <div className="card p-4">
      <Skeleton className="mb-2 h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="mt-1 h-3 w-20" />
    </div>
  )
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <table className="min-w-full divide-y" style={{ borderColor: '#252535' }}>
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="px-4 py-3 text-left">
              <Skeleton className="h-4 w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y" style={{ borderColor: '#252535' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  )
}
