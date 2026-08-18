# Configuración inicial del entorno DevConexa (PostgreSQL local por defecto)
param(
    [switch]$WithDocker,
    [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Ensure-EnvFile($projectPath, $exampleName = ".env.example") {
    $envFile = Join-Path $projectPath ".env"
    $example = Join-Path $projectPath $exampleName
    if (-not (Test-Path $envFile) -and (Test-Path $example)) {
        Copy-Item $example $envFile
        Write-Host "  Creado .env en $(Split-Path $projectPath -Leaf)" -ForegroundColor Green
    }
}

Write-Step "Verificando Node.js"
$nodeVersion = node -v
Write-Host "  Node $nodeVersion"

if ($WithDocker) {
    Write-Step "Levantando PostgreSQL (Docker)"
    Push-Location $Root
    docker compose up -d
    Pop-Location
    Write-Host "  Esperando PostgreSQL..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
} else {
    Write-Host "`n  PostgreSQL local (sin Docker). Asegúrate de tener la BD 'Conexa' creada" -ForegroundColor Yellow
    Write-Host "  y DATABASE_URL configurada en Sever.Conexa/.env" -ForegroundColor Yellow
}

Write-Step "Configurando variables de entorno"
Ensure-EnvFile (Join-Path $Root "Sever.Conexa")
Ensure-EnvFile (Join-Path $Root "ErpConexa")
Ensure-EnvFile (Join-Path $Root "ServerFEpos")
Ensure-EnvFile (Join-Path $Root "ChatBoot")

Write-Step "Instalando dependencias"
$projects = @(
    @{ Name = "Sever.Conexa"; Cmd = "npm install" },
    @{ Name = "ErpConexa"; Cmd = "npm install --ignore-scripts; npx quasar prepare" },
    @{ Name = "ServerFEpos"; Cmd = "npm install" },
    @{ Name = "ChatBoot"; Cmd = "npm install" }
)

foreach ($p in $projects) {
    $path = Join-Path $Root $p.Name
    Write-Host "  $($p.Name)..." -ForegroundColor Gray
    Push-Location $path
    Invoke-Expression $p.Cmd
    Pop-Location
}

if (-not $SkipMigrate) {
    Write-Step "Ejecutando migraciones (Sever.Conexa → PostgreSQL local)"
    Push-Location (Join-Path $Root "Sever.Conexa")
    npm run db:migrate
    Pop-Location
}

Write-Step "Listo"
Write-Host @"

Entorno configurado. Desarrollo diario (sin Docker):

  .\Scripts\dev.ps1 -Profile erp

Al final de la jornada, pruebas con Docker:

  .\Scripts\docker-up.ps1

"@ -ForegroundColor Green
