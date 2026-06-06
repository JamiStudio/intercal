import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OBSERVABILITY_VIEW_NAMES } from './observability.js';

describe('observability views', () => {
  it('keeps the core read helper aligned to the SQL-owned views', () => {
    const migration = readFileSync(
      resolve(process.cwd(), '..', '..', 'db', 'migrations', '0030_observability.sql'),
      'utf8',
    );

    for (const viewName of OBSERVABILITY_VIEW_NAMES) {
      expect(migration).toContain(`VIEW ${viewName}`);
    }
  });
});
