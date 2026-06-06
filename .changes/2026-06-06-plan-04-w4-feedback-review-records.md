Plan 04 W4 adds the bounded public feedback/review loop: `POST /v1/feedback`, SDK
`submitFeedback`, `review_records`, transactional `feedback.submit` audit events, and operations
docs for the review workflow. Feedback creates review records only and does not mutate canonical
graph state.

Audit follow-up: SDK feedback submissions are not automatically retried, even when client retries
are enabled, so a transient response failure cannot duplicate review records.
