@echo off
rem Lanzador de JARVIS. Ejemplos:
rem   jarvis.bat              modo voz ("Hey Jarvis")
rem   jarvis.bat --hud        modo voz con el reactor animado
rem   jarvis.bat --text       modo texto
rem El entorno virtual vive fuera de OneDrive (ver README, paso 2).
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
"%USERPROFILE%\.venvs\jarvis\Scripts\python.exe" main.py %*
