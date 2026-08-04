$ErrorActionPreference = "Stop"
$projectPath = "C:\Users\refri\OneDrive\Documentos\Kalleb\baileyBot-v2-main"
$url = "http://localhost:3000"

$server = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if (-not $server) {
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k", "npm start" `
        -WorkingDirectory $projectPath `
        -WindowStyle Minimized

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $response = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) { break }
        } catch {
            # Aguarda o servidor concluir a inicialização.
        }
    }
}

Start-Process $url
