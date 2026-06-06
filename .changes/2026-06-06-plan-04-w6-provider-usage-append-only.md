---
type: fixed
area: operations
---

Enforced the documented append-only invariant for provider usage telemetry at the database boundary
so imported budget observations cannot be updated, deleted, or truncated after insertion.
