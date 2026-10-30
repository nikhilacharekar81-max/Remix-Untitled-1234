import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import os from 'os';

async function check() {
  const pgDataDir = process.env.PGLITE_DATA_DIR || path.join(os.tmpdir(), 'wph-pglite-data');
  console.log(`Connecting to PGlite at ${pgDataDir}...`);
  const db = new PGlite(pgDataDir);
  await db.waitReady;

  console.log('Tables:');
  const tables = await db.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
  console.table(tables.rows);

  console.log('Constraints:');
  const constraints = await db.query("SELECT conname, contype FROM pg_catalog.pg_constraint");
  console.table(constraints.rows);

  await db.close();
}

check().catch(console.error);
