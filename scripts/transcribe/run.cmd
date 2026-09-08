@echo off
REM Runs the Yemot recordings sync + local Whisper transcription once.
REM Scheduled by Windows Task Scheduler (see setup) to run automatically.
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" transcribe.mjs > run.log 2>&1
