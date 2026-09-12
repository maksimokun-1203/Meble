from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pydantic import BaseModel
import os
import shutil
import hashlib
from database import get_db

app = FastAPI(title="ViyarApp API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
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
    user_id: int
    sales_value: Optional[float] = None
    status: Optional[str] = None
    modules_count: Optional[float] = None
    extra_work_workshop: Optional[str] = None
    extra_work_site: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    location_address: Optional[str] = None
    advance_payment: Optional[float] = None

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

class ModuleUpdate(BaseModel):
    status: Optional[str] = None
    assignee_id: Optional[int] = None

class InvoiceCreate(BaseModel):
    invoice_number: str
    category: str
    branch: str
    assignee_id: Optional[int] = None
    amount_due: float = 0

class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    is_paid: Optional[bool] = None

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
    modules = conn.execute("SELECT m.*, u.name as assignee_name FROM modules m LEFT JOIN users u ON m.assignee_id = u.id WHERE m.project_id = ?", (project_id,)).fetchall()
    invoices = conn.execute("SELECT i.*, u.name as assignee_name FROM viyar_invoices i LEFT JOIN users u ON i.assignee_id = u.id WHERE i.project_id = ?", (project_id,)).fetchall()
    
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
    project_dict["modules"] = [dict(m) for m in modules]
    project_dict["invoices"] = [dict(i) for i in invoices]
    
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

@app.post("/api/projects/{project_id}/modules")
def create_module(project_id: int, data: ModuleCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO modules (project_id, name, type_id, width, height, depth, joints_count, assignee_id, salary_calculated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (project_id, data.name, data.type_id, data.width, data.height, data.depth, data.joints_count, data.assignee_id, data.salary_calculated))
    conn.commit()
    return {"status": "success"}

@app.put("/api/modules/{module_id}")
def update_module(module_id: int, data: ModuleUpdate):
    conn = get_db()
    if data.status is not None:
        conn.execute("UPDATE modules SET status = ? WHERE id = ?", (data.status, module_id))
    if data.assignee_id is not None:
        conn.execute("UPDATE modules SET assignee_id = ? WHERE id = ?", (data.assignee_id, module_id))
    conn.commit()
    return {"status": "success"}

@app.delete("/api/modules/{module_id}")
def delete_module(module_id: int):
    conn = get_db()
    conn.execute("DELETE FROM modules WHERE id = ?", (module_id,))
    conn.commit()
    return {"status": "success"}

@app.post("/api/projects/{project_id}/invoices")
def create_invoice(project_id: int, data: InvoiceCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO viyar_invoices (project_id, invoice_number, category, branch, assignee_id, amount_due)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (project_id, data.invoice_number, data.category, data.branch, data.assignee_id, data.amount_due))
    conn.commit()
    return {"status": "success"}

@app.put("/api/invoices/{invoice_id}")
def update_invoice(invoice_id: int, data: InvoiceUpdate):
    conn = get_db()
    if data.status is not None:
        conn.execute("UPDATE viyar_invoices SET status = ? WHERE id = ?", (data.status, invoice_id))
    if data.is_paid is not None:
        conn.execute("UPDATE viyar_invoices SET is_paid = ? WHERE id = ?", (data.is_paid, invoice_id))
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
    return {"status": "success", "filename": file.filename}

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
