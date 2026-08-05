$ErrorActionPreference = "Stop"
$projectPath = "C:\Users\refri\OneDrive\Documentos\Kalleb\baileyBot-v2-main"
$url = "http://127.0.0.1:3000/#/dashboard"
$healthUrl = "http://127.0.0.1:3000/api/health"

$server = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if (-not $server) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $nodePath `
        -ArgumentList "index.js" `
        -WorkingDirectory $projectPath `
        -WindowStyle Hidden

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) { break }
        } catch {
            # Aguarda o servidor concluir a inicialização.
        }
    }
}

Start-Process $url
