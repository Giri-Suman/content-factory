# =============================================================================
#  Wake on a schedule, drain the queue, go back to sleep.
# =============================================================================
#  This is the half of the queue that lives on the laptop.
#
#  Someone queues work from the public page while this machine is asleep. This
#  task wakes it a few times a day, runs whatever is pending, and then calls
#  sleep-if-idle.ps1 to put it back down. Nobody waits for a person to turn a
#  computer on, and the machine is not left awake for hours after a 1-minute job.
#
#  Sleeping is GUARDED, not unconditional - sleep-if-idle.ps1 refuses if someone
#  is at the keyboard, if cloudflared is running (the portal is meant to be
#  reachable), or if work is still going. Pass -NoSleep to skip it entirely.
#
#  Why scheduled wake and not Wake-on-LAN: WoL does not work on this machine.
#  Checked - it is WiFi only (Qualcomm QCA9377, no ethernet), Fast Startup is
#  enabled, and `powercfg /devicequery wake_armed` reports NONE. The RTC timer
#  is a different mechanism and IS enabled, so a scheduled wake works where a
#  network wake cannot.
#
#  IMPORTANT: this wakes from SLEEP, not from shutdown. With Fast Startup on, a
#  full shutdown will not come back. Close the lid, do not power off.
#
#  ASCII only: PowerShell 5.1 reads .ps1 as cp1252, and a stray em dash breaks
#  parsing with an error that does not mention encoding.
# =============================================================================

param(
  [string]$At = "09:00,14:00,20:00",   # local times to wake and drain
  [switch]$NoSleep,                    # stay awake after draining
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "ContentFactoryDrain"

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "removed '$TaskName' - no more scheduled wake-ups" -ForegroundColor Green
  } else {
    Write-Host "'$TaskName' was not registered"
  }
  exit 0
}

# --- make sure waking is actually permitted on this power plan ---------------
$scheme = (powercfg /getactivescheme) -replace '.*GUID: ([a-f0-9-]+).*', '$1'
$rtc = powercfg /query $scheme SUB_SLEEP RTCWAKE 2>&1 | Out-String
if ($rtc -match 'Current AC Power Setting Index:\s*(0x\S+)' -and $matches[1] -eq '0x00000000') {
  Write-Host "Wake timers are disabled on this power plan. Enabling for AC:" -ForegroundColor Yellow
  powercfg /setacvalueindex $scheme SUB_SLEEP RTCWAKE 1
  powercfg /setactive $scheme
  Write-Host "  enabled" -ForegroundColor Green
}

# --- the action --------------------------------------------------------------
# `queue drain` requeues anything stuck, runs pending jobs oldest-first, then
# rebuilds the public page so finished work shows up without a person doing it.
$cmd = "node `"$Root\packages\cli\bin\factory.js`" queue drain && node `"$Root\packages\cli\bin\factory.js`" viewer build"
if (-not $NoSleep) {
  # `&` and not `&&`: the machine must still go back to sleep even if a job
  # failed, otherwise one bad render leaves the laptop awake until someone
  # notices. sleep-if-idle.ps1 decides whether sleeping is actually safe.
  $cmd += " & powershell -NoProfile -ExecutionPolicy Bypass -File `"$Root\scripts\sleep-if-idle.ps1`""
}
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $cmd" -WorkingDirectory $Root

# --- triggers: one per requested time ----------------------------------------
$triggers = @()
foreach ($t in ($At -split ',')) {
  $t = $t.Trim()
  if (-not $t) { continue }
  $triggers += New-ScheduledTaskTrigger -Daily -At $t
}
if (-not $triggers) { throw "no valid times in -At" }

$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -AllowStartIfOnBatteries:$false `
  -DontStopIfGoingOnBatteries:$false `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew

# AllowStartIfOnBatteries is FALSE deliberately: a math short is ~11 minutes of
# full-tilt CPU, and waking a laptop on battery to do that is a bad trade.
# StartWhenAvailable means a missed window runs at the next opportunity rather
# than being skipped entirely.

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings `
  -Description "Wake, run queued video jobs, rebuild the public page" | Out-Null

Write-Host "`nRegistered '$TaskName'" -ForegroundColor Green
Write-Host "  wakes at : $At  (mains power only)"
Write-Host "  runs     : factory queue drain -> viewer build$(if(-not $NoSleep){' -> sleep (guarded)'})"
Write-Host ""
Write-Host "  NOTE: wakes from SLEEP, not shutdown. Close the lid; do not power off."
Write-Host ""
Write-Host "  check    : Get-ScheduledTaskInfo $TaskName"
Write-Host "  run now  : Start-ScheduledTask $TaskName"
Write-Host "  undo     : .\scripts\wake-and-drain.ps1 -Remove`n"
