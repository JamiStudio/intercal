## Changed

- Hardened `rss_feed_v1` so RSS/Atom item links are validated with the SSRF/public-URL guard before
  they are persisted as source-document citation URLs.

## Verification

- `pnpm py:test services/shared/tests/test_historical_source_adapters.py`
- `pnpm py:lint`
- `pnpm py:typecheck`
