# Скрипт швидкого вивантаження ViyarApp на орендований VPS
param (
    [Parameter(Mandatory=$false)]
    [string]$ServerIP
)

if (-not $ServerIP) {
    $ServerIP = Read-Host "Введіть IP-адресу вашого VPS сервера (наприклад, 194.67.12.34)"
}

if (-not $ServerIP) {
    Write-Host "IP-адреса не вказана. Скасовано." -ForegroundColor Red
    exit
}

Write-Host "Вивантаження ViyarApp на $ServerIP:/opt/ViyarApp..." -ForegroundColor Cyan

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Використовуємо rsync або tar через ssh/scp
$archiveName = "viyar_deploy_temp.tar.gz"

Write-Host "Створення архіву проекту..." -ForegroundColor Yellow
tar --exclude=".git" --exclude="__pycache__" -czf "$archiveName" -C "$CurrentDir" .

Write-Host "Копіювання архіву на сервер..." -ForegroundColor Yellow
scp "$archiveName" "root@${ServerIP}:/tmp/"

Write-Host "Розпакування та запуск на сервері..." -ForegroundColor Yellow
ssh "root@${ServerIP}" "mkdir -p /opt/ViyarApp && tar -xzf /tmp/$archiveName -C /opt/ViyarApp && rm -f /tmp/$archiveName && cd /opt/ViyarApp && chmod +x deploy.sh backup.sh && ./deploy.sh"

Remove-Item "$archiveName" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "УСПІШНО! Додаток встановлено і запущено на VPS!" -ForegroundColor Green
Write-Host "Відкрийте у браузері: http://${ServerIP}/" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
