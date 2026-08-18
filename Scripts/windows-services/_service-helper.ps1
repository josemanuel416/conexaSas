# Helpers compartidos para detectar servicios Windows Conexa
$script:ConexaServiceNames = @('ConexaApi', 'ConexaFEpos')

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

function Restart-ConexaWindowsServiceIfInstalled($name) {
    if (-not (Test-ConexaWindowsService $name)) { return $false }
    Write-Host "Reiniciando servicio Windows $name..." -ForegroundColor Cyan
    Restart-Service -Name $name -Force
    return $true
}

function Ensure-ConexaWindowsService($name, $port, $healthPath) {
    if (-not (Test-ConexaWindowsService $name)) { return $false }

    $healthUrl = "http://127.0.0.1:$port$healthPath"
    $healthy = Test-ConexaServiceHealth $port $healthPath
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue

    if ($svc.Status -eq 'Running' -and $healthy) {
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
