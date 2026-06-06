#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const stdioEntrypoint = join(packageRoot, 'dist', 'stdio.js');

if (!existsSync(stdioEntrypoint)) {
  console.error(
    '[intercal-mcp-stdio] Missing build output at packages/mcp-server/dist/stdio.js. Run `pnpm --filter @intercal/mcp-server build` before starting the stdio transport.',
  );
  process.exit(1);
}

await import(pathToFileURL(stdioEntrypoint).href);
