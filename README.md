# Nexus Admin Panel

Operator console for the Nexus NFT Launchpad. Admins use it to feature and moderate
collections, track platform fee revenue, review the audit log, manage admin users and
watch infrastructure health.

Built and maintained by **MarTech Networks**.

| | |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Headless UI, Lucide icons |
| Data | TanStack Query 5 |
| Charts | Recharts |
| Drag & drop | dnd-kit (featured-collection ordering) |
| Package manager | **pnpm** (never npm) |
| Backend | Nexus NestJS API — see `../Backend` |

---

## Contents

- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Features](#features)
- [Authentication & roles](#authentication--roles)
- [API layer](#api-layer)
- [Build & deployment](#build--deployment)
- [Security](#security)

---

## Getting started

```bash
pnpm install
cp .env.example .env       # then set NEXT_PUBLIC_API_URL
pnpm dev                   # → http://localhost:3000
```

The backend must be running (`cd ../Backend && pnpm start:dev`, default
`http://localhost:8000`). If `NEXT_PUBLIC_API_URL` is left unset, most hooks fall back to
the built-in mock data in `src/lib/api/mock.ts`, so the UI is browsable without a
backend.

Scripts:

| Command | Does |
|---|---|
| `pnpm dev` | Development server on `:3000` |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint via `eslint-config-next` |

## Environment variables

Only two are read by the application code:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | recommended | Base URL of the Nexus backend, e.g. `http://localhost:8000` or `https://api.nexus-web3.com`. Bare origin, **no trailing slash** — endpoint paths already include `/api`. Unset ⇒ mock data. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | optional | Gateway used to render `ipfs://` collection images. |

Both are `NEXT_PUBLIC_*`, meaning they are **inlined into the client bundle and visible to
anyone using the panel**. Never put a secret in this app — the admin JWT is obtained at
runtime by logging in, not from an env var.

`.env.production.template` and `.env.staging.template` are kept as deployment references
but currently list a number of variables the code does not read (analytics, rate limits,
cache TTL, feature flags). Treat the table above as authoritative.

## Project structure

```
admin/
├── app/                       # Next.js App Router — routing lives HERE
│   ├── (dashboard)/
│   │   ├── dashboard/         # KPI cards and platform stats
│   │   ├── collections/       # moderate: feature, status, pause, soft-delete/restore
│   │   ├── featured/          # drag-to-reorder featured collections
│   │   ├── revenue/           # fee revenue charts + CSV export
│   │   ├── logs/              # audit log
│   │   ├── users/             # admin user management
│   │   ├── settings/
│   │   └── layout.tsx         # authenticated shell (sidebar, header)
│   ├── login/
│   ├── layout.tsx
│   ├── globals.css
│   └── robots.ts
├── src/                       # everything non-routing; `@/*` → `src/*`
│   ├── components/            # ui/, tables/, modals/, layout/
│   ├── lib/
│   │   ├── api/               # client.ts, hooks.ts, endpoints.ts, mock.ts
│   │   ├── auth/              # auth context, ProtectedRoute
│   │   ├── dashboard.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   └── styles/
├── public/
├── Dockerfile
├── docker-compose.production.yml / .staging.yml
└── .github/workflows/         # security scan + build/deploy
```

The `@/*` path alias resolves to `src/*` (see `tsconfig.json`). Routes go in `app/`;
components, hooks and lib code go in `src/`.

## Features

- **Dashboard** — platform-wide stats: collections, mints, creators, fee revenue.
- **Collections** — searchable table; feature/unfeature, override status, pause,
  soft-delete and restore.
- **Featured** — drag-and-drop ordering of the featured carousel (dnd-kit), persisted as
  `featuredRank`.
- **Revenue** — summary plus breakdowns by collection and by creator, a timeseries chart
  (24h / 7d / 30d) and CSV export. Backed by the append-only `fee_ledger`.
- **Logs** — the backend's append-only audit log of admin actions.
- **Users** — create and manage admin users and roles (super-admin only).
- **Health** — backend, IPFS and Solana status, refetched every 30–60s.

## Authentication & roles

Login posts to the backend's `/api/admin/auth` endpoint and receives a JWT (8h TTL). The
client stores it in `localStorage['nexus_admin_token']`, attaches it as
`Authorization: Bearer …` on every request, and redirects to `/login` on any `401`.

Roles are enforced **server-side** by the backend (`JwtAuthGuard` + `RolesGuard`); the UI
only hides controls the current role cannot use:

| Role | Can |
|---|---|
| `super_admin` | Everything, including managing admin users |
| `finance` | Revenue views and exports |
| `moderator` | Feature, status changes, moderation |
| `read_only` | View only |

## API layer

`src/lib/api/client.ts` is the single fetch wrapper. It prefixes `NEXT_PUBLIC_API_URL`,
injects the bearer token, handles `401` redirects, and unwraps the backend's standard
`{ success, data }` envelope so callers receive `data` directly.

`src/lib/api/hooks.ts` exposes TanStack Query hooks for stats, collections, creators,
featured ordering, revenue (summary / by-collection / by-creator / timeseries), audit
entries, admin users and infra health. Endpoint paths live in `endpoints.ts`; response
shapes in `src/lib/types.ts`.

## Build & deployment

```bash
pnpm build && pnpm start
```

**Docker** — multi-stage build producing a Next.js `standalone` output, run as a non-root
user, listening on `:3000`:

```bash
docker build -t nexus-admin .
docker compose -f docker-compose.production.yml up -d
```

**CI/CD** — `.github/workflows/` runs a Trivy vulnerability scan and a dependency audit,
builds a multi-arch image, pushes it to GitHub Container Registry, and recreates the
container over SSH.

> The compose files ship with placeholder values (`ghcr.io/yourusername/…`,
> `https://yourdomain.com`). Replace them with real registry and host values before
> deploying.

## Security

- This panel controls platform moderation and can read revenue data. Put it behind a
  restricted hostname or network, not the public marketing domain.
- All authorisation is enforced by the backend. The UI's role checks are cosmetic — never
  rely on them alone.
- No secrets belong in this app. Every `NEXT_PUBLIC_*` variable is public.
- `.gitleaks.toml` is configured for secret scanning in CI.

Report vulnerabilities privately rather than via public issues.

---

© 2026 MarTech Networks.
