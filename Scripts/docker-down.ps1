# Detiene los contenedores Docker al terminar las pruebas de fin de jornada
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "`nDeteniendo Docker DevConexa...`n" -ForegroundColor Cyan
Push-Location $Root
docker compose down
Pop-Location

Write-Host @"
Contenedores detenidos.

Recuerda restaurar en Sever.Conexa/.env tu DATABASE_URL de PostgreSQL local
si lo cambiaste para las pruebas con Docker.

"@ -ForegroundColor Green
