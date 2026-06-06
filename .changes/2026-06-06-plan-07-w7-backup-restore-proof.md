Plan 07 W7: added the backup/restore runbook and `scripts/ops/backup-restore.mjs` for portable
Postgres custom-format dumps, optional R2/S3 second-copy upload, restore into an operator-supplied
fresh branch/target database, and a read-only restored-store heartbeat.

P2 audit hardened the proof path so `pg_dump` / `pg_restore` receive database credentials through
libpq `PG*` environment variables instead of command-line URL arguments, and `restore-proof`
rejects an exact source/target DSN match to avoid accidentally restoring into the configured source.
Credentialed `--source-url` / `--target-url` arguments are rejected because package-manager output
and process listings can expose command-line arguments before redaction.
