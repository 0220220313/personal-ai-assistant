@echo off
pushd "%~dp0"
title Install Agent Dependencies
echo Installing Python dependencies for Windows Agent...
python -m pip install -r requirements.txt
echo.
echo Done! You can now run start.bat
popd
pause
