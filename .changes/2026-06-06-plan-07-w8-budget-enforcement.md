Type: changed
Scope: plan-07-w8

Implemented worker runtime budget enforcement: shared config validates budget knobs, pipeline/extract/synthesize CLIs use the budgeted LLM factory, Vertex is preferred with Gemini fallback, successful LLM calls append real provider usage events, and warning/exceeded provider-consumption states auto-degrade routing.
