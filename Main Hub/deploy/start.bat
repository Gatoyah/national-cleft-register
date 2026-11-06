@echo off
REM National Cleft Registry -- Main Hub launcher. Double-click to start.
REM The app will be available at http://localhost:3000 (and http://<this-pc-ip>:3000 on the network)
cd /d "%~dp0"

set NODE_BIN=node\node.exe
if exist "%NODE_BIN%" goto :havenode
set NODE_BIN=node
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js not found. Put a portable Node.js in the "node" folder - see DEPLOY.md.
    pause
    exit /b 1
)
:havenode

REM 1. Create .env with fresh random secrets on first run (never overwrites real values).
"%NODE_BIN%" setup-env.mjs
if errorlevel 1 goto :fail

REM 2. Absolute database path based on this folder's real location.
set DATABASE_URL=file:%~dp0main_hub.db
set NODE_ENV=production

REM 3. Back up the existing database, then apply any new migrations (safe every start).
if exist "main_hub.db" "%NODE_BIN%" backup.mjs
"%NODE_BIN%" migrate.mjs
if errorlevel 1 goto :fail

echo Starting National Cleft Registry - Main Hub...
echo Once you see "Ready", open http://localhost:3000 in your browser.
echo On first run, the SETUP TOKEN for creating the administrator is printed below.
echo Keep this window open while the system is in use.
echo.
if "%PORT%"=="" set PORT=3000
"%NODE_BIN%" server.js
pause
exit /b 0

:fail
echo.
echo Startup failed - see the error above.
pause
exit /b 1
