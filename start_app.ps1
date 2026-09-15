# Скрипт запуску додатку ViyarApp для PowerShell на Windows
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "           Запуск додатку ViyarApp" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# Перевірка наявності Python
try {
    $null = Get-Command python -ErrorAction Stop
} catch {
    Write-Host "[ПОМИЛКА] Python не знайдено в системі PATH!" -ForegroundColor Red
    Write-Host "Встановіть Python 3.10+ з https://www.python.org/ та позначте 'Add Python to PATH'." -ForegroundColor Red
    Read-Host "Натисніть Enter для виходу..."
    exit 1
}

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

if (Test-Path $venvPython) {
    $pyExec = $venvPython
} else {
    Write-Host "[1/3] Створення віртуального оточення .venv..." -ForegroundColor Yellow
    python -m venv (Join-Path $PSScriptRoot ".venv")
    if (Test-Path $venvPython) {
        $pyExec = $venvPython
        Write-Host "[2/3] Встановлення бібліотек з requirements.txt..." -ForegroundColor Yellow
        & $pyExec -m pip install --upgrade pip
        & $pyExec -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")
    } else {
        Write-Host "[Увага] Не вдалося створити .venv, використовуємо системний Python..." -ForegroundColor Yellow
        $pyExec = "python"
        pip install -r (Join-Path $PSScriptRoot "requirements.txt")
    }
}

Write-Host "[3/3] Перевірка бази даних..." -ForegroundColor Yellow
Set-Location (Join-Path $PSScriptRoot "backend")
& $pyExec -c "import database; database.init_db(); database.seed_db()"

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host " Сервер успішно запущено!" -ForegroundColor Green
Write-Host " Відкрийте у браузері: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host " Для зупинки натисніть Ctrl + C у цьому вікні" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""

Start-Process "http://127.0.0.1:8000"
& $pyExec -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
