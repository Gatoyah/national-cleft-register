@echo off
REM National Cleft Registry -- Main Hub launcher
REM Double-click this file to start the server.
REM The app will be available at http://localhost:3000

cd /d "%~dp0"

if not exist ".env" (
    echo.
    echo ERROR: .env file not found.
    echo Copy .env.example to .env and fill in real secret values before first run.
    echo.
    pause
    exit /b 1
)

REM Use the bundled portable Node.js if this folder has one, otherwise fall
REM back to a system-installed "node" on PATH.
set NODE_BIN=node\node.exe
if not exist "%NODE_BIN%" set NODE_BIN=node

REM Force an absolute database path based on THIS folder's real location,
REM regardless of what's written in .env. This avoids a relative "file:"
REM path being resolved inconsistently between the migration script and the
REM compiled server bundle.
set DATABASE_URL=file:%~dp0main_hub.db

if not exist "main_hub.db" (
    echo First run detected -- setting up the database...
    "%NODE_BIN%" migrate.mjs
    if errorlevel 1 (
        echo Database setup failed. See the error above.
        pause
        exit /b 1
    )
)

echo Starting National Cleft Registry - Main Hub...
echo Once you see "Ready", open http://localhost:3000 in your browser.
echo Keep this window open while the system is in use.
echo.

set PORT=3000
"%NODE_BIN%" server.js

pause
