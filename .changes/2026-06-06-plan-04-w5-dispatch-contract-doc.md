Clarify the public subscription dispatch contract so `POST /v1/subscriptions/dispatch` states that
REST dispatch only enqueues notifications for subscriptions owned by the authenticated API key.

This keeps the generated OpenAPI and TypeScript contract docs aligned with the Plan 04 W5
owner-scoped dispatch behavior added in `33f97b0`; runtime behavior is unchanged.
