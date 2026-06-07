# Decision Records

Durable architectural decisions for Intercal. Each record captures **what** was decided,
**why**, and **what changes if reversed**, so the reasoning survives handoff. The live repo
and active roadmap remain the source of truth; these records explain the reasoning, not the
implementation.

## Convention

- One numbered file per decision or per cohesive decision set: `NNNN-short-slug.md`.
- A record is **Accepted**, **Superseded by NNNN**, or **Proposed**.
- Promote a decision here once accepted; do not leave forks implicit in prose.
- When a source-truth fact changes, supersede the record with a new one rather than editing
  history.

## Index

- [`0001-foundation-stack.md`](0001-foundation-stack.md) — D1–D16, the June-2026 foundation
  stack and adapter baseline (Node/TS, pnpm, Biome, uv/Ruff/Pyright, Postgres+pgvector,
  Neon, R2, Upstash, TypeSpec contracts, MCP, scheduler/workers, embeddings, LLM, Next.js,
  hosting posture, docs convention).
- [`0002-final-hosting-topology.md`](0002-final-hosting-topology.md) — the decided go-live
  shape: Neon (dev branches, no local Docker) · Vercel app · Cloudflare R2 · Upstash ·
  GitHub Actions → Cloud Run for the Python pipeline.
- [`0003-public-launch-provider-posture.md`](0003-public-launch-provider-posture.md) — the
  release-audit posture: launch remains `intercal.jami.studio` on Vercel; an Intercal-owned domain
  and Cloudflare compute proof are explicit future decisions.
