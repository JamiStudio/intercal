import { createDb, loadConfig } from '@intercal/core';

let db: ReturnType<typeof createDb> | null = null;

export function dashboardDb(): ReturnType<typeof createDb> {
  if (!db) db = createDb(loadConfig().databaseUrl);
  return db;
}
