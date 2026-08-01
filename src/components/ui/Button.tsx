import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

const sizeClasses = {
  sm: 'px-2 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        variantClasses[variant],
        size !== 'md' && sizeClasses[size],
        className
      )}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading}
      {...props}
    >
        {isLoading ? (
          <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : (
          leftIcon
        )}
        {children != null && children !== '' && <span>{children}</span>}
        {!isLoading && rightIcon}
      </button>
    )
  }
)

Button.displayName = 'Button'
