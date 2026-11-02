@echo off
rem Double-click to run Cashflow on Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies, this takes a minute...
  call npm install
  if errorlevel 1 (
    echo Install failed, see the messages above.
    pause
    exit /b 1
  )
)

rem Open the browser a few seconds after the server starts
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
echo Close this window to stop Cashflow.
call npm start
pause
