const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_TABLE = 'schema_migrations';

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function listAppliedMigrations(client) {
  const res = await client.query(`SELECT name FROM ${MIGRATION_TABLE} ORDER BY name ASC`);
  return new Set(res.rows.map((row) => row.name));
}

async function applyMigration(client, migrationName) {
  const fullPath = path.join(MIGRATIONS_DIR, migrationName);
  const sql = await fs.readFile(fullPath, 'utf8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(`INSERT INTO ${MIGRATION_TABLE} (name) VALUES ($1)`, [migrationName]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await ensureMigrationTable(client);

    const [files, applied] = await Promise.all([
      listMigrationFiles(),
      listAppliedMigrations(client)
    ]);

    const pending = files.filter((name) => !applied.has(name));
    if (pending.length === 0) {
      process.stdout.write('No pending migrations\n');
      return;
    }

    for (const migrationName of pending) {
      process.stdout.write(`Applying ${migrationName}\n`);
      await applyMigration(client, migrationName);
    }

    process.stdout.write(`Applied ${pending.length} migration(s)\n`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  process.stderr.write(`Migration failed: ${err.message}\n`);
  process.exitCode = 1;
});
