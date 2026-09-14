@echo off
REM Local portal with the password gate OFF, bound to 127.0.0.1.
REM The gate is meant for the deployed portal; on localhost it just means
REM signing in to your own laptop. See apps/mission-control/scripts/dev-open.mjs.
cd /d "D:\youtube\automated website\content-factory\apps\mission-control"
call npm run dev:open
