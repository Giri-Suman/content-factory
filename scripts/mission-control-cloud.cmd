@echo off
REM ===========================================================================
REM  The portal locally, on the REAL Workers runtime with the REAL bucket.
REM
REM  This serves the bundle CI built (.vercel/output/static) through
REM  `wrangler pages dev`, so it is the deployed code, not an approximation:
REM  same edge runtime, same R2 binding, same routing. `remote = true` on the
REM  binding in wrangler.toml is what makes it read the live bucket instead of
REM  an empty simulated one.
REM
REM  No password: Pages secrets are not present locally, so the gate is off.
REM  It listens on 127.0.0.1 only.
REM
REM  It does NOT hot-reload. To pick up code changes: push, let CI build, then
REM  run `node scripts/deploy-portal.mjs` to pull the new bundle down.
REM ===========================================================================
cd /d "D:\youtube\automated website\content-factory\apps\mission-control"
call npm run dev:cloud
