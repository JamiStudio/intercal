# Provider Boundaries (Adapters)

Every external dependency sits behind a port. Provider logic never crosses the port boundary,
so Intercal is **deploy-target agnostic and provider-swappable without a migration**. Selection
is by environment (see `.env.example`); the Python `intercal_shared.factory` returns the
configured adapter for each port.

| Port | Interface (Python) | Default adapter | Other adapters | Selected by |
| --- | --- | --- | --- | --- |
| Database | `intercal_shared.db` (asyncpg pool); Kysely on the TS read side | Postgres + pgvector | Neon / Supabase / VPS — any Postgres | `DATABASE_URL` |
| Object storage | `StoragePort` | S3 adapter (MinIO local) | Cloudflare R2 / AWS S3 / any S3-compatible | `STORAGE_PROVIDER`, `S3_*` |
| Queue / cache | `QueuePort` | Redis/Valkey | Postgres (pgmq-style) | `QUEUE_PROVIDER`, `REDIS_URL` |
| Embeddings | `EmbeddingsPort` | local fastembed (ONNX, bge-small-en-v1.5, 384-dim, halfvec) | OpenAI (hosted) | `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_DIM` |
| LLM (extract/synthesize) | `LlmPort` | Vertex AI (primary, ADC/SA key) via `GeminiLlmAdapter(vertexai=True)` | Gemini API key (fallback), Groq, Anthropic, OpenAI | `LLM_PROVIDER`, `LLM_MODEL`, `VERTEX_PROJECT`, `VERTEX_LOCATION` |
| Scheduler | `SchedulerPort` | local invoke | GitHub Actions / Modal / cron call the same worker CLIs | `SCHEDULER_PROVIDER` |

## LLM provider selection (Vertex / Gemini dual-mode)

`GeminiLlmAdapter` implements `LlmPort` for both modes — same adapter class, selected by config:

- **`LLM_PROVIDER=vertex`** (primary): uses `google-genai` `Client(vertexai=True, project=..., location=...)`.
  Credentials via ADC — set `GOOGLE_APPLICATION_CREDENTIALS` to a SA JSON key, or use `gcloud auth
  application-default login` in dev.  Requires `VERTEX_PROJECT` (e.g. `rich-wavelet-496206-h7`) and
  `VERTEX_LOCATION` (default `us-east4`).  Primary per the program posture (yrka.io trial credits).
- **`LLM_PROVIDER=gemini`** (fallback): uses `Client(api_key=...)`.  Requires `GEMINI_API_KEY`.
  Falls back to postpay daily allowance when Vertex credits are exhausted or ADC unavailable.

Model names are identical across both modes (e.g. `gemini-2.5-flash`) — the SDK routes correctly
based on the `vertexai` flag.  Switching between modes is a single env-var change; no code change.

`LLM_PROVIDER=groq|anthropic|openai` route to their own adapter classes; all implement `LlmPort`.

## Embeddings adapter

`LocalEmbeddingsAdapter` (fastembed/ONNX) is the zero-cost default.  It exposes `.model` and `.dim`
properties — callers **must** store both alongside every vector row so a model change can be detected
and re-embedding triggered.  See [data-model.md](data-model.md) for the vector-space safety rule.

## Rules

- **No provider payloads in canonical records.** Adapters translate to/from the contract and
  domain types; raw provider responses never reach Postgres tables or the public API.
- **Credentials are a runtime concern.** A real adapter that needs an API key raises a clear
  error when the key is absent — that is a configuration state, not a placeholder.
- **Vector-space safety.** Embeddings rows carry `model` + `dim`. Changing the embedding model
  changes the vector space; it requires a re-embed and (for a different dimension) a new
  column/table. The adapter alone does not protect against this — see
  [`data-model.md`](data-model.md).
- **TS deploy portability.** The REST API uses Hono (Node/Vercel/Cloudflare/Bun) and the MCP
  server uses the standard Streamable HTTP transport, so the front door is a deploy target, not
  an architectural dependency.

See [`../decisions/0001-foundation-stack.md`](../decisions/0001-foundation-stack.md) for the
provider choices and their rationale, and [`deployment-topology.md`](deployment-topology.md)
for how the same ports map onto local / pilot / managed environments.
