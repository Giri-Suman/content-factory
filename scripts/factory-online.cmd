@echo off
REM ============================================================================
REM  Content Factory - everything up, in one command.
REM
REM  Starts three things and leaves them running:
REM    1. the portal        (localhost:4600)
REM    2. the tunnel        (publishes it over HTTPS)
REM    3. the worker        (collects trends on a schedule)
REM
REM  Registered by go-online.ps1 to run at login, so a reboot brings the whole
REM  thing back without you doing anything.
REM ============================================================================

cd /d "%~dp0.."

echo.
echo  Content Factory - starting everything
echo  -------------------------------------

REM --- the portal (production build if present, dev otherwise) --------------
if exist "apps\mission-control\.next\BUILD_ID" (
  echo  portal  : production build
  start "factory-portal" /min cmd /c "cd apps\mission-control && npm start"
) else (
  echo  portal  : dev mode  ^(run "npm run build --prefix apps/mission-control" for a faster one^)
  start "factory-portal" /min cmd /c "cd apps\mission-control && npm run dev"
)

REM give Next a moment to bind 4600 before the tunnel tries to reach it
timeout /t 12 /nobreak >nul

REM --- the tunnel ----------------------------------------------------------
where cloudflared >nul 2>&1
if %errorlevel%==0 (
  echo  tunnel  : cloudflared
  start "factory-tunnel" /min cmd /c "cloudflared tunnel run content-factory"
) else (
  echo  tunnel  : SKIPPED - cloudflared not installed, run scripts\go-online.ps1
)

REM --- the worker ----------------------------------------------------------
REM collect 30m / youtube 60m / deep 6h / digest 08:00 IST
echo  worker  : scheduler
start "factory-worker" /min cmd /c "node packages\cli\bin\factory.js worker"

echo.
echo  Local : http://localhost:4600
echo  Online: https://factory.coderfact.com
echo.
echo  Three minimised windows are now running. Closing them stops that piece.
echo.
