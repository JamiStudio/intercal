## Source HTTP Usage Telemetry

- Added best-effort source HTTP request-attempt accounting for ingestion-owned source clients.
- Recorded source HTTP measurements as append-only `provider_usage_events` rows without pretending a global upstream allowance exists.
- Documented that queue command usage remains unavailable until the queue port/adapters emit real command counts or provider telemetry is imported.
