@echo off
chcp 65001 >nul
title ViyarApp - Сервер запуску

cd /d "%~dp0"

echo ===================================================
echo           Запуск додатку ViyarApp
echo ===================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ПОМИЛКА] Python не знайдено в системі PATH!
    echo Встановіть Python 3.10+ з https://www.python.org/
    echo Обов'язково позначте галочку "Add Python to PATH".
    pause
    exit /b 1
)

set "VENV_PY=%~dp0.venv\Scripts\python.exe"

if exist "%VENV_PY%" (
    set "PY_EXEC=%VENV_PY%"
) else (
    echo [1/3] Створення віртуального оточення (.venv)...
    python -m venv "%~dp0.venv"
    if exist "%VENV_PY%" (
        set "PY_EXEC=%VENV_PY%"
        echo [2/3] Встановлення бібліотек з requirements.txt...
        "%VENV_PY%" -m pip install --upgrade pip
        "%VENV_PY%" -m pip install -r "%~dp0requirements.txt"
    ) else (
        echo [УВАГА] Не вдалося створити .venv, використовуємо системний Python...
        set "PY_EXEC=python"
        pip install -r "%~dp0requirements.txt"
    )
)

echo [3/3] Перевірка бази даних...
cd /d "%~dp0backend"
"%PY_EXEC%" -c "import database; database.init_db(); database.seed_db()"

echo.
echo ===================================================
echo  Сервер успішно запущено!
echo  Адреса у браузері: http://127.0.0.1:8000
echo  Для зупинки натисніть Ctrl + C у цьому вікні
echo ===================================================
echo.

start http://127.0.0.1:8000
"%PY_EXEC%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

pause
