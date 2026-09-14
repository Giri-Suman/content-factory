@echo off
REM ===========================================================================
REM  Keep this laptop answering the portal in real time.
REM
REM  Leave this window open while the laptop is on. It polls the R2 queue every
REM  15 seconds and runs anything the portal queued, so work asked for from
REM  factory.coderfact.com starts within seconds instead of waiting for the next
REM  scheduled drain at 09:00 / 14:00 / 20:00.
REM
REM  It also keeps the heartbeat fresh, which is what lets the portal say "the
REM  laptop is awake" instead of quoting a time hours away.
REM
REM  Safe to run alongside the scheduled ContentFactoryDrain task - claiming a
REM  job is atomic, so they cannot both run the same one.
REM
REM  Ctrl-C to stop.
REM ===========================================================================
cd /d "D:\youtube\automated website\content-factory"
node packages\cli\bin\factory.js queue watch --every=3
pause
