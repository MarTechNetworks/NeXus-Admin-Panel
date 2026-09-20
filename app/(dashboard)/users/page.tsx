'use client'

import { useMemo, useState } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/tables/DataTable'
import { Modal } from '@/components/modals/Modal'
import { ConfirmDialog } from '@/components/modals/ConfirmDialog'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAdminUsers, useCreateAdminUser, useUpdateAdminUser } from '@/lib/api/hooks'
import { useAuth } from '@/lib/auth/context'
import { formatDate } from '@/lib/utils'
import type { AdminRole, AdminUser } from '@/lib/types'
import { KeyRound, Pencil, ShieldAlert, UserPlus } from 'lucide-react'

const TEXT = '#ffffff'
const SUB = '#8a8a9a'
const GRID = '#252535'
const CYAN = '#00d4ff'

// Mirrors AdminRole in Backend/src/database/entities/admin-user.entity.ts. The
// backend validates with @IsEnum, so these strings have to match exactly.
const ROLES: { value: AdminRole; label: string; blurb: string; color: string }[] = [
  { value: 'super_admin', label: 'Super admin', blurb: 'Everything, including managing these accounts', color: '#ef4444' },
  { value: 'finance', label: 'Finance', blurb: 'Revenue, exports and read-only elsewhere', color: '#10b981' },
  { value: 'moderator', label: 'Moderator', blurb: 'Feature, pause and remove collections', color: '#f59e0b' },
  { value: 'read_only', label: 'Read only', blurb: 'Can look, cannot touch', color: '#8a8a9a' },
]

const ROLE_META = Object.fromEntries(ROLES.map((r) => [r.value, r])) as Record<
  AdminRole,
  (typeof ROLES)[number]
>

// The backend enforces a minimum of 8 characters (@MinLength(8) on both DTOs).
const MIN_PASSWORD = 8

function RoleChip({ role }: { role: AdminRole }) {
  const meta = ROLE_META[role]
  const color = meta?.color ?? SUB
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}40` }}
    >
      {meta?.label ?? role}
    </span>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: SUB }}>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: SUB }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function errorMessage(err: unknown): string {
  if (!err) return ''
  // The api client throws a plain { message, code, status } object, not an Error.
  const m = (err as { message?: unknown }).message
  return typeof m === 'string' ? m : 'Something went wrong'
}

export default function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth()
  const canWrite = hasPermission('users:write')

  const { data: users, isLoading, error, refetch } = useAdminUsers({ enabled: canWrite })
  const createUser = useCreateAdminUser()
  const updateUser = useUpdateAdminUser()

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const [pwTarget, setPwTarget] = useState<AdminUser | null>(null)
  const [toggleTarget, setToggleTarget] = useState<AdminUser | null>(null)

  // Create form
  const [form, setForm] = useState({ email: '', displayName: '', password: '', role: 'read_only' as AdminRole })
  // Edit form
  const [editForm, setEditForm] = useState({ displayName: '', role: 'read_only' as AdminRole })
  // Password reset
  const [newPassword, setNewPassword] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = users ?? []
    if (!q) return list
    return list.filter(
      (u) => u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
    )
  }, [users, search])

  function openCreate() {
    setForm({ email: '', displayName: '', password: '', role: 'read_only' })
    createUser.reset()
    setCreateOpen(true)
  }

  function openEdit(u: AdminUser) {
    setEditForm({ displayName: u.displayName, role: u.role })
    updateUser.reset()
    setEditTarget(u)
  }

  function openPasswordReset(u: AdminUser) {
    setNewPassword('')
    updateUser.reset()
    setPwTarget(u)
  }

  const createValid =
    /.+@.+\..+/.test(form.email) && form.displayName.trim().length > 0 && form.password.length >= MIN_PASSWORD

  function submitCreate() {
    if (!createValid) return
    createUser.mutate(
      {
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        password: form.password,
        role: form.role,
      },
      { onSuccess: () => setCreateOpen(false) }
    )
  }

  function submitEdit() {
    if (!editTarget || !editForm.displayName.trim()) return
    updateUser.mutate(
      {
        id: editTarget.id,
        data: { displayName: editForm.displayName.trim(), role: editForm.role },
      },
      { onSuccess: () => setEditTarget(null) }
    )
  }

  function submitPassword() {
    if (!pwTarget || newPassword.length < MIN_PASSWORD) return
    updateUser.mutate(
      { id: pwTarget.id, data: { password: newPassword } },
      { onSuccess: () => setPwTarget(null) }
    )
  }

  function submitToggle() {
    if (!toggleTarget) return
    updateUser.mutate(
      { id: toggleTarget.id, data: { disabled: !toggleTarget.disabled } },
      { onSuccess: () => setToggleTarget(null) }
    )
  }

  // Only super_admin can reach GET/POST/PATCH /api/admin/auth/users — the backend
  // returns 403 for everyone else. Say so plainly instead of rendering a table
  // that can only ever show an error.
  if (!canWrite) {
    return (
      <MainLayout breadcrumbs={[{ label: 'Admin Users' }]}>
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Super admin only"
          description="Managing admin accounts requires the super_admin role. Ask an existing super admin to make the change for you."
        />
      </MainLayout>
    )
  }

  const columns = [
    {
      key: 'displayName',
      header: 'Name',
      render: (row: AdminUser) => (
        <div>
          <div className="font-medium" style={{ color: TEXT }}>
            {row.displayName}
            {row.id === currentUser?.id && (
              <span className="ml-2 text-xs font-normal" style={{ color: CYAN }}>
                you
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: SUB }}>
            {row.email}
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row: AdminUser) => <RoleChip role={row.role} /> },
    {
      key: 'disabled',
      header: 'Status',
      render: (row: AdminUser) => (
        <span className="text-sm" style={{ color: row.disabled ? '#f59e0b' : '#10b981' }}>
          {row.disabled ? 'Disabled' : 'Active'}
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      render: (row: AdminUser) => (
        <span className="text-sm" style={{ color: SUB }}>
          {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: AdminUser) => {
        const isSelf = row.id === currentUser?.id
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(row)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<KeyRound className="h-3.5 w-3.5" />}
              onClick={() => openPasswordReset(row)}
            >
              Password
            </Button>
            <Button
              variant="ghost"
              size="sm"
              // Locking yourself out of the only super-admin account is not a
              // recoverable mistake from inside this UI.
              disabled={isSelf}
              title={isSelf ? 'You cannot disable your own account' : undefined}
              onClick={() => setToggleTarget(row)}
              style={{ color: isSelf ? SUB : row.disabled ? '#10b981' : '#ef4444' }}
            >
              {row.disabled ? 'Enable' : 'Disable'}
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <MainLayout
      breadcrumbs={[{ label: 'Admin Users' }]}
      actions={
        <>
          <Button variant="secondary" onClick={() => refetch()}>
            Refresh
          </Button>
          <Button variant="primary" leftIcon={<UserPlus className="h-4 w-4" />} onClick={openCreate}>
            New admin
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm" style={{ color: SUB }}>
        Console accounts, not wallet owners. Every change here is written to the{' '}
        <a href="/logs" style={{ color: CYAN }}>
          audit log
        </a>
        .
      </p>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-base max-w-xs"
          aria-label="Search admin users"
        />
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
        >
          {errorMessage(error)}
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No matching admins' : 'No admin accounts'}
          description={
            search
              ? 'Nothing matches that search.'
              : 'Seed the first super admin with ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD on the backend, then add the rest here.'
          }
          action={
            !search && (
              <Button variant="primary" onClick={openCreate}>
                New admin
              </Button>
            )
          }
        />
      ) : (
        <DataTable columns={columns} data={filtered} keyExtractor={(row) => row.id} emptyMessage="No admins" />
      )}

      {/* ── Create ─────────────────────────────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New admin" size="md">
        <div className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input-base w-full"
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Display name">
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              className="input-base w-full"
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Temporary password" hint={`At least ${MIN_PASSWORD} characters. Share it out of band.`}>
            <input
              type="text"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="input-base w-full font-mono"
            />
          </Field>
          <Field label="Role">
            <div className="space-y-1.5">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
                  style={{
                    background: form.role === r.value ? 'rgba(0,212,255,0.08)' : 'transparent',
                    border: `1px solid ${form.role === r.value ? 'rgba(0,212,255,0.35)' : GRID}`,
                  }}
                >
                  <span>
                    <span className="block text-sm font-medium" style={{ color: TEXT }}>
                      {r.label}
                    </span>
                    <span className="block text-xs" style={{ color: SUB }}>
                      {r.blurb}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {createUser.error && (
            <p className="text-sm" style={{ color: '#f87171' }}>
              {errorMessage(createUser.error)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!createValid} isLoading={createUser.isPending} onClick={submitCreate}>
              Create admin
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit ───────────────────────────────────────────────────────────── */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit ${editTarget?.displayName ?? ''}`} size="md">
        <div className="space-y-4">
          <Field label="Display name">
            <input
              type="text"
              value={editForm.displayName}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              className="input-base w-full"
            />
          </Field>
          <Field
            label="Role"
            hint={
              editTarget?.id === currentUser?.id
                ? 'Careful: demoting yourself takes effect on your next request.'
                : undefined
            }
          >
            <div className="space-y-1.5">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setEditForm((f) => ({ ...f, role: r.value }))}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
                  style={{
                    background: editForm.role === r.value ? 'rgba(0,212,255,0.08)' : 'transparent',
                    border: `1px solid ${editForm.role === r.value ? 'rgba(0,212,255,0.35)' : GRID}`,
                  }}
                >
                  <span>
                    <span className="block text-sm font-medium" style={{ color: TEXT }}>
                      {r.label}
                    </span>
                    <span className="block text-xs" style={{ color: SUB }}>
                      {r.blurb}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {updateUser.error && (
            <p className="text-sm" style={{ color: '#f87171' }}>
              {errorMessage(updateUser.error)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!editForm.displayName.trim()}
              isLoading={updateUser.isPending}
              onClick={submitEdit}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Password reset ─────────────────────────────────────────────────── */}
      <Modal open={!!pwTarget} onClose={() => setPwTarget(null)} title={`Set password for ${pwTarget?.displayName ?? ''}`} size="md">
        <div className="space-y-4">
          <Field label="New password" hint={`At least ${MIN_PASSWORD} characters. Their existing sessions are signed out and they get an email saying who did it.`}>
            <input
              type="text"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-base w-full font-mono"
            />
          </Field>

          {updateUser.error && (
            <p className="text-sm" style={{ color: '#f87171' }}>
              {errorMessage(updateUser.error)}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPwTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={newPassword.length < MIN_PASSWORD}
              isLoading={updateUser.isPending}
              onClick={submitPassword}
            >
              Set password
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Enable / disable ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={submitToggle}
        title={toggleTarget?.disabled ? 'Enable admin' : 'Disable admin'}
        message={
          toggleTarget ? (
            toggleTarget.disabled ? (
              <>Re-enable {toggleTarget.displayName}? They will be able to sign in again.</>
            ) : (
              <>
                Disable {toggleTarget.displayName}? They will be refused at login. Accounts are never deleted, so the
                audit trail stays intact.
              </>
            )
          ) : (
            ''
          )
        }
        confirmLabel={toggleTarget?.disabled ? 'Enable' : 'Disable'}
        variant={toggleTarget?.disabled ? 'primary' : 'danger'}
        isLoading={updateUser.isPending}
      />
    </MainLayout>
  )
}
