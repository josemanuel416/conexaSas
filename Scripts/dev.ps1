# Inicia servicios Node en desarrollo (PostgreSQL local por defecto, sin Docker)
param(
    [ValidateSet("erp", "all")]
    [string]$Profile = "erp",
    [switch]$WithDocker
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Start-DevService($name, $path, $command, $env = @{}) {
    $title = "Conexa: $name"
    $envLines = ($env.GetEnumerator() | ForEach-Object { "`$env:$($_.Key)='$($_.Value)'" }) -join "; "
    $fullCmd = if ($envLines) { "$envLines; $command" } else { $command }

    Write-Host "  Iniciando $name..." -ForegroundColor Green
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "cd '$path'; `$Host.UI.RawUI.WindowTitle = '$title'; $fullCmd"
    ) | Out-Null
}

Write-Host "`nDevConexa — perfil: $Profile (Node local`$(if ($WithDocker) { ', BD Docker' }))`n" -ForegroundColor Cyan

if ($WithDocker) {
    Write-Host "PostgreSQL (Docker)..." -ForegroundColor Yellow
    Push-Location $Root
    docker compose up -d 2>$null
    Pop-Location
    Start-Sleep -Seconds 2
    Write-Host "  Usa DATABASE_URL de Docker en Sever.Conexa/.env" -ForegroundColor Yellow
} else {
    Write-Host "PostgreSQL local (sin levantar Docker)" -ForegroundColor DarkGray
}

& "$PSScriptRoot\restart-api.ps1"
& "$PSScriptRoot\restart-fepos.ps1"

if ($Profile -eq "erp" -or $Profile -eq "all") {
    Start-DevService "ErpConexa Frontend" (Join-Path $Root "ErpConexa") "npm run dev"
}

if ($Profile -eq "all") {
    Start-DevService "ChatBoot WhatsApp" (Join-Path $Root "ChatBoot") "npm run dev" @{ PORT = "3001" }
}

Write-Host @"

Servicios iniciados en ventanas separadas.

  ERP:    http://localhost:9500  (API vía proxy → puerto 3500 o alternativo)
  FEpos:  http://localhost:3010  (DIAN — reiniciar: .\Scripts\restart-fepos.ps1)
$(if ($Profile -eq "all") { "  Chat:   http://localhost:3001" })

  Servicios Windows (recomendado, más estables):
    .\Scripts\windows-services.ps1 -Action Install

"@ -ForegroundColor Green
