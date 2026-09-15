from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from pydantic import BaseModel
import os
import shutil
import hashlib
import datetime
import re
try:
    import PyPDF2
except ImportError:
    PyPDF2 = None
from database import get_db

app = FastAPI(title="ViyarApp API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "../frontend")

def hash_password(pw: str):
    return hashlib.sha256(pw.encode()).hexdigest()

# Models
class UserAuth(BaseModel):
    user_id: int
    password: str

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class ContractorCreate(BaseModel):
    name: str

class ProjectUpdate(BaseModel):
    user_id: Optional[int] = None
    sales_value: Optional[float] = None
    status: Optional[str] = None
    modules_count: Optional[float] = None
    extra_work_workshop: Optional[str] = None
    extra_work_site: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    location_address: Optional[str] = None
    advance_payment: Optional[float] = None
    description: Optional[str] = None
    payment_type: Optional[str] = None
    advance_percent: Optional[float] = None

class ModuleCommentCreate(BaseModel):
    user_id: int
    text: str

class ScheduleCreate(BaseModel):
    project_id: Optional[int] = None
    event_type: str
    title: str
    event_date: str
    event_time: Optional[str] = None
    address: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    assignee_id: Optional[int] = None
    assignee_ids: Optional[List[int]] = None
    status: Optional[str] = "Заплановано"
    notes: Optional[str] = None

class ScheduleUpdate(BaseModel):
    project_id: Optional[int] = None
    event_type: Optional[str] = None
    title: Optional[str] = None
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    address: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    assignee_id: Optional[int] = None
    assignee_ids: Optional[List[int]] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class WorkLogCreate(BaseModel):
    project_id: int
    user_id: int
    work_type: str
    hours: float
    modules_done: float

class WorkLogUpdate(BaseModel):
    user_id: int
    work_type: Optional[str] = None
    hours: Optional[float] = None
    modules_done: Optional[float] = None

class ExpenseCreate(BaseModel):
    project_id: int
    user_id: int
    expense_type: str
    amount: float
    description: Optional[str] = None

class ProjectItemCreate(BaseModel):
    category: str
    name: str
    quantity: int

class ProjectProductCreate(BaseModel):
    name: str
    pricing_type: Optional[str] = 'standard'
    total_price: Optional[float] = 0
    product_cost: Optional[float] = 0
    installation_cost: Optional[float] = 0
    assembly_cost: Optional[float] = 0
    design_cost: Optional[float] = 0
    delivery_cost: Optional[float] = 0
    extra_work_workshop: Optional[float] = 0
    extra_work_site: Optional[float] = 0

class ProjectProductUpdate(BaseModel):
    name: Optional[str] = None
    pricing_type: Optional[str] = None
    total_price: Optional[float] = None
    product_cost: Optional[float] = None
    installation_cost: Optional[float] = None
    assembly_cost: Optional[float] = None
    design_cost: Optional[float] = None
    delivery_cost: Optional[float] = None
    extra_work_workshop: Optional[float] = None
    extra_work_site: Optional[float] = None

class ProjectItemUpdate(BaseModel):
    quantity: Optional[int] = None
    is_checked: Optional[int] = None

class ModuleCreate(BaseModel):
    name: str
    type_id: str
    width: float
    height: float
    depth: float
    joints_count: int
    assignee_id: Optional[int] = None
    salary_calculated: float = 0
    drawing_path: Optional[str] = None

class ModuleUpdate(BaseModel):
    status: Optional[str] = None
    assignee_id: Optional[int] = None
    name: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    joints_count: Optional[int] = None
    drawing_path: Optional[str] = None
    hours: Optional[float] = None

class InvoiceCreate(BaseModel):
    invoice_number: str
    category: str
    branch: str
    assignee_id: Optional[int] = None
    amount_due: float = 0
    file_path: Optional[str] = None

class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    is_paid: Optional[bool] = None
    is_ready: Optional[bool] = None
    invoice_number: Optional[str] = None
    category: Optional[str] = None
    branch: Optional[str] = None
    amount_due: Optional[float] = None

# Routes
@app.post("/api/set-password")
def set_password(data: UserAuth):
    conn = get_db()
    user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (data.user_id,)).fetchone()
    if user and user["password_hash"]:
        raise HTTPException(status_code=400, detail="Password already set")
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(data.password), data.user_id))
    conn.commit()
    return {"status": "success"}

@app.post("/api/users/{user_id}/change_password")
def change_password(user_id: int, data: PasswordChange):
    conn = get_db()
    user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or user["password_hash"] != hash_password(data.old_password):
        raise HTTPException(status_code=401, detail="Invalid old password")
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(data.new_password), user_id))
    conn.commit()
    return {"status": "success"}

@app.post("/api/login")
def login(data: UserAuth):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (data.user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user["password_hash"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    user_dict = dict(user)
    del user_dict["password_hash"]
    return {"status": "success", "user": user_dict}

@app.get("/api/users")
def get_users():
    conn = get_db()
    users = conn.execute("SELECT id, name, role, password_hash FROM users").fetchall()
    return [{"id": u["id"], "name": u["name"], "role": u["role"], "has_password": bool(u["password_hash"])} for u in users]

@app.get("/api/users/{user_id}/stats")
def get_user_stats(user_id: int):
    conn = get_db()
    user = conn.execute("SELECT name, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user: raise HTTPException(status_code=404)
    
    # Calc total earnings
    wl = conn.execute("SELECT SUM(amount) FROM work_logs WHERE user_id = ?", (user_id,)).fetchone()[0] or 0
    mod = conn.execute("SELECT SUM(salary_calculated) FROM modules WHERE assignee_id = ? AND status='Зібрано'", (user_id,)).fetchone()[0] or 0
    earnings = wl + mod
    
    # Calc expenses
    exp = conn.execute("SELECT SUM(amount) FROM expenses WHERE user_id = ?", (user_id,)).fetchone()[0] or 0
    
    # Proj count
    projects = conn.execute("SELECT COUNT(DISTINCT project_id) FROM work_logs WHERE user_id = ?", (user_id,)).fetchone()[0] or 0
    
    return {
        "name": user["name"],
        "role": user["role"],
        "earnings": earnings,
        "expenses": exp,
        "projects_count": projects
    }

@app.get("/api/users/{user_id}/tasks")
def get_user_tasks(user_id: int):
    conn = get_db()
    # Get active modules assigned to user
    modules = conn.execute("""
        SELECT m.id, m.name, m.status, p.name as project_name, 'Модуль' as task_type, '' as event_date, '' as event_time
        FROM modules m
        JOIN projects p ON m.project_id = p.id
        WHERE m.assignee_id = ? AND m.status = 'В роботі'
    """, (user_id,)).fetchall()
    
    # Get upcoming schedule events assigned to user
    schedules = conn.execute("""
        SELECT s.id, s.title as name, s.status, COALESCE(p.name, 'Індивідуально') as project_name, s.event_type as task_type, s.event_date, s.event_time
        FROM schedules s
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE ',' || s.assignee_ids || ',' LIKE '%,' || ? || ',%' AND s.status != 'Виконано'
        ORDER BY s.event_date ASC, s.event_time ASC
    """, (str(user_id),)).fetchall()
    
    return [dict(m) for m in modules] + [dict(s) for s in schedules]

@app.post("/api/users/contractor")
def create_contractor(data: ContractorCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO users (name, role) VALUES (?, ?)", (data.name, "Підрядник"))
    conn.commit()
    return {"status": "success", "id": cursor.lastrowid}

@app.get("/api/dictionary")
def get_dictionary():
    conn = get_db()
    items = conn.execute("SELECT * FROM dictionary_items").fetchall()
    return [dict(i) for i in items]

@app.get("/api/modules/templates")
def get_module_templates():
    conn = get_db()
    items = conn.execute("SELECT * FROM module_templates").fetchall()
    return [dict(i) for i in items]

@app.get("/api/projects")
def get_projects():
    conn = get_db()
    projects = conn.execute("SELECT * FROM projects ORDER BY id DESC").fetchall()
    return [dict(p) for p in projects]

@app.get("/api/projects/{project_id}")
def get_project(project_id: int, user_id: Optional[int] = None):
    conn = get_db()
    project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_dict = dict(project)
    sales_value = project_dict.get("sales_value") or 0
    
    tasks_raw = conn.execute("SELECT w.*, u.name as user_name FROM work_logs w JOIN users u ON w.user_id = u.id WHERE w.project_id = ?", (project_id,)).fetchall()
    expenses = conn.execute("SELECT e.*, u.name as user_name FROM expenses e JOIN users u ON e.user_id = u.id WHERE e.project_id = ?", (project_id,)).fetchall()
    files = conn.execute("SELECT * FROM files WHERE project_id = ?", (project_id,)).fetchall()
    items = conn.execute("SELECT * FROM project_items WHERE project_id = ?", (project_id,)).fetchall()
    
    # New tables
    modules = conn.execute("""
        SELECT m.*, u.name as assignee_name,
               (SELECT COUNT(*) FROM module_comments WHERE module_id = m.id) as comments_count
        FROM modules m 
        LEFT JOIN users u ON m.assignee_id = u.id 
        WHERE m.project_id = ?
    """, (project_id,)).fetchall()
    
    invoices = conn.execute("SELECT i.*, u.name as assignee_name FROM viyar_invoices i LEFT JOIN users u ON i.assignee_id = u.id WHERE i.project_id = ?", (project_id,)).fetchall()
    
    schedules = conn.execute("""
        SELECT s.*, u.name as assignee_name
        FROM schedules s
        LEFT JOIN users u ON s.assignee_id = u.id
        WHERE s.project_id = ?
        ORDER BY s.event_date ASC, s.event_time ASC
    """, (project_id,)).fetchall()
    
    # Dynamic Salary Calculation
    pools = {
        "Збірка в цеху": sales_value * 0.04,
        "Монтаж на об'єкті": sales_value * 0.06,
        "Вигрузка/загрузка": sales_value * 0.05,
        "Конструктив": sales_value * 0.10
    }
    
    tasks = [dict(t) for t in tasks_raw]
    type_scores = {}
    
    for t in tasks:
        w_type = t["work_type"]
        hrs = float(t["quantity"])
        mods = float(t.get("modules_done", 0))
        score = hrs + mods
        type_scores[w_type] = type_scores.get(w_type, 0) + score
        
    for t in tasks:
        w_type = t["work_type"]
        hrs = float(t["quantity"])
        mods = float(t.get("modules_done", 0))
        score = hrs + mods
        tot_score = type_scores.get(w_type, 0)
        
        if tot_score > 0:
            t["amount"] = (score / tot_score) * pools.get(w_type, 0)
        else:
            t["amount"] = 0
            
    project_dict["work_logs"] = tasks
    project_dict["expenses"] = [dict(e) for e in expenses]
    project_dict["files"] = [dict(f) for f in files]
    project_dict["items"] = [dict(i) for i in items]
    products = conn.execute("SELECT * FROM project_products WHERE project_id = ?", (project_id,)).fetchall()
    project_dict["products"] = [dict(p) for p in products]
    project_dict["modules"] = [dict(m) for m in modules]
    project_dict["invoices"] = [dict(i) for i in invoices]
    project_dict["schedules"] = [dict(s) for s in schedules]
    
    # PRIVACY FILTER
    if user_id:
        u = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
        if u and u["role"] not in ["Admin", "Developer"]:
            for t in project_dict["work_logs"]:
                if t["user_id"] != user_id:
                    t["amount"] = 0
            for m in project_dict["modules"]:
                if m["assignee_id"] != user_id:
                    m["salary_calculated"] = 0
    
    return project_dict

@app.put("/api/projects/{project_id}")
def update_project(project_id: int, data: ProjectUpdate):
    conn = get_db()
    user = conn.execute("SELECT role FROM users WHERE id = ?", (data.user_id,)).fetchone()
    if not user: raise HTTPException(status_code=403, detail="Not authorized")
    
    is_admin = user["role"] in ["Admin", "Developer"]
    
    if data.sales_value is not None:
        if not is_admin: raise HTTPException(status_code=403, detail="Admin only")
        conn.execute("UPDATE projects SET sales_value = ? WHERE id = ?", (data.sales_value, project_id))
    
    if data.status is not None:
        if not is_admin: raise HTTPException(status_code=403, detail="Admin only")
        conn.execute("UPDATE projects SET status = ? WHERE id = ?", (data.status, project_id))
        
    if data.modules_count is not None:
        conn.execute("UPDATE projects SET modules_count = ? WHERE id = ?", (data.modules_count, project_id))
    if data.extra_work_workshop is not None:
        conn.execute("UPDATE projects SET extra_work_workshop = ? WHERE id = ?", (data.extra_work_workshop, project_id))
    if data.extra_work_site is not None:
        conn.execute("UPDATE projects SET extra_work_site = ? WHERE id = ?", (data.extra_work_site, project_id))
    if data.client_name is not None:
        conn.execute("UPDATE projects SET client_name = ? WHERE id = ?", (data.client_name, project_id))
    if data.client_phone is not None:
        conn.execute("UPDATE projects SET client_phone = ? WHERE id = ?", (data.client_phone, project_id))
    if data.location_address is not None:
        conn.execute("UPDATE projects SET location_address = ? WHERE id = ?", (data.location_address, project_id))
    if data.advance_payment is not None:
        conn.execute("UPDATE projects SET advance_payment = ? WHERE id = ?", (data.advance_payment, project_id))
    if data.description is not None:
        conn.execute("UPDATE projects SET description = ? WHERE id = ?", (data.description, project_id))
    if data.payment_type is not None:
        conn.execute("UPDATE projects SET payment_type = ? WHERE id = ?", (data.payment_type, project_id))
    if data.advance_percent is not None:
        conn.execute("UPDATE projects SET advance_percent = ? WHERE id = ?", (data.advance_percent, project_id))

    conn.commit()
    return {"status": "success"}

@app.post("/api/projects/{project_id}/items")
def add_project_item(project_id: int, data: ProjectItemCreate):
    conn = get_db()
    cursor = conn.cursor()
    existing = cursor.execute("SELECT id, quantity FROM project_items WHERE project_id = ? AND category = ? AND name = ?", 
                             (project_id, data.category, data.name)).fetchone()
    if existing:
        cursor.execute("UPDATE project_items SET quantity = quantity + ? WHERE id = ?", (data.quantity, existing["id"]))
    else:
        cursor.execute("INSERT INTO project_items (project_id, category, name, quantity, is_checked) VALUES (?, ?, ?, ?, 0)",
                      (project_id, data.category, data.name, data.quantity))
    conn.commit()
    return {"status": "success"}

@app.put("/api/projects/{project_id}/items/{item_id}")
def update_project_item(project_id: int, item_id: int, data: ProjectItemUpdate):
    conn = get_db()
    if data.quantity is not None:
        conn.execute("UPDATE project_items SET quantity = ? WHERE id = ?", (data.quantity, item_id))
    if data.is_checked is not None:
        conn.execute("UPDATE project_items SET is_checked = ? WHERE id = ?", (data.is_checked, item_id))
    conn.commit()
    return {"status": "success"}

@app.delete("/api/projects/{project_id}/items/{item_id}")
def delete_project_item(project_id: int, item_id: int):
    conn = get_db()
    conn.execute("DELETE FROM project_items WHERE id = ?", (item_id,))
    conn.commit()
    return {"status": "success"}

@app.post("/api/projects/{project_id}/products")
def add_project_product(project_id: int, data: ProjectProductCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO project_products 
        (project_id, name, pricing_type, total_price, product_cost, installation_cost, assembly_cost, design_cost, delivery_cost, extra_work_workshop, extra_work_site)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (project_id, data.name, data.pricing_type, data.total_price, data.product_cost, data.installation_cost, data.assembly_cost, data.design_cost, data.delivery_cost, data.extra_work_workshop, data.extra_work_site))
    conn.commit()
    return {"status": "success", "id": cursor.lastrowid}

@app.put("/api/products/{product_id}")
def update_project_product(product_id: int, data: ProjectProductUpdate):
    conn = get_db()
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if update_data:
        fields = [f"{k} = ?" for k in update_data.keys()]
        values = list(update_data.values())
        values.append(product_id)
        conn.execute(f"UPDATE project_products SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return {"status": "success"}

@app.delete("/api/products/{product_id}")
def delete_project_product(product_id: int):
    conn = get_db()
    conn.execute("DELETE FROM project_products WHERE id = ?", (product_id,))
    conn.commit()
    return {"status": "success"}

@app.post("/api/projects/{project_id}/modules")
def create_module(project_id: int, data: ModuleCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO modules (project_id, name, type_id, width, height, depth, joints_count, assignee_id, salary_calculated, drawing_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (project_id, data.name, data.type_id, data.width, data.height, data.depth, data.joints_count, data.assignee_id, data.salary_calculated, data.drawing_path))
    conn.commit()
    return {"status": "success"}

@app.put("/api/modules/{module_id}")
def update_module(module_id: int, data: ModuleUpdate):
    conn = get_db()
    cursor = conn.cursor()
    old_mod = cursor.execute("SELECT status, project_id, assignee_id FROM modules WHERE id = ?", (module_id,)).fetchone()
    
    if data.status is not None:
        conn.execute("UPDATE modules SET status = ? WHERE id = ?", (data.status, module_id))
        
        # Auto-log if status becomes 'Зібрано'
        user_id = data.assignee_id or (old_mod["assignee_id"] if old_mod else None)
        if data.status == "Зібрано" and old_mod and old_mod["status"] != "Зібрано" and user_id:
            current_date = datetime.date.today().isoformat()
            log = cursor.execute("SELECT id FROM work_logs WHERE project_id=? AND user_id=? AND work_type=? AND date(date)=?", 
                                (old_mod["project_id"], user_id, "Збірка в цеху", current_date)).fetchone()
            
            h = float(data.hours or 0.0)
            if log:
                cursor.execute("UPDATE work_logs SET quantity = COALESCE(quantity, 0) + ?, modules_done = COALESCE(modules_done, 0) + 1 WHERE id=?", (h, log["id"]))
            else:
                cursor.execute("""
                    INSERT INTO work_logs (project_id, user_id, work_type, unit, quantity, amount, modules_done)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (old_mod["project_id"], user_id, "Збірка в цеху", "годин", h, 0, 1))

    if data.assignee_id is not None:
        conn.execute("UPDATE modules SET assignee_id = ? WHERE id = ?", (data.assignee_id, module_id))
    if data.name is not None:
        conn.execute("UPDATE modules SET name = ? WHERE id = ?", (data.name, module_id))
    if data.width is not None:
        conn.execute("UPDATE modules SET width = ? WHERE id = ?", (data.width, module_id))
    if data.height is not None:
        conn.execute("UPDATE modules SET height = ? WHERE id = ?", (data.height, module_id))
    if data.depth is not None:
        conn.execute("UPDATE modules SET depth = ? WHERE id = ?", (data.depth, module_id))
    if data.joints_count is not None:
        conn.execute("UPDATE modules SET joints_count = ? WHERE id = ?", (data.joints_count, module_id))
    if data.drawing_path is not None:
        conn.execute("UPDATE modules SET drawing_path = ? WHERE id = ?", (data.drawing_path, module_id))
    conn.commit()
    return {"status": "success"}

@app.delete("/api/modules/{module_id}")
def delete_module(module_id: int):
    conn = get_db()
    conn.execute("DELETE FROM modules WHERE id = ?", (module_id,))
    conn.execute("DELETE FROM module_comments WHERE module_id = ?", (module_id,))
    conn.commit()
    return {"status": "success"}

@app.get("/api/modules/{module_id}/comments")
def get_module_comments(module_id: int):
    conn = get_db()
    comments = conn.execute("""
        SELECT c.*, u.name as user_name
        FROM module_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.module_id = ?
        ORDER BY c.id ASC
    """, (module_id,)).fetchall()
    return [dict(c) for c in comments]

@app.post("/api/modules/{module_id}/comments")
def add_module_comment(module_id: int, data: ModuleCommentCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO module_comments (module_id, user_id, text)
        VALUES (?, ?, ?)
    """, (module_id, data.user_id, data.text.strip()))
    conn.commit()
    return {"status": "success", "id": cursor.lastrowid}

@app.post("/api/projects/{project_id}/invoices")
def create_invoice(project_id: int, data: InvoiceCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO viyar_invoices (project_id, invoice_number, category, branch, assignee_id, amount_due, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (project_id, data.invoice_number, data.category, data.branch, data.assignee_id, data.amount_due, data.file_path))
    conn.commit()
    return {"status": "success"}

@app.put("/api/invoices/{invoice_id}")
def update_invoice(invoice_id: int, data: InvoiceUpdate):
    conn = get_db()
    if data.status is not None:
        conn.execute("UPDATE viyar_invoices SET status = ? WHERE id = ?", (data.status, invoice_id))
    if data.is_paid is not None:
        conn.execute("UPDATE viyar_invoices SET is_paid = ? WHERE id = ?", (data.is_paid, invoice_id))
    if data.is_ready is not None:
        conn.execute("UPDATE viyar_invoices SET is_ready = ? WHERE id = ?", (data.is_ready, invoice_id))
    if data.invoice_number is not None:
        conn.execute("UPDATE viyar_invoices SET invoice_number = ? WHERE id = ?", (data.invoice_number, invoice_id))
    if data.category is not None:
        conn.execute("UPDATE viyar_invoices SET category = ? WHERE id = ?", (data.category, invoice_id))
    if data.branch is not None:
        conn.execute("UPDATE viyar_invoices SET branch = ? WHERE id = ?", (data.branch, invoice_id))
    if data.amount_due is not None:
        conn.execute("UPDATE viyar_invoices SET amount_due = ? WHERE id = ?", (data.amount_due, invoice_id))
    conn.commit()
    return {"status": "success"}

@app.delete("/api/invoices/{invoice_id}")
def delete_invoice(invoice_id: int):
    conn = get_db()
    conn.execute("DELETE FROM viyar_invoices WHERE id = ?", (invoice_id,))
    conn.commit()
    return {"status": "success"}

@app.post("/api/work_logs")
def create_work_log(data: WorkLogCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO work_logs (project_id, user_id, work_type, unit, quantity, amount, modules_done)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (data.project_id, data.user_id, data.work_type, 'годин', data.hours, 0, data.modules_done))
    conn.commit()
    return {"status": "success", "id": cursor.lastrowid}

@app.put("/api/work_logs/{log_id}")
def update_work_log(log_id: int, data: WorkLogUpdate):
    conn = get_db()
    log = conn.execute("SELECT user_id FROM work_logs WHERE id = ?", (log_id,)).fetchone()
    if not log: raise HTTPException(status_code=404)
    user = conn.execute("SELECT role FROM users WHERE id = ?", (data.user_id,)).fetchone()
    is_admin = user["role"] in ["Admin", "Developer"]
    if log["user_id"] != data.user_id and not is_admin: raise HTTPException(status_code=403)
    
    if data.work_type is not None: conn.execute("UPDATE work_logs SET work_type = ? WHERE id = ?", (data.work_type, log_id))
    if data.hours is not None: conn.execute("UPDATE work_logs SET quantity = ? WHERE id = ?", (data.hours, log_id))
    if data.modules_done is not None: conn.execute("UPDATE work_logs SET modules_done = ? WHERE id = ?", (data.modules_done, log_id))
    conn.commit()
    return {"status": "success"}

@app.delete("/api/work_logs/{log_id}")
def delete_work_log(log_id: int, user_id: int):
    conn = get_db()
    log = conn.execute("SELECT user_id FROM work_logs WHERE id = ?", (log_id,)).fetchone()
    if not log: raise HTTPException(status_code=404)
    user = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    is_admin = user["role"] in ["Admin", "Developer"]
    if log["user_id"] != user_id and not is_admin: raise HTTPException(status_code=403)
    
    conn.execute("DELETE FROM work_logs WHERE id = ?", (log_id,))
    conn.commit()
    return {"status": "success"}

@app.post("/api/expenses")
def create_expense(data: ExpenseCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO expenses (project_id, user_id, expense_type, amount, description)
        VALUES (?, ?, ?, ?, ?)
    ''', (data.project_id, data.user_id, data.expense_type, data.amount, data.description))
    conn.commit()
    return {"status": "success"}

@app.post("/api/projects/{project_id}/upload")
def upload_file(project_id: int, file: UploadFile = File(...)):
    conn = get_db()
    if not conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone(): raise HTTPException(status_code=404)
        
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    cursor = conn.cursor()
    cursor.execute("INSERT INTO files (project_id, filename, filepath) VALUES (?, ?, ?)", 
                   (project_id, file.filename, f"/uploads/{file.filename}"))
    conn.commit()
    return {"status": "success", "filename": file.filename, "filepath": f"/uploads/{file.filename}"}

@app.post("/api/parse-viyar-invoice")
def parse_viyar_invoice(file: UploadFile = File(...)):
    if not PyPDF2:
        return {"status": "error", "message": "PyPDF2 is not installed"}
    
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    text = ""
    try:
        with open(filepath, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += page.extract_text() or ""
    except Exception as e:
        return {"status": "error", "message": str(e)}

    # Best-effort regex parsing
    # Number: e.g. "Замовлення покупця № СФ-000123" or "Рахунок-фактура №..."
    inv_number = ""
    m_num = re.search(r'(?:Замовлення(?:\s+покупця)?|Рахунок(?:-фактура|\s+на\s+оплату)?|СФ|ЗВ|ЧК).*?№\s*([A-Za-zА-Яа-я0-9\-_/]+)', text, re.IGNORECASE)
    if not m_num:
        m_num = re.search(r'№\s*([A-Za-zА-Яа-я0-9\-_/]{3,})', text)
    if m_num:
        inv_number = m_num.group(1).strip()
        
    # Amount: e.g. "Всього до сплати: 12 345,67 грн"
    amount = 0.0
    m_amt = re.search(r'(?:Всього\s+(?:до\s+сплати|на\s+суму)|Разом\s+(?:до\s+сплати|з\s+ПДВ)?|Сума\s+до\s+сплати|До\s+сплати|Разом)\s*[:\-]?\s*([0-9][0-9\s]*[.,][0-9]{2})', text, re.IGNORECASE)
    if not m_amt:
        m_amt = re.search(r'(\d+[\s\d]*[.,]\d{2})\s*(?:грн|UAH)', text, re.IGNORECASE)
    if m_amt:
        val_str = m_amt.group(1).replace('\xa0', '').replace(' ', '').replace(',', '.')
        try:
            amount = float(val_str)
        except:
            pass

    # Branch
    branch = ""
    m_branch = re.search(r'Філія:\s*(.*?)(?=\n|ЗАЯВКА|РАХУНОК|Від|Платник|\s{3,}|$)', text, re.IGNORECASE)
    if m_branch and m_branch.group(1).strip():
        branch = m_branch.group(1).strip()
    
    if not branch:
        if "Гавела" in text or "Лепсе" in text:
            branch = "В.Гавела"
        elif "Віскозна" in text:
            branch = "Віскозна"
        elif "Новокостянтинівська" in text or "Новокост" in text:
            branch = "Новокостянтинівська"
        elif "Дніпровська" in text or "Дніпронабережна" in text:
            branch = "Дніпровська набережна"
        elif "Бровар" in text:
            branch = "Бровари"

    return {
        "status": "success", 
        "filename": file.filename,
        "filepath": f"/uploads/{file.filename}",
        "invoice_number": inv_number, 
        "amount": amount, 
        "branch": branch
    }

@app.get("/api/schedules")
def get_schedules(month: Optional[str] = None, event_type: Optional[str] = None, project_id: Optional[int] = None):
    conn = get_db()
    query = """
        SELECT s.*, p.name as project_name, u.name as assignee_name
        FROM schedules s
        LEFT JOIN projects p ON s.project_id = p.id
        LEFT JOIN users u ON s.assignee_id = u.id
        WHERE 1=1
    """
    params = []
    if month:
        query += " AND s.event_date LIKE ?"
        params.append(f"{month}%")
    if event_type and event_type != "Всі":
        query += " AND s.event_type = ?"
        params.append(event_type)
    if project_id:
        query += " AND s.project_id = ?"
        params.append(project_id)
        
    query += " ORDER BY s.event_date ASC, s.event_time ASC"
    rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/schedules")
def create_schedule(data: ScheduleCreate):
    conn = get_db()
    cursor = conn.cursor()
    assignee_ids_str = ','.join(map(str, data.assignee_ids)) if data.assignee_ids else None
    cursor.execute("""
        INSERT INTO schedules (project_id, event_type, title, event_date, event_time, address, client_name, client_phone, assignee_id, assignee_ids, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (data.project_id, data.event_type, data.title, data.event_date, data.event_time, data.address, data.client_name, data.client_phone, data.assignee_id, assignee_ids_str, data.status or 'Заплановано', data.notes))
    conn.commit()
    return {"status": "success", "id": cursor.lastrowid}

@app.put("/api/schedules/{schedule_id}")
def update_schedule(schedule_id: int, data: ScheduleUpdate):
    conn = get_db()
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if 'assignee_ids' in update_data:
        update_data['assignee_ids'] = ','.join(map(str, update_data['assignee_ids']))
        
    if update_data:
        fields = [f"{k} = ?" for k in update_data.keys()]
        values = list(update_data.values())
        values.append(schedule_id)
        conn.execute(f"UPDATE schedules SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return {"status": "success"}

@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: int):
    conn = get_db()
    conn.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
    conn.commit()
    return {"status": "success"}

@app.get("/api/reports")
def get_reports():
    conn = get_db()
    projects = conn.execute("SELECT id, name FROM projects WHERE status = 'Виконано'").fetchall()
    
    report_data = {
        "completed_projects": len(projects),
        "user_earnings": {},
        "total_expenses": 0
    }
    
    expenses = conn.execute("SELECT amount FROM expenses e JOIN projects p ON e.project_id = p.id WHERE p.status = 'Виконано'").fetchall()
    report_data["total_expenses"] = sum([e["amount"] for e in expenses])
    
    for p in projects:
        p_details = get_project(p["id"]) # No user_id, so full data
        for wl in p_details["work_logs"]:
            uname = wl["user_name"]
            if uname not in report_data["user_earnings"]: report_data["user_earnings"][uname] = 0
            report_data["user_earnings"][uname] += wl["amount"]
            
        for m in p_details["modules"]:
            if m["assignee_id"]:
                uname = m["assignee_name"]
                if uname not in report_data["user_earnings"]: report_data["user_earnings"][uname] = 0
                report_data["user_earnings"][uname] += m["salary_calculated"]
            
    return report_data

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
