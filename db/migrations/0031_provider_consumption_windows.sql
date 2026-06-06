-- 0031_provider_consumption_windows.sql
-- Plan 07 W8: keep provider-consumption budget windows half-open.
--
-- Migration 0030's provider-consumption view used `period_end >= window_start`,
-- which can include a previous day/month row ending exactly at the current
-- window boundary.  W8 budget routing depends on this view for warning/exceeded
-- auto-degrade, so rebuild the view with explicit [window_start, window_end)
-- semantics while preserving append-only provider_usage_events.

CREATE OR REPLACE VIEW observability_provider_consumption AS
WITH allowance_windows AS (
    SELECT
        a.*,
        CASE a.allowance_period
            WHEN 'day' THEN date_trunc('day', now())
            WHEN 'month' THEN date_trunc('month', now())
            ELSE NULL
        END AS window_start,
        CASE a.allowance_period
            WHEN 'day' THEN date_trunc('day', now()) + interval '1 day'
            WHEN 'month' THEN date_trunc('month', now()) + interval '1 month'
            ELSE NULL
        END AS window_end
    FROM observability_provider_budget_allowances a
),
usage_rollups AS (
    SELECT
        a.provider,
        a.allowance_key,
        sum(pue.quantity) AS quantity_used,
        sum(pue.cost_usd) AS cost_usd,
        max(pue.observed_at) AS last_observed_at
    FROM allowance_windows a
    LEFT JOIN provider_usage_events pue
        ON pue.provider = a.provider
        AND (pue.allowance_key = a.allowance_key OR (pue.allowance_key IS NULL AND pue.metric_name = a.metric_name))
        AND (
            a.window_start IS NULL
            OR (pue.period_start >= a.window_start AND pue.period_start < a.window_end)
            OR (pue.period_start IS NULL AND pue.observed_at >= a.window_start AND pue.observed_at < a.window_end)
        )
    GROUP BY a.provider, a.allowance_key
)
SELECT
    a.provider,
    a.allowance_key,
    a.metric_name,
    a.metric_unit,
    a.allowance_period,
    a.allowance_quantity,
    a.binding,
    CASE WHEN u.last_observed_at IS NULL THEN NULL ELSE u.quantity_used END AS quantity_used,
    CASE
        WHEN u.last_observed_at IS NULL THEN NULL
        WHEN a.allowance_quantity IS NULL THEN NULL
        ELSE round((u.quantity_used / NULLIF(a.allowance_quantity, 0)) * 100, 2)
    END AS used_pct,
    CASE WHEN u.last_observed_at IS NULL THEN NULL ELSE u.cost_usd END AS cost_usd,
    u.last_observed_at,
    CASE
        WHEN u.last_observed_at IS NULL THEN 'unavailable'
        WHEN a.allowance_quantity IS NULL THEN 'unavailable'
        WHEN u.quantity_used >= a.allowance_quantity THEN 'exceeded'
        WHEN u.quantity_used >= a.allowance_quantity * a.warning_ratio THEN 'warning'
        ELSE 'ok'
    END AS budget_state,
    CASE
        WHEN u.last_observed_at IS NULL THEN 'no provider usage event has been recorded'
        WHEN a.allowance_quantity IS NULL THEN 'allowance quantity is not configured in resource-budget.md/provider quota data'
        ELSE NULL
    END AS unavailable_reason,
    a.source_document,
    a.notes
FROM allowance_windows a
JOIN usage_rollups u ON u.provider = a.provider AND u.allowance_key = a.allowance_key;

COMMENT ON VIEW observability_provider_consumption IS
    'Provider usage versus resource-budget allowances using half-open current day/month windows; unavailable rows are explicit, not zero-filled provider telemetry.';
