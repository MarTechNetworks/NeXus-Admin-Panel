import { Fragment, type ReactNode } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose} open={open}>
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
                'w-full rounded-lg bg-surface shadow-lg border border-border',
                sizeClasses[size]
              )}
            >
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                  {title}
                </h2>
              </div>
              <div className="px-6 py-4">{children}</div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
