# Helpers compartidos para detectar servicios Windows Conexa
$script:ConexaServiceNames = @('ConexaApi', 'ConexaFEpos')
$script:ConexaApiHealthPath = '/api/health'

function Get-ConexaRepoRoot {
    param([string]$FromScriptRoot = (Split-Path -Parent $PSScriptRoot))
    Split-Path -Parent $FromScriptRoot
}

function Get-ConexaApiPreferredPort {
    param([string]$Root = (Get-ConexaRepoRoot))
    $envPath = Join-Path $Root 'Sever.Conexa\.env'
    if (Test-Path $envPath) {
        $m = Select-String -Path $envPath -Pattern '^PORT=(\d+)' | Select-Object -First 1
        if ($m) { return [int]$m.Matches.Groups[1].Value }
    }
    return 3500
}

function Get-ConexaRuntimePortPath {
    param([string]$Root = (Get-ConexaRepoRoot))
    Join-Path $Root 'Sever.Conexa\.runtime-port'
}

function Set-ConexaRuntimePort {
    param(
        [int]$Port,
        [string]$Root = (Get-ConexaRepoRoot)
    )
    if ($Port -le 0) { return }
    $path = Get-ConexaRuntimePortPath -Root $Root
    Set-Content -Path $path -Value "$Port" -NoNewline -Encoding ascii
}

function Get-ConexaRuntimePort {
    param([string]$Root = (Get-ConexaRepoRoot))
    $path = Get-ConexaRuntimePortPath -Root $Root
    if (-not (Test-Path $path)) { return 0 }
    $parsed = [int](Get-Content $path -Raw).Trim()
    if ($parsed -gt 0) { return $parsed }
    return 0
}

function Test-ConexaWindowsService($name) {
    return [bool](Get-Service -Name $name -ErrorAction SilentlyContinue)
}

function Test-ConexaServiceHealth($port, $healthPath) {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$port$healthPath" -TimeoutSec 4 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-ConexaApiNotaPdfRoute {
    param([int]$Port)
    $probePath = '/api/company/cuentas-pagar/00000000-0000-4000-8000-000000000001/notas/00000000-0000-4000-8000-000000000002/pdf'
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$probePath" -Method GET -UseBasicParsing -TimeoutSec 4
        return $response.StatusCode -eq 401
    } catch {
        $status = $null
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        # 401 = ruta registrada (falta token); 404 = codigo viejo sin PDF de notas
        return $status -eq 401
    }
}

function Test-ConexaApiFeatures {
    param(
        [int]$Port,
        [string]$HealthPath = $script:ConexaApiHealthPath
    )
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port$HealthPath" -TimeoutSec 4
        if (-not $health.features.fcxpNotas) { return $false }
        if ($health.features.fcxpNotaPdf -eq $true) { return $true }
        return Test-ConexaApiNotaPdfRoute $Port
    } catch {
        return $false
    }
}

function Test-ConexaApiFePosReady {
    param(
        [int]$Port,
        [string]$HealthPath = $script:ConexaApiHealthPath
    )
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port$HealthPath" -TimeoutSec 4
        if (-not $health.fePosUrl) { return $false }
        if ($health.fePos -and $health.fePos.ok -eq $false) { return $false }
        if ($health.fePos -and $health.fePos.dianDnsFix -eq $false) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Find-ConexaHealthyApiPort {
    param(
        [int]$PreferredPort = 3500,
        [int]$MaxOffset = 10,
        [string]$HealthPath = $script:ConexaApiHealthPath,
        [switch]$RequireNotas,
        [switch]$RequireFePos
    )
    $candidates = @()
    for ($offset = 0; $offset -lt $MaxOffset; $offset += 1) {
        $port = $PreferredPort + $offset
        if (-not (Test-ConexaServiceHealth $port $HealthPath)) { continue }
        if ($RequireNotas -and -not (Test-ConexaApiFeatures $port $HealthPath)) { continue }
        if ($RequireFePos -and -not (Test-ConexaApiFePosReady $port $HealthPath)) { continue }
        $candidates += $port
    }
    if ($candidates.Count -eq 0) { return $null }
    return $candidates[0]
}

function Get-ConexaApiListeningPorts {
    param(
        [int]$FromPort = 3500,
        [int]$ToPort = 3509
    )
    $ports = @()
    for ($port = $FromPort; $port -le $ToPort; $port += 1) {
        $hasListener = netstat -ano | Select-String ":$port\s+.*LISTENING"
        if ($hasListener) { $ports += $port }
    }
    return ($ports | Sort-Object -Unique)
}

function Stop-ConexaApiPortListeners {
    param(
        [int]$FromPort = 3500,
        [int]$ToPort = 3509,
        [int[]]$ExcludePorts = @()
    )
    $stopped = @()
    for ($port = $FromPort; $port -le $ToPort; $port += 1) {
        if ($ExcludePorts -contains $port) { continue }
        $procIds = netstat -ano | Select-String ":$port\s+.*LISTENING" | ForEach-Object {
            ($_ -split '\s+')[-1]
        } | Sort-Object -Unique

        foreach ($procId in $procIds) {
            if ($procId -match '^\d+$' -and [int]$procId -gt 0) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                $stopped += [pscustomobject]@{ Port = $port; Pid = [int]$procId }
            }
        }
    }
    return $stopped
}

function Wait-ConexaApiHealth {
    param(
        [int]$Port,
        [string]$HealthPath = $script:ConexaApiHealthPath,
        [int]$TimeoutSec = 20
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-ConexaServiceHealth $Port $HealthPath) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Show-ConexaApiPortDiagnostics {
    param(
        [int]$PreferredPort = 3500,
        [string]$Root = (Get-ConexaRepoRoot)
    )
    $runtime = Get-ConexaRuntimePort -Root $Root
    $healthy = Find-ConexaHealthyApiPort -PreferredPort $PreferredPort
    $features = if ($healthy) { Test-ConexaApiFeatures $healthy } else { $false }
    $notaPdf = if ($healthy) { Test-ConexaApiNotaPdfRoute $healthy } else { $false }
    $listening = Get-ConexaApiListeningPorts -FromPort $PreferredPort -ToPort ($PreferredPort + 9)
    Write-Host "  runtime-port: $(if ($runtime) { $runtime } else { '(sin archivo)' })" -ForegroundColor DarkGray
    Write-Host "  API saludable: $(if ($healthy) { $healthy } else { 'ninguna' })" -ForegroundColor DarkGray
    Write-Host "  Rutas notas CxP: $(if ($features) { 'si' } else { 'no / codigo viejo' })" -ForegroundColor DarkGray
    Write-Host "  PDF notas CxP: $(if ($notaPdf) { 'si' } else { 'no / reinicie API' })" -ForegroundColor DarkGray
    $fePosReady = if ($healthy) { Test-ConexaApiFePosReady $healthy } else { $false }
    Write-Host "  FEpos DIAN listo: $(if ($fePosReady) { 'si' } else { 'no / API vieja o FEpos 3010' })" -ForegroundColor DarkGray
    if ($listening.Count -gt 1) {
        Write-Host "  Instancias escuchando: $($listening -join ', ') (debe haber solo una)" -ForegroundColor Yellow
    }
}

function Restart-ConexaWindowsServiceIfInstalled($name) {
    if (-not (Test-ConexaWindowsService $name)) { return $false }
    Write-Host "Reiniciando servicio Windows $name..." -ForegroundColor Cyan
    Restart-Service -Name $name -Force
    return $true
}

function Ensure-ConexaWindowsService($name, $port, $healthPath, [switch]$ForceRestart) {
    if (-not (Test-ConexaWindowsService $name)) { return $false }

    $healthUrl = "http://127.0.0.1:$port$healthPath"
    $healthy = Test-ConexaServiceHealth $port $healthPath
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue

    if (-not $ForceRestart -and $svc.Status -eq 'Running' -and $healthy) {
        Write-Host "$name ya responde en $healthUrl" -ForegroundColor Green
        return $true
    }

    Write-Host "Reiniciando servicio Windows $name..." -ForegroundColor Cyan
    try {
        Restart-Service -Name $name -Force
        return $true
    } catch {
        Write-Host "No se pudo reiniciar $name (requiere administrador)." -ForegroundColor Yellow
        if (Test-ConexaServiceHealth $port $healthPath) {
            Write-Host '  El servicio sigue respondiendo; se continua sin reiniciar.' -ForegroundColor DarkGray
            return $true
        }
        Write-Host "  Para reiniciar: PowerShell como administrador, luego .\Scripts\windows-services.ps1 -Action Restart" -ForegroundColor DarkGray
        throw
    }
}
