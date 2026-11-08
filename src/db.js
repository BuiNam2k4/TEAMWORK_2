import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString) {
  return new Pool({ connectionString, max: 10 });
}

export async function createMemoryPool() {
  const { newDb } = await import('pg-mem');
  const db = newDb();
  const { Pool: MemoryPool } = db.adapters.createPg();
  return new MemoryPool();
}

export async function initDb(pool) {
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}
