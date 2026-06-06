Plan 04 W8 fixes the secret fan-out CLI to accept pnpm's `--` argument separator.

- Makes the documented account/deployment runbook commands such as
  `pnpm ops:secrets-fanout -- --dry-run` execute the same way as the other ops scripts.
