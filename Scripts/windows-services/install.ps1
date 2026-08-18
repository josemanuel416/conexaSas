# Instala / administra servicios Windows para Sever.Conexa y ServerFEpos (NSSM + Node.js)
# Requiere PowerShell como Administrador.
#
# Uso:
#   .\Scripts\windows-services\install.ps1              # instalar e iniciar
#   .\Scripts\windows-services\install.ps1 -Action Status
#   .\Scripts\windows-services\install.ps1 -Action Restart
#   .\Scripts\windows-services\install.ps1 -Action Uninstall
#
param(
    [ValidateSet('Install', 'Uninstall', 'Status', 'Start', 'Stop', 'Restart')]
    [string]$Action = 'Install'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ToolsDir = Join-Path $PSScriptRoot 'tools'
$NssmDir = Join-Path $ToolsDir 'nssm'
$LogDir = Join-Path $PSScriptRoot 'logs'

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ProjectPort($envPath, $defaultPort) {
    if (-not (Test-Path $envPath)) { return $defaultPort }
    $m = Select-String -Path $envPath -Pattern '^PORT=(\d+)' | Select-Object -First 1
    if ($m) { return [int]$m.Matches.Groups[1].Value }
    return $defaultPort
}

function Stop-PortListeners($port) {
    $procIds = netstat -ano | Select-String ":$port\s+.*LISTENING" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique

    foreach ($procId in $procIds) {
        if ($procId -match '^\d+$' -and [int]$procId -gt 0) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-NssmExe {
    $local = Join-Path $NssmDir 'win64\nssm.exe'
    if (Test-Path $local) { return $local }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host 'Instalando NSSM con winget...' -ForegroundColor Yellow
        winget install --id NSSM.NSSM -e --accept-source-agreements --accept-package-agreements | Out-Null
        $fromPath = Get-Command nssm -ErrorAction SilentlyContinue
        if ($fromPath) { return $fromPath.Source }
    }

    Write-Host 'Descargando NSSM 2.24...' -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $NssmDir | Out-Null
    $zipPath = Join-Path $ToolsDir 'nssm-2.24.zip'
    Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $NssmDir -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path $local)) {
        throw "No se encontró nssm.exe en $local"
    }
    return $local
}

function Get-ServiceDefinitions($nodeExe) {
    $apiPort = Get-ProjectPort (Join-Path $Root 'Sever.Conexa\.env') 3500
    $fePort = Get-ProjectPort (Join-Path $Root 'ServerFEpos\.env') 3010

    return @(
        @{
            Name        = 'ConexaApi'
            DisplayName = 'Conexa API (Sever.Conexa)'
            Description = "API REST DevConexa - puerto $apiPort"
            WorkDir     = Join-Path $Root 'Sever.Conexa'
            App         = $nodeExe
            Args        = 'src\index.js'
            Port        = $apiPort
            HealthPath  = '/api/health'
            LogBase     = 'api'
        },
        @{
            Name        = 'ConexaFEpos'
            DisplayName = 'Conexa FEpos (DIAN)'
            Description = "Facturacion electronica DIAN - puerto $fePort"
            WorkDir     = Join-Path $Root 'ServerFEpos'
            App         = $nodeExe
            Args        = 'server.js'
            Port        = $fePort
            HealthPath  = '/health'
            LogBase     = 'fepos'
        }
    )
}

function Install-ConexaService($nssm, $svc) {
    $existing = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  Deteniendo servicio existente $($svc.Name)..." -ForegroundColor DarkGray
        Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
        & $nssm remove $svc.Name confirm | Out-Null
        Start-Sleep -Seconds 1
    }

    Write-Host "  Liberando puerto $($svc.Port)..." -ForegroundColor DarkGray
    Stop-PortListeners $svc.Port

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $stdout = Join-Path $LogDir "$($svc.LogBase).log"
    $stderr = Join-Path $LogDir "$($svc.LogBase)-error.log"

    & $nssm install $svc.Name $svc.App $svc.Args | Out-Null
    & $nssm set $svc.Name AppDirectory $svc.WorkDir | Out-Null
    & $nssm set $svc.Name DisplayName $svc.DisplayName | Out-Null
    & $nssm set $svc.Name Description $svc.Description | Out-Null
    & $nssm set $svc.Name Start SERVICE_AUTO_START | Out-Null
    & $nssm set $svc.Name AppStdout $stdout | Out-Null
    & $nssm set $svc.Name AppStderr $stderr | Out-Null
    & $nssm set $svc.Name AppStdoutCreationDisposition 4 | Out-Null
    & $nssm set $svc.Name AppStderrCreationDisposition 4 | Out-Null
    & $nssm set $svc.Name AppRotateFiles 1 | Out-Null
    & $nssm set $svc.Name AppRotateBytes 5242880 | Out-Null
    & $nssm set $svc.Name AppExit Default Restart | Out-Null
    & $nssm set $svc.Name AppRestartDelay 5000 | Out-Null

    Write-Host "  Instalado: $($svc.DisplayName)" -ForegroundColor Green
}

function Show-Status($services) {
    Write-Host "`nServicios DevConexa`n" -ForegroundColor Cyan
    foreach ($svc in $services) {
        $winSvc = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
        if (-not $winSvc) {
            Write-Host "  $($svc.Name): no instalado" -ForegroundColor Yellow
            continue
        }
        $color = switch ($winSvc.Status) {
            'Running' { 'Green' }
            'Stopped' { 'Red' }
            default { 'Yellow' }
        }
        $health = '-'
        if ($winSvc.Status -eq 'Running') {
            try {
                $r = Invoke-RestMethod -Uri "http://127.0.0.1:$($svc.Port)$($svc.HealthPath)" -TimeoutSec 4
                $health = 'OK'
            } catch {
                $health = "sin respuesta ($($_.Exception.Message))"
            }
        }
        Write-Host "  $($svc.DisplayName)" -ForegroundColor $color
        Write-Host "    Estado: $($winSvc.Status)  |  Puerto: $($svc.Port)  |  Health: $health"
        Write-Host "    Logs: $LogDir\$($svc.LogBase).log"
    }
    Write-Host ''
}

if ($Action -ne 'Status' -and -not (Test-IsAdmin)) {
    Write-Host 'Se requieren permisos de administrador. Reejecutando elevado...' -ForegroundColor Yellow
    Write-Host '  Acepte el aviso UAC (Control de cuentas de usuario) para continuar.' -ForegroundColor DarkGray
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Action $Action"
    Start-Process powershell -Verb RunAs -ArgumentList $argList
    Write-Host '  Ventana elevada abierta. Use -Action Status para ver el resultado sin admin.' -ForegroundColor DarkGray
    exit 0
}

$nodeExe = (Get-Command node -ErrorAction Stop).Source
$services = Get-ServiceDefinitions $nodeExe
$nssm = if ($Action -in @('Install', 'Uninstall')) { Get-NssmExe } else { $null }

switch ($Action) {
    'Install' {
        Write-Host "`nInstalando servicios Windows DevConexa...`n" -ForegroundColor Cyan
        foreach ($svc in $services) {
            Write-Host "-> $($svc.Name)" -ForegroundColor White
            Install-ConexaService $nssm $svc
        }
        Write-Host "`nIniciando servicios..." -ForegroundColor Cyan
        foreach ($svc in $services) {
            Start-Service -Name $svc.Name
        }
        Start-Sleep -Seconds 4
        Show-Status $services
        Write-Host @"
Listo. Los servicios arrancan solos con Windows y se reinician si fallan.

  Administrar:  .\Scripts\windows-services\install.ps1 -Action Restart
  Ver estado:   .\Scripts\windows-services\install.ps1 -Action Status
  Desinstalar:  .\Scripts\windows-services\install.ps1 -Action Uninstall

Evite .\Scripts\restart-api.ps1 en paralelo (mata el puerto del servicio).
Use restart-api.ps1 solo si NO usa servicios Windows.

"@ -ForegroundColor Green
    }
    'Uninstall' {
        Write-Host "`nDesinstalando servicios...`n" -ForegroundColor Yellow
        foreach ($svc in $services) {
            $winSvc = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
            if ($winSvc) {
                Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
                & $nssm remove $svc.Name confirm | Out-Null
                Write-Host "  Removido: $($svc.Name)" -ForegroundColor Green
            }
        }
    }
    'Start' {
        foreach ($svc in $services) { Start-Service -Name $svc.Name -ErrorAction SilentlyContinue }
        Show-Status $services
    }
    'Stop' {
        foreach ($svc in $services) { Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue }
        Show-Status $services
    }
    'Restart' {
        foreach ($svc in $services) {
            Restart-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 4
        Show-Status $services
    }
    'Status' {
        Show-Status $services
    }
}
