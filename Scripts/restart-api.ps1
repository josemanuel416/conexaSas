# Reinicia / sincroniza Sever.Conexa (servicio Windows o ventana Node local)
param([switch]$ForceReload)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\windows-services\_service-helper.ps1"

$PreferredPort = Get-ConexaApiPreferredPort -Root $Root
$HealthPath = $script:ConexaApiHealthPath
$RuntimePort = Get-ConexaRuntimePort -Root $Root
$HasWindowsService = Test-ConexaWindowsService 'ConexaApi'

Write-Host "`nConexa API - puerto preferido $PreferredPort" -ForegroundColor Cyan
Show-ConexaApiPortDiagnostics -PreferredPort $PreferredPort -Root $Root

function Complete-ApiRestart {
    param([int]$Port)
    Set-ConexaRuntimePort -Port $Port -Root $Root
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port$HealthPath" -TimeoutSec 8
    Write-Host "Sever.Conexa OK en puerto $Port - $($health.service)" -ForegroundColor Green
    Write-Host "  runtime-port sincronizado -> $Port" -ForegroundColor DarkGray

    $orphans = Get-ConexaApiListeningPorts -FromPort $PreferredPort -ToPort ($PreferredPort + 9) |
        Where-Object { $_ -ne $Port }
    if ($orphans.Count -gt 0) {
        Write-Host "  Cerrando instancias duplicadas en: $($orphans -join ', ')" -ForegroundColor Yellow
        Stop-ConexaApiPortListeners -FromPort $PreferredPort -ToPort ($PreferredPort + 9) -ExcludePorts @($Port) | Out-Null
    }
}

# 1) API sana, notas CxP y FEpos DIAN -> sincronizar runtime-port (salvo -ForceReload)
$healthyPort = Find-ConexaHealthyApiPort -PreferredPort $PreferredPort -RequireNotas -RequireFePos
if (-not $healthyPort) {
    $staleFePosPort = Find-ConexaHealthyApiPort -PreferredPort $PreferredPort -RequireNotas
    if ($staleFePosPort -and -not (Test-ConexaApiFePosReady $staleFePosPort)) {
        Write-Host "API en puerto $staleFePosPort sin FEpos DIAN (codigo desactualizado o FEPOS_URL=3010). Reiniciando..." -ForegroundColor Yellow
        if ($HasWindowsService) {
            try { Stop-Service -Name 'ConexaApi' -Force -ErrorAction Stop } catch { }
        }
        Stop-ConexaApiPortListeners -FromPort $PreferredPort -ToPort ($PreferredPort + 9) | Out-Null
        Start-Sleep -Seconds 2
        $staleFePosPort = $null
    }
}

if ($healthyPort -and -not $ForceReload) {
    if ($RuntimePort -ne $healthyPort) {
        Write-Host "Corrigiendo runtime-port ($RuntimePort -> $healthyPort)..." -ForegroundColor Yellow
    } else {
        Write-Host "API OK en puerto $healthyPort (notas CxP disponibles)." -ForegroundColor Green
    }
    Complete-ApiRestart -Port $healthyPort
    exit 0
}

if ($ForceReload -and $healthyPort) {
    Write-Host "Recargando codigo: deteniendo API en puerto $healthyPort..." -ForegroundColor Yellow
    Stop-ConexaApiPortListeners -FromPort $PreferredPort -ToPort ($PreferredPort + 9) | Out-Null
    Start-Sleep -Seconds 2
    $healthyPort = $null
}

# API responde pero sin rutas nuevas (codigo viejo en servicio Windows)
if (-not $healthyPort) {
$stalePort = Find-ConexaHealthyApiPort -PreferredPort $PreferredPort
if ($stalePort -and -not (Test-ConexaApiFeatures $stalePort)) {
    Write-Host "API en puerto $stalePort sin rutas /notas (codigo desactualizado). Reiniciando..." -ForegroundColor Yellow
    if ($HasWindowsService) {
        try { Stop-Service -Name 'ConexaApi' -Force -ErrorAction Stop } catch { }
    }
    Stop-ConexaApiPortListeners -FromPort $PreferredPort -ToPort ($PreferredPort + 9) | Out-Null
    Start-Sleep -Seconds 2
}
}

if (-not $healthyPort) {
Write-Host "No hay API actualizada en $($PreferredPort)-$($PreferredPort + 9)." -ForegroundColor Yellow

# 2) Intentar servicio Windows
if ($HasWindowsService) {
    $serviceStarted = $false
    try {
        if (Ensure-ConexaWindowsService 'ConexaApi' $PreferredPort $HealthPath -ForceRestart) {
            $serviceStarted = $true
        }
    } catch {
        Write-Host "Servicio Windows no pudo reiniciarse: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    if ($serviceStarted) {
        Start-Sleep -Seconds 3
        if (Wait-ConexaApiHealth -Port $PreferredPort) {
            if (Test-ConexaApiFeatures $PreferredPort) {
                Complete-ApiRestart -Port $PreferredPort
                exit 0
            }
        }
    }
}

# 3) Modo manual: limpiar puertos y levantar una sola instancia
Write-Host "Deteniendo instancias previas en $($PreferredPort)-$($PreferredPort + 9)..." -ForegroundColor Yellow
$stopped = Stop-ConexaApiPortListeners -FromPort $PreferredPort -ToPort ($PreferredPort + 9)
foreach ($item in $stopped) {
    Write-Host "  Puerto $($item.Port) PID $($item.Pid)" -ForegroundColor DarkGray
}

Start-Sleep -Seconds 2

if ($HasWindowsService) {
    Write-Host "Iniciando servicio Windows ConexaApi..." -ForegroundColor Green
    try {
        Start-Service -Name 'ConexaApi' -ErrorAction Stop
        if (Wait-ConexaApiHealth -Port $PreferredPort) {
            if (Test-ConexaApiFeatures $PreferredPort) {
                Complete-ApiRestart -Port $PreferredPort
                exit 0
            }
        }
    } catch {
        Write-Host "No se pudo iniciar el servicio (¿admin?): $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "Iniciando Sever.Conexa en ventana Node (npm start)..." -ForegroundColor Green
Write-Host "  Tip: instale servicio Windows con .\Scripts\windows-services\install.ps1" -ForegroundColor DarkGray
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$Root\Sever.Conexa'; `$Host.UI.RawUI.WindowTitle = 'Conexa: Sever.Conexa API'; npm start"
) | Out-Null

$healthyPort = $null
for ($i = 0; $i -lt 25; $i += 1) {
    Start-Sleep -Seconds 1
    $healthyPort = Find-ConexaHealthyApiPort -PreferredPort $PreferredPort -RequireNotas -RequireFePos
    if ($healthyPort) { break }
}

if ($healthyPort) {
    Complete-ApiRestart -Port $healthyPort
} else {
    Write-Host "Sever.Conexa iniciado; no respondió a tiempo en /api/health" -ForegroundColor Yellow
    Write-Host "  Verifique la ventana 'Conexa: Sever.Conexa API'" -ForegroundColor DarkGray
}
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
    Write-Host "  Ejecute: .\Scripts\restart-fepos.ps1 -ForceReload" -ForegroundColor Yellow
}

if ($ForceReload) {
    & "$PSScriptRoot\restart-fepos.ps1" -ForceReload
}
