# pdc-sbp-agent — Fly.io image.
#
# IMPORTANT: this is a pnpm workspace package (@pdc/sbp-agent depends on
# @pdc/shared-types and @pdc/x402-adapter via "workspace:*" — see
# apps/sbp-agent/package.json). A Docker build context scoped to
# apps/sbp-agent alone cannot resolve those dependencies. This Dockerfile
# MUST be built with the repo root as the build context, e.g.:
#
#   docker build -f apps/sbp-agent/Dockerfile -t pdc-sbp-agent .
#
# or, via flyctl, from the repo root:
#
#   flyctl deploy --config apps/sbp-agent/fly.toml \
#                 --dockerfile apps/sbp-agent/Dockerfile .
#
# See FLY_DEPLOY.md for the full command. This mirrors exactly how Railway
# and Render already build this service (root buildCommand
# "pnpm run build:sbp-agent", root-relative startCommand) — see this
# directory's render.yaml and railway.json.
#
# Single-stage build, not multi-stage: pnpm's node_modules layout is a
# symlink farm into a content-addressable store, which does not survive a
# naive `COPY --from=builder node_modules` into a second stage without
# extra tooling (e.g. `pnpm deploy`). This app is a low-traffic background
# worker, not a request-path service where image size matters — a
# single-stage build matching the existing Render/Railway build exactly is
# the lower-risk choice. Revisit with `pnpm deploy --filter @pdc/sbp-agent`
# if image size ever becomes a real problem.

FROM node:20-slim

# Required for pnpm's fetch/network operations and for the AWS SDK's TLS
# calls to Secrets Manager; node:20-slim ships without ca-certificates by
# default on some base layers.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Corepack ships with Node >=16.9 — this pins the exact same pnpm version
# the existing render.yaml buildCommand uses, so the lockfile resolves
# identically.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Workspace plumbing first (better layer caching — these change far less
# often than application source).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Only the workspace packages this app actually depends on, plus the app
# itself — not the whole monorepo, to keep the build context's copied set
# minimal and explicit (this also means a stray node_modules/.env/dist
# left on disk in an unrelated app is never a risk here, independent of
# whatever .dockerignore ends up being honoured — see this directory's
# .dockerignore and FLY_DEPLOY.md for the known dockerignore-location
# caveat with a repo-root build context).
COPY packages/shared-types ./packages/shared-types
COPY packages/pdc-x402-adapter ./packages/pdc-x402-adapter
COPY apps/sbp-agent ./apps/sbp-agent

# Needs devDependencies (typescript, tsx types) to run the build below —
# --frozen-lockfile matches the existing Render/Railway buildCommand
# exactly, so this never silently resolves different versions than what's
# already running in production.
RUN pnpm install --frozen-lockfile

RUN pnpm run build:sbp-agent

ENV NODE_ENV=production

# @hono/node-server binds env.PORT (default 4022, see src/env.ts) — kept
# in sync with fly.toml's internal_port.
EXPOSE 4022

CMD ["node", "apps/sbp-agent/dist/index.js"]
