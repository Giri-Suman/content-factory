# =============================================================================
#  Content Factory - start the laptop fallback queue after Windows sign-in
# =============================================================================
#
#  Run once. Cloud jobs continue to run on GitHub Actions while the laptop is
#  off. This task handles only jobs explicitly assigned to the laptop and makes
#  them resume automatically after this Windows user signs in.
#
#  The task runs continuously until sign-out/shutdown. The watcher polls R2
#  every three seconds and safely ignores github-actions jobs.
# =============================================================================

param(
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "ContentFactoryQueue"
$WatchScript = Join-Path $Root "scripts\factory-watch.cmd"
$StartupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "ContentFactoryQueue.lnk"

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
  }
  if (Test-Path -LiteralPath $StartupShortcut) {
    Remove-Item -LiteralPath $StartupShortcut
    Write-Host "Removed Startup shortcut '$StartupShortcut'." -ForegroundColor Green
  }
  if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) -and
      -not (Test-Path -LiteralPath $StartupShortcut)) {
    Write-Host "Automatic queue startup is disabled."
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $WatchScript)) {
  throw "Queue watcher not found: $WatchScript"
}

# The legacy all-in-one task calls factory-online.cmd. That script now starts
# the queue watcher too, so registering a second watcher would only duplicate a
# long-running process.
if (Get-ScheduledTask -TaskName "ContentFactoryOnline" -ErrorAction SilentlyContinue) {
  Write-Host "'ContentFactoryOnline' is already registered." -ForegroundColor Green
  Write-Host "Its startup script now includes the laptop fallback queue watcher."
  exit 0
}

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/d /c `"`"$WatchScript`"`"" `
  -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1)

try {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Resume Content Factory jobs assigned to this laptop" `
    -ErrorAction Stop | Out-Null
  $method = "Windows scheduled task"
} catch {
  # Standard Windows accounts may not be allowed to create scheduled tasks.
  # A per-user Startup shortcut needs no administrator access and starts the
  # same watcher after sign-in.
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($StartupShortcut)
  $shortcut.TargetPath = $WatchScript
  $shortcut.WorkingDirectory = $Root
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Resume Content Factory jobs assigned to this laptop"
  $shortcut.Save()
  $method = "current-user Startup shortcut"
}

Write-Host "Automatic queue startup is enabled." -ForegroundColor Green
Write-Host "  method   : $method"
Write-Host "  starts   : automatically after Windows sign-in"
Write-Host "  handles  : laptop fallback jobs only"
Write-Host "  run now  : .\scripts\factory-watch.cmd"
Write-Host "  remove   : .\scripts\install-queue-startup.ps1 -Remove"
