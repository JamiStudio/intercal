## feat(dashboard): harden public knowledge experience

- Added graph/timeline, topic comparison, source-record, and authenticated subscription management
  dashboard routes backed by existing SDK/core query paths.
- Exposed generated REST subscription operations through the SDK without editing generated
  contracts.
- Tightened public evidence/source-policy rendering: citations link to source records, invalid
  citation URLs do not crash rendering, and source bodies remain outside dashboard routes.
- Fixed feedback and subscription server-action redirects so successful writes are not caught as
  false errors.
- Updated the public knowledge architecture doc and active roadmap with pass 2 status and remaining
  Workstream 5 gaps.
