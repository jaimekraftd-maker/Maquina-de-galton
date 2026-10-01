@echo off
rem Instala JARVIS y prueba las fases (ver instalar.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
pause
