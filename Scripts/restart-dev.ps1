# Reinicio limpio del entorno de desarrollo (API + FEpos + ERP)
# Uso: .\Scripts\restart-dev.ps1
param(
    [switch]$SkipErp
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\windows-services\_service-helper.ps1"

function Get-FePosDevPort {
    param([string]$RootPath = $Root)
    $apiEnv = Join-Path $RootPath "Sever.Conexa\.env"
    if (Test-Path $apiEnv) {
        $m = Select-String -Path $apiEnv -Pattern '^FEPOS_URL=http://[^:]+:(\d+)' | Select-Object -First 1
        if ($m) { return [int]$m.Matches.Groups[1].Value }
    }
    return 3011
}

function Stop-PortListeners {
    param([int[]]$Ports)
    foreach ($port in $Ports) {
        $procIds = netstat -ano | Select-String ":$port\s+.*LISTENING" | ForEach-Object {
            ($_ -split '\s+')[-1]
        } | Sort-Object -Unique
        foreach ($procId in $procIds) {
            if ($procId -match '^\d+$' -and [int]$procId -gt 0) {
                Write-Host "  Puerto $port -> PID $procId" -ForegroundColor DarkGray
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Wait-HttpOk {
    param([string]$Url, [int]$TimeoutSec = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-RestMethod -Uri $Url -TimeoutSec 4 | Out-Null
            return $true
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

$fePosPort = Get-FePosDevPort
$apiPort = 3504
$erpPort = 9500

Write-Host ""
Write-Host "DevConexa - reinicio completo" -ForegroundColor Cyan
Write-Host "  API objetivo: $apiPort (FEpos -> $fePosPort)" -ForegroundColor DarkGray
Write-Host "  ERP: http://localhost:$erpPort" -ForegroundColor DarkGray

Write-Host ""
Write-Host "[1/5] Deteniendo servicios Windows..." -ForegroundColor Yellow
foreach ($svc in @('ConexaApi', 'ConexaFEpos')) {
    if (-not (Test-ConexaWindowsService $svc)) { continue }
    try {
        Stop-Service -Name $svc -Force -ErrorAction Stop
        Write-Host "  ${svc} detenido" -ForegroundColor DarkGray
    } catch {
        Write-Host "  ${svc} no detenido (requiere admin). Cerrando por puerto." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[2/5] Liberando puertos..." -ForegroundColor Yellow
$portsToFree = @(3500, 3501, 3502, 3503, 3504, 3505, 3506, 3507, 3508, 3509, 3010, 3011, $erpPort)
Stop-PortListeners -Ports $portsToFree
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "[3/5] Iniciando ServerFEpos en puerto $fePosPort..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$Root\ServerFEpos'; `$env:PORT=$fePosPort; `$Host.UI.RawUI.WindowTitle = 'Conexa: ServerFEpos ($fePosPort)'; node server.js"
) | Out-Null

if (-not (Wait-HttpOk "http://127.0.0.1:$fePosPort/health")) {
    Write-Host "ServerFEpos no respondio en puerto $fePosPort" -ForegroundColor Red
    exit 1
}
$fePosHealth = Invoke-RestMethod "http://127.0.0.1:$fePosPort/health" -TimeoutSec 5
Write-Host "  FEpos OK pid $($fePosHealth.pid) dianDnsFix=$($fePosHealth.dianDnsFix)" -ForegroundColor Green

Write-Host ""
Write-Host "[4/5] Iniciando Sever.Conexa en puerto $apiPort..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$Root\Sever.Conexa'; `$env:PORT=$apiPort; `$Host.UI.RawUI.WindowTitle = 'Conexa: API ($apiPort)'; node src/index.js"
) | Out-Null

if (-not (Wait-HttpOk "http://127.0.0.1:$apiPort/api/health")) {
    Write-Host "Sever.Conexa no respondio en puerto $apiPort" -ForegroundColor Red
    exit 1
}
$apiHealth = Invoke-RestMethod "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 5
if (-not (Test-ConexaApiFePosReady $apiPort)) {
    Write-Host "API en $apiPort sin FEpos DIAN listo" -ForegroundColor Red
    exit 1
}
Set-ConexaRuntimePort -Port $apiPort -Root $Root
Write-Host "  API OK fePosUrl=$($apiHealth.fePosUrl) runtime-port=$apiPort" -ForegroundColor Green

if (-not $SkipErp) {
    Write-Host ""
    Write-Host "[5/5] Iniciando ErpConexa..." -ForegroundColor Green
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "cd '$Root\ErpConexa'; `$Host.UI.RawUI.WindowTitle = 'Conexa: ErpConexa ($erpPort)'; npm run dev"
    ) | Out-Null
    Write-Host "  ERP iniciando en http://localhost:$erpPort (espere ~30s)" -ForegroundColor DarkGray
} else {
    Write-Host ""
    Write-Host "[5/5] ERP omitido (-SkipErp)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Listo." -ForegroundColor Green
Write-Host ("  ERP:   http://localhost:{0}" -f $erpPort) -ForegroundColor Green
Write-Host ("  API:   http://localhost:{0}/api/health" -f $apiPort) -ForegroundColor Green
Write-Host ("  FEpos: http://localhost:{0}/health" -f $fePosPort) -ForegroundColor Green
Write-Host ""
