# Atajo para administrar servicios Windows de DevConexa
param(
    [ValidateSet('Install', 'Uninstall', 'Status', 'Start', 'Stop', 'Restart')]
    [string]$Action = 'Install'
)

& "$PSScriptRoot\windows-services\install.ps1" -Action $Action
