#!/bin/bash
set -e

echo "======================================================="
echo "   Автоматичне розгортання ViyarApp на VPS сервері   "
echo "======================================================="

# 1. Оновлення системи
echo "[1/5] Оновлення пакетів системи..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban ca-certificates

# 2. Встановлення Docker (якщо ще не встановлено)
if ! command -v docker &> /dev/null; then
    echo "[2/5] Встановлення Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm -f get-docker.sh
else
    echo "[2/5] Docker вже встановлено."
fi

# 3. Налаштування файрволу (UFW)
echo "[3/5] Налаштування безпеки файрволу (SSH, HTTP, HTTPS)..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8000/tcp
ufw --force enable

# 4. Створення папки для даних та резервних копій
echo "[4/5] Підготовка папок для даних..."
mkdir -p data/uploads
mkdir -p data/backups

# 5. Запуск додатку через Docker Compose
echo "[5/5] Збірка та запуск контейнера ViyarApp..."
docker compose up -d --build

# 6. Додавання щоденного бекапу в cron (кожної ночі о 03:00)
CRON_JOB="0 3 * * * cd $(pwd) && ./backup.sh > /dev/null 2>&1"
(crontab -l 2>/dev/null | grep -Fv "backup.sh" ; echo "$CRON_JOB") | crontab -

echo ""
echo "======================================================="
echo "   УСПІШНО! Додаток працює у фоновому режимі 24/7!   "
echo "======================================================="
echo "Відкрийте у браузері:"
echo "👉 http://$(curl -s ifconfig.me)/"
echo "або"
echo "👉 http://$(curl -s ifconfig.me):8000/"
echo "======================================================="
