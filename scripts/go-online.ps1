# =============================================================================
#  Content Factory - put the portal online at zero cost
# =============================================================================
#  Run ONCE. It sets up a permanent, free, HTTPS address for the portal using
#  Cloudflare Tunnel on a domain you already own.
#
#  Why this and not a host: the portal drives ffmpeg, Chrome, Python and whisper
#  and takes minutes per render. Every free serverless tier can run none of that.
#  A tunnel keeps the work on this machine and only publishes the door - which
#  is why it is free rather than cheap.
#
#  What it does NOT do: it will not touch your Cloudflare account or DNS on its
#  own. The two steps that do (`tunnel login`, `tunnel route dns`) are yours to
#  run and it tells you exactly when.
# =============================================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TunnelName = "content-factory"
$Hostname = "factory.coderfact.com"   # change if you want a different subdomain

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    !!  $msg" -ForegroundColor Yellow }

# --- 1. password ------------------------------------------------------------
Step 1 "Portal password"
$envFile = Join-Path $Root ".env"
$envText = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { "" }
$hasPassword = $envText -match '(?m)^FACTORY_PASSWORD=\S+'

if ($hasPassword) {
  Ok "FACTORY_PASSWORD is already set"
} else {
  # 32 random bytes, base64 - long enough that nobody guesses it
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pw = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
  if ($envText -match '(?m)^FACTORY_PASSWORD=') {
    $envText = $envText -replace '(?m)^FACTORY_PASSWORD=.*$', "FACTORY_PASSWORD=$pw"
  } else {
    $envText = $envText.TrimEnd() + "`nFACTORY_PASSWORD=$pw`n"
  }
  Set-Content -Path $envFile -Value $envText -Encoding utf8
  Ok "generated a password and wrote it to .env"
  Write-Host "`n    YOUR PASSWORD (save it in your password manager now):" -ForegroundColor Yellow
  Write-Host "    $pw`n" -ForegroundColor White
}

# --- 2. cloudflared ---------------------------------------------------------
Step 2 "Cloudflare Tunnel client"
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cf) {
  Ok "cloudflared present"
} else {
  Write-Host "    installing via winget..."
  winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
  Warn "reopen this terminal so cloudflared is on PATH, then run this script again"
  exit 0
}

# --- 3. the two steps you run ----------------------------------------------
Step 3 "Authorise and create the tunnel"
$tunnelList = (cloudflared tunnel list 2>&1 | Out-String)
if ($tunnelList -match [regex]::Escape($TunnelName)) {
  Ok "tunnel '$TunnelName' already exists"
} else {
  Write-Host @"
    Run these two commands yourself - they touch your Cloudflare account
    and add a DNS record, so this script will not do it for you:

      cloudflared tunnel login
      cloudflared tunnel create $TunnelName
      cloudflared tunnel route dns $TunnelName $Hostname

    Then run this script again.
"@ -ForegroundColor Yellow
  exit 0
}

# --- 4. tunnel config ------------------------------------------------------
Step 4 "Tunnel config"
$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
$idLine = (cloudflared tunnel list 2>&1 | Select-String $TunnelName | Out-String).Trim()
$tunnelId = ($idLine -split '\s+')[0]
$configPath = Join-Path $cfDir "config.yml"

@"
# written by scripts/go-online.ps1
tunnel: $tunnelId
credentials-file: $cfDir\$tunnelId.json

ingress:
  - hostname: $Hostname
    service: http://localhost:4600
  - service: http_status:404
"@ | Set-Content -Path $configPath -Encoding utf8
Ok "wrote $configPath -> $Hostname"

# --- 5. run on boot --------------------------------------------------------
Step 5 "Start automatically when this PC boots"
$startScript = Join-Path $Root "scripts\factory-online.cmd"
$taskName = "ContentFactoryOnline"
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Ok "scheduled task already registered"
} else {
  $action = New-ScheduledTaskAction -Execute $startScript
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Content Factory portal + tunnel" | Out-Null
  Ok "registered '$taskName' - starts at login"
}

# --- 6. stay awake ---------------------------------------------------------
Step 6 "Sleep settings"
Write-Host @"
    The tunnel only answers while this PC is awake. To make "anytime" true:

      powercfg /change standby-timeout-ac 0
      powercfg /change hibernate-timeout-ac 0

    (Screen can still sleep - that costs nothing. Only standby breaks it.)
"@

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "  Start it now:  scripts\factory-online.cmd"
Write-Host "  Then open:     https://$Hostname"
Write-Host "`n  Strongly recommended, also free: put Cloudflare Access in front of"
Write-Host "  $Hostname and restrict it to your own email. That gives you a second,"
Write-Host "  independent gate - dash.cloudflare.com -> Zero Trust -> Access -> Applications`n"
