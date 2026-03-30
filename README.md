# Paperclip MVP Monorepo Bootstrap

This repository contains the Week 1 baseline for MVP delivery:

- monorepo workspace layout (`apps/*`, `packages/*`)
- CI workflow for lint/typecheck/test/build
- staging deployment workflow triggered on `main`
- local bootstrap script for developer setup

## Prerequisites

- Node.js 20+
- pnpm 9+

## Quick Start

```bash
pnpm install
./scripts/bootstrap.sh
```

## Run API + Web Vertical Slice

Start the API:

```bash
pnpm --filter @paperclip/api start
```

In a second terminal, start the web UI (proxies `/auth/*` and `/ai/*` to the API):

```bash
pnpm --filter @paperclip/web start
```

Then open `http://127.0.0.1:3000`.

## Database migrations (API)

The API includes a PostgreSQL migration runner and baseline MVP schema.

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/paperclip
pnpm --filter @paperclip/api db:migrate
```

Detailed rollout and rollback guidance: `apps/api/docs/database-migrations.md`.

## CI Gates

`/.github/workflows/ci.yml` runs on pull requests and `main` pushes with required quality checks.

To enforce merge gates, configure branch protection on `main` in GitHub and require the `CI / quality` check.

## Staging Deploy

`/.github/workflows/deploy-staging.yml` deploys on `main`.

Configure repository secret `STAGING_DEPLOY_HOOK` with your staging provider deploy URL.

## Required Org/Repo Admin Setup

The following controls require admin access and cannot be enforced from local code alone:

- enable branch protection on `main`
- require `CI / quality` status check before merge
- store `STAGING_DEPLOY_HOOK` repository secret
