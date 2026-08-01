import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  className?: string
  sortable?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  emptyMessage?: string
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No data',
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border', className)}>
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="transition-colors hover:bg-surface-muted/50"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100',
                      col.className
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
