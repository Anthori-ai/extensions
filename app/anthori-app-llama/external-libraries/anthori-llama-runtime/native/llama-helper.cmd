@echo off
setlocal
set SCRIPT_DIR=%~dp0

if not "%ANTHORI_PYTHON_BIN%"=="" (
  "%ANTHORI_PYTHON_BIN%" "%SCRIPT_DIR%llama_helper.py" %*
  exit /b %ERRORLEVEL%
)

py -3 "%SCRIPT_DIR%llama_helper.py" %*
if %ERRORLEVEL% EQU 0 exit /b 0

python "%SCRIPT_DIR%llama_helper.py" %*
exit /b %ERRORLEVEL%
