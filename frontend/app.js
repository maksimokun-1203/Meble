const API_URL = "http://localhost:8000/api";

let state = {
    users: [],
    projects: [],
    dictionary: [],
    currentUser: null,
    currentProject: null,
    selectedUserForAuth: null,
    currentTabCategory: null
};

// --- API Calls ---
async function fetchUsers() {
    const res = await fetch(`${API_URL}/users`);
    state.users = await res.json();
}

async function fetchProjects() {
    const res = await fetch(`${API_URL}/projects`);
    state.projects = await res.json();
}

async function fetchProjectDetails(id) {
    const res = await fetch(`${API_URL}/projects/${id}`);
    return await res.json();
}

async function fetchDictionary() {
    const res = await fetch(`${API_URL}/dictionary`);
    state.dictionary = await res.json();
}

// --- UI Logic ---
document.addEventListener("DOMContentLoaded", async () => {
    const savedUserId = localStorage.getItem('viyar_user_id');
    
    await fetchUsers();
    await fetchDictionary();
    renderAuthUsers();
    
    if (savedUserId) {
        const u = state.users.find(x => x.id == savedUserId);
        if (u) finishLogin(u);
    }
    
    await loadProjectsDashboard();
    
    document.getElementById('auth-btn').onclick = () => {
        document.getElementById('auth-password-section').classList.add('hidden');
        document.getElementById('users-list').classList.remove('hidden');
        openModal('auth-modal');
    };

    document.getElementById('auth-submit').onclick = handlePasswordSubmit;
});

function selectUserForAuth(user) {
    state.selectedUserForAuth = user;
    document.getElementById('users-list').classList.add('hidden');
    document.getElementById('auth-password-section').classList.remove('hidden');
    
    const prompt = document.getElementById('auth-prompt');
    if (user.has_password) {
        prompt.textContent = `Введіть пароль для ${user.name}:`;
    } else {
        prompt.textContent = `Придумайте пароль для ${user.name}:`;
    }
    document.getElementById('auth-password').value = '';
}

async function handlePasswordSubmit() {
    const pw = document.getElementById('auth-password').value;
    if(!pw) return;
    
    const user = state.selectedUserForAuth;
    const endpoint = user.has_password ? '/login' : '/set-password';
    
    const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({user_id: user.id, password: pw})
    });
    
    if (res.ok) {
        if (!user.has_password) user.has_password = true;
        finishLogin(user);
    } else {
        alert("Помилка: невірний пароль!");
    }
}

function finishLogin(user) {
    state.currentUser = user;
    localStorage.setItem('viyar_user_id', user.id);
    
    const display = document.getElementById('current-user-display');
    display.textContent = user.name;
    display.classList.remove('hidden');
    closeModal('auth-modal');
    
    const isPrivileged = (user.role === 'Admin' || user.role === 'Developer');
    if (isPrivileged) {
        document.getElementById('nav-reports-btn').classList.remove('hidden');
    } else {
        document.getElementById('nav-reports-btn').classList.add('hidden');
    }
    
    if(state.currentProject) {
        renderProjectDetails(state.currentProject);
        if(state.currentTabCategory) renderChecklist(state.currentTabCategory);
    }
}

async function createContractor() {
    const name = document.getElementById('contractor-name').value;
    if (!name) return alert("Введіть ім'я");
    
    const res = await fetch(`${API_URL}/users/contractor`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: name})
    });
    if (res.ok) {
        closeModal('contractor-modal');
        await fetchUsers();
        renderAuthUsers();
        alert("Підрядника створено! Знайдіть його у списку.");
    }
}

async function loadProjectsDashboard() {
    document.getElementById('projects-loading').classList.remove('hidden');
    await fetchProjects();
    document.getElementById('projects-loading').classList.add('hidden');
    
    const container = document.getElementById('projects-container');
    container.innerHTML = '';
    
    // Kanban Columns Configuration
    const columns = [
        { title: "На погодженні", id: "status-1", status: "На погодженні", color: "bg-slate-100" },
        { title: "В очікуванні", id: "status-2", status: "В очікуванні", color: "bg-blue-50/60" },
        { title: "В роботі", id: "status-3", status: "В роботі", color: "bg-indigo-50/60" },
        { title: "Потребує допрацювання", id: "status-4", status: "Потребує допрацювання", color: "bg-orange-50/60" },
        { title: "Виконано", id: "status-5", status: "Виконано", color: "bg-green-50/60" }
    ];
    
    // Create columns
    columns.forEach(col => {
        const colDiv = document.createElement('div');
        colDiv.className = `flex-shrink-0 w-80 rounded-3xl p-5 flex flex-col gap-3 snap-center border border-slate-100 ${col.color}`;
        colDiv.innerHTML = `<h3 class="font-bold text-slate-700 flex justify-between items-center">${col.title} <span class="bg-white px-2 py-0.5 rounded-md text-xs font-bold text-slate-400 shadow-sm" id="count-${col.id}">0</span></h3><div id="cards-${col.id}" class="space-y-3 mt-1 flex-1"></div>`;
        colDiv.id = col.id;
        container.appendChild(colDiv);
    });
    
    // Render cards
    state.projects.forEach(p => {
        const card = document.createElement('div');
        
        card.className = "bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all flex flex-col gap-2";
        card.onclick = () => {
            openTab('main');
            openProject(p.id);
        }
        
        card.innerHTML = `
            <h3 class="font-bold text-slate-800 leading-tight">${p.name}</h3>
            <span class="text-xs text-slate-500 font-medium">${p.sales_value > 0 ? p.sales_value + ' грн' : 'Бюджет не встановлено'}</span>
        `;
        
        // Find matching column, default to "В роботі" if status not found
        let colObj = columns.find(c => c.status === (p.status || 'В роботі')) || columns[2];
        const colContainer = document.getElementById(`cards-${colObj.id}`);
        
        if (colContainer) {
            colContainer.appendChild(card);
            const countSpan = document.getElementById(`count-${colObj.id}`);
            countSpan.textContent = parseInt(countSpan.textContent) + 1;
        }
    });
}

async function openProject(id) {
    const project = await fetchProjectDetails(id);
    const isFirstLoad = !state.currentProject || state.currentProject.id !== id;
    state.currentProject = project;
    renderProjectDetails(project);
    
    if(document.getElementById('page-project-details').classList.contains('hidden-page')) {
        navigate('project-details');
    }
    
    if (isFirstLoad) {
        openTab('main');
    }
    
    if(state.currentTabCategory) {
        renderChecklist(state.currentTabCategory);
    }
}

function openTab(tabName) {
    document.getElementById('tab-info').classList.add('hidden-page');
    document.getElementById('tab-checklist').classList.add('hidden-page');
    
    const tilesGrid = document.getElementById('pd-tiles');
    
    if (tabName === 'main') {
        if (tilesGrid) tilesGrid.style.display = 'grid';
        state.currentTabCategory = null;
    } else if (tabName === 'info') {
        if (tilesGrid) tilesGrid.style.display = 'none';
        document.getElementById('tab-info').classList.remove('hidden-page');
        state.currentTabCategory = null;
    } else {
        if (tilesGrid) tilesGrid.style.display = 'none';
        document.getElementById('tab-checklist').classList.remove('hidden-page');
        let title = '';
        let cat = '';
        if (tabName === 'furniture') { title = 'Фурнітура'; cat = 'Фурнітура'; }
        if (tabName === 'tools') { title = 'Інструмент та розхідники'; cat = 'Інструмент та розхідники'; }
        if (tabName === 'prep') { title = 'Підготовка до виїзду'; cat = 'Підготовка до виїзду'; }
        document.getElementById('checklist-title').textContent = title;
        state.currentTabCategory = cat;
        renderChecklist(cat);
    }
}

function renderChecklist(category) {
    const container = document.getElementById('checklist-container');
    container.innerHTML = '';
    
    const isPrivileged = state.currentUser && (state.currentUser.role === 'Admin' || state.currentUser.role === 'Developer');
    const canAdd = state.currentUser && state.currentUser.role !== 'Підрядник' && state.currentUser.role !== 'Contractor';
    
    // Explicitly hide/show
    if (canAdd) {
        document.getElementById('add-item-btn').style.display = 'block';
    } else {
        document.getElementById('add-item-btn').style.display = 'none';
    }
    
    const datalist = document.getElementById('item-datalist');
    datalist.innerHTML = '';
    state.dictionary.filter(d => d.category === category).forEach(d => {
        datalist.innerHTML += `<option value="${d.name}">`;
    });
    
    const items = state.currentProject.items.filter(i => i.category === category);
    
    if (items.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-400">Список порожній. Адміністратор може додати позиції.</p>';
        return;
    }
    
    items.forEach(item => {
        container.innerHTML += `
        <div class="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <input type="checkbox" ${item.is_checked ? 'checked' : ''} onchange="updateItemStatus(${item.id}, 'check', this.checked)" class="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500">
            <span class="flex-1 text-sm font-medium ${item.is_checked ? 'line-through text-slate-400' : 'text-slate-700'}">${item.name}</span>
            <input type="number" value="${item.quantity}" min="0" onchange="updateItemStatus(${item.id}, 'qty', this.value)" class="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-center">
            <span class="text-xs text-slate-500">шт</span>
        </div>`;
    });
}

async function addProjectItem() {
    const name = document.getElementById('item-search').value;
    if(!name || !state.currentTabCategory || !state.currentProject) return;
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}/items`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            category: state.currentTabCategory,
            name: name,
            quantity: 0
        })
    });
    
    document.getElementById('item-search').value = '';
    closeModal('add-item-modal');
    openProject(state.currentProject.id);
}

async function updateItemStatus(itemId, type, val) {
    const payload = {};
    if (type === 'check') payload.is_checked = val ? 1 : 0;
    if (type === 'qty') payload.quantity = parseInt(val) || 0;
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}/items/${itemId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    openProject(state.currentProject.id);
}

function renderProjectDetails(p) {
    document.getElementById('pd-name').textContent = p.name;
    document.getElementById('pd-sales').textContent = p.sales_value > 0 ? p.sales_value + ' грн' : '0 грн';
    
    const statusSelect = document.getElementById('pd-status-select');
    statusSelect.value = p.status || 'В роботі';
    
    const isPrivileged = state.currentUser && (state.currentUser.role === 'Admin' || state.currentUser.role === 'Developer');
    statusSelect.disabled = !isPrivileged;
    
    // Client Info Update
    document.getElementById('pd-client-name').innerHTML = `<i class="fa-solid fa-user w-5 text-center mr-1"></i><span>${p.client_name || 'Не вказано'}</span>`;
    document.getElementById('pd-client-phone').innerHTML = `<i class="fa-solid fa-phone w-5 text-center mr-1"></i><span>${p.client_phone || 'Не вказано'}</span>`;
    document.getElementById('pd-client-phone').href = `tel:${p.client_phone || ''}`;
    document.getElementById('pd-client-address').innerHTML = `<i class="fa-solid fa-map-location-dot w-5 text-center mr-1"></i><span>${p.location_address || 'Не вказано'}</span>`;
    document.getElementById('pd-advance-payment').textContent = `${p.advance_payment || 0} грн`;

    const editClientBtn = document.getElementById('pd-edit-client-btn');
    if (isPrivileged) {
        editClientBtn.classList.remove('hidden');
    } else {
        editClientBtn.classList.add('hidden');
    }
    
    const adminControls = document.getElementById('pd-admin-controls');
    if (isPrivileged && adminControls) {
        adminControls.classList.remove('hidden');
        document.getElementById('pd-sales-input').value = p.sales_value || 0;
        document.getElementById('pd-modules-input').value = p.modules_count || '';
        document.getElementById('pd-extra-ws-input').value = p.extra_work_workshop || '';
        document.getElementById('pd-extra-site-input').value = p.extra_work_site || '';
    } else if (adminControls) {
        adminControls.classList.add('hidden');
    }
    
    const summaryCard = document.getElementById('pd-summary');
    if (p.status === 'Виконано') {
        summaryCard.classList.remove('hidden');
        document.getElementById('pd-actions').classList.add('hidden');
        
        let totalExpenses = p.expenses.reduce((sum, e) => sum + e.amount, 0);
        let content = `<p><strong>Продажна вартість:</strong> ${p.sales_value} грн</p>
                       <p><strong>Загальні витрати:</strong> ${totalExpenses} грн</p>`;
                       
        if (p.modules_count) content += `<p><strong>Модулів загалом:</strong> ${p.modules_count} шт</p>`;
        
        let userSalaries = {};
        p.work_logs.forEach(l => {
            if(!userSalaries[l.user_name]) userSalaries[l.user_name] = 0;
            userSalaries[l.user_name] += l.amount;
        });
        
        content += `<h4 class="font-bold mt-3 border-t border-indigo-100 pt-2">Розрахована ЗП (за Балами: Модулі + Години):</h4><ul class="list-disc pl-4 mt-1">`;
        for (const [user, amount] of Object.entries(userSalaries)) {
            content += `<li>${user}: <span class="font-bold text-indigo-700">${amount.toFixed(0)} грн</span></li>`;
        }
        content += `</ul>`;
        
        document.getElementById('pd-summary-content').innerHTML = content;
    } else {
        summaryCard.classList.add('hidden');
        document.getElementById('pd-actions').classList.remove('hidden');
    }
    
    const wlContainer = document.getElementById('pd-worklogs');
    wlContainer.innerHTML = '';
    if (p.work_logs.length === 0) {
        wlContainer.innerHTML = '<p class="text-sm text-slate-400">Ще немає записів</p>';
    } else {
        p.work_logs.forEach(l => {
            const canEdit = state.currentUser && (state.currentUser.id === l.user_id || isPrivileged);
            const safeWorkType = l.work_type.replace(/'/g, "\\'");
            const editBtn = canEdit ? `<button onclick="editWorkLog(${l.id}, '${safeWorkType}', ${l.quantity}, ${l.modules_done || 0})" class="text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-pen"></i></button>` : '';
            
            wlContainer.innerHTML += `
            <div class="border-b border-slate-50 pb-2 mb-2 last:border-0 group">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-sm font-semibold">${l.work_type}</p>
                        <p class="text-xs text-slate-500">${l.user_name} • ${new Date(l.date).toLocaleDateString()}</p>
                        <p class="text-xs text-slate-400 mt-1">Годин: ${l.quantity} | Модулів: ${l.modules_done || 0}</p>
                    </div>
                    <div class="text-right flex items-center gap-3">
                        <div>
                            <p class="text-sm font-bold text-indigo-600">${l.amount > 0 ? l.amount.toFixed(0) + ' грн' : '0 грн'}</p>
                            <p class="text-xs text-indigo-300">Бал: ${(l.quantity + (l.modules_done||0)).toFixed(1)}</p>
                        </div>
                        ${editBtn}
                    </div>
                </div>
            </div>`;
        });
    }

    const expContainer = document.getElementById('pd-expenselogs');
    if(expContainer) {
        expContainer.innerHTML = '';
        if (p.expenses.length === 0) {
            expContainer.innerHTML = '<p class="text-sm text-slate-400">Ще немає витрат</p>';
        } else {
            p.expenses.forEach(e => {
                expContainer.innerHTML += `
                <div class="border-b border-slate-50 pb-2 mb-2 last:border-0">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-semibold">${e.expense_type}</p>
                            <p class="text-xs text-slate-500">${e.user_name} • ${e.description || ''}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-bold text-rose-600">${e.amount} грн</p>
                        </div>
                    </div>
                </div>`;
            });
        }
    }
    
    // Modules List Rendering
    const modContainer = document.getElementById('pd-modules-list');
    if(modContainer) {
        modContainer.innerHTML = '';
        if(!p.modules || p.modules.length === 0) {
            modContainer.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Ще немає модулів</p>';
        } else {
            p.modules.forEach(m => {
                let actionBtn = '';
                if(m.status === 'В черзі') {
                    actionBtn = `<button onclick="takeModule(${m.id})" class="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg w-full">Взяти в роботу</button>`;
                } else if (m.status === 'В роботі') {
                    if(state.currentUser && m.assignee_id === state.currentUser.id) {
                        actionBtn = `<button onclick="completeModule(${m.id})" class="mt-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-2 rounded-lg w-full transition">Позначити як Зібрано</button>`;
                    } else {
                        actionBtn = `<div class="mt-2 text-xs font-medium text-amber-600 bg-amber-50 px-3 py-2 rounded-lg w-full text-center">Робить: ${m.assignee_name}</div>`;
                    }
                } else if (m.status === 'Зібрано') {
                    actionBtn = `<div class="mt-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg w-full text-center flex items-center justify-center gap-1"><i class="fa-solid fa-check"></i> Зібрано (${m.assignee_name})</div>`;
                }
                
                modContainer.innerHTML += `
                <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-slate-800">${m.name}</h4>
                        <span class="text-indigo-600 font-bold">${m.salary_calculated > 0 ? m.salary_calculated + ' грн' : '0 грн'}</span>
                    </div>
                    <div class="text-xs text-slate-500 mb-2 flex gap-3">
                        <span><i class="fa-solid fa-ruler-combined"></i> ${m.width}x${m.height}x${m.depth}</span>
                        <span>Стиків: ${m.joints_count}</span>
                    </div>
                    ${actionBtn}
                </div>`;
            });
        }
    }
    
    // Invoices List Rendering
    const invContainer = document.getElementById('pd-invoices-list');
    if(invContainer) {
        invContainer.innerHTML = '';
        if(!p.invoices || p.invoices.length === 0) {
            invContainer.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Немає рахунків</p>';
        } else {
            p.invoices.forEach(inv => {
                let statusBadge = inv.is_paid 
                    ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">Оплачено</span>`
                    : `<button onclick="payInvoice(${inv.id})" class="bg-amber-100 text-amber-700 hover:bg-emerald-500 hover:text-white px-2 py-1 rounded text-xs font-bold transition">Не оплачено (Оплатити)</button>`;
                    
                invContainer.innerHTML += `
                <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
                    <div class="flex justify-between">
                        <span class="font-bold text-slate-800"># ${inv.invoice_number}</span>
                        <span class="font-bold text-rose-600">${inv.amount_due} грн</span>
                    </div>
                    <div class="text-xs text-slate-500 flex justify-between">
                        <span>${inv.category} • ${inv.branch}</span>
                        ${statusBadge}
                    </div>
                </div>`;
            });
        }
    }
    
    const filesContainer = document.getElementById('pd-files');
    filesContainer.innerHTML = '';
    if (p.files.length === 0) {
        filesContainer.innerHTML = '<p class="text-xs text-slate-400">Немає прикріплених файлів</p>';
    } else {
        p.files.forEach(f => {
            filesContainer.innerHTML += `
            <a href="http://localhost:8000${f.filepath}" target="_blank" class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition">
                <i class="fa-regular fa-file-image text-indigo-400 text-xl"></i>
                <span class="text-sm font-medium text-slate-700 truncate w-full">${f.filename}</span>
            </a>`;
        });
    }
}

async function updateProjectStatus() {
    if(!state.currentProject) return;
    const status = document.getElementById('pd-status-select').value;
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            user_id: state.currentUser.id,
            status: status
        })
    });
    openProject(state.currentProject.id); 
}

async function updateProjectDetails() {
    if(!state.currentProject) return;
    
    const val = parseFloat(document.getElementById('pd-sales-input').value) || 0;
    const mods = parseFloat(document.getElementById('pd-modules-input').value) || 0;
    const exWs = document.getElementById('pd-extra-ws-input').value;
    const exSite = document.getElementById('pd-extra-site-input').value;
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            user_id: state.currentUser.id,
            sales_value: val,
            modules_count: mods,
            extra_work_workshop: exWs,
            extra_work_site: exSite
        })
    });
    openProject(state.currentProject.id); 
}

function resetWorkForm() {
    document.getElementById('work-form').reset();
    document.getElementById('work_log_id').value = '';
    document.getElementById('work_type').disabled = false;
    document.getElementById('btn-delete-work').classList.add('hidden');
}

function editWorkLog(id, w_type, hours, modules) {
    resetWorkForm();
    document.getElementById('work_log_id').value = id;
    document.getElementById('work_type').value = w_type;
    document.getElementById('work_type').disabled = false;
    document.getElementById('work_hours').value = hours;
    document.getElementById('work_modules').value = modules;
    
    document.getElementById('btn-delete-work').classList.remove('hidden');
    openModal('work-modal');
}

async function deleteWorkLog() {
    if(!state.currentUser) return;
    if(!confirm("Видалити цей запис?")) return;
    const id = document.getElementById('work_log_id').value;
    
    await fetch(`${API_URL}/work_logs/${id}?user_id=${state.currentUser.id}`, {
        method: 'DELETE'
    });
    
    closeModal('work-modal');
    openProject(state.currentProject.id);
}

async function submitWorkLog(e) {
    e.preventDefault();
    if(!state.currentUser) return alert("Авторизуйтесь!");
    
    const id = document.getElementById('work_log_id').value;
    
    if (id) {
        await fetch(`${API_URL}/work_logs/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: state.currentUser.id,
                work_type: document.getElementById('work_type').value,
                hours: parseFloat(document.getElementById('work_hours').value),
                modules_done: parseFloat(document.getElementById('work_modules').value) || 0
            })
        });
    } else {
        await fetch(`${API_URL}/work_logs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                project_id: state.currentProject.id,
                user_id: state.currentUser.id,
                work_type: document.getElementById('work_type').value,
                hours: parseFloat(document.getElementById('work_hours').value),
                modules_done: parseFloat(document.getElementById('work_modules').value) || 0
            })
        });
    }
    
    closeModal('work-modal');
    resetWorkForm();
    openProject(state.currentProject.id); 
}

async function submitExpense(e) {
    e.preventDefault();
    if(!state.currentUser) return alert("Авторизуйтесь!");
    
    const data = {
        project_id: state.currentProject.id,
        user_id: state.currentUser.id,
        expense_type: document.getElementById('exp_type').value,
        amount: parseFloat(document.getElementById('exp_amount').value),
        description: document.getElementById('exp_desc').value
    };
    
    const res = await fetch(`${API_URL}/expenses`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    
    if(res.ok) {
        closeModal('expense-modal');
        document.getElementById('expense-form').reset();
        openProject(state.currentProject.id); 
    }
}

async function uploadFile() {
    if(!state.currentProject) return;
    const fileInput = document.getElementById('file-upload');
    if(!fileInput.files.length) return;
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    document.getElementById('pd-files').innerHTML = '<p class="text-xs text-indigo-500">Завантаження...</p>';
    
    const res = await fetch(`${API_URL}/projects/${state.currentProject.id}/upload`, {
        method: 'POST',
        body: formData
    });
    
    if(res.ok) {
        fileInput.value = '';
        openProject(state.currentProject.id); 
    }
}

async function loadReports() {
    document.getElementById('reports-loading').classList.remove('hidden');
    document.getElementById('reports-content').innerHTML = '';
    
    const res = await fetch(`${API_URL}/reports`);
    const data = await res.json();
    
    document.getElementById('reports-loading').classList.add('hidden');
    
    let html = `
        <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-center">
                <p class="text-slate-500 text-sm font-medium mb-1">Закритих об'єктів</p>
                <p class="text-3xl font-bold text-indigo-600">${data.completed_projects}</p>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-center">
                <p class="text-slate-500 text-sm font-medium mb-1">Витрати загалом</p>
                <p class="text-2xl font-bold text-rose-500">${data.total_expenses} грн</p>
            </div>
        </div>
        
        <h3 class="text-lg font-bold text-slate-800 mb-3">Заробіток співробітників (за закритими)</h3>
        <div class="space-y-3">
    `;
    
    for (const [user, amount] of Object.entries(data.user_earnings)) {
        html += `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-50 flex justify-between items-center">
            <span class="font-medium text-slate-700">${user}</span>
            <span class="font-bold text-indigo-600 text-lg">${amount.toFixed(0)} грн</span>
        </div>`;
    }
    
    html += `</div>`;
    document.getElementById('reports-content').innerHTML = html;
}

// --- Navigation & Modals ---
function navigate(pageId) {
    document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden-page'));
    document.getElementById(`page-${pageId}`).classList.remove('hidden-page');
    if(pageId === 'projects') loadProjectsDashboard();
    if(pageId === 'reports') loadReports();
}

function handleDynamicBack() {
    state.currentTabCategory = null;
    openTab('main');
    navigate('projects');
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function renderAuthUsers() {
    const list = document.getElementById('users-list');
    list.innerHTML = '';
    state.users.forEach(u => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left px-4 py-3 mb-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl font-medium transition flex justify-between items-center";
        let badge = '';
        if (u.role === 'Підрядник' || u.role === 'Contractor') {
            badge = `<span class="text-xs px-2 py-1 bg-slate-200 rounded-md text-slate-600">${u.has_password ? '🔒' : '⚠️'} ${u.role}</span>`;
        } else {
            badge = `<span class="text-xs text-slate-400">${u.has_password ? '🔒' : '⚠️'}</span>`;
        }
        btn.innerHTML = `<span>${u.name}</span> ${badge}`;
        btn.onclick = () => selectUserForAuth(u);
        list.appendChild(btn);
    });
}


// --- Client Edit Logic ---
function openClientEditModal() {
    if(!state.currentProject) return;
    document.getElementById('ce-name').value = state.currentProject.client_name || '';
    document.getElementById('ce-phone').value = state.currentProject.client_phone || '';
    document.getElementById('ce-address').value = state.currentProject.location_address || '';
    document.getElementById('ce-advance').value = state.currentProject.advance_payment || '';
    openModal('client-edit-modal');
}

async function saveClientEdit() {
    if(!state.currentProject) return;
    
    const data = {
        user_id: state.currentUser.id,
        client_name: document.getElementById('ce-name').value,
        client_phone: document.getElementById('ce-phone').value,
        location_address: document.getElementById('ce-address').value,
        advance_payment: parseFloat(document.getElementById('ce-advance').value) || 0
    };
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    
    closeModal('client-edit-modal');
    openProject(state.currentProject.id);
}

// --- Templates Fetch ---
let moduleTemplates = [];
async function fetchTemplates() {
    try {
        const res = await fetch(`${API_URL}/modules/templates`);
        moduleTemplates = await res.json();
        
        const sel = document.getElementById('mod-template');
        sel.innerHTML = '<option value="">-- Оберіть шаблон --</option>';
        moduleTemplates.forEach(t => {
            sel.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });
    } catch(e) {}
}

function applyModuleTemplate() {
    const tId = document.getElementById('mod-template').value;
    if(!tId) return;
    const tmpl = moduleTemplates.find(x => x.id == tId);
    if(tmpl) {
        document.getElementById('mod-name').value = tmpl.name;
    }
}

async function saveModule() {
    if(!state.currentProject || !state.currentUser) return;
    const tId = document.getElementById('mod-template').value;
    const name = document.getElementById('mod-name').value;
    
    // Calculate salary based on template if selected
    let salary = 0;
    if(tId) {
        const tmpl = moduleTemplates.find(x => x.id == tId);
        const joints = parseInt(document.getElementById('mod-joints').value) || 0;
        if(tmpl) {
            salary = tmpl.base_rate + (joints * tmpl.joints_rate);
        }
    }
    
    const data = {
        name: name,
        type_id: tId,
        width: parseFloat(document.getElementById('mod-width').value) || 0,
        height: parseFloat(document.getElementById('mod-height').value) || 0,
        depth: parseFloat(document.getElementById('mod-depth').value) || 0,
        joints_count: parseInt(document.getElementById('mod-joints').value) || 0,
        assignee_id: null,
        salary_calculated: salary
    };
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}/modules`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    
    closeModal('add-module-modal');
    // reset form
    document.getElementById('mod-name').value = '';
    document.getElementById('mod-template').value = '';
    document.getElementById('mod-width').value = '';
    document.getElementById('mod-height').value = '';
    document.getElementById('mod-depth').value = '';
    document.getElementById('mod-joints').value = '';
    
    openProject(state.currentProject.id);
}

async function takeModule(moduleId) {
    if(!state.currentUser) return;
    if(!confirm("Взяти цей модуль в роботу?")) return;
    
    await fetch(`${API_URL}/modules/${moduleId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ assignee_id: state.currentUser.id, status: 'В роботі' })
    });
    openProject(state.currentProject.id);
}

async function completeModule(moduleId) {
    if(!state.currentUser) return;
    if(!confirm("Позначити модуль як зібраний?")) return;
    
    await fetch(`${API_URL}/modules/${moduleId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: 'Зібрано' })
    });
    openProject(state.currentProject.id);
}

// --- Invoice Logic ---
async function saveInvoice() {
    if(!state.currentProject || !state.currentUser) return;
    const data = {
        invoice_number: document.getElementById('inv-number').value,
        category: document.getElementById('inv-category').value,
        branch: document.getElementById('inv-branch').value,
        amount_due: parseFloat(document.getElementById('inv-amount').value) || 0,
        assignee_id: state.currentUser.id
    };
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}/invoices`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    
    closeModal('add-invoice-modal');
    document.getElementById('inv-number').value = '';
    document.getElementById('inv-branch').value = '';
    document.getElementById('inv-amount').value = '';
    
    openProject(state.currentProject.id);
}

async function payInvoice(invoiceId) {
    if(!state.currentUser) return;
    if(!confirm("Позначити рахунок як оплачений?")) return;
    
    await fetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: 'Оплачено', is_paid: true })
    });
    openProject(state.currentProject.id);
}

// Add fetchTemplates to init
const oldInit = init;
init = async function() {
    await fetchTemplates();
    await oldInit();
}
