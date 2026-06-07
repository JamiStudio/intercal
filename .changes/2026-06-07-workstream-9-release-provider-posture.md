# Workstream 9 release/provider posture

- Added an accepted decision record for the public launch provider posture: keep
  `intercal.jami.studio` on Vercel now, treat an Intercal-owned domain as future work, and require a
  separate Cloudflare compute proof before any host swap.
- Updated deployment and account runbooks with the Vercel-specific code assumptions found in the
  audit. Pass 3 later replaced the initial R2 proof gap with verified Wrangler bucket metadata for
  Cloudflare account `jami-studio` and bucket `intercal`, while leaving object write/read smoke as a
  separate proof.
- Tightened public operations transparency so provider portability does not overclaim front-door
  compute readiness.
