# =============================================================================
#  Go back to sleep - but only when that is actually the right thing to do.
# =============================================================================
#  Called after `queue drain`. Sleeping unconditionally would be wrong in three
#  common situations, so each is checked before suspending:
#
#    1. SOMEONE IS USING THE MACHINE. Waking at 14:00 to run a job while its
#       owner is sitting there, then sleeping the laptop under them, is hostile.
#       Checked with GetLastInputInfo (real keyboard/mouse idle time).
#
#    2. THE PORTAL IS MEANT TO BE UP. factory-online.cmd runs the tunnel so
#       factory.coderfact.com answers. Sleeping kills it. If cloudflared is
#       running, this machine is deliberately serving and must stay awake.
#
#    3. WORK IS STILL RUNNING. A render or ffmpeg job still going means the
#       drain is not finished.
#
#  Sleep, never hibernate: hibernate (S4) resume is slower and interacts badly
#  with Fast Startup, which is enabled here. And disableWakeEvent MUST be false
#  or the next scheduled wake will not fire - which would strand the queue
#  permanently.
#
#  ASCII only: PowerShell 5.1 reads .ps1 as cp1252.
# =============================================================================

param(
  [int]$IdleMinutes = 10,   # someone active within this window = do not sleep
  [switch]$Force,           # skip the guards (for testing)
  [switch]$WhatIf           # report the decision, sleep nothing
)

$ErrorActionPreference = "Stop"

# --- 1. how long since real user input? --------------------------------------
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IdleCheck {
  [StructLayout(LayoutKind.Sequential)]
  struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint IdleMs() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(lii);
    if (!GetLastInputInfo(ref lii)) return 0;
    return (uint)Environment.TickCount - lii.dwTime;
  }
}
"@ -ErrorAction SilentlyContinue

$idleMin = [math]::Round([IdleCheck]::IdleMs() / 60000, 1)

# --- 2. is this machine deliberately serving? --------------------------------
$tunnel = Get-Process cloudflared -ErrorAction SilentlyContinue

# --- 3. is work still running? -----------------------------------------------
$busy = Get-Process ffmpeg, python, whisper-ctranslate2 -ErrorAction SilentlyContinue

$reasons = @()
if (-not $Force) {
  if ($idleMin -lt $IdleMinutes) { $reasons += "someone used this machine $idleMin min ago (need $IdleMinutes)" }
  if ($tunnel)                   { $reasons += "cloudflared is running - the portal is meant to be reachable" }
  if ($busy)                     { $reasons += "still working: $(($busy | Select-Object -Expand ProcessName -Unique) -join ', ')" }
}

if ($reasons.Count -gt 0) {
  Write-Host "staying awake:" -ForegroundColor Yellow
  $reasons | ForEach-Object { Write-Host "  - $_" }
  exit 0
}

if ($WhatIf) {
  Write-Host "would sleep now (idle $idleMin min, no tunnel, nothing running)" -ForegroundColor Cyan
  exit 0
}

Write-Host "sleeping (idle $idleMin min, nothing to keep this awake)" -ForegroundColor Green
# hibernate=false, force=true, disableWakeEvent=FALSE  <- the last one matters
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $true, $false) | Out-Null
