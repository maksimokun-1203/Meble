const API_URL = '/api';

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
    await fetchTemplates();
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

    // Auto-parse Viyar invoice PDF
    const invFileInput = document.getElementById('inv-file');
    if (invFileInput) {
        invFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith('.pdf')) return;
            
            const label = invFileInput.previousElementSibling;
            const origText = label ? label.textContent : '';
            if (label) label.textContent = 'Зчитування PDF рахунку... ⏳';
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch(`${API_URL}/parse-viyar-invoice`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.status === 'success') {
                    if (data.invoice_number) document.getElementById('inv-number').value = data.invoice_number;
                    if (data.amount) document.getElementById('inv-amount').value = data.amount;
                    if (data.branch) document.getElementById('inv-branch').value = data.branch;
                    if (data.filepath) invFileInput.dataset.uploadedPath = data.filepath;
                }
            } catch (err) {
                console.error('Invoice parse error:', err);
            } finally {
                if (label) label.textContent = origText;
            }
        });
    }
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
    
    document.getElementById('current-user-display').textContent = user.name;
    document.getElementById('current-user-display').classList.remove('hidden');
    document.getElementById('nav-cabinet-btn').classList.remove('hidden');
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
    ['tab-info', 'tab-checklist', 'tab-modules', 'tab-invoices', 'tab-media'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden-page');
    });
    
    const tilesGrid = document.getElementById('pd-tiles');
    if (tilesGrid) {
        tilesGrid.style.display = (tabName === 'main') ? 'grid' : 'none';
    }
    
    const topBackBtn = document.getElementById('pd-top-back-btn');
    if (topBackBtn) {
        topBackBtn.style.display = (tabName === 'main') ? 'flex' : 'none';
    }
    
    if (tabName === 'main') {
        state.currentTabCategory = null;
    } else if (tabName === 'info') {
        document.getElementById('tab-info').classList.remove('hidden-page');
        state.currentTabCategory = null;
    } else if (tabName === 'modules') {
        document.getElementById('tab-modules').classList.remove('hidden-page');
        state.currentTabCategory = null;
    } else if (tabName === 'invoices') {
        document.getElementById('tab-invoices').classList.remove('hidden-page');
        state.currentTabCategory = null;
    } else if (tabName === 'media') {
        document.getElementById('tab-media').classList.remove('hidden-page');
        state.currentTabCategory = null;
    } else {
        document.getElementById('tab-checklist').classList.remove('hidden-page');
        let title = '';
        let cat = '';
        if (tabName === 'furniture') { title = 'Фурнітура'; cat = 'Фурнітура'; }
        if (tabName === 'tools') { title = 'Інструмент та розхідники'; cat = 'Інструмент та розхідники'; }
        if (tabName === 'prep') { title = 'Підготовка до виїзду'; cat = 'Підготовка до виїзду'; }
        if (tabName === 'hardware') { title = 'Фурнітура / Інструмент'; cat = 'Фурнітура / Інструмент'; }
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
        let deleteBtn = canAdd ? `<button onclick="deleteProjectItem(${item.id})" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash"></i></button>` : '';
        container.innerHTML += `
        <div class="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <input type="checkbox" ${item.is_checked ? 'checked' : ''} onchange="updateItemStatus(${item.id}, 'check', this.checked)" class="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500">
            <span class="flex-1 text-sm font-medium ${item.is_checked ? 'line-through text-slate-400' : 'text-slate-700'}">${item.name}</span>
            <input type="number" value="${item.quantity}" min="0" onchange="updateItemStatus(${item.id}, 'qty', this.value)" class="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-center">
            <span class="text-xs text-slate-500">шт</span>
            ${deleteBtn}
        </div>`;
    });
}

async function addProjectItem() {
    const name = document.getElementById('item-search').value;
    const qty = parseInt(document.getElementById('item-qty').value) || 0;
    if(!name || !state.currentTabCategory || !state.currentProject) return;
    
    await fetch(`${API_URL}/projects/${state.currentProject.id}/items`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            category: state.currentTabCategory,
            name: name,
            quantity: qty
        })
    });
    
    document.getElementById('item-search').value = '';
    document.getElementById('item-qty').value = '';
    closeModal('add-item-modal');
    openProject(state.currentProject.id);
}

async function deleteProjectItem(itemId) {
    if(!confirm("Видалити цю позицію?")) return;
    await fetch(`${API_URL}/projects/${state.currentProject.id}/items/${itemId}`, {
        method: 'DELETE'
    });
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
    const modsCountDisplay = document.getElementById('pd-modules-display');
    if (modsCountDisplay) modsCountDisplay.textContent = (p.modules_count || 0) + ' шт';
    
    const statusSelect = document.getElementById('pd-status-select');
    statusSelect.value = p.status || 'В роботі';
    
    const isPrivileged = state.currentUser && (state.currentUser.role === 'Admin' || state.currentUser.role === 'Developer');
    statusSelect.disabled = !isPrivileged;
    
    // Client Info Update
    document.getElementById('pd-client-name').innerHTML = `<i class="fa-solid fa-user w-5 text-center mr-1"></i><span>${escapeHtml(p.client_name || 'Не вказано')}</span>`;
    document.getElementById('pd-client-phone').innerHTML = `<i class="fa-solid fa-phone w-5 text-center mr-1"></i><span>${escapeHtml(p.client_phone || 'Не вказано')}</span>`;
    document.getElementById('pd-client-phone').href = `tel:${p.client_phone || ''}`;
    document.getElementById('pd-client-address').innerHTML = `<i class="fa-solid fa-map-location-dot w-5 text-center mr-1"></i><span>${escapeHtml(p.location_address || 'Не вказано')}</span>`;
    
    // Order Description
    const descBox = document.getElementById('pd-description-box');
    const descText = document.getElementById('pd-description-text');
    if (descBox && descText) {
        if (p.description && p.description.trim()) {
            descBox.classList.remove('hidden');
            descText.textContent = p.description;
        } else {
            descBox.classList.add('hidden');
            descText.textContent = '';
        }
    }

    // Payment info: Advance & Remaining balance
    const advEl = document.getElementById('pd-advance-payment');
    const remEl = document.getElementById('pd-remaining-payment');
    const remBox = document.getElementById('pd-remaining-box');
    
    const advance = p.advance_payment || 0;
    const sales = p.sales_value || 0;
    
    if (p.payment_type === 'percent' && p.advance_percent > 0) {
        advEl.textContent = `${advance.toLocaleString('uk-UA')} грн (${p.advance_percent}%)`;
    } else {
        advEl.textContent = `${advance.toLocaleString('uk-UA')} грн`;
    }
    
    if (sales > 0) {
        if (remBox) remBox.classList.remove('hidden');
        const remaining = Math.max(0, sales - advance);
        const remPercent = sales > 0 ? ((remaining / sales) * 100).toFixed(0) : 0;
        if (remEl) remEl.textContent = `${remaining.toLocaleString('uk-UA')} грн (${remPercent}%)`;
    } else {
        if (remBox) remBox.classList.remove('hidden');
        if (remEl) remEl.textContent = `0 грн`;
    }

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
                
                let manageBtns = '';
                const canManageMod = isPrivileged || (m.assignee_id === state.currentUser?.id);
                if (canManageMod) {
                    manageBtns = `<div class="absolute top-4 right-4 flex gap-2">
                        <button onclick='editModule(${JSON.stringify(m)})' class="text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteModule(${m.id})" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash"></i></button>
                    </div>`;
                }

                let drawingLink = '';
                if (m.drawing_path) {
                    drawingLink = `
                    <a href="${m.drawing_path}" target="_blank" class="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg font-medium transition">
                        <i class="fa-solid fa-file-lines"></i> Креслення
                    </a>`;
                }

                const commentsCount = m.comments_count || 0;
                const safeModName = (m.name || 'Модуль').replace(/'/g, "\\'");
                const commentsBtn = `
                <button onclick="openModuleComments(${m.id}, '${safeModName}')" class="inline-flex items-center gap-1 text-xs ${commentsCount > 0 ? 'text-indigo-700 bg-indigo-100 font-bold' : 'text-slate-600 bg-slate-100 hover:text-indigo-600 hover:bg-indigo-50'} px-2.5 py-1 rounded-lg transition">
                    <i class="fa-regular fa-comment-dots"></i> 💬 Коментарі ${commentsCount > 0 ? `(${commentsCount})` : ''}
                </button>`;

                modContainer.innerHTML += `
                <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative pr-12">
                    ${manageBtns}
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-slate-800">${escapeHtml(m.name)}</h4>
                        <span class="text-indigo-600 font-bold">${m.salary_calculated > 0 ? m.salary_calculated + ' грн' : '0 грн'}</span>
                    </div>
                    <div class="text-xs text-slate-500 mb-2 flex gap-3">
                        <span><i class="fa-solid fa-ruler-combined"></i> ${m.width}x${m.height}x${m.depth}</span>
                        <span>Стиків: ${m.joints_count}</span>
                    </div>
                    <div class="mt-2 mb-2 flex items-center gap-2 flex-wrap">
                        ${drawingLink}
                        ${commentsBtn}
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
                let paidChecked = inv.is_paid ? 'checked' : '';
                let readyChecked = inv.is_ready ? 'checked' : '';
                
                let fileLink = inv.file_path 
                    ? `<a href="http://localhost:8000${inv.file_path}" target="_blank" class="text-indigo-500 hover:underline"><i class="fa-solid fa-file-pdf"></i> Файл</a>` 
                    : '';
                    
                let manageBtns = '';
                if (isPrivileged || inv.assignee_id === state.currentUser?.id) {
                    manageBtns = `
                        <button onclick='editInvoice(${JSON.stringify(inv)})' class="text-slate-400 hover:text-indigo-600 ml-2"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteInvoice(${inv.id})" class="text-slate-400 hover:text-rose-600 ml-2"><i class="fa-solid fa-trash"></i></button>
                    `;
                }

                invContainer.innerHTML += `
                <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2 relative">
                    <div class="flex justify-between">
                        <span class="font-bold text-slate-800"># ${inv.invoice_number}</span>
                        <div class="flex items-center">
                            <span class="font-bold text-rose-600">${inv.amount_due} грн</span>
                            ${manageBtns}
                        </div>
                    </div>
                    <div class="text-xs text-slate-500 flex justify-between items-center border-b border-slate-100 pb-2">
                        <span>${inv.category} • ${inv.branch}</span>
                        ${fileLink}
                    </div>
                    <div class="flex gap-4 mt-1 text-sm font-medium">
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" onchange="toggleReadyInvoice(${inv.id}, this.checked)" ${readyChecked} class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded">
                            <span class="${inv.is_ready ? 'text-indigo-600' : 'text-slate-600'}">Готово</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" onchange="payInvoice(${inv.id}, this.checked)" ${paidChecked} class="w-4 h-4 text-emerald-600 focus:ring-emerald-500 rounded">
                            <span class="${inv.is_paid ? 'text-emerald-600' : 'text-slate-600'}">Оплачено</span>
                        </label>
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
    const target = document.getElementById(`page-${pageId}`);
    if (target) target.classList.remove('hidden-page');
    if(pageId === 'projects') loadProjectsDashboard();
    if(pageId === 'reports') loadReports();
    if(pageId === 'schedule') loadSchedule();
}

function handleDynamicBack() {
    const scheduleSection = document.getElementById('page-schedule');
    if (scheduleSection && !scheduleSection.classList.contains('hidden-page')) {
        navigate('projects');
        return;
    }
    const reportsSection = document.getElementById('page-reports');
    if (reportsSection && !reportsSection.classList.contains('hidden-page')) {
        navigate('projects');
        return;
    }
    const subTabs = ['tab-info', 'tab-checklist', 'tab-modules', 'tab-invoices', 'tab-media', 'tab-hardware'];
    const isSubTabOpen = subTabs.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden-page');
    });

    if (isSubTabOpen) {
        openTab('main');
    } else {
        navigate('projects');
    }
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


// --- Client Edit & Payment Logic ---
let currentPaymentTypeMode = 'amount';

function setPaymentType(type) {
    currentPaymentTypeMode = type;
    const btnAmount = document.getElementById('pay-type-amount-btn');
    const btnPercent = document.getElementById('pay-type-percent-btn');
    const blockAmount = document.getElementById('pay-amount-block');
    const blockPercent = document.getElementById('pay-percent-block');
    
    if (type === 'percent') {
        if (btnPercent) btnPercent.className = "py-2 text-xs font-bold rounded-xl border border-indigo-600 bg-indigo-600 text-white transition";
        if (btnAmount) btnAmount.className = "py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition";
        if (blockPercent) blockPercent.classList.remove('hidden');
        if (blockAmount) blockAmount.classList.add('hidden');
    } else {
        if (btnAmount) btnAmount.className = "py-2 text-xs font-bold rounded-xl border border-indigo-600 bg-indigo-600 text-white transition";
        if (btnPercent) btnPercent.className = "py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition";
        if (blockAmount) blockAmount.classList.remove('hidden');
        if (blockPercent) blockPercent.classList.add('hidden');
    }
}

function handleAdvanceAmountInput() {
    const sales = state.currentProject ? (state.currentProject.sales_value || 0) : 0;
    const val = parseFloat(document.getElementById('ce-advance').value) || 0;
    const hint = document.getElementById('ce-advance-hint');
    if (hint) {
        if (sales > 0 && val > 0) {
            const pct = ((val / sales) * 100).toFixed(1);
            const rem = Math.max(0, sales - val);
            hint.textContent = `Це ${pct}% від загальної вартості (${sales.toLocaleString('uk-UA')} грн). Залишок: ${rem.toLocaleString('uk-UA')} грн`;
        } else {
            hint.textContent = '';
        }
    }
}

function handleAdvancePercentInput() {
    const sales = state.currentProject ? (state.currentProject.sales_value || 0) : 0;
    const pct = parseFloat(document.getElementById('ce-percent').value) || 0;
    const hint = document.getElementById('ce-percent-hint');
    if (hint) {
        if (sales > 0 && pct >= 0) {
            const calcAdvance = Math.round((sales * pct) / 100);
            const rem = Math.max(0, sales - calcAdvance);
            hint.textContent = `Сума авансу: ${calcAdvance.toLocaleString('uk-UA')} грн (Залишок: ${rem.toLocaleString('uk-UA')} грн з ${sales.toLocaleString('uk-UA')} грн)`;
        } else if (sales === 0) {
            hint.textContent = `Вкажіть продажну вартість об'єкта для точного розрахунку`;
        } else {
            hint.textContent = '';
        }
    }
}

function openClientEditModal() {
    if(!state.currentProject) return;
    document.getElementById('ce-name').value = state.currentProject.client_name || '';
    document.getElementById('ce-phone').value = state.currentProject.client_phone || '';
    document.getElementById('ce-address').value = state.currentProject.location_address || '';
    document.getElementById('ce-description').value = state.currentProject.description || '';
    
    const payType = state.currentProject.payment_type || 'amount';
    const adv = state.currentProject.advance_payment || 0;
    const advPct = state.currentProject.advance_percent || 0;
    
    document.getElementById('ce-advance').value = adv || '';
    document.getElementById('ce-percent').value = advPct || '';
    
    setPaymentType(payType);
    if (payType === 'percent') {
        handleAdvancePercentInput();
    } else {
        handleAdvanceAmountInput();
    }
    
    openModal('client-edit-modal');
}

async function saveClientEdit() {
    if(!state.currentProject) return;
    
    const sales = state.currentProject.sales_value || 0;
    let advancePayment = 0;
    let advancePercent = 0;
    
    if (currentPaymentTypeMode === 'percent') {
        advancePercent = parseFloat(document.getElementById('ce-percent').value) || 0;
        advancePayment = sales > 0 ? Math.round((sales * advancePercent) / 100) : 0;
    } else {
        advancePayment = parseFloat(document.getElementById('ce-advance').value) || 0;
        advancePercent = sales > 0 ? Math.round(((advancePayment / sales) * 100) * 10) / 10 : 0;
    }
    
    const data = {
        user_id: state.currentUser ? state.currentUser.id : null,
        client_name: document.getElementById('ce-name').value,
        client_phone: document.getElementById('ce-phone').value,
        location_address: document.getElementById('ce-address').value,
        description: document.getElementById('ce-description').value,
        payment_type: currentPaymentTypeMode,
        advance_payment: advancePayment,
        advance_percent: advancePercent
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
    
    let drawingPath = null;
    const fileInput = document.getElementById('mod-file');
    if (fileInput && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const uploadRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/upload`, {
            method: 'POST',
            body: formData
        });
        if (uploadRes.ok) {
            const upData = await uploadRes.json();
            drawingPath = `/uploads/${upData.filename}`;
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
        salary_calculated: salary,
        drawing_path: drawingPath
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
    if (fileInput) fileInput.value = '';
    
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
    const hoursInput = prompt("Скільки годин витрачено на збірку цього модуля?", "0");
    if (hoursInput === null) return; // User cancelled
    const hours = parseFloat(hoursInput) || 0;
    
    await fetch(`${API_URL}/modules/${moduleId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: 'Зібрано', hours: hours })
    });
    openProject(state.currentProject.id);
}

// --- Invoice Logic ---
async function saveInvoice() {
    if(!state.currentProject || !state.currentUser) return;
    const fileInput = document.getElementById('inv-file');
    let filePath = fileInput.dataset.uploadedPath || null;

    if (!filePath && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const uploadRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/upload`, {
            method: 'POST',
            body: formData
        });
        if (uploadRes.ok) {
            const upData = await uploadRes.json();
            filePath = `/uploads/${upData.filename}`;
        }
    }

    const data = {
        invoice_number: document.getElementById('inv-number').value,
        category: document.getElementById('inv-category').value,
        branch: document.getElementById('inv-branch').value,
        amount_due: parseFloat(document.getElementById('inv-amount').value) || 0,
        assignee_id: state.currentUser.id,
        file_path: filePath
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
    document.getElementById('inv-file').value = '';
    delete fileInput.dataset.uploadedPath;
    
    openProject(state.currentProject.id);
}

async function payInvoice(invoiceId, isPaid) {
    if(!state.currentUser) return;
    
    await fetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ is_paid: isPaid, status: isPaid ? 'Оплачено' : 'Не оплачено' })
    });
    openProject(state.currentProject.id);
}

async function toggleReadyInvoice(invoiceId, isReady) {
    if(!state.currentUser) return;
    
    await fetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ is_ready: isReady })
    });
    openProject(state.currentProject.id);
}

async function deleteInvoice(invoiceId) {
    if(!confirm("Видалити рахунок?")) return;
    await fetch(`${API_URL}/invoices/${invoiceId}`, { method: 'DELETE' });
    openProject(state.currentProject.id);
}

async function deleteModule(moduleId) {
    if(!confirm("Видалити модуль?")) return;
    await fetch(`${API_URL}/modules/${moduleId}`, { method: 'DELETE' });
    openProject(state.currentProject.id);
}

function editModule(m) {
    document.getElementById('edit-mod-id').value = m.id;
    document.getElementById('edit-mod-name').value = m.name;
    document.getElementById('edit-mod-width').value = m.width;
    document.getElementById('edit-mod-height').value = m.height;
    document.getElementById('edit-mod-depth').value = m.depth;
    document.getElementById('edit-mod-joints').value = m.joints_count;
    
    const prevEl = document.getElementById('edit-mod-file-preview');
    const fileInput = document.getElementById('edit-mod-file');
    if (fileInput) fileInput.value = '';
    
    if (prevEl) {
        if (m.drawing_path) {
            prevEl.innerHTML = `<a href="${m.drawing_path}" target="_blank" class="underline hover:text-indigo-800"><i class="fa-solid fa-file-lines"></i> Поточне креслення</a>`;
            prevEl.classList.remove('hidden');
        } else {
            prevEl.innerHTML = '';
            prevEl.classList.add('hidden');
        }
    }
    openModal('edit-module-modal');
}

async function submitEditModule() {
    const id = document.getElementById('edit-mod-id').value;
    const name = document.getElementById('edit-mod-name').value;
    const width = parseFloat(document.getElementById('edit-mod-width').value) || 0;
    const height = parseFloat(document.getElementById('edit-mod-height').value) || 0;
    const depth = parseFloat(document.getElementById('edit-mod-depth').value) || 0;
    const joints = parseInt(document.getElementById('edit-mod-joints').value) || 0;

    let drawingPath = undefined;
    const fileInput = document.getElementById('edit-mod-file');
    if (fileInput && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const uploadRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/upload`, {
            method: 'POST',
            body: formData
        });
        if (uploadRes.ok) {
            const upData = await uploadRes.json();
            drawingPath = `/uploads/${upData.filename}`;
        }
    }

    const payload = {
        name: name, width: width, height: height, depth: depth, joints_count: joints
    };
    if (drawingPath !== undefined) {
        payload.drawing_path = drawingPath;
    }

    await fetch(`${API_URL}/modules/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    
    closeModal('edit-module-modal');
    openProject(state.currentProject.id);
}

function editInvoice(inv) {
    document.getElementById('edit-inv-id').value = inv.id;
    document.getElementById('edit-inv-number').value = inv.invoice_number;
    document.getElementById('edit-inv-category').value = inv.category;
    document.getElementById('edit-inv-branch').value = inv.branch;
    document.getElementById('edit-inv-amount').value = inv.amount_due;
    openModal('edit-invoice-modal');
}

async function submitEditInvoice() {
    const id = document.getElementById('edit-inv-id').value;
    const number = document.getElementById('edit-inv-number').value;
    const category = document.getElementById('edit-inv-category').value;
    const branch = document.getElementById('edit-inv-branch').value;
    const amount = parseFloat(document.getElementById('edit-inv-amount').value) || 0;

    await fetch(`${API_URL}/invoices/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            invoice_number: number, category: category, branch: branch, amount_due: amount
        })
    });
    
    closeModal('edit-invoice-modal');
    openProject(state.currentProject.id);
}

// --- Cabinet Logic ---
async function openCabinet() {
    if(!state.currentUser) return;
    openModal('cabinet-modal');
    
    const res = await fetch(`${API_URL}/users/${state.currentUser.id}/stats`);
    if(res.ok) {
        const stats = await res.json();
        document.getElementById('cab-earnings').textContent = `${stats.earnings.toFixed(0)} грн`;
        document.getElementById('cab-expenses').textContent = `${stats.expenses.toFixed(0)} грн`;
    }
    
    // Fill active tasks
    const tasksContainer = document.getElementById('cab-tasks');
    tasksContainer.innerHTML = '<p class="text-sm text-slate-400 italic text-center py-2">Завантаження задач...</p>';
    
    const tasksRes = await fetch(`${API_URL}/users/${state.currentUser.id}/tasks`);
    if(tasksRes.ok) {
        const tasks = await tasksRes.json();
        tasksContainer.innerHTML = '';
        if(tasks.length === 0) {
            tasksContainer.innerHTML = '<p class="text-sm text-slate-500 italic text-center py-2">Немає активних задач</p>';
        } else {
            tasks.forEach(t => {
                let badge = '<span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">В роботі</span>';
                let extra = '';
                if (t.task_type && t.task_type !== 'Модуль') {
                    let icon = t.task_type === 'Монтаж' ? '🚚' : (t.task_type === 'Збірка' ? '🛠️' : '📐');
                    badge = `<span class="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded">${icon} ${t.task_type}</span>`;
                    if (t.event_date) {
                        extra = `<p class="text-[11px] text-indigo-600 font-semibold mt-0.5"><i class="fa-regular fa-calendar mr-1"></i>${t.event_date} ${t.event_time || ''}</p>`;
                    }
                }
                tasksContainer.innerHTML += `
                <div class="bg-white border border-slate-200 rounded-xl p-3 flex justify-between items-center shadow-xs">
                    <div>
                        <p class="font-bold text-sm text-slate-800">${escapeHtml(t.name)}</p>
                        <p class="text-xs text-slate-500">${escapeHtml(t.project_name)}</p>
                        ${extra}
                    </div>
                    ${badge}
                </div>`;
            });
        }
    } else {
        tasksContainer.innerHTML = '<p class="text-sm text-rose-500 italic">Помилка завантаження</p>';
    }
}

async function changePassword() {
    if(!state.currentUser) return;
    const oldPw = document.getElementById('cab-old-pw').value;
    const newPw = document.getElementById('cab-new-pw').value;
    
    if(!oldPw || !newPw) return alert('Заповніть всі поля!');
    
    const res = await fetch(`${API_URL}/users/${state.currentUser.id}/change_password`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({old_password: oldPw, new_password: newPw})
    });
    
    if(res.ok) {
        alert("Пароль успішно змінено!");
        document.getElementById('cab-old-pw').value = '';
        document.getElementById('cab-new-pw').value = '';
        closeModal('cabinet-modal');
    } else {
        alert("Помилка! Можливо, старий пароль вказано невірно.");
    }
}

// ==========================================
// --- Module Comments Logic ---
// ==========================================
let activeCommentsModuleId = null;

async function openModuleComments(moduleId, moduleName) {
    activeCommentsModuleId = moduleId;
    document.getElementById('mc-modal-module-id').value = moduleId;
    document.getElementById('mc-module-title').textContent = moduleName || 'Модуль';
    document.getElementById('mc-new-comment-input').value = '';
    document.getElementById('mc-comments-list').innerHTML = '<p class="text-xs text-slate-400 text-center py-4"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Завантаження коментарів...</p>';
    openModal('module-comments-modal');
    await fetchModuleComments(moduleId);
    setTimeout(() => {
        const input = document.getElementById('mc-new-comment-input');
        if (input) input.focus();
    }, 100);
}

async function fetchModuleComments(moduleId) {
    try {
        const res = await fetch(`${API_URL}/modules/${moduleId}/comments`);
        if (!res.ok) throw new Error('Помилка завантаження');
        const comments = await res.json();
        renderModuleComments(comments);
    } catch (err) {
        console.error('Comments fetch error:', err);
        document.getElementById('mc-comments-list').innerHTML = '<p class="text-xs text-rose-500 text-center py-4">Не вдалося завантажити коментарі</p>';
    }
}

function renderModuleComments(comments) {
    const list = document.getElementById('mc-comments-list');
    if (!comments || comments.length === 0) {
        list.innerHTML = `
            <div class="text-center py-6 text-slate-400 text-xs">
                <i class="fa-regular fa-comments text-2xl mb-2 text-slate-300"></i>
                <p class="font-medium text-slate-500">Ще немає коментарів або заміток</p>
                <p class="text-slate-400 mt-0.5">Вкажіть особливості збірки, деталі чи зауваження.</p>
            </div>`;
        return;
    }
    
    let html = '';
    comments.forEach(c => {
        const isMe = state.currentUser && state.currentUser.id === c.user_id;
        const timeStr = c.created_at ? new Date(c.created_at).toLocaleString('uk-UA', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '';
        
        html += `
        <div class="p-2.5 rounded-xl border ${isMe ? 'bg-indigo-50/80 border-indigo-200 ml-4' : 'bg-white border-slate-200 mr-4'} shadow-xs">
            <div class="flex justify-between items-center mb-1">
                <span class="text-xs font-bold ${isMe ? 'text-indigo-700' : 'text-slate-700'}">${escapeHtml(c.user_name || 'Співробітник')}</span>
                <span class="text-[10px] text-slate-400">${timeStr}</span>
            </div>
            <p class="text-xs text-slate-800 whitespace-pre-line leading-relaxed">${escapeHtml(c.text)}</p>
        </div>`;
    });
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;
}

async function submitModuleComment() {
    const input = document.getElementById('mc-new-comment-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    if (!state.currentUser) {
        alert('Будь ласка, авторизуйтесь (оберіть користувача у верхньому правому кутку) для додавання коментарів!');
        return;
    }
    const moduleId = activeCommentsModuleId || document.getElementById('mc-modal-module-id').value;
    if (!moduleId) return;
    
    input.disabled = true;
    try {
        const res = await fetch(`${API_URL}/modules/${moduleId}/comments`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: state.currentUser.id,
                text: text
            })
        });
        if (res.ok) {
            input.value = '';
            await fetchModuleComments(moduleId);
            // If viewing a project, update module count
            if (state.currentProject) {
                const pData = await fetchProjectDetails(state.currentProject.id);
                state.currentProject = pData;
                renderProjectDetails(pData);
            }
        } else {
            alert('Помилка додавання коментаря');
        }
    } catch (e) {
        console.error('Comment save error:', e);
        alert('Не вдалося зберегти коментар');
    } finally {
        input.disabled = false;
        input.focus();
    }
}

// ==========================================
// --- Schedule / Calendar Logic ---
// ==========================================
let calendarState = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(), // 0-11
    selectedDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    filterType: 'Всі',
    events: []
};

function setScheduleFilter(type) {
    calendarState.filterType = type;
    document.querySelectorAll('.sched-filter-btn').forEach(btn => {
        if (btn.dataset.type === type) {
            btn.className = "sched-filter-btn px-3 py-1.5 rounded-lg transition bg-white text-indigo-600 shadow-xs font-bold";
        } else {
            btn.className = "sched-filter-btn px-3 py-1.5 rounded-lg transition text-slate-600 hover:text-indigo-600";
        }
    });
    renderCalendar();
    renderDayEvents(calendarState.selectedDate);
}

function changeCalendarMonth(delta) {
    calendarState.currentMonth += delta;
    if (calendarState.currentMonth > 11) {
        calendarState.currentMonth = 0;
        calendarState.currentYear += 1;
    } else if (calendarState.currentMonth < 0) {
        calendarState.currentMonth = 11;
        calendarState.currentYear -= 1;
    }
    loadSchedule();
}

function goToTodayCalendar() {
    const now = new Date();
    calendarState.currentYear = now.getFullYear();
    calendarState.currentMonth = now.getMonth();
    calendarState.selectedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    loadSchedule();
}

async function loadSchedule() {
    const monthPad = String(calendarState.currentMonth + 1).padStart(2, '0');
    const monthStr = `${calendarState.currentYear}-${monthPad}`;
    
    const monthNames = [
        'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
        'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ];
    const titleEl = document.getElementById('cal-month-title');
    if (titleEl) titleEl.textContent = `${monthNames[calendarState.currentMonth]} ${calendarState.currentYear}`;
    
    try {
        const res = await fetch(`${API_URL}/schedules?month=${monthStr}`);
        if (res.ok) {
            calendarState.events = await res.json();
        } else {
            calendarState.events = [];
        }
    } catch (e) {
        console.error('Failed to load schedule:', e);
        calendarState.events = [];
    }
    
    renderCalendar();
    renderDayEvents(calendarState.selectedDate);
}

function renderCalendar() {
    const grid = document.getElementById('cal-days-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const year = calendarState.currentYear;
    const month = calendarState.currentMonth;
    
    // First day of month (0 = Sun, 1 = Mon ... 6 = Sat)
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Monday as index 0:
    const startOffset = (firstDayIndex + 6) % 7;
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 1. Previous month trailing days
    for (let i = startOffset - 1; i >= 0; i--) {
        const dayNum = daysInPrevMonth - i;
        const cell = document.createElement('div');
        cell.className = "min-h-[70px] sm:min-h-[85px] p-1 sm:p-1.5 rounded-xl border border-slate-100 bg-slate-50/50 opacity-40 text-slate-400 text-xs";
        cell.innerHTML = `<span class="font-medium">${dayNum}</span>`;
        grid.appendChild(cell);
    }
    
    // 2. Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dayPad = String(d).padStart(2, '0');
        const monthPad = String(month + 1).padStart(2, '0');
        const dateStr = `${year}-${monthPad}-${dayPad}`;
        
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === calendarState.selectedDate;
        
        // Filter events for this day
        const dayEvents = calendarState.events.filter(e => {
            if (e.event_date !== dateStr) return false;
            if (calendarState.filterType !== 'Всі' && e.event_type !== calendarState.filterType) return false;
            return true;
        });
        
        const cell = document.createElement('div');
        let borderClass = isSelected ? "border-2 border-indigo-600 shadow-sm ring-2 ring-indigo-200" : "border border-slate-200 hover:border-indigo-300";
        let bgClass = isSelected ? "bg-indigo-50/40" : (isToday ? "bg-amber-50/30" : "bg-white");
        
        cell.className = `min-h-[70px] sm:min-h-[85px] p-1 sm:p-1.5 rounded-xl ${borderClass} ${bgClass} cursor-pointer transition flex flex-col justify-between`;
        cell.onclick = () => selectCalendarDate(dateStr);
        
        // Day number header
        let dayNumHtml = `<span class="text-xs font-bold text-slate-700">${d}</span>`;
        if (isToday) {
            dayNumHtml = `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">${d}</span>`;
        }
        
        // Mini event badges (up to 2 visible)
        let badgesHtml = '';
        const maxBadges = 2;
        const visibleEvents = dayEvents.slice(0, maxBadges);
        const remainingCount = dayEvents.length - maxBadges;
        
        visibleEvents.forEach(e => {
            let colorCls = "bg-blue-100 text-blue-800 border-blue-200";
            let icon = "🚚";
            if (e.event_type === 'Збірка') {
                colorCls = "bg-amber-100 text-amber-800 border-amber-200";
                icon = "🛠️";
            } else if (e.event_type === 'Замір') {
                colorCls = "bg-purple-100 text-purple-800 border-purple-200";
                icon = "📐";
            }
            
            if (e.status === 'Виконано') {
                colorCls = "bg-emerald-100 text-emerald-800 border-emerald-200 line-through opacity-75";
            }
            
            const shortTitle = e.title.length > 12 ? e.title.substring(0, 10) + '..' : e.title;
            badgesHtml += `
            <div class="text-[9px] sm:text-[10px] font-semibold px-1 py-0.5 rounded border ${colorCls} truncate leading-tight mb-0.5" title="${escapeHtml(e.title)} (${e.event_time || ''})">
                <span>${icon} ${escapeHtml(shortTitle)}</span>
            </div>`;
        });
        
        if (remainingCount > 0) {
            badgesHtml += `<div class="text-[9px] font-bold text-slate-400 pl-0.5">+${remainingCount} ще</div>`;
        }
        
        cell.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                ${dayNumHtml}
                ${dayEvents.length > 0 ? `<span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>` : ''}
            </div>
            <div class="flex-1 flex flex-col justify-start overflow-hidden">
                ${badgesHtml}
            </div>
        `;
        
        grid.appendChild(cell);
    }
    
    // 3. Next month leading days to complete grid rows
    const totalCells = startOffset + daysInMonth;
    const remainingCells = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainingCells; i++) {
        const cell = document.createElement('div');
        cell.className = "min-h-[70px] sm:min-h-[85px] p-1 sm:p-1.5 rounded-xl border border-slate-100 bg-slate-50/50 opacity-40 text-slate-400 text-xs";
        cell.innerHTML = `<span class="font-medium">${i}</span>`;
        grid.appendChild(cell);
    }
}

function selectCalendarDate(dateStr) {
    calendarState.selectedDate = dateStr;
    renderCalendar();
    renderDayEvents(dateStr);
}

function renderDayEvents(dateStr) {
    const titleEl = document.getElementById('cal-selected-day-title');
    const container = document.getElementById('cal-selected-day-tasks');
    if (!titleEl || !container) return;
    
    const dateObj = new Date(dateStr + 'T00:00:00');
    const daysOfWeek = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'];
    const dayName = daysOfWeek[dateObj.getDay()];
    const dateFormatted = dateObj.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    
    titleEl.textContent = `Завдання на ${dateFormatted} (${dayName})`;
    
    const dayEvents = calendarState.events.filter(e => {
        if (e.event_date !== dateStr) return false;
        if (calendarState.filterType !== 'Всі' && e.event_type !== calendarState.filterType) return false;
        return true;
    });
    
    if (dayEvents.length === 0) {
        container.innerHTML = `
        <div class="text-center py-8 text-slate-400">
            <i class="fa-regular fa-calendar-check text-3xl mb-2 text-slate-300"></i>
            <p class="text-sm font-medium text-slate-600">На цей день нічого не заплановано</p>
            <p class="text-xs text-slate-400 mt-1">Ви можете призначити монтаж, збірку чи виїзд на замір.</p>
            <button onclick="openScheduleModal(null, '${dateStr}')" class="mt-3 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition">
                + Запланувати завдання на ${dateFormatted}
            </button>
        </div>`;
        return;
    }
    
    let html = '';
    dayEvents.forEach(e => {
        let typeBadge = '';
        if (e.event_type === 'Монтаж') {
            typeBadge = `<span class="text-xs font-bold px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg"><i class="fa-solid fa-truck mr-1"></i> Монтаж</span>`;
        } else if (e.event_type === 'Збірка') {
            typeBadge = `<span class="text-xs font-bold px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg"><i class="fa-solid fa-wrench mr-1"></i> Збірка</span>`;
        } else {
            typeBadge = `<span class="text-xs font-bold px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg"><i class="fa-solid fa-ruler mr-1"></i> Замір</span>`;
        }
        
        let statusBadge = '';
        if (e.status === 'Виконано') {
            statusBadge = `<span class="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg"><i class="fa-solid fa-check mr-1"></i> Виконано</span>`;
        } else if (e.status === 'В процесі') {
            statusBadge = `<span class="text-xs font-bold px-2.5 py-1 bg-sky-100 text-sky-700 rounded-lg"><i class="fa-solid fa-spinner fa-spin mr-1"></i> В процесі</span>`;
        } else if (e.status === 'Перенесено') {
            statusBadge = `<span class="text-xs font-bold px-2.5 py-1 bg-rose-100 text-rose-700 rounded-lg"><i class="fa-solid fa-clock-rotate-left mr-1"></i> Перенесено</span>`;
        } else {
            statusBadge = `<span class="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg"><i class="fa-regular fa-clock mr-1"></i> Заплановано</span>`;
        }
        
        const timeHtml = e.event_time ? `<span class="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg"><i class="fa-regular fa-clock mr-1"></i> ${escapeHtml(e.event_time)}</span>` : '';
        
        const projectLink = e.project_id ? `
            <button onclick="openProject(${e.project_id})" class="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 mt-1">
                <i class="fa-solid fa-folder-open"></i> Об'єкт: ${escapeHtml(e.project_name || 'Відкрити')}
            </button>
        ` : '';
        
        const addressHtml = e.address ? `
            <div class="text-xs text-slate-600 flex items-start gap-1.5 mt-1.5">
                <i class="fa-solid fa-map-location-dot text-indigo-500 mt-0.5"></i>
                <a href="https://maps.google.com/?q=${encodeURIComponent(e.address)}" target="_blank" class="hover:text-indigo-600 hover:underline">
                    ${escapeHtml(e.address)}
                </a>
            </div>
        ` : '';
        
        const clientHtml = (e.client_name || e.client_phone) ? `
            <div class="text-xs text-slate-600 flex items-center gap-3 mt-1.5 flex-wrap">
                ${e.client_name ? `<span><i class="fa-solid fa-user text-slate-400 mr-1"></i>${escapeHtml(e.client_name)}</span>` : ''}
                ${e.client_phone ? `<a href="tel:${e.client_phone}" class="text-indigo-600 hover:underline"><i class="fa-solid fa-phone text-slate-400 mr-1"></i>${escapeHtml(e.client_phone)}</a>` : ''}
            </div>
        ` : '';
        
        const assigneeHtml = e.assignee_name ? `
            <div class="text-xs text-slate-600 mt-1.5">
                <span class="text-slate-400">Відповідальний:</span> <span class="font-semibold text-slate-700">${escapeHtml(e.assignee_name)}</span>
            </div>
        ` : '';
        
        const notesHtml = e.notes ? `
            <div class="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-700 whitespace-pre-line">
                <span class="font-bold text-slate-500 block mb-0.5"><i class="fa-solid fa-clipboard-list mr-1"></i> Нотатки / Деталі:</span>
                ${escapeHtml(e.notes)}
            </div>
        ` : '';
        
        const isDone = e.status === 'Виконано';
        const toggleStatusBtn = `
            <button onclick="toggleScheduleDone(${e.id}, '${e.status}')" class="text-xs font-semibold px-3 py-1.5 rounded-lg transition ${isDone ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}">
                <i class="fa-solid ${isDone ? 'fa-rotate-left' : 'fa-check'} mr-1"></i> ${isDone ? 'Повернути в роботу' : 'Позначити виконаним'}
            </button>
        `;
        
        const editEventData = JSON.stringify(e).replace(/'/g, "&#39;");
        
        html += `
        <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-indigo-200 transition">
            <div class="flex justify-between items-start flex-wrap gap-2 mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    ${typeBadge}
                    ${timeHtml}
                    ${statusBadge}
                </div>
                <div class="flex items-center gap-1">
                    <button onclick='openScheduleModal(${editEventData})' class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition" title="Редагувати">
                        <i class="fa-solid fa-pen text-xs"></i>
                    </button>
                    <button onclick="deleteScheduleEventDirect(${e.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-50 transition" title="Видалити">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </div>
            
            <h4 class="font-bold text-slate-800 text-base mb-1">${escapeHtml(e.title)}</h4>
            ${projectLink}
            ${addressHtml}
            ${clientHtml}
            ${assigneeHtml}
            ${notesHtml}
            
            <div class="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center">
                ${toggleStatusBtn}
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

// Schedule Modal Handling
function setScheduleModalType(type) {
    document.getElementById('sch-type').value = type;
    document.querySelectorAll('.sch-type-select-btn').forEach(btn => {
        if (btn.dataset.val === type) {
            btn.className = "sch-type-select-btn py-2 text-xs font-bold rounded-xl border border-indigo-600 bg-indigo-600 text-white transition";
        } else {
            btn.className = "sch-type-select-btn py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition";
        }
    });
}

async function openScheduleModal(eventData = null, defaultDate = null) {
    if (!state.projects || state.projects.length === 0) {
        await fetchProjects();
    }
    const projSelect = document.getElementById('sch-project');
    projSelect.innerHTML = '<option value="">-- Без прив\'язки (індивідуальний замір/робота) --</option>';
    state.projects.forEach(p => {
        projSelect.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
    });
    
    const assigneeSelect = document.getElementById('sch-assignee');
    assigneeSelect.innerHTML = '<option value="">-- Оберіть майстра --</option>';
    state.users.forEach(u => {
        assigneeSelect.innerHTML += `<option value="${u.id}">${escapeHtml(u.name)} (${u.role})</option>`;
    });
    
    const deleteBtn = document.getElementById('sch-delete-btn');
    
    if (eventData) {
        document.getElementById('sch-modal-title').textContent = 'Редагувати подію';
        document.getElementById('sch-id').value = eventData.id;
        setScheduleModalType(eventData.event_type || 'Монтаж');
        projSelect.value = eventData.project_id || '';
        document.getElementById('sch-title').value = eventData.title || '';
        document.getElementById('sch-date').value = eventData.event_date || '';
        document.getElementById('sch-time').value = eventData.event_time || '';
        document.getElementById('sch-address').value = eventData.address || '';
        document.getElementById('sch-client-name').value = eventData.client_name || '';
        document.getElementById('sch-client-phone').value = eventData.client_phone || '';
        assigneeSelect.value = eventData.assignee_id || '';
        document.getElementById('sch-status').value = eventData.status || 'Заплановано';
        document.getElementById('sch-notes').value = eventData.notes || '';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
    } else {
        document.getElementById('sch-modal-title').textContent = 'Запланувати подію';
        document.getElementById('sch-id').value = '';
        setScheduleModalType('Монтаж');
        document.getElementById('sch-title').value = '';
        document.getElementById('sch-date').value = defaultDate || calendarState.selectedDate || new Date().toISOString().split('T')[0];
        document.getElementById('sch-time').value = '10:00';
        document.getElementById('sch-address').value = '';
        document.getElementById('sch-client-name').value = '';
        document.getElementById('sch-client-phone').value = '';
        assigneeSelect.value = state.currentUser ? state.currentUser.id : '';
        document.getElementById('sch-status').value = 'Заплановано';
        document.getElementById('sch-notes').value = '';
        
        if (state.currentProject) {
            projSelect.value = state.currentProject.id;
            handleScheduleProjectChange();
        } else {
            projSelect.value = '';
        }
        
        if (deleteBtn) deleteBtn.classList.add('hidden');
    }
    
    openModal('schedule-modal');
}

function handleScheduleProjectChange() {
    const pId = document.getElementById('sch-project').value;
    if (!pId) return;
    const proj = state.projects.find(p => p.id == pId) || (state.currentProject && state.currentProject.id == pId ? state.currentProject : null);
    if (!proj) return;
    
    if (proj.location_address && !document.getElementById('sch-address').value) {
        document.getElementById('sch-address').value = proj.location_address;
    }
    if (proj.client_name && !document.getElementById('sch-client-name').value) {
        document.getElementById('sch-client-name').value = proj.client_name;
    }
    if (proj.client_phone && !document.getElementById('sch-client-phone').value) {
        document.getElementById('sch-client-phone').value = proj.client_phone;
    }
    const curTitle = document.getElementById('sch-title').value;
    if (!curTitle || curTitle.startsWith('Монтаж') || curTitle.startsWith('Збірка') || curTitle.startsWith('Замір')) {
        const curType = document.getElementById('sch-type').value;
        document.getElementById('sch-title').value = `${curType}: ${proj.name}`;
    }
}

async function saveScheduleEvent() {
    const id = document.getElementById('sch-id').value;
    const eventType = document.getElementById('sch-type').value;
    const title = document.getElementById('sch-title').value.trim();
    const eventDate = document.getElementById('sch-date').value;
    const eventTime = document.getElementById('sch-time').value;
    const projectId = document.getElementById('sch-project').value ? parseInt(document.getElementById('sch-project').value) : null;
    const address = document.getElementById('sch-address').value.trim();
    const clientName = document.getElementById('sch-client-name').value.trim();
    const clientPhone = document.getElementById('sch-client-phone').value.trim();
    const assigneeId = document.getElementById('sch-assignee').value ? parseInt(document.getElementById('sch-assignee').value) : null;
    const status = document.getElementById('sch-status').value;
    const notes = document.getElementById('sch-notes').value.trim();
    
    if (!title) return alert('Вкажіть назву події!');
    if (!eventDate) return alert('Оберіть дату події!');
    
    const payload = {
        project_id: projectId,
        event_type: eventType,
        title: title,
        event_date: eventDate,
        event_time: eventTime,
        address: address,
        client_name: clientName,
        client_phone: clientPhone,
        assignee_id: assigneeId,
        status: status,
        notes: notes
    };
    
    try {
        let res;
        if (id) {
            res = await fetch(`${API_URL}/schedules/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_URL}/schedules`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        }
        
        if (res.ok) {
            closeModal('schedule-modal');
            calendarState.selectedDate = eventDate;
            await loadSchedule();
        } else {
            alert('Помилка збереження події');
        }
    } catch (e) {
        console.error('Schedule save error:', e);
        alert('Не вдалося зберегти подію');
    }
}

async function deleteScheduleEvent() {
    const id = document.getElementById('sch-id').value;
    if (!id) return;
    if (!confirm('Видалити цю подію з графіку?')) return;
    
    try {
        const res = await fetch(`${API_URL}/schedules/${id}`, { method: 'DELETE' });
        if (res.ok) {
            closeModal('schedule-modal');
            await loadSchedule();
        } else {
            alert('Помилка видалення');
        }
    } catch (e) {
        console.error('Schedule delete error:', e);
    }
}

async function deleteScheduleEventDirect(id) {
    if (!confirm('Ви дійсно хочете видалити це завдання з графіку?')) return;
    try {
        const res = await fetch(`${API_URL}/schedules/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadSchedule();
        } else {
            alert('Помилка видалення');
        }
    } catch (e) {
        console.error('Schedule delete error:', e);
    }
}

async function toggleScheduleDone(id, currentStatus) {
    const newStatus = (currentStatus === 'Виконано') ? 'Заплановано' : 'Виконано';
    try {
        const res = await fetch(`${API_URL}/schedules/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            await loadSchedule();
        }
    } catch (e) {
        console.error('Toggle status error:', e);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
