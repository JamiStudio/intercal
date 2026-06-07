# Workstream 9 release/provider posture

- Added an accepted decision record for the public launch provider posture: keep
  `intercal.jami.studio` on Vercel now, treat an Intercal-owned domain as future work, and require a
  separate Cloudflare compute proof before any host swap.
- Updated deployment and account runbooks with the Vercel-specific code assumptions found in the
  audit and the exact R2 proof gap from this shell.
- Tightened public operations transparency so provider portability does not overclaim front-door
  compute readiness.
