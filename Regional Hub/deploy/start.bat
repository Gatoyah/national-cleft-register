@echo off
REM National Cleft Registry -- Regional Hub launcher
REM Double-click this file to start the server.
REM The app will be available at http://localhost:3001

cd /d "%~dp0"

if not exist ".env" (
    echo.
    echo ERROR: .env file not found.
    echo Copy .env.example to .env and fill in real secret values before first run.
    echo.
    pause
    exit /b 1
)

set NODE_BIN=node\node.exe
if not exist "%NODE_BIN%" set NODE_BIN=node

if not exist "local.db" (
    echo First run detected -- setting up the database...
    "%NODE_BIN%" init-db.mjs
    if errorlevel 1 (
        echo Database setup failed. See the error above.
        pause
        exit /b 1
    )
)

echo Starting National Cleft Registry - Regional Hub...
echo Once you see "Ready", open http://localhost:3001 in your browser.
echo Keep this window open while the system is in use.
echo.

set PORT=3001
"%NODE_BIN%" server.js

pause
