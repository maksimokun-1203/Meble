import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "viyar_app.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Employee'
    )
    ''')

    # Projects Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sales_value REAL DEFAULT 0,
        status TEXT DEFAULT 'Активний'
    )
    ''')

    # Work Logs Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS work_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        user_id INTEGER,
        work_type TEXT NOT NULL,
        unit TEXT,
        quantity REAL,
        amount REAL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    # Expenses Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        user_id INTEGER,
        expense_type TEXT,
        amount REAL,
        description TEXT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    # Files (Drawings) Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        filename TEXT,
        filepath TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )
    ''')

    conn.commit()
    conn.close()

def seed_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Seed Users
    users = [
        ("Макс Окунь", "Employee"),
        ("Жека Дмитрюк", "Employee"),
        ("Андрій Підгорний", "Admin"),
        ("Алі Мірзоєв", "Employee")
    ]
    
    for user in users:
        cursor.execute("SELECT id FROM users WHERE name = ?", (user[0],))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO users (name, role) VALUES (?, ?)", user)
            
    # Seed Projects
    projects = [
        "Загальні питання", "Доп Женя", "Доп Алі", "Доп Максім",
        "Васильків Офіси", "Бориспіль, Green house", "Парадні (вул. Олександра Олеся 17)",
        "Шафа Підгірці", "Дорогожичі", "Ніжин (Сергій)", "Голіков, кухня збірка",
        "Квартира Одеса", "кухня хуст", "белогородка"
    ]
    
    for proj in projects:
        cursor.execute("SELECT id FROM projects WHERE name = ?", (proj,))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO projects (name) VALUES (?)", (proj,))
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_db()
    print("Database initialized and seeded successfully.")
