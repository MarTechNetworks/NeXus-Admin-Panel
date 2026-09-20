import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { endpoints } from './endpoints'
import { api } from './client'
import type {
  AdminRole,
  AdminStats,
  AdminUser,
  AuditEntry,
  AuthUser,
  Collection,
  CollectionsPage,
  ContractStatus,
  Creator,
  HealthReport,
  IpfsHealth,
  PaginatedResponse,
  RevenueByCollectionRow,
  RevenueByCreatorRow,
  RevenueSummary,
  RevenueTimeseriesPoint,
  SolanaConfig,
  SolanaNetwork,
} from '../types'

// Options callers may pass through. `queryKey`/`queryFn` are owned by the hook —
// UseQueryOptions marks queryKey as required, so without this Omit no caller can
// pass a bare `{ enabled }` without a type error.
type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, 'queryKey' | 'queryFn'>

const QUERY_KEYS = {
  adminStats: ['admin', 'stats'] as const,
  collections: (filters: object) => ['collections', filters] as const,
  collection: (id: string) => ['collections', id] as const,
  creators: ['admin', 'creators'] as const,
  health: ['infra', 'health'] as const,
  ipfsHealth: ['infra', 'ipfs', 'health'] as const,
  solanaNetwork: ['infra', 'solana', 'network'] as const,
  solanaConfig: ['infra', 'solana', 'config'] as const,
  contractStatus: ['infra', 'contracts'] as const,
}

// --- Admin Stats ---

export function useAdminStats(options?: QueryOpts<AdminStats>) {
  return useQuery({
    queryKey: QUERY_KEYS.adminStats,
    queryFn: () => api.get<AdminStats>(endpoints.admin.stats),
    ...options,
  })
}

// --- Collections ---

export interface CollectionFilters {
  /** Page size, 1–50 (the backend rejects anything outside that range). */
  pageSize?: number
  search?: string
  status?: string
  /** true = featured only, false = unfeatured only, undefined = both. */
  featured?: boolean
  /** Opaque cursor from the previous page's `nextCursor`. Omit for page 1. */
  cursor?: string
}

/**
 * One page of collections.
 *
 * `GET /api/collections` is cursor-based, not offset-based: it returns
 * `{ data, nextCursor }` and has no notion of a page number or a total count
 * (deliberately — the service comments explain that COUNT(*) is what made the
 * old implementation slow). Callers that need to walk pages keep a cursor stack;
 * see the Collections page.
 */
export function useCollections(
  filters: CollectionFilters = {},
  options?: QueryOpts<CollectionsPage>
) {
  const { pageSize = 20, search, status, featured, cursor } = filters
  return useQuery({
    queryKey: QUERY_KEYS.collections(filters),
    queryFn: async () => {
      const body = await api.get<{ data: Collection[]; nextCursor: string | null }>(
        endpoints.collections.list,
        {
          // The cursor lives on the envelope, next to `data`, so we need the
          // whole body rather than the unwrapped payload.
          unwrap: false,
          params: {
            limit: Math.min(50, Math.max(1, pageSize)),
            search: search || undefined,
            status: status && status !== 'all' ? status : undefined,
            featured,
            cursor,
          },
        }
      )
      return {
        data: Array.isArray(body?.data) ? body.data : [],
        nextCursor: body?.nextCursor ?? null,
      }
    },
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a skeleton on every click.
    placeholderData: (prev) => prev,
    ...options,
  })
}

export function useCollection(id: string | null, options?: QueryOpts<Collection | null>) {
  return useQuery({
    queryKey: QUERY_KEYS.collection(id ?? ''),
    queryFn: async () => {
      if (!id) return null
      return api.get<Collection>(endpoints.collections.byId(id))
    },
    enabled: !!id,
    ...options,
  })
}

// --- Admin Collection Mutations ---

export function useAdminUpdateCollection(
  options?: UseMutationOptions<
    void,
    Error,
    { id: string; data: { featured?: boolean; status?: string; featuredRank?: number } }
  >
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }) => {
      await api.patch(endpoints.admin.updateCollection(id), data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      qc.invalidateQueries({ queryKey: ['featured'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    ...options,
  })
}

export function useAdminDeleteCollection(options?: UseMutationOptions<void, Error, string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(endpoints.admin.deleteCollection(id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    ...options,
  })
}

export function useRestoreCollection(options?: UseMutationOptions<void, Error, string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      await api.post(endpoints.admin.restoreCollection(id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    ...options,
  })
}

export function useTriggerSync(options?: UseMutationOptions<void, Error, void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.post(endpoints.collections.sync)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
      qc.invalidateQueries({ queryKey: ['revenue'] })
    },
    ...options,
  })
}

// --- Creators ---

export function useCreators(options?: QueryOpts<Creator[]>) {
  return useQuery({
    queryKey: QUERY_KEYS.creators,
    queryFn: () => api.get<Creator[]>(endpoints.admin.creators),
    ...options,
  })
}

// --- Infrastructure ---
//
// /health always returns HTTP 200 with the status in the body (see
// Backend/src/health/health.controller.ts), so a resolved query here does not
// mean "healthy" — read report.status.

export function useHealthCheck(options?: QueryOpts<HealthReport>) {
  return useQuery({
    queryKey: QUERY_KEYS.health,
    queryFn: () => api.get<HealthReport>(endpoints.infrastructure.health),
    refetchInterval: 30_000,
    retry: false,
    ...options,
  })
}

export function useIpfsHealth(options?: QueryOpts<IpfsHealth>) {
  return useQuery({
    queryKey: QUERY_KEYS.ipfsHealth,
    queryFn: () => api.get<IpfsHealth>(endpoints.infrastructure.ipfsHealth),
    refetchInterval: 60_000,
    retry: false,
    ...options,
  })
}

export function useSolanaNetwork(options?: QueryOpts<SolanaNetwork>) {
  return useQuery({
    queryKey: QUERY_KEYS.solanaNetwork,
    queryFn: () => api.get<SolanaNetwork>(endpoints.infrastructure.solanaNetwork),
    refetchInterval: 30_000,
    retry: false,
    ...options,
  })
}

export function useSolanaConfig(options?: QueryOpts<SolanaConfig>) {
  return useQuery({
    queryKey: QUERY_KEYS.solanaConfig,
    queryFn: () => api.get<SolanaConfig>(endpoints.infrastructure.solanaConfig),
    // Program IDs and the platform wallet do not change between deploys.
    staleTime: 5 * 60_000,
    retry: false,
    ...options,
  })
}

export function useContractStatus(options?: QueryOpts<ContractStatus>) {
  return useQuery({
    queryKey: QUERY_KEYS.contractStatus,
    queryFn: () => api.get<ContractStatus>(endpoints.infrastructure.contractStatus),
    refetchInterval: 60_000,
    retry: false,
    ...options,
  })
}

// --- Featured collections ---

export function useFeaturedCollections(options?: QueryOpts<Collection[]>) {
  return useQuery({
    queryKey: ['featured'],
    queryFn: () => api.get<Collection[]>(endpoints.collections.featured),
    ...options,
  })
}

export function useReorderFeatured(options?: UseMutationOptions<void, Error, string[]>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds) => {
      await api.patch(endpoints.admin.reorderFeatured, { orderedIds })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['featured'] })
      qc.invalidateQueries({ queryKey: ['collections'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    ...options,
  })
}

// --- Revenue ---

export function useRevenueSummary(options?: QueryOpts<RevenueSummary>) {
  return useQuery({
    queryKey: ['revenue', 'summary'],
    queryFn: () => api.get<RevenueSummary>(endpoints.revenue.summary),
    refetchInterval: 60_000,
    ...options,
  })
}

export function useRevenueByCollection(limit = 100, options?: QueryOpts<RevenueByCollectionRow[]>) {
  return useQuery({
    queryKey: ['revenue', 'by-collection', limit],
    queryFn: () =>
      api.get<RevenueByCollectionRow[]>(endpoints.revenue.byCollection, { params: { limit } }),
    ...options,
  })
}

export function useRevenueByCreator(options?: QueryOpts<RevenueByCreatorRow[]>) {
  return useQuery({
    queryKey: ['revenue', 'by-creator'],
    queryFn: () => api.get<RevenueByCreatorRow[]>(endpoints.revenue.byCreator),
    ...options,
  })
}

export function useRevenueTimeseries(
  params: { from?: string; to?: string; bucket?: string; includeBaseline?: boolean } = {},
  options?: QueryOpts<RevenueTimeseriesPoint[]>
) {
  return useQuery({
    queryKey: ['revenue', 'timeseries', params],
    queryFn: () =>
      api.get<RevenueTimeseriesPoint[]>(endpoints.revenue.timeseries, {
        params: {
          from: params.from,
          to: params.to,
          bucket: params.bucket,
          includeBaseline: params.includeBaseline,
        },
      }),
    ...options,
  })
}

// --- Audit log ---
//
// This is the only activity source there is. There was a `useActivityList` hook
// pointed at `/api/activity`, but no such route exists in the backend — it only
// ever returned data in mock mode, and 404'd against a real API.

/**
 * The audit endpoint returns `{ data, total, page, pageSize }` — no `totalPages`.
 * Callers derive it (see the Audit Log page).
 */
export type AuditPage = Omit<PaginatedResponse<AuditEntry>, 'totalPages'>

export function useAuditLog(
  params: { page?: number; pageSize?: number; action?: string } = {},
  options?: QueryOpts<AuditPage>
) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () =>
      api.get<AuditPage>(endpoints.admin.audit, {
        params: { page: params.page, pageSize: params.pageSize, action: params.action },
      }),
    ...options,
  })
}

// --- Admin users (auth) ---

export function useAdminUsers(options?: QueryOpts<AdminUser[]>) {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUser[]>(endpoints.auth.users),
    ...options,
  })
}

export function useCreateAdminUser(
  options?: UseMutationOptions<
    AdminUser,
    Error,
    { email: string; password: string; displayName: string; role: AdminRole }
  >
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post<AdminUser>(endpoints.auth.users, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    ...options,
  })
}

export function useUpdateAdminUser(
  options?: UseMutationOptions<
    AdminUser,
    Error,
    {
      id: string
      data: { displayName?: string; role?: AdminRole; disabled?: boolean; password?: string }
    }
  >
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.patch<AdminUser>(endpoints.auth.userById(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    ...options,
  })
}

// ── Account security (self-service) ─────────────────────────────────────────
// Backend/src/auth/auth.controller.ts — any signed-in admin for change/cancel,
// public + throttled for forgot/reset/verify (those arrive from a mailed link).

export function useChangePassword(
  options?: UseMutationOptions<
    { token: string; expiresIn: number },
    Error,
    { currentPassword: string; newPassword: string }
  >
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post<{ token: string; expiresIn: number }>(endpoints.auth.changePassword, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit'] }),
    ...options,
  })
}

export function useForgotPassword(options?: UseMutationOptions<{ ok: true }, Error, { email: string }>) {
  return useMutation({
    mutationFn: (data) => api.post<{ ok: true }>(endpoints.auth.forgotPassword, data),
    ...options,
  })
}

export function useResetPassword(
  options?: UseMutationOptions<{ ok: true }, Error, { token: string; newPassword: string }>
) {
  return useMutation({
    mutationFn: (data) => api.post<{ ok: true }>(endpoints.auth.resetPassword, data),
    ...options,
  })
}

export function useRequestEmailChange(
  options?: UseMutationOptions<AuthUser, Error, { newEmail: string; currentPassword: string }>
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post<AuthUser>(endpoints.auth.changeEmail, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit'] }),
    ...options,
  })
}

export function useCancelEmailChange(options?: UseMutationOptions<AuthUser, Error, void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<AuthUser>(endpoints.auth.changeEmail),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit'] }),
    ...options,
  })
}

export function useVerifyEmail(options?: UseMutationOptions<{ email: string }, Error, { token: string }>) {
  return useMutation({
    mutationFn: (data) => api.post<{ email: string }>(endpoints.auth.verifyEmail, data),
    ...options,
  })
}
