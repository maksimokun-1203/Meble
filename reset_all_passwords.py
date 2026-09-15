import sqlite3
import os
import hashlib

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

db_path = os.path.join('backend', 'viyar_app.db')
conn = sqlite3.connect(db_path)

# Отримуємо хеш від '1111'
default_hash = hash_password('1111')

conn.execute("UPDATE users SET password_hash = ?", (default_hash,))
conn.commit()
conn.close()

print("Усім користувачам успішно встановлено пароль '1111'")
