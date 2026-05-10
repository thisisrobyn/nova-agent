# NOVA Agent - Development servers launcher (Windows)
# Usage: .\dev.ps1

Write-Host "`n  NOVA Development Servers" -ForegroundColor Cyan
Write-Host "  =======================" -ForegroundColor Cyan
Write-Host ""

# Start FastAPI backend in a new terminal window
Write-Host "  Starting API server (port 8000)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$PSScriptRoot'; Write-Host '  NOVA API Server' -ForegroundColor Cyan; uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --reload-exclude .venv"

Start-Sleep -Seconds 2

# Start Vite dev server in a new terminal window
Write-Host "  Starting UI server  (port 5173)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$PSScriptRoot\ui'; Write-Host '  NOVA UI Server' -ForegroundColor Cyan; npm run dev"

Write-Host ""
Write-Host "  API: http://localhost:8000" -ForegroundColor Green
Write-Host "  UI:  http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "  Close the terminal windows to stop the servers." -ForegroundColor DarkGray
