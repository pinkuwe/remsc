@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "remsc-launch.exe" (
    "remsc-launch.exe"
    goto :done
)

if exist "target\release\remsc-launch.exe" (
    "target\release\remsc-launch.exe"
    goto :done
)

echo.
echo  Не найден remsc-launch.exe
echo  Соберите проект:
echo    cargo build --release
echo.
echo  Затем скопируйте в эту папку:
echo    target\release\remsc.exe
echo    target\release\remsc-launch.exe
echo.
pause
exit /b 1

:done
if errorlevel 1 pause
