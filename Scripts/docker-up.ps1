# Fin de jornada: levanta PostgreSQL en Docker y prepara la BD para pruebas integradas
param(
    [switch]$SkipMigrate,
    [switch]$StartServices
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$DockerDbUrl = "postgresql://postgres:postgres@localhost:5432/Conexa"

Write-Host "`nDevConexa — Docker (fin de jornada)`n" -ForegroundColor Cyan

Write-Host "Levantando PostgreSQL en Docker..." -ForegroundColor Yellow
Push-Location $Root
docker compose up -d
Pop-Location

Start-Sleep -Seconds 3

if (-not $SkipMigrate) {
    Write-Host "Ejecutando migraciones sobre la BD de Docker..." -ForegroundColor Yellow
    Push-Location (Join-Path $Root "Sever.Conexa")
    $env:DATABASE_URL = $DockerDbUrl
    npm run db:migrate
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}

Write-Host @"

PostgreSQL en Docker listo.

IMPORTANTE — para probar contra Docker, ajusta temporalmente en Sever.Conexa/.env:

  DATABASE_URL=$DockerDbUrl

Luego inicia los servicios:

  .\Scripts\dev.ps1 -Profile erp
  .\Scripts\dev.ps1 -Profile all

Cuando termines:

  .\Scripts\docker-down.ps1

Vuelve a tu DATABASE_URL local para el desarrollo diario.

"@ -ForegroundColor Green

if ($StartServices) {
    & (Join-Path $PSScriptRoot "dev.ps1") -Profile erp
}
