Type: changed
Scope: plan-07-w8

Implemented worker runtime budget enforcement: shared config validates budget knobs, pipeline/extract/synthesize CLIs use the budgeted LLM factory, the local request guard is seeded from same-day provider usage rows, Vertex is preferred with Gemini fallback, successful LLM calls append real provider usage events, and warning/exceeded provider-consumption states auto-degrade routing.

Follow-up W8 audit fixed provider-usage window boundaries: daily request seeding and the provider-consumption view now use half-open current day/month windows so prior periods ending at midnight do not consume the next period's budget.
