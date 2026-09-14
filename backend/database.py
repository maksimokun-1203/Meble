import sqlite3
import os

DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "viyar_app.db")

# If DATA_DIR is external and DB does not exist yet, copy initial DB if available
if DATA_DIR != os.path.dirname(__file__) and not os.path.exists(DB_PATH):
    default_db = os.path.join(os.path.dirname(__file__), "viyar_app.db")
    if os.path.exists(default_db):
        import shutil
        shutil.copy2(default_db, DB_PATH)

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

    # Modules Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        name TEXT,
        type_id TEXT,
        width REAL,
        height REAL,
        depth REAL,
        joints_count INTEGER,
        status TEXT DEFAULT 'В черзі',
        assignee_id INTEGER,
        salary_calculated REAL DEFAULT 0,
        drawing_path TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(assignee_id) REFERENCES users(id)
    )
    ''')
    try:
        cursor.execute("ALTER TABLE modules ADD COLUMN drawing_path TEXT")
    except sqlite3.OperationalError:
        pass

    # Invoices Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS viyar_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        invoice_number TEXT,
        category TEXT,
        branch TEXT,
        status TEXT DEFAULT 'В роботі',
        assignee_id INTEGER,
        is_paid BOOLEAN DEFAULT 0,
        amount_due REAL DEFAULT 0,
        is_ready BOOLEAN DEFAULT 0,
        file_path TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(assignee_id) REFERENCES users(id)
    )
    ''')

    # Module Templates Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS module_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_rate REAL NOT NULL,
        joints_rate REAL NOT NULL
    )
    ''')

    # Project Items Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS project_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        category TEXT,
        name TEXT,
        quantity INTEGER DEFAULT 0,
        is_checked INTEGER DEFAULT 0,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )
    ''')

    # Module Comments Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS module_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(module_id) REFERENCES modules(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    # Schedules Table (Planning for Measurements, Assemblies, Installations)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        event_date TEXT NOT NULL,
        event_time TEXT,
        address TEXT,
        client_name TEXT,
        client_phone TEXT,
        assignee_id INTEGER,
        status TEXT DEFAULT 'Заплановано',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(assignee_id) REFERENCES users(id)
    )
    ''')

    # Safe column migrations for projects
    for col_def in [
        "client_name TEXT",
        "client_phone TEXT",
        "location_address TEXT",
        "advance_payment REAL DEFAULT 0",
        "modules_count REAL DEFAULT 0",
        "extra_work_workshop TEXT",
        "extra_work_site TEXT",
        "description TEXT",
        "payment_type TEXT DEFAULT 'amount'",
        "advance_percent REAL DEFAULT 0"
    ]:
        try:
            cursor.execute(f"ALTER TABLE projects ADD COLUMN {col_def}")
        except sqlite3.OperationalError:
            pass

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
