#!/usr/bin/env node
// Intercal backup + restore proof CLI (Plan 07 W7).
//
// Creates portable PostgreSQL custom-format dumps, optionally uploads them to the configured
// S3-compatible backup target, restores a dump into an operator-supplied target database, and runs
// a read-only heartbeat against the restored target.
//
// HARD RULE: never print database URLs, access keys, tokens, or signed URLs. Output is limited to
// filenames, object keys, counts, and command names.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const ENV_PATH = resolve(REPO_ROOT, '.env');
const DEFAULT_BACKUP_DIR = resolve(REPO_ROOT, '.backups');

const LIBPQ_CONNECTION_ENV_NAMES = [
  'PGAPPNAME',
  'PGCHANNELBINDING',
  'PGCONNECT_TIMEOUT',
  'PGDATABASE',
  'PGHOST',
  'PGOPTIONS',
  'PGPASSWORD',
  'PGPORT',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLCERT',
  'PGSSLCOMPRESSION',
  'PGSSLKEY',
  'PGSSLMODE',
  'PGSSLROOTCERT',
  'PGTARGETSESSIONATTRS',
  'PGUSER',
];

const HEARTBEAT_TABLES = [
  '_migrations',
  'sources',
  'source_documents',
  'claims',
  'claim_evidence',
  'entities',
  'relationships',
  'fact_versions',
];

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq >= 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[arg.slice(2)] = next;
      i++;
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return flags;
}

function usage(message, exitCode = 2) {
  if (message) console.error(`[backup] ${message}\n`);
  console.error(
    [
      'Usage:',
      '  backup-restore backup [--source-url <non-secret-local-url>] [--output-dir <dir>] [--upload-r2] [--dry-run]',
      '  backup-restore restore-proof --dump <file> [--target-url <non-secret-local-url>] [--skip-restore]',
      '  backup-restore health [--target-url <non-secret-local-url>]',
      '',
      'Env fallback:',
      '  source-url: DATABASE_URL_UNPOOLED, then DATABASE_URL',
      '  target-url: RESTORE_DATABASE_URL',
      '  R2 upload: BACKUP_S3_BUCKET or S3_BUCKET, BACKUP_S3_PREFIX, S3_ENDPOINT, S3_* keys',
    ].join('\n'),
  );
  process.exit(exitCode);
}

function loadDotenv() {
  const out = new Map(Object.entries(process.env).filter(([, value]) => value !== undefined));
  if (!existsSync(ENV_PATH)) return out;
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !out.has(key)) out.set(key, value);
  }
  return out;
}

function envValue(env, ...names) {
  for (const name of names) {
    const value = env.get(name);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

function credentialSafeUrlFlag(flags, name) {
  const value = flags[name];
  if (!value || value === true) return undefined;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }
  if (parsed.password) {
    throw new Error(
      `do not pass credentialed database URLs via --${name}; set the documented environment variable instead`,
    );
  }
  return value;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function redact(text) {
  return String(text)
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, '$1***$2')
    .replace(/(rediss?:\/\/[^:\s]+:)[^@\s]+(@)/gi, '$1***$2')
    .replace(/(AWS_SECRET_ACCESS_KEY=)[^\s]+/gi, '$1***')
    .replace(/(S3_SECRET_ACCESS_KEY=)[^\s]+/gi, '$1***')
    .replace(/(token=)[^&\s]+/gi, '$1***');
}

function postgresEnvFromUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('invalid Postgres connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('connection URL must use postgres:// or postgresql://');
  }

  const env = {
    PGHOST: parsed.hostname,
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
    PGUSER: decodeURIComponent(parsed.username),
  };
  if (!env.PGDATABASE) {
    throw new Error('connection URL must include a database name');
  }
  if (parsed.port) env.PGPORT = parsed.port;
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);

  const queryEnv = {
    application_name: 'PGAPPNAME',
    channel_binding: 'PGCHANNELBINDING',
    connect_timeout: 'PGCONNECT_TIMEOUT',
    options: 'PGOPTIONS',
    sslcert: 'PGSSLCERT',
    sslcompression: 'PGSSLCOMPRESSION',
    sslkey: 'PGSSLKEY',
    sslmode: 'PGSSLMODE',
    sslrootcert: 'PGSSLROOTCERT',
    target_session_attrs: 'PGTARGETSESSIONATTRS',
  };
  for (const [param, envName] of Object.entries(queryEnv)) {
    const value = parsed.searchParams.get(param);
    if (value) env[envName] = value;
  }

  return env;
}

function childEnvWithPostgres(pgEnv) {
  const childEnv = { ...process.env };
  for (const name of LIBPQ_CONNECTION_ENV_NAMES) {
    delete childEnv[name];
  }
  return {
    ...childEnv,
    ...pgEnv,
  };
}

function normalizedUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return value;
  }
}

function assertRestoreTargetIsNotSource(env, targetUrl) {
  const sourceUrls = [envValue(env, 'DATABASE_URL_UNPOOLED'), envValue(env, 'DATABASE_URL')].filter(
    Boolean,
  );
  const normalizedTarget = normalizedUrl(targetUrl);
  for (const sourceUrl of sourceUrls) {
    if (normalizedUrl(sourceUrl) === normalizedTarget) {
      throw new Error(
        'restore target matches a configured source database URL; create a fresh throwaway branch and set RESTORE_DATABASE_URL to that target',
      );
    }
  }
}

async function runTool(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: REPO_ROOT,
      env: options.env ?? process.env,
      maxBuffer: 1024 * 1024 * 10,
    });
  } catch (err) {
    const stderr = redact(err.stderr || err.message || err);
    throw new Error(`${command} failed: ${stderr}`);
  }
}

function backupPath(outputDir) {
  return join(outputDir, `intercal-${timestamp()}.dump`);
}

async function backup(env, flags) {
  const sourceUrl =
    credentialSafeUrlFlag(flags, 'source-url') ||
    envValue(env, 'DATABASE_URL_UNPOOLED', 'DATABASE_URL');
  if (!sourceUrl) usage('backup requires --source-url or DATABASE_URL_UNPOOLED/DATABASE_URL.');

  const outputDir = resolve(
    REPO_ROOT,
    flags['output-dir'] || envValue(env, 'BACKUP_OUTPUT_DIR') || DEFAULT_BACKUP_DIR,
  );
  const out = backupPath(outputDir);
  const dryRun = Boolean(flags['dry-run']);
  const pgEnv = postgresEnvFromUrl(sourceUrl);

  console.log(`Intercal backup${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Output: ${out}`);
  if (dryRun) {
    console.log(
      'Would run: PG* connection env + pg_dump --format=custom --no-owner --no-privileges --file <output>',
    );
  } else {
    mkdirSync(outputDir, { recursive: true });
    await runTool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', out], {
      env: childEnvWithPostgres(pgEnv),
    });
    const size = statSync(out).size;
    console.log(`Backup written: ${out} (${size} bytes)`);
  }

  if (flags['upload-r2']) {
    await uploadR2(env, out, dryRun);
  }
}

async function uploadR2(env, filePath, dryRun) {
  const bucket = envValue(env, 'BACKUP_S3_BUCKET', 'S3_BUCKET');
  const prefix = envValue(env, 'BACKUP_S3_PREFIX') || 'database-dumps';
  const endpoint = envValue(env, 'BACKUP_S3_ENDPOINT', 'S3_ENDPOINT');
  const region = envValue(env, 'BACKUP_S3_REGION', 'S3_REGION') || 'auto';
  const accessKey = envValue(env, 'BACKUP_S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID');
  const secretKey = envValue(env, 'BACKUP_S3_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY');
  if (!bucket || !endpoint || !accessKey || !secretKey) {
    usage('R2 upload requires bucket, endpoint, access key id, and secret access key env names.');
  }
  const key = `${prefix.replace(/^\/+|\/+$/g, '')}/${basename(filePath)}`;
  const target = `s3://${bucket}/${key}`;
  console.log(`R2 object: ${target}`);
  if (dryRun) {
    console.log('Would run: aws s3 cp <dump> <r2-object> --endpoint-url <endpoint> --no-progress');
    return;
  }
  await runTool(
    'aws',
    ['s3', 'cp', filePath, target, '--endpoint-url', endpoint, '--no-progress'],
    {
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: accessKey,
        AWS_SECRET_ACCESS_KEY: secretKey,
        AWS_DEFAULT_REGION: region,
        AWS_EC2_METADATA_DISABLED: 'true',
      },
    },
  );
  console.log('R2 upload complete.');
}

async function restoreProof(env, flags) {
  const dump = flags.dump ? resolve(REPO_ROOT, flags.dump) : undefined;
  const targetUrl =
    credentialSafeUrlFlag(flags, 'target-url') || envValue(env, 'RESTORE_DATABASE_URL');
  if (!dump) usage('restore-proof requires --dump <file>.');
  if (!existsSync(dump)) usage(`dump does not exist: ${dump}`);
  if (!targetUrl) usage('restore-proof requires --target-url or RESTORE_DATABASE_URL.');
  assertRestoreTargetIsNotSource(env, targetUrl);

  console.log('Intercal restore proof');
  console.log(`Dump: ${dump}`);
  if (!flags['skip-restore']) {
    console.log('Restoring into target database (target URL redacted).');
    const pgEnv = postgresEnvFromUrl(targetUrl);
    await runTool(
      'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--single-transaction',
        '--exit-on-error',
        '--dbname',
        pgEnv.PGDATABASE,
        dump,
      ],
      {
        env: childEnvWithPostgres(pgEnv),
      },
    );
    console.log('Restore completed.');
  } else {
    console.log('Skipping restore; running heartbeat only.');
  }
  await heartbeat(targetUrl);
}

async function heartbeat(databaseUrl) {
  let pg;
  try {
    pg = (await import('pg')).default;
  } catch {
    throw new Error('The "pg" package is not installed. Run `pnpm install`.');
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const version = await client.query("SELECT current_setting('server_version') AS version");
    const pgvector = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed",
    );
    const counts = {};
    for (const table of HEARTBEAT_TABLES) {
      const result = await client.query(`SELECT count(*)::bigint AS count FROM ${table}`);
      counts[table] = Number(result.rows[0].count);
    }
    const provenance = await client.query(`
      SELECT count(*)::bigint AS count
      FROM claim_evidence ce
      JOIN claims c ON c.id = ce.claim_id
      JOIN source_documents sd ON sd.id = ce.document_id
    `);
    const bitemporal = await client.query(`
      SELECT count(*)::bigint AS count
      FROM fact_versions
      WHERE recorded_at IS NOT NULL
        AND fact_subject_type IN ('entity', 'relationship', 'claim')
        AND fact_subject_id IS NOT NULL
    `);

    const failures = [];
    if (!pgvector.rows[0].installed) failures.push('pgvector extension is missing');
    if (counts._migrations === 0) failures.push('no migrations recorded');
    if (counts.sources === 0) failures.push('no seeded sources found');
    if (counts.source_documents === 0) failures.push('no source documents found');
    if (counts.claims === 0) failures.push('no claims found');
    if (counts.entities === 0) failures.push('no entities found');
    if (counts.relationships === 0) failures.push('no relationships found');
    if (counts.fact_versions === 0) failures.push('no fact versions found');
    if (Number(provenance.rows[0].count) === 0)
      failures.push('no claim evidence provenance links found');
    if (Number(bitemporal.rows[0].count) === 0)
      failures.push('no bitemporal fact-version rows found');

    console.log('Heartbeat counts:');
    for (const table of HEARTBEAT_TABLES) {
      console.log(`  ${table}: ${counts[table]}`);
    }
    console.log(`  claim_evidence_provenance_links: ${Number(provenance.rows[0].count)}`);
    console.log(`  bitemporal_fact_versions: ${Number(bitemporal.rows[0].count)}`);
    console.log(`  postgres_version: ${version.rows[0].version}`);

    if (failures.length > 0) {
      console.error('Heartbeat failed:');
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exit(1);
    }
    console.log('Restore heartbeat passed.');
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function health(env, flags) {
  const targetUrl =
    credentialSafeUrlFlag(flags, 'target-url') ||
    envValue(env, 'RESTORE_DATABASE_URL', 'DATABASE_URL');
  if (!targetUrl) usage('health requires --target-url, RESTORE_DATABASE_URL, or DATABASE_URL.');
  await heartbeat(targetUrl);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') usage(undefined, 0);
  const env = loadDotenv();
  const flags = parseFlags(rest);
  if (flags.help) usage(undefined, 0);
  if (command === 'backup') return backup(env, flags);
  if (command === 'restore-proof') return restoreProof(env, flags);
  if (command === 'health') return health(env, flags);
  usage(`unknown command: ${command}`);
}

main().catch((err) => {
  console.error(`[backup] ${redact(err.message)}`);
  process.exit(1);
});
