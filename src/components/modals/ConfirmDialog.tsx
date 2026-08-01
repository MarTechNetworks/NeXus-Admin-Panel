import { Fragment, type ReactNode } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={onClose}
        open={open}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 dark:bg-black/60" aria-hidden="true" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel
              className={cn(
                'w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg',
                'border border-border'
              )}
            >
              <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {message}
              </Dialog.Description>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={onClose} disabled={isLoading}>
                  {cancelLabel}
                </Button>
                <Button
                  variant={variant === 'danger' ? 'danger' : 'primary'}
                  onClick={onConfirm}
                  isLoading={isLoading}
                >
                  {confirmLabel}
                </Button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
