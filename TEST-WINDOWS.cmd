@echo off
setlocal
cd /d "%~dp0"
title Hotel Central POS - CPU Preflight and Local Build

echo ================================================
echo HOTEL CENTRAL POS - LOCAL TEST (NO DEPLOY)
echo ================================================
echo This script does not contact Cloudflare D1 or deploy a Worker.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js 22 LTS or newer first.
  goto FAIL
)
node --version
node --test tests\cpu-patch.test.mjs
if errorlevel 1 goto FAIL

echo.
echo Checking Corepack / pnpm...
where corepack >nul 2>nul
if not errorlevel 1 (
  echo Installing dependencies using pinned pnpm version...
  call corepack pnpm install --frozen-lockfile
  if errorlevel 1 goto FAIL
  call corepack pnpm run build
  if errorlevel 1 goto FAIL
  goto SUCCESS
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Corepack / pnpm not found. Install pnpm via official documentation.
  goto FAIL
)
call pnpm install --frozen-lockfile
if errorlevel 1 goto FAIL
call pnpm run build
if errorlevel 1 goto FAIL
:SUCCESS
echo.
echo SUCCESS: Offline CPU patch checks and project BUILD both passed.
echo This does NOT prove Cloudflare CPU limits or online POS features.
echo No deployment performed. Keep production D1 untouched.
pause
exit /b 0
:FAIL
echo.
echo FAILED: A check, dependency installation, or build did not finish.
echo Internet access may be required for installing packages.
echo Do not deploy until errors are resolved.
pause
exit /b 1
