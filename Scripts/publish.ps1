# Publica un paquete autónomo en C:\ConexaErp (web compilada + API + FEpos).
# La carpeta de fuentes se puede quitar después; Node.js y PostgreSQL siguen en el equipo.
param(
    [string]$Dest = 'C:\ConexaErp'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ApiSrc = Join-Path $Root 'Sever.Conexa'
$FeSrc = Join-Path $Root 'ServerFEpos'
$ErpSrc = Join-Path $Root 'ErpConexa'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Copy-AppTree($from, $to) {
    New-Item -ItemType Directory -Force -Path $to | Out-Null
    $excludeDirs = @('node_modules', '.git', 'logs', 'firmados', 'validados_dian')
    Get-ChildItem $from -Force | Where-Object {
        $_.Name -notin $excludeDirs -and $_.Name -ne '.runtime-port'
    } | ForEach-Object {
        Copy-Item $_.FullName -Destination (Join-Path $to $_.Name) -Recurse -Force
    }
    $nmFrom = Join-Path $from 'node_modules'
    $nmTo = Join-Path $to 'node_modules'
    if (Test-Path $nmFrom) {
        Write-Host "  Copiando node_modules $(Split-Path $from -Leaf)..." -ForegroundColor DarkGray
        robocopy $nmFrom $nmTo /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy node_modules fallo ($LASTEXITCODE) en $from" }
    }
}

Write-Step "Compilando ErpConexa (Quasar SPA, API same-origin)"
Push-Location $ErpSrc
$env:VITE_API_URL = 'same-origin'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'quasar build fallo' }
Pop-Location

$spa = Join-Path $ErpSrc 'dist\spa'
if (-not (Test-Path (Join-Path $spa 'index.html'))) {
    throw "No se encontro dist/spa/index.html"
}

Write-Step "Publicando en $Dest"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$web = Join-Path $Dest 'web'
$api = Join-Path $Dest 'api'
$fepos = Join-Path $Dest 'fepos'

if (Test-Path $web) { Remove-Item $web -Recurse -Force }
New-Item -ItemType Directory -Force -Path $web | Out-Null
Copy-Item (Join-Path $spa '*') -Destination $web -Recurse -Force

Copy-AppTree $ApiSrc $api
Copy-AppTree $FeSrc $fepos

$envApi = Join-Path $api '.env'
if (-not (Test-Path $envApi)) {
    Copy-Item (Join-Path $ApiSrc '.env.example') $envApi
}
$envText = Get-Content $envApi -Raw
$envText = [regex]::Replace($envText, '(?m)^NODE_ENV=.*$', 'NODE_ENV=production')
if ($envText -notmatch '(?m)^NODE_ENV=') { $envText = "NODE_ENV=production`r`n$envText" }
$envText = [regex]::Replace($envText, '(?m)^PORT=.*$', 'PORT=3500')
$envText = [regex]::Replace($envText, '(?m)^CORS_ORIGIN=.*$', 'CORS_ORIGIN=http://localhost,http://127.0.0.1,http://localhost:3500,http://127.0.0.1:3500,http://74.208.104.128,http://74.208.104.128:3500')
$envText = [regex]::Replace($envText, '(?m)^FEPOS_CERT_ROOT=.*$', 'FEPOS_CERT_ROOT=C:\\ConexaErp\\fepos\\cert\\companies')
$envText = [regex]::Replace($envText, '(?m)^CERT_STORAGE_PATH=.*$', 'CERT_STORAGE_PATH=C:\\ConexaErp\\api\\storage\\dian-certs')
if ($envText -match '(?m)^WEB_ROOT=') {
    $envText = [regex]::Replace($envText, '(?m)^WEB_ROOT=.*$', 'WEB_ROOT=C:\\ConexaErp\\web')
} else {
    $envText = $envText.TrimEnd() + "`r`nWEB_ROOT=C:\\ConexaErp\\web`r`n"
}
Set-Content -Path $envApi -Value $envText -Encoding utf8

New-Item -ItemType Directory -Force -Path (Join-Path $api 'storage\dian-certs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $fepos 'cert\companies') | Out-Null

$svcSrc = Join-Path $Root 'Scripts\windows-services'
$svcDst = Join-Path $Dest 'windows-services'
if (Test-Path $svcSrc) {
    if (Test-Path $svcDst) { Remove-Item $svcDst -Recurse -Force }
    Copy-Item $svcSrc $svcDst -Recurse -Force
}

$startPs1 = @'
param([ValidateSet("Start","Stop","Status")][string]$Action = "Start")
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$node = (Get-Command node).Source

function Stop-Port($port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

function Get-ProcOnPort($port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
}

switch ($Action) {
    "Stop" {
        Stop-Port 3500
        Stop-Port 3010
        Write-Host "API y FEpos detenidos."
    }
    "Status" {
        foreach ($p in @(3500, 3010)) {
            $c = Get-ProcOnPort $p
            if ($c) { Write-Host "Puerto ${p}: LISTEN pid=$($c.OwningProcess -join ',')" }
            else { Write-Host "Puerto ${p}: libre" }
        }
        try { Invoke-RestMethod http://127.0.0.1:3500/api/health -TimeoutSec 4 | ConvertTo-Json -Compress } catch { Write-Host "API health: $($_.Exception.Message)" }
        try { Invoke-RestMethod http://127.0.0.1:3010/health -TimeoutSec 4 | ConvertTo-Json -Compress } catch { Write-Host "FEpos health: $($_.Exception.Message)" }
    }
    "Start" {
        Stop-Port 3500
        Stop-Port 3010
        Start-Process $node -ArgumentList "src\index.js" -WorkingDirectory (Join-Path $Root "api") -WindowStyle Hidden
        Start-Process $node -ArgumentList "server.js" -WorkingDirectory (Join-Path $Root "fepos") -WindowStyle Hidden
        Start-Sleep -Seconds 4
        Write-Host "ERP:  http://127.0.0.1:3500"
        Write-Host "API:  http://127.0.0.1:3500/api/health"
        Write-Host "FEpos: http://127.0.0.1:3010/health"
    }
}
'@
Set-Content -Path (Join-Path $Dest 'start.ps1') -Value $startPs1 -Encoding UTF8

Write-Step "Listo"
Write-Host @"

Publicado en $Dest

  Web:   $web
  API:   $api
  FEpos: $fepos

Arrancar:
  powershell -ExecutionPolicy Bypass -File $Dest\start.ps1

ERP (mismo origen, puerto 3500):
  http://127.0.0.1:3500

Servicios Windows (desde el repo de fuentes, mientras exista):
  .\Scripts\windows-services.ps1 -Action Install -DeployRoot $Dest

"@ -ForegroundColor Green
