#!/bin/bash
# Скрипт автоматичного резервного копіювання бази даних ViyarApp
BACKUP_DIR="./data/backups"
DB_FILE="./data/viyar_app.db"
DATE=$(date +"%Y-%m-%d_%H-%M")

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_FILE" ]; then
    BACKUP_FILE="$BACKUP_DIR/viyar_app_$DATE.db"
    # Безпечне копіювання SQLite через sqlite3 .backup або cp
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
    else
        cp "$DB_FILE" "$BACKUP_FILE"
    fi
    gzip -f "$BACKUP_FILE"
    echo "[$(date)] Резервну копію збережено: $BACKUP_FILE.gz"
fi

# Видалення бекапів старіших за 30 днів
find "$BACKUP_DIR" -type f -name "*.db.gz" -mtime +30 -delete
