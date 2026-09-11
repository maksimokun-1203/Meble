import sqlite3
conn = sqlite3.connect('viyar_app.db')

conn.execute('''
CREATE TABLE IF NOT EXISTS dictionary_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT,
    name TEXT
)
''')

conn.execute('''
CREATE TABLE IF NOT EXISTS project_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    category TEXT,
    name TEXT,
    quantity INTEGER DEFAULT 0,
    is_checked INTEGER DEFAULT 0
)
''')

# Update Maksym role
conn.execute("UPDATE users SET role = 'Admin' WHERE name LIKE '%Максим%'")

# Seed dictionary if empty
count = conn.execute('SELECT COUNT(*) FROM dictionary_items').fetchone()[0]
if count == 0:
    items = [
        ('Фурнітура', 'Петлі накладні'),
        ('Фурнітура', 'Петлі внутрішні'),
        ('Фурнітура', 'Направляючі прихованого монтажу'),
        ('Фурнітура', 'Направляючі телескопічні'),
        ('Фурнітура', 'Ручки профільні (Gola)'),
        ('Фурнітура', 'Ручки накладні'),
        ('Фурнітура', 'Ніжки кухонні'),
        ('Фурнітура', 'Конфірмати'),
        ('Фурнітура', 'Мініфікси'),
        ('Фурнітура', 'Шканти'),
        ('Фурнітура', 'Самонарізи 3.5х16'),
        ('Фурнітура', 'Самонарізи 4х30'),
        ('Фурнітура', 'Дюбелі'),
        
        ('Інструмент та розхідники', 'Шуруповерт'),
        ('Інструмент та розхідники', 'Перфоратор'),
        ('Інструмент та розхідники', 'Лазерний рівень'),
        ('Інструмент та розхідники', 'Лобзик'),
        ('Інструмент та розхідники', 'Пилосос будівельний'),
        ('Інструмент та розхідники', 'Свердло по бетону 6мм'),
        ('Інструмент та розхідники', 'Свердло по бетону 8мм'),
        ('Інструмент та розхідники', 'Свердло конфірматне'),
        ('Інструмент та розхідники', 'Біти PZ2'),
        ('Інструмент та розхідники', 'Піна монтажна'),
        ('Інструмент та розхідники', 'Силікон прозорий'),
        ('Інструмент та розхідники', 'Малярна стрічка'),
        
        ('Підготовка до виїзду', 'Перевірка креслень'),
        ('Підготовка до виїзду', 'Узгодження часу з клієнтом'),
        ('Підготовка до виїзду', 'Пакування фасадів'),
        ('Підготовка до виїзду', 'Пакування корпусу')
    ]
    cursor = conn.cursor()
    cursor.executemany('INSERT INTO dictionary_items (category, name) VALUES (?, ?)', items)

conn.commit()
conn.close()
