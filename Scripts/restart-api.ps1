# Reinicia Sever.Conexa (servicio Windows o ventana Node local)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\windows-services\_service-helper.ps1"

$PreferredPort = 3500
if (Test-Path "$Root\Sever.Conexa\.env") {
  $m = Select-String -Path "$Root\Sever.Conexa\.env" -Pattern '^PORT=(\d+)' | Select-Object -First 1
  if ($m) { $PreferredPort = [int]$m.Matches.Groups[1].Value }
}

if (Ensure-ConexaWindowsService 'ConexaApi' $PreferredPort '/api/health') {
  Start-Sleep -Seconds 4
  $runtimePort = $PreferredPort
  $runtimeFile = "$Root\Sever.Conexa\.runtime-port"
  if (Test-Path $runtimeFile) {
    $runtimePort = [int](Get-Content $runtimeFile -Raw).Trim()
  }
  $healthUrl = "http://127.0.0.1:$runtimePort/api/health"
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 10
    Write-Host "ConexaApi (servicio Windows) OK en puerto $runtimePort - $($health.service)" -ForegroundColor Green
  } catch {
    Write-Host "Servicio reiniciado; verifique $healthUrl" -ForegroundColor Yellow
    Write-Host "  Log: Scripts\windows-services\logs\api-error.log" -ForegroundColor DarkGray
  }
  exit 0
}

Write-Host "Deteniendo instancias previas en puerto $PreferredPort..." -ForegroundColor Yellow
$procIds = netstat -ano | Select-String ":$PreferredPort\s+.*LISTENING" | ForEach-Object {
  ($_ -split '\s+')[-1]
} | Sort-Object -Unique

foreach ($procId in $procIds) {
  if ($procId -match '^\d+$' -and [int]$procId -gt 0) {
    Write-Host "  PID $procId" -ForegroundColor DarkGray
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Seconds 2

Write-Host "Iniciando Sever.Conexa (modo estable, sin --watch)..." -ForegroundColor Green
Write-Host "  Tip: instale servicio Windows con .\Scripts\windows-services.ps1" -ForegroundColor DarkGray
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "cd '$Root\Sever.Conexa'; `$Host.UI.RawUI.WindowTitle = 'Conexa: Sever.Conexa API'; npm start"
) | Out-Null

Start-Sleep -Seconds 4
$runtimePort = $PreferredPort
$runtimeFile = "$Root\Sever.Conexa\.runtime-port"
if (Test-Path $runtimeFile) {
  $runtimePort = [int](Get-Content $runtimeFile -Raw).Trim()
}

$healthUrl = "http://127.0.0.1:$runtimePort/api/health"
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 10
  Write-Host "Sever.Conexa OK en puerto $runtimePort - $($health.service)" -ForegroundColor Green
} catch {
  Write-Host "Sever.Conexa iniciado; verifique en $healthUrl" -ForegroundColor Yellow
}

$fePosPort = 3010
if (Test-Path "$Root\ServerFEpos\.env") {
  $fm = Select-String -Path "$Root\ServerFEpos\.env" -Pattern '^PORT=(\d+)' | Select-Object -First 1
  if ($fm) { $fePosPort = [int]$fm.Matches.Groups[1].Value }
}
$fePosHealthUrl = "http://127.0.0.1:$fePosPort/health"
try {
  $fePos = Invoke-RestMethod -Uri $fePosHealthUrl -TimeoutSec 3
  Write-Host "ServerFEpos OK en puerto $fePosPort - pid $($fePos.pid)" -ForegroundColor Green
} catch {
  Write-Host "ServerFEpos NO responde en $fePosHealthUrl" -ForegroundColor Red
  Write-Host "  Ejecute: .\Scripts\restart-fepos.ps1" -ForegroundColor Yellow
}
