# Database migrations

## Baseline schema

`001_init.sql` creates the MVP baseline tables:

- `users`
- `workspaces`
- `workflow_requests`
- `workflow_outputs`

and supporting indexes for common request/output access patterns.

## Running migrations

Set `DATABASE_URL` and run:

```bash
pnpm --filter @paperclip/api db:migrate
```

The migration runner:

- ensures the `schema_migrations` table exists
- applies pending SQL files from `apps/api/src/db/migrations` in lexical order
- runs each migration in a transaction

## Staging and production rollout

1. Back up the database.
2. Run `db:migrate` against staging.
3. Smoke test auth and workflow endpoints.
4. Run `db:migrate` against production.
5. Verify migration state:
   `SELECT name, applied_at FROM schema_migrations ORDER BY applied_at DESC;`

## Rollback path

The migration runner is forward-only by design. Rollback is handled with one of these production-safe options:

1. Preferred for hotfixes: ship a new forward migration that restores compatibility.
2. For failed deployments with no data writes: restore from the pre-migration backup.
3. For destructive changes: use a two-step rollout (additive migration first, destructive cleanup later) so rollback stays possible without dropping data.
