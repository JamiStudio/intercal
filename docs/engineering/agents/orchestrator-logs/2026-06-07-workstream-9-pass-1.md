# Workstream 9 Pass 1

Thread: `019ea078-21bc-7121-aa12-020d5d2bd797`

Commit: `2376d3c6b15c7c28b10bd3fec7f37cddd867837a`

Subject: `docs: record release provider posture`

Gate: B

Pass 1 added release/provider posture documentation and a new accepted decision:

- current launch remains `intercal.jami.studio` on Vercel;
- Intercal-owned domain purchase is future work;
- Cloudflare compute proof is a separate future decision;
- Vercel-specific mount, runtime, and trusted-header assumptions are documented;
- R2 remains behind the S3 adapter, but live bucket proof is operator-gated from this shell;
- public source-text and marketing-claim audit found no release blocker.

The pass changed 12 files with 156 insertions and 16 deletions, including public docs export output.
Because the content is production-meaningful provider posture documentation, the coordinator gate is
B and a mandatory pass 2 was dispatched to thread `019ea081-bd2d-78f3-b0ac-b695f26274d0`.

Verification reported:

- `node scripts/docs/check-public-docs.mjs --write`
- `pnpm docs:check`
- `git diff --check -- . ':(exclude)mcps/Neon/tools/*.json'`
- strict touched-file secret value scan excluding the documented local placeholder DSN
- live smokes for public pages, REST/OpenAPI, evidence/freshness, and MCP initialize

Unrelated deleted `mcps/Neon/tools/*.json` files remained dirty and were not staged or touched.
