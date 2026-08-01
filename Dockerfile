# Multi-stage build for Next.js admin
# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm. Pinned to the `packageManager` version in package.json: an
# unpinned global install silently picks up whatever pnpm is latest on the day
# the image is built, which is how a Node version bump becomes a surprise.
RUN npm install -g pnpm@11.17.0

# Copy package files. pnpm-workspace.yaml is not optional: pnpm 11 reads
# `allowBuilds` from it, and without it the install aborts with
# ERR_PNPM_IGNORED_BUILDS on sharp / @parcel/watcher / unrs-resolver.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm. Pinned to the `packageManager` version in package.json: an
# unpinned global install silently picks up whatever pnpm is latest on the day
# the image is built, which is how a Node version bump becomes a surprise.
RUN npm install -g pnpm@11.17.0

# Copy package files. pnpm-workspace.yaml is not optional: pnpm 11 reads
# `allowBuilds` from it, and without it the install aborts with
# ERR_PNPM_IGNORED_BUILDS on sharp / @parcel/watcher / unrs-resolver.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# NEXT_PUBLIC_* is inlined into the client bundle at BUILD time, not read at
# runtime — setting it in docker-compose `environment:` does nothing. It has to
# arrive here, as a build arg, or the bundle ships with it undefined and every
# API call resolves against the admin's own origin (404 on login).
# Mirrors Frontend/Dockerfile. Keep the default in step with admin/.env.example.
ARG NEXT_PUBLIC_API_URL=https://api.nexus-web3.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_IPFS_GATEWAY=https://ipfs-gateway.nexus-web3.com/ipfs/
ENV NEXT_PUBLIC_IPFS_GATEWAY=$NEXT_PUBLIC_IPFS_GATEWAY

# Fail the build rather than ship a console that silently points at nothing.
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "NEXT_PUBLIC_API_URL is empty" && exit 1)

# Build the application
RUN pnpm build

# Stage 3: Development
#
# Deliberately ahead of the runner stage: `docker build` with no --target builds
# the LAST stage in the file, so production has to be last. When this stage was
# last, CI (which passed no target) shipped a `next dev` server to the VPS.
FROM node:22-alpine AS development
WORKDIR /app

# Install pnpm. Pinned to the `packageManager` version in package.json: an
# unpinned global install silently picks up whatever pnpm is latest on the day
# the image is built, which is how a Node version bump becomes a surprise.
RUN npm install -g pnpm@11.17.0

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV development
ENV NEXT_TELEMETRY_DISABLED 1

EXPOSE 3000

CMD ["pnpm", "dev"]

# Stage 4: Runner (Production) — MUST STAY LAST, see the note on stage 3
FROM node:22-alpine AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Install pnpm. Pinned to the `packageManager` version in package.json: an
# unpinned global install silently picks up whatever pnpm is latest on the day
# the image is built, which is how a Node version bump becomes a surprise.
RUN npm install -g pnpm@11.17.0

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
