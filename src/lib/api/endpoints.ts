// Every path here is backed by a real controller in the NestJS backend. If you
// add one, add the route too — this file previously carried a block of
// "mock-only" endpoints (users, settings, activity) that had no implementation
// and 404'd the moment the console was pointed at a live API.
//
// Cross-reference: Backend/src/**/*.controller.ts
export const endpoints = {
  auth: {
    // Backend/src/auth/auth.controller.ts
    login: '/api/admin/auth/login',
    me: '/api/admin/auth/me',
    /** Self-service account security — any signed-in admin, or a link from a mail. */
    changePassword: '/api/admin/auth/password/change',
    forgotPassword: '/api/admin/auth/password/forgot',
    resetPassword: '/api/admin/auth/password/reset',
    changeEmail: '/api/admin/auth/email/change',
    verifyEmail: '/api/admin/auth/email/verify',
    /** Admin console accounts. super_admin only. */
    users: '/api/admin/auth/users',
    userById: (id: string) => `/api/admin/auth/users/${id}`,
  },
  collections: {
    // Backend/src/collections/collections.controller.ts
    list: '/api/collections',
    byId: (id: string) => `/api/collections/${id}`,
    featured: '/api/collections/featured',
    sync: '/api/collections/sync',
    onchain: (address: string) => `/api/collections/onchain/${address}`,
  },
  admin: {
    // Backend/src/admin/admin.controller.ts
    stats: '/api/admin/stats',
    creators: '/api/admin/creators',
    audit: '/api/admin/audit',
    updateCollection: (id: string) => `/api/admin/collections/${id}`,
    deleteCollection: (id: string) => `/api/admin/collections/${id}`,
    restoreCollection: (id: string) => `/api/admin/collections/${id}/restore`,
    reorderFeatured: '/api/admin/featured/order',
  },
  revenue: {
    // Backend/src/revenue/revenue.controller.ts
    summary: '/api/admin/revenue/summary',
    byCollection: '/api/admin/revenue/by-collection',
    byCreator: '/api/admin/revenue/by-creator',
    timeseries: '/api/admin/revenue/timeseries',
    exportCsv: '/api/admin/revenue/export.csv',
  },
  infrastructure: {
    health: '/health',
    ipfsHealth: '/api/ipfs/health',
    solanaNetwork: '/api/solana/network',
    solanaConfig: '/api/solana/config',
    contractStatus: '/api/solana/contracts/status',
  },
} as const
