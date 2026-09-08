@echo off
REM ── Manual "button": double-click to transcribe new recordings right now ──
cd /d "%~dp0"
echo ============================================
echo   Shreber - Transcribing recordings...
echo   (this window will show progress)
echo ============================================
echo.
"C:\Program Files\nodejs\node.exe" transcribe.mjs 2>nul
echo.
echo ============================================
echo   Done. You can close this window.
echo ============================================
pause
