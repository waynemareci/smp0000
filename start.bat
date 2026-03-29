@echo off
echo Starting SMP...
echo.

:: Resolve project root from bat file location (strip trailing backslash)
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

:: Start FastAPI
echo [1/2] Starting FastAPI on port 8001...
start "SMP - FastAPI" cmd /k "cd /d "%ROOT%" && set PYTHONIOENCODING=utf-8 && python -m uvicorn app.main:app --port 8001"

:: Brief pause to let FastAPI initialise
timeout /t 3 /nobreak > nul

:: Start Next.js
echo [2/2] Starting Next.js on port 3000...
start "SMP - Next.js" cmd /k "cd /d "%ROOT%\frontend" && npm run dev"

echo.
echo Both services starting in separate windows.
echo   FastAPI:  http://localhost:8001
echo   Next.js:  http://localhost:3000
echo.
echo Close the two terminal windows to stop the services.
pause