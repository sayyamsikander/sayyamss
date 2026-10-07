const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

let currentAdmin = null;
let contacts = [];
let users = [];
let settings = null;
let csvText = '';
let csvMapping = {};
let searchTimer = null;

async function api(url, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  const type = res.headers.get('content-type') || '';
  let data = {};
  if (type.includes('application/json')) {
    try { data = await res.json(); } catch {}
  } else {
    data = { text: await res.text() };
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function setView(name) {
  const titles = { dashboard: 'Dashboard', contacts: 'Contacts', import: 'Import CSV', users: 'Users', payments: 'Payments', settings: 'Settings' };
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('#viewTitle').textContent = titles[name] || 'Admin';
  $('.sidebar').classList.remove('open');
  if (name === 'contacts') loadContacts();
  if (name === 'users') loadUsers();
  if (name === 'payments') loadPayments();
  if (name === 'settings') loadSettings();
}

async function ensureAccess() {
  let me;
  try {
    me = await api('/api/me');
  } catch (err) {
    $('#adminPerson').innerHTML = `<strong>Connection failed</strong><small>${esc(err.message)}</small>`;
    toast(`Admin connection failed: ${err.message}`, 'err');
    return false;
  }
  if (!me.user) {
    location.href = 'admin-login.html';
    return false;
  }
  if (me.user.role !== 'admin') {
    document.body.innerHTML = '<main style="max-width:680px;margin:80px auto;padding:30px;font-family:system-ui"><h1>Administrator access required</h1><p>This account can use the public site but cannot open the admin console.</p><a href="index.html">Return to website</a></main>';
    return false;
  }
  currentAdmin = me.user;
  $('#adminPerson').innerHTML = `<strong>${esc(me.user.name)}</strong><small>${esc(me.user.email)}</small>`;
  $('#envAdmin').textContent = me.user.email;
  return true;
}

async function loadDashboard() {
  const data = await api('/api/admin/stats');
  $('#statContacts').textContent = Number(data.contacts).toLocaleString();
  $('#statUsers').textContent = Number(data.users).toLocaleString();
  $('#statReveals').textContent = Number(data.reveals).toLocaleString();
  $('#statCredits').textContent = Number(data.totalCredits).toLocaleString();
  $('#storageStatus').textContent = `Storage: ${data.storage}`;
  $('#demoWarning').classList.toggle('hidden', !data.demoBilling);
  $('#localStorageWarning').classList.toggle('hidden', data.storage !== 'Local JSON');
  if (data.lastImport) {
    const i = data.lastImport;
    $('#lastImport').innerHTML = `<div class="import-summary"><div><span>Date</span><strong>${esc(new Date(i.at).toLocaleString())}</strong></div><div><span>Mode</span><strong>${esc(i.mode)}</strong></div><div><span>Added</span><strong>${esc(i.added)}</strong></div><div><span>Updated</span><strong>${esc(i.updated)}</strong></div><div><span>Skipped</span><strong>${esc(i.skipped)}</strong></div></div>`;
  } else {
    $('#lastImport').textContent = 'No CSV imports yet.';
  }
}

function contactRowsHtml(list) {
  if (!list.length) return '<tr><td colspan="6" class="loading">No contacts found.</td></tr>';
  return list.map(c => `<tr>
    <td><strong>${esc(c.name)}</strong><small>${esc(c.title || 'No title')} · ${esc(c.location || 'No location')}</small></td>
    <td><strong>${esc(c.company)}</strong><small>${esc(c.domain || '')} · ${esc(c.industry || '')}</small></td>
    <td><div class="contact-stack"><span>${esc(c.email || 'No email')}</span><span>${esc(c.phone || 'No phone')}</span></div></td>
    <td><span class="score">${esc(c.confidence)}%</span></td>
    <td>${esc(c.verified || '')}<small>${esc(c.source || '')}</small></td>
    <td><div class="row-actions"><button class="icon-btn" data-edit-contact="${esc(c.id)}">Edit</button><button class="icon-btn delete" data-delete-contact="${esc(c.id)}">Delete</button></div></td>
  </tr>`).join('');
}

function bindContactActions() {
  $$('[data-edit-contact]').forEach(btn => btn.onclick = () => openContactModal(contacts.find(c => c.id === btn.dataset.editContact)));
  $$('[data-delete-contact]').forEach(btn => btn.onclick = () => deleteContact(btn.dataset.deleteContact));
}

async function loadContacts() {
  const q = $('#contactSearch').value.trim();
  $('#contactAdminRows').innerHTML = '<tr><td colspan="6" class="loading">Loading contacts…</td></tr>';
  try {
    const data = await api(`/api/admin/contacts?q=${encodeURIComponent(q)}`);
    contacts = data.contacts;
    $('#contactAdminRows').innerHTML = contactRowsHtml(contacts);
    bindContactActions();
  } catch (err) { toast(err.message, 'err'); }
}

function openContactModal(contact = null) {
  const c = contact || {};
  $('#contactModalTitle').textContent = contact ? 'Edit contact' : 'Add contact';
  $('#contactId').value = c.id || '';
  $('#cName').value = c.name || '';
  $('#cTitle').value = c.title || '';
  $('#cCompany').value = c.company || '';
  $('#cDomain').value = c.domain || '';
  $('#cIndustry').value = c.industry || '';
  $('#cLocation').value = c.location || '';
  $('#cEmployees').value = c.employees || '';
  $('#cEmail').value = c.email || '';
  $('#cPhone').value = c.phone || '';
  $('#cConfidence').value = c.confidence ?? 90;
  $('#cSource').value = c.source || '';
  $('#cVerified').value = c.verified || new Date().toISOString().slice(0,10);
  $('#contactError').classList.add('hidden');
  $('#contactModal').classList.remove('hidden');
  setTimeout(() => $('#cName').focus(), 30);
}

function closeContactModal() { $('#contactModal').classList.add('hidden'); }

async function saveContact(e) {
  e.preventDefault();
  const id = $('#contactId').value;
  const payload = {
    name: $('#cName').value,
    title: $('#cTitle').value,
    company: $('#cCompany').value,
    domain: $('#cDomain').value,
    industry: $('#cIndustry').value,
    location: $('#cLocation').value,
    employees: $('#cEmployees').value,
    email: $('#cEmail').value,
    phone: $('#cPhone').value,
    confidence: Number($('#cConfidence').value),
    source: $('#cSource').value,
    verified: $('#cVerified').value
  };
  const errEl = $('#contactError'); errEl.classList.add('hidden');
  try {
    if (id) await api(`/api/admin/contacts/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
    else await api('/api/admin/contacts', { method: 'POST', body: payload });
    closeContactModal();
    await Promise.all([loadContacts(), loadDashboard()]);
    toast(id ? 'Contact updated.' : 'Contact added.');
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
  }
}

async function deleteContact(id) {
  const c = contacts.find(x => x.id === id);
  if (!confirm(`Delete ${c?.name || 'this contact'}? Existing reveal history will keep an audit record but the contact value will no longer be available.`)) return;
  try {
    await api(`/api/admin/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await Promise.all([loadContacts(), loadDashboard()]);
    toast('Contact deleted.');
  } catch (err) { toast(err.message, 'err'); }
}

function setCsvFile(file) {
  if (!file) return;
  if (file.size > 5_500_000) { toast('CSV file is too large. Keep it below about 5.5 MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    csvText = String(reader.result || '');
    csvMapping = {};
    $('#fileSummary').classList.remove('hidden');
    $('#fileName').textContent = file.name;
    const rows = Math.max(0, csvText.split(/\r?\n/).filter(Boolean).length - 1);
    $('#fileMeta').textContent = `${(file.size / 1024).toFixed(1)} KB · about ${rows.toLocaleString()} data rows`;
    $('#importBtn').disabled = true;
    $('#importResult').classList.add('hidden');
    await loadCsvPreview();
  };
  reader.onerror = () => toast('Could not read that file.', 'err');
  reader.readAsText(file);
}

async function loadCsvPreview() {
  if (!csvText.trim()) return;
  try {
    const data = await api('/api/admin/import/preview', { method: 'POST', body: { csv: csvText } });
    csvMapping = { ...data.suggestedMapping };
    const labels = {name:'Name',firstName:'First name',lastName:'Last name',title:'Job title',company:'Company',domain:'Domain',industry:'Industry',location:'Location',employees:'Company size',email:'Work email',phone:'Phone',confidence:'Confidence',source:'Source',verified:'Verified date'};
    const options = ['<option value="">Ignore this column</option>', ...Object.entries(labels).map(([value,label]) => `<option value="${value}">${label}</option>`)].join('');
    $('#csvMapping').innerHTML = data.headers.map(header => {
      const sample = data.sample.map(row => row[header] || '').filter(Boolean).slice(0, 2).join(' · ');
      return `<div class="csv-map-row"><div><strong>${esc(header || '(blank)')}</strong><small>${esc(sample || 'No sample value')}</small></div><select data-csv-source="${esc(header)}">${options}</select></div>`;
    }).join('');
    data.headers.forEach(header => { const el = [...document.querySelectorAll('[data-csv-source]')].find(x => x.dataset.csvSource === header); if (el) el.value = csvMapping[header] || ''; });
    $('#csvMappingPanel').classList.remove('hidden');
    $('#importBtn').disabled = false;
  } catch (err) {
    $('#csvMappingPanel').classList.add('hidden');
    $('#importBtn').disabled = true;
    toast(err.message, 'err');
  }
}

function clearCsv() {
  csvText = '';
  csvMapping = {};
  $('#csvFile').value = '';
  $('#fileSummary').classList.add('hidden');
  $('#csvMappingPanel').classList.add('hidden');
  $('#csvMapping').innerHTML = '';
  $('#importBtn').disabled = true;
  $('#importResult').classList.add('hidden');
}

async function importCsv() {
  if (!csvText.trim()) return;
  const mode = $('#importMode').value;
  document.querySelectorAll('[data-csv-source]').forEach(select => { csvMapping[select.dataset.csvSource] = select.value; });
  if (mode === 'replace' && !confirm('Replace mode will remove every existing contact before importing this CSV. Continue?')) return;
  const btn = $('#importBtn');
  btn.disabled = true; btn.textContent = 'Importing…';
  const result = $('#importResult'); result.classList.add('hidden', 'error');
  try {
    const data = await api('/api/admin/import', { method: 'POST', body: { csv: csvText, mode, mapping: csvMapping } });
    result.className = 'import-result';
    result.innerHTML = `<strong>Import complete.</strong><br>${esc(data.added)} added · ${esc(data.updated)} updated · ${esc(data.skipped)} skipped.${data.totalErrors ? `<br>${esc(data.totalErrors)} row error(s). First error: row ${esc(data.rowErrors[0]?.row)} — ${esc(data.rowErrors[0]?.error)}` : ''}`;
    await Promise.all([loadDashboard(), loadContacts()]);
    toast('CSV import complete.');
  } catch (err) {
    result.className = 'import-result error';
    result.textContent = err.message;
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Import contacts';
  }
}

function userRowsHtml(list) {
  if (!list.length) return '<tr><td colspan="7" class="loading">No users found.</td></tr>';
  return list.map(u => `<tr>
    <td><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></td>
    <td><span class="role-pill ${esc(u.role)}">${esc(u.role)}</span></td>
    <td><span class="plan-pill">${esc(u.planId)}</span></td>
    <td><strong>${Number(u.credits).toLocaleString()}</strong></td>
    <td>${Number(u.revealCount).toLocaleString()}</td>
    <td>${esc(new Date(u.createdAt).toLocaleDateString())}</td>
    <td><div class="row-actions"><button class="icon-btn" data-manage-user="${esc(u.id)}">Manage</button><button class="icon-btn" data-reset-user="${esc(u.id)}">Reset</button><button class="icon-btn delete" data-delete-user="${esc(u.id)}">Delete</button></div></td>
  </tr>`).join('');
}

async function loadUsers() {
  $('#userRows').innerHTML = '<tr><td colspan="7" class="loading">Loading users…</td></tr>';
  try {
    const data = await api('/api/admin/users');
    users = data.users;
    $('#userRows').innerHTML = userRowsHtml(users);
    $('[data-manage-user]').forEach(btn => btn.onclick = () => openUserModal(users.find(u => u.id === btn.dataset.manageUser)));
    $('[data-reset-user]').forEach(btn => btn.onclick = () => resetUserPassword(btn.dataset.resetUser));
    $('[data-delete-user]').forEach(btn => btn.onclick = () => deleteUser(btn.dataset.deleteUser));
  } catch (err) { toast(err.message, 'err'); }
}

async function addUser(e) {
  e.preventDefault();
  const errorEl = $('#addUserError'); errorEl.classList.add('hidden');
  try {
    await api('/api/admin/users', { method: 'POST', body: {
      name: $('#newUserName').value, email: $('#newUserEmail').value, password: $('#newUserPassword').value,
      planId: $('#newUserPlan').value, role: $('#newUserRole').value, credits: Number($('#newUserCredits').value || 0)
    }});
    $('#addUserModal').classList.add('hidden'); $('#addUserForm').reset();
    await Promise.all([loadUsers(), loadDashboard()]);
    toast('User created.');
  } catch (err) { errorEl.textContent = err.message; errorEl.classList.remove('hidden'); }
}

async function resetUserPassword(id) {
  const user = users.find(x => x.id === id); if (!user) return;
  if (!confirm('Send a password reset link to ' + user.email + '?')) return;
  try {
    const data = await api('/api/admin/users/' + encodeURIComponent(id) + '/reset-password', { method: 'POST' });
    toast(data.message || 'Reset link sent.');
  } catch (err) { toast(err.message, 'err'); }
}

async function deleteUser(id) {
  const user = users.find(x => x.id === id); if (!user) return;
  if (!confirm('Delete ' + user.name + ' (' + user.email + ')? This will also revoke their active sessions.')) return;
  try {
    await api('/api/admin/users/' + encodeURIComponent(id), { method: 'DELETE' });
    closeUserModal(); await Promise.all([loadUsers(), loadDashboard()]); toast('User deleted.');
  } catch (err) { toast(err.message, 'err'); }
}

function openUserModal(user) {
  if (!user) return;
  $('#userModalTitle').textContent = user.name;
  $('#userId').value = user.id;
  $('#userPlan').value = user.planId;
  $('#userRole').value = user.role;
  $('#userCreditDelta').value = 0;
  $('#userCreditReason').value = '';
  $('#userError').classList.add('hidden');
  $('#userModal').classList.remove('hidden');
}
function closeUserModal() { $('#userModal').classList.add('hidden'); }

async function saveUser(e) {
  e.preventDefault();
  const id = $('#userId').value;
  const user = users.find(u => u.id === id);
  const errEl = $('#userError'); errEl.classList.add('hidden');
  try {
    if ($('#userPlan').value !== user.planId) await api(`/api/admin/users/${encodeURIComponent(id)}/plan`, { method: 'POST', body: { planId: $('#userPlan').value } });
    if ($('#userRole').value !== user.role) await api(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: 'POST', body: { role: $('#userRole').value } });
    const delta = Number($('#userCreditDelta').value || 0);
    if (delta) await api(`/api/admin/users/${encodeURIComponent(id)}/credits`, { method: 'POST', body: { delta, reason: $('#userCreditReason').value || 'admin_adjustment' } });
    closeUserModal();
    await Promise.all([loadUsers(), loadDashboard()]);
    toast('User updated.');
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
  }
}

function paymentRowsHtml(list) {
  if (!list.length) return '<tr><td colspan="6" class="loading">No payment activity yet.</td></tr>';
  return list.map(p => '<tr><td>' + esc(p.at ? new Date(p.at).toLocaleString() : '') + '</td><td><strong>' + esc(p.userEmail) + '</strong></td><td>' + esc(p.planName || p.planId || '') + '</td><td><span class="status-pill">' + esc(p.status) + '</span></td><td>' + (p.amount != null ? esc(p.amount) + ' ' + esc((p.currency || 'USD').toUpperCase()) : '—') + '</td><td>' + esc(p.reason || '—') + '</td></tr>').join('');
}

async function loadPayments() {
  $('#paymentRows').innerHTML = '<tr><td colspan="6" class="loading">Loading payments…</td></tr>';
  try {
    const data = await api('/api/admin/payments');
    $('#paymentRows').innerHTML = paymentRowsHtml(data.payments);
  } catch (err) { toast(err.message, 'err'); }
}

function renderPlanSettings(plans) {
  $('#planSettings').innerHTML = plans.map(p => `<div class="plan-setting">
    <strong>${esc(p.name)}</strong>
    <label class="field">Price / month<input type="number" min="0" max="1000000" data-plan-price="${esc(p.id)}" value="${esc(p.price)}" /></label>
    <label class="field">Credits<input type="number" min="0" max="10000000" data-plan-credits="${esc(p.id)}" value="${esc(p.credits)}" /></label>
  </div>`).join('');
}

async function loadSettings() {
  try {
    const data = await api('/api/admin/settings');
    settings = data.settings;
    $('#brandName').textContent = settings.siteName;
    $('#settingSiteName').value = settings.siteName;
    $('#settingTagline').value = settings.tagline || '';
    $('#settingSignupCredits').value = settings.signupCredits;
    $('#settingEmailCost').value = settings.emailRevealCost;
    $('#settingPhoneCost').value = settings.phoneRevealCost;
    $('#settingLinkedIn').value = settings.social?.linkedin || '';
    $('#settingFacebook').value = settings.social?.facebook || '';
    $('#settingInstagram').value = settings.social?.instagram || '';
    [['adminLinkedIn','linkedin'],['adminFacebook','facebook'],['adminInstagram','instagram']].forEach(([id,key]) => { const el = $('#' + id); if (el) { el.href = settings.social?.[key] || '#'; el.classList.toggle('hidden', !settings.social?.[key]); } });
    renderPlanSettings(settings.plans);
    $('#envStorage').textContent = data.storage;
    $('#envBilling').textContent = data.demoBilling ? 'Demo billing' : 'Stripe live/test mode';
    $('#adminAccountEmail').value = currentAdmin?.email || '';
  } catch (err) { toast(err.message, 'err'); }
}

async function saveSettings(e) {
  e.preventDefault();
  const plans = settings.plans.map(p => ({
    id: p.id,
    price: Number($(`[data-plan-price="${p.id}"]`).value),
    credits: Number($(`[data-plan-credits="${p.id}"]`).value)
  }));
  try {
    const newAdminEmail = $('#adminAccountEmail').value.trim().toLowerCase();
    const newAdminPassword = $('#adminNewPassword').value;
    const adminEmailChanged = newAdminEmail && newAdminEmail !== String(currentAdmin?.email || '').toLowerCase();
    if (adminEmailChanged || newAdminPassword) {
      if (newAdminPassword !== $('#adminNewPasswordConfirm').value) throw new Error('New administrator passwords do not match.');
      if (!$('#adminCurrentPassword').value) throw new Error('Enter the current administrator password to change admin credentials.');
      const account = await api('/api/admin/account', { method: 'POST', body: { currentPassword: $('#adminCurrentPassword').value, email: newAdminEmail, newPassword: newAdminPassword }});
      currentAdmin = account.user; $('#envAdmin').textContent = currentAdmin.email;
      $('#adminCurrentPassword').value = ''; $('#adminNewPassword').value = ''; $('#adminNewPasswordConfirm').value = '';
    }
    const data = await api('/api/admin/settings', { method: 'PUT', body: {
      siteName: $('#settingSiteName').value,
      tagline: $('#settingTagline').value,
      signupCredits: Number($('#settingSignupCredits').value),
      emailRevealCost: Number($('#settingEmailCost').value),
      phoneRevealCost: Number($('#settingPhoneCost').value),
      social: { linkedin: $('#settingLinkedIn').value, facebook: $('#settingFacebook').value, instagram: $('#settingInstagram').value },
      plans
    }});
    settings = data.settings;
    $('#brandName').textContent = settings.siteName;
    renderPlanSettings(settings.plans);
    toast('Settings saved.');
  } catch (err) { toast(err.message, 'err'); }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  location.href = 'index.html';
}

function bindEvents() {
  $$('.nav-item').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('[data-jump]').forEach(b => b.onclick = () => setView(b.dataset.jump));
  $('#menuBtn').onclick = () => $('.sidebar').classList.toggle('open');
  $('#logoutBtn').onclick = logout;
  $('#downloadCsv').onclick = () => { location.href = '/api/admin/contacts.csv'; };
  $('#addContactBtn').onclick = () => openContactModal();
  $('#contactClose').onclick = closeContactModal;
  $('#contactCancel').onclick = closeContactModal;
  $('#contactModal').onclick = e => { if (e.target === $('#contactModal')) closeContactModal(); };
  $('#contactForm').onsubmit = saveContact;
  $('#contactSearch').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadContacts, 250); };
  $('#chooseCsvBtn').onclick = () => $('#csvFile').click();
  $('#csvFile').onchange = e => setCsvFile(e.target.files?.[0]);
  $('#clearCsvBtn').onclick = clearCsv;
  $('#importBtn').onclick = importCsv;
  const drop = $('#dropZone');
  ['dragenter','dragover'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave','drop'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', e => setCsvFile(e.dataTransfer.files?.[0]));
  drop.addEventListener('click', e => { if (!e.target.closest('button')) $('#csvFile').click(); });
  $('#userClose').onclick = closeUserModal;
  $('#userCancel').onclick = closeUserModal;
  $('#addUserBtn').onclick = () => { $('#addUserError').classList.add('hidden'); $('#addUserModal').classList.remove('hidden'); setTimeout(() => $('#newUserName').focus(), 30); };
  $('#addUserClose').onclick = () => $('#addUserModal').classList.add('hidden');
  $('#addUserCancel').onclick = () => $('#addUserModal').classList.add('hidden');
  $('#addUserModal').onclick = e => { if (e.target === $('#addUserModal')) $('#addUserModal').classList.add('hidden'); };
  $('#addUserForm').onsubmit = addUser;
  $('#userDelete').onclick = () => deleteUser($('#userId').value);
  $('#userReset').onclick = () => resetUserPassword($('#userId').value);
  $('#previewCsvBtn').onclick = loadCsvPreview;
  $('#userModal').onclick = e => { if (e.target === $('#userModal')) closeUserModal(); };
  $('#userForm').onsubmit = saveUser;
  $('#settingsForm').onsubmit = saveSettings;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeContactModal(); closeUserModal(); $('.sidebar').classList.remove('open'); } });
}

async function init() {
  bindEvents();
  try {
    const ok = await ensureAccess();
    if (!ok) return;
    await Promise.all([loadDashboard(), loadSettings()]);
  } catch (err) {
    if (err.status === 401) location.href = 'admin-login.html';
    else toast(err.message, 'err');
  }
}

init();
