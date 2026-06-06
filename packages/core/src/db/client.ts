import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

/** Re-export Kysely's `sql` tag so callers can run raw statements without depending on kysely directly. */
export { sql };

export type Db = Kysely<Database>;

/** Create a Kysely client backed by a pg connection pool. One per process is enough. */
export function createDb(databaseUrl: string): Db {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
