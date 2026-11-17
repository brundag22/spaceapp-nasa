import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from './pool.js';

interface MigrationRow extends RowDataPacket {
  version: string;
}

export async function applyMigrations(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(80) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const version = '001_initial';
  const [rows] = await pool.execute<MigrationRow[]>(
    'SELECT version FROM schema_migrations WHERE version = ?',
    [version],
  );
  if (rows.length) return;

  const file = resolve(process.cwd(), 'server/sql/001_initial.sql');
  const script = await readFile(file, 'utf8');
  const statements = script
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  const connection = await pool.getConnection();
  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
  } finally {
    connection.release();
  }
}
