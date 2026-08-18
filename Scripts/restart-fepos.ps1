# Reinicia ServerFEpos (servicio Windows o ventana Node local)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\windows-services\_service-helper.ps1"

$Port = 3010
if (Test-Path "$Root\ServerFEpos\.env") {
  $m = Select-String -Path "$Root\ServerFEpos\.env" -Pattern '^PORT=(\d+)' | Select-Object -First 1
  if ($m) { $Port = [int]$m.Matches.Groups[1].Value }
}

if (Ensure-ConexaWindowsService 'ConexaFEpos' $Port '/health') {
  Start-Sleep -Seconds 3
  $healthUrl = "http://127.0.0.1:$Port/health"
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 8
    Write-Host "ConexaFEpos (servicio Windows) OK en puerto $Port - pid $($health.pid)" -ForegroundColor Green
  } catch {
    Write-Host "Servicio reiniciado; verifique $healthUrl" -ForegroundColor Yellow
    Write-Host "  Log: Scripts\windows-services\logs\fepos-error.log" -ForegroundColor DarkGray
  }
  exit 0
}

Write-Host "Deteniendo procesos en puerto $Port..." -ForegroundColor Yellow
$procIds = netstat -ano | Select-String ":$Port\s+.*LISTENING" | ForEach-Object {
  ($_ -split '\s+')[-1]
} | Sort-Object -Unique

foreach ($procId in $procIds) {
  if ($procId -match '^\d+$' -and [int]$procId -gt 0) {
    Write-Host "  PID $procId" -ForegroundColor DarkGray
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Seconds 2

Write-Host "Iniciando ServerFEpos (modo estable, sin nodemon)..." -ForegroundColor Green
Write-Host "  Tip: instale servicio Windows con .\Scripts\windows-services.ps1" -ForegroundColor DarkGray
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "cd '$Root\ServerFEpos'; `$Host.UI.RawUI.WindowTitle = 'Conexa: ServerFEpos DIAN'; npm run serve"
) | Out-Null

Start-Sleep -Seconds 3
$healthUrl = "http://127.0.0.1:$Port/health"
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 8
  Write-Host "ServerFEpos OK en puerto $Port - pid $($health.pid), uptime $($health.uptimeSec)s" -ForegroundColor Green
} catch {
  Write-Host "ServerFEpos no respondió en $healthUrl" -ForegroundColor Red
  Write-Host "  Revise la ventana 'Conexa: ServerFEpos DIAN' o el log del servicio Windows." -ForegroundColor Yellow
  exit 1
}
