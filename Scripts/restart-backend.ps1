# Reinicia API + ServerFEpos (servicios backend del ERP)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "`nReiniciando backend DevConexa...`n" -ForegroundColor Cyan
& "$PSScriptRoot\restart-api.ps1"
& "$PSScriptRoot\restart-fepos.ps1"
Write-Host "`nBackend listo.`n" -ForegroundColor Green
