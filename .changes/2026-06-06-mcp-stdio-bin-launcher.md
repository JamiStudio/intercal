---
"@intercal/mcp-server": patch
"@intercal/shared": patch
---

Point the stdio CLI bin at a committed launcher so workspace installs no longer try to link a pre-build `dist/stdio.js` artifact.
Run contract generation subprocesses without shell argument concatenation, set uv link mode explicitly, and pin datamodel-codegen formatters to keep Vercel contract builds warning-clean.
Approve the build-stack native install scripts that Vercel reported (`esbuild` and `sharp`) through pnpm's workspace policy.
