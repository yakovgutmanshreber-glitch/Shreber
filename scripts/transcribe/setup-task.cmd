@echo off
REM ── One-time setup: schedule automatic transcription every 15 minutes ──
REM Double-click this file once. If Windows asks, allow it.
REM %~dp0 = this folder, so the paths work regardless of where the project sits.

schtasks /Create /TN "ShreberTranscribe" /SC MINUTE /MO 15 /F /TR "wscript.exe \"%~dp0run_hidden.vbs\""

echo.
if %errorlevel%==0 (
  echo [OK] Automatic transcription is set up - it runs every 15 minutes.
  echo      New Yemot recordings will be synced and transcribed on their own.
) else (
  echo [X] Something went wrong. Try right-click this file - Run as administrator.
)
echo.
pause
