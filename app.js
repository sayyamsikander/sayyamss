const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let currentUser = null;
let authMode = 'signup';
let contacts = [];
let plans = [];
let meta = { signupCredits: 15, emailRevealCost: 1, phoneRevealCost: 5, siteName: 'ContactScope', tagline: 'Verified B2B contact intelligence', industries: [], sizes: [], social: { linkedin: '', facebook: '', instagram: '' } };

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function api(url, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
}

function setAuthMode(mode) {
  authMode = mode;
  $$('.auth-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === mode));
  $('#nameField').classList.toggle('hidden', mode === 'login');
  $('#authTitle').textContent = mode === 'signup' ? 'Create your free account' : 'Welcome back';
  $('#authSubtitle').textContent = mode === 'signup' ? `Get ${meta.signupCredits} reveal credits. No card required.` : 'Sign in to reveal and manage contacts.';
  $('#authSubmit').textContent = mode === 'signup' ? 'Create free account' : 'Log in';
  $('#authPassword').setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
  $('#forgotPasswordBtn').classList.toggle('hidden', mode !== 'login');
  $('#resendVerificationBtn').classList.add('hidden');
  $('#authError').classList.add('hidden');
}

function openAuth(mode = 'signup') {
  setAuthMode(mode);
  $('#authModal').classList.remove('hidden');
  setTimeout(() => (mode === 'signup' ? $('#authName') : $('#authEmail')).focus(), 30);
}
function openResetPassword(token) {
  setAuthMode('login');
  $('#resetForm').dataset.token = token;
  $('#resetPassword').value = '';
  $('#resetPasswordConfirm').value = '';
  $('#resetError').classList.add('hidden');
  $('#resetModal').classList.remove('hidden');
  setTimeout(() => $('#resetPassword').focus(), 30);
}
function closeResetPassword() { $('#resetModal').classList.add('hidden'); }
async function openBillingPortal() {
  try {
    const data = await api('/api/billing/portal', { method: 'POST' });
    window.location.href = data.url;
  } catch (err) { toast(err.message, 'err'); }
}
function closeAuth() { $('#authModal').classList.add('hidden'); }

function updateBranding() {
  document.title = `${meta.siteName} — B2B Contact Intelligence`;
  $$('.brand > span:last-child').forEach(el => { el.textContent = meta.siteName; });
  const heroTrust = $('#heroTrustCredits'); if (heroTrust) heroTrust.textContent = `✓ ${meta.signupCredits} free reveal credits`;
  const pricingNote = $('#pricingCreditNote'); if (pricingNote) pricingNote.textContent = `Email reveal = ${meta.emailRevealCost} credit${meta.emailRevealCost === 1 ? '' : 's'} · Phone reveal = ${meta.phoneRevealCost} credit${meta.phoneRevealCost === 1 ? '' : 's'}`;
  const ctaText = $('#ctaCredits'); if (ctaText) ctaText.textContent = `Create a free account and use ${meta.signupCredits} reveal credits to test the full workflow.`;
  ['LinkedIn','Facebook','Instagram'].forEach(name => {
    const key = name.toLowerCase();
    const el = $('#social' + name);
    if (el) {
      const href = meta.social?.[key] || '';
      el.href = href || '#';
      el.classList.toggle('hidden', !href);
    }
  });
  if (authMode === 'signup') setAuthMode('signup');
}

function populateFilters() {
  const industry = $('#industryInput');
  const size = $('#sizeInput');
  const currentIndustry = industry.value;
  const currentSize = size.value;
  industry.innerHTML = `<option value="">All industries</option>${meta.industries.map(v => `<option>${esc(v)}</option>`).join('')}`;
  size.innerHTML = `<option value="">Any size</option>${meta.sizes.map(v => `<option>${esc(v)}</option>`).join('')}`;
  if (meta.industries.includes(currentIndustry)) industry.value = currentIndustry;
  if (meta.sizes.includes(currentSize)) size.value = currentSize;
}

async function loadMeta() {
  try {
    meta = { ...meta, ...(await api('/api/meta')) };
    updateBranding();
    populateFilters();
  } catch (err) { toast(err.message, 'err'); }
}

function updateAccountUI() {
  if (currentUser) {
    const adminLink = currentUser.role === 'admin' ? '<a class="btn btn-light" href="admin.html">Admin</a>' : '';
    const billingLink = currentUser.hasBilling ? '<button class="btn btn-light" id="billingBtn">Billing</button>' : '';
    $('#headerActions').innerHTML = `${adminLink}${billingLink}<button class="btn btn-light" id="headerCredits">${esc(currentUser.credits)} credits</button><button class="btn btn-dark" id="logoutBtn">Log out</button>`;
    if ($('#billingBtn')) $('#billingBtn').addEventListener('click', openBillingPortal);
    $('#logoutBtn').addEventListener('click', logout);
    $('#accountChip').classList.remove('hidden');
    $('#accountChip').innerHTML = `<strong>${esc(currentUser.name)}</strong><b>${esc(currentUser.credits)} credits</b>${currentUser.role === 'admin' ? '<a href="admin.html">Admin console →</a>' : ''}`;
    $('#historyBtn').classList.remove('hidden');
  } else {
    $('#headerActions').innerHTML = `<button class="btn btn-ghost" data-auth="login">Log in</button><button class="btn btn-dark" data-auth="signup">Start free</button>`;
    $('#accountChip').classList.add('hidden');
    $('#historyBtn').classList.add('hidden');
    bindAuthButtons();
  }
  renderPricing();
}

function bindAuthButtons() {
  $$('[data-auth]').forEach(btn => { btn.onclick = () => openAuth(btn.dataset.auth); });
}

async function loadMe() {
  try {
    const data = await api('/api/me');
    currentUser = data.user;
  } catch { currentUser = null; }
  updateAccountUI();
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  currentUser = null;
  updateAccountUI();
  await searchContacts();
  toast('You are logged out.');
}

function revealHtml(field, type, id) {
  if (!field.available) return '<span class="masked">Not available</span>';
  if (field.revealed) return `<span class="revealed">${esc(field.revealed)}</span><span class="unlocked-badge">Unlocked</span>`;
  return `<span class="masked">${esc(field.masked)}</span><button class="reveal-btn" data-reveal="${type}" data-id="${esc(id)}">Reveal · ${esc(field.cost)}</button>`;
}

function contactRowsHtml(list) {
  return list.map(c => `<tr>
      <td><div class="person-cell"><div class="person-avatar">${esc(initials(c.name))}</div><div class="person-meta"><strong>${esc(c.name)}</strong><small>${esc(c.title)} · ${esc(c.location)}</small></div></div></td>
      <td><div class="company-cell"><strong>${esc(c.company)}</strong><small>${esc(c.domain)} · ${esc(c.employees)}</small></div></td>
      <td><span class="confidence-pill">${esc(c.confidence)}%</span><div class="person-meta"><small>Verified ${esc(c.verified)}</small></div></td>
      <td><div class="reveal-wrap">${revealHtml(c.email, 'email', c.id)}</div></td>
      <td><div class="reveal-wrap">${revealHtml(c.phone, 'phone', c.id)}</div></td>
    </tr>`).join('');
}

function mobileCardsHtml(list) {
  return list.map(c => {
    const field = (type) => {
      const f = c[type];
      if (!f.available) return `<div class="mobile-reveal-row"><div><small>${type === 'email' ? 'Work email' : 'Direct phone'}</small><div class="masked">Not available</div></div></div>`;
      return `<div class="mobile-reveal-row"><div><small>${type === 'email' ? 'Work email' : 'Direct phone'}</small><div class="${f.revealed ? 'revealed' : 'masked'}">${esc(f.revealed || f.masked)}</div></div>${f.revealed ? '<span class="unlocked-badge">Unlocked</span>' : `<button class="reveal-btn" data-reveal="${type}" data-id="${esc(c.id)}">Reveal · ${f.cost}</button>`}</div>`;
    };
    return `<article class="contact-mobile"><div class="contact-mobile-top"><div class="person-avatar">${esc(initials(c.name))}</div><div class="person-meta"><strong>${esc(c.name)}</strong><small>${esc(c.title)}</small></div><span class="confidence-pill">${esc(c.confidence)}%</span></div><div class="contact-mobile-company">${esc(c.company)} · ${esc(c.location)} · ${esc(c.employees)}</div>${field('email')}${field('phone')}</article>`;
  }).join('');
}

function bindRevealButtons() {
  $$('[data-reveal]').forEach(btn => btn.addEventListener('click', () => reveal(btn.dataset.id, btn.dataset.reveal)));
}

async function searchContacts() {
  const q = $('#queryInput').value.trim();
  const industry = $('#industryInput').value;
  const size = $('#sizeInput').value;
  const params = new URLSearchParams({ q, industry, size });
  $('#contactRows').innerHTML = '<tr><td colspan="5" class="loading-cell">Searching…</td></tr>';
  $('#mobileCards').innerHTML = '';
  try {
    const data = await api(`/api/contacts?${params}`);
    contacts = data.contacts;
    $('#resultCount').textContent = `${data.total} contact${data.total === 1 ? '' : 's'}`;
    $('#contactRows').innerHTML = contacts.length ? contactRowsHtml(contacts) : '<tr><td colspan="5" class="loading-cell">No matching contacts.</td></tr>';
    $('#mobileCards').innerHTML = contacts.length ? mobileCardsHtml(contacts) : '<div class="loading-cell">No matching contacts.</div>';
    bindRevealButtons();
  } catch (err) {
    $('#contactRows').innerHTML = '<tr><td colspan="5" class="loading-cell">Could not load contacts.</td></tr>';
    toast(err.message, 'err');
  }
}

async function reveal(id, type) {
  if (!currentUser) {
    openAuth('signup');
    toast('Create an account to reveal contact details.', 'err');
    return;
  }
  const contact = contacts.find(c => c.id === id);
  const cost = contact?.[type]?.cost ?? (type === 'phone' ? meta.phoneRevealCost : meta.emailRevealCost);
  if (currentUser.credits < cost) {
    document.querySelector('#pricing').scrollIntoView({ behavior: 'smooth' });
    toast(`You need ${cost} credits for this reveal.`, 'err');
    return;
  }
  try {
    const data = await api(`/api/contacts/${encodeURIComponent(id)}/reveal`, { method: 'POST', body: { type } });
    currentUser.credits = data.credits;
    updateAccountUI();
    await searchContacts();
    toast(data.alreadyRevealed ? 'Already unlocked — no credits charged.' : `${type === 'email' ? 'Email' : 'Phone'} revealed for ${data.cost} credit${data.cost === 1 ? '' : 's'}.`);
  } catch (err) {
    if (err.status === 401) openAuth('login');
    if (err.status === 402) document.querySelector('#pricing').scrollIntoView({ behavior: 'smooth' });
    toast(err.message, 'err');
  }
}

async function loadPlans() {
  try {
    const data = await api('/api/plans');
    plans = data.plans;
    $('#billingNote').textContent = data.demoBilling ? 'Demo billing is disabled for customer purchases.' : 'Secure Stripe Checkout is used for international payments. Credits are added only after Stripe confirms payment.';
    renderPricing();
  } catch (err) { toast(err.message, 'err'); }
}

function renderPricing() {
  if (!plans.length) return;
  $('#pricingGrid').innerHTML = plans.map(p => {
    const isCurrent = currentUser?.planId === p.id;
    const label = p.id === 'free' ? (currentUser ? 'Free plan' : 'Start free') : (currentUser?.hasBilling && ['active','trialing','past_due','payment_failed','incomplete'].includes(currentUser.billingStatus)) ? 'Manage billing' : isCurrent ? `Choose ${p.name}` : `Choose ${p.name}`;
    return `<article class="price-card ${p.popular ? 'popular' : ''}">${p.popular ? '<span class="popular-tag">Most popular</span>' : ''}<div><span class="plan-name">${esc(p.name)}</span>${isCurrent ? '<span class="current-plan">Current</span>' : ''}</div><div class="plan-price">$${esc(p.price)}${p.price ? '<small>/month</small>' : ''}</div><div class="plan-credits">${esc(Number(p.credits).toLocaleString())} reveal credits</div><ul class="feature-list">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul><button class="btn ${p.popular ? 'btn-accent' : 'btn-light'}" data-plan="${esc(p.id)}">${esc(label)}</button></article>`;
  }).join('');
  $$('[data-plan]').forEach(btn => btn.addEventListener('click', () => choosePlan(btn.dataset.plan)));
}

async function choosePlan(planId) {
  if (planId === 'free') {
    if (!currentUser) openAuth('signup'); else toast('You are already able to use the free workflow.');
    return;
  }
  if (!currentUser) { openAuth('signup'); toast('Create an account before choosing a paid plan.', 'err'); return; }
  try {
    if (currentUser.hasBilling && ['active','trialing','past_due','payment_failed','incomplete'].includes(currentUser.billingStatus)) {
      return openBillingPortal();
    }
    const data = await api('/api/billing/checkout', { method: 'POST', body: { planId } });
    if (data.url) { window.location.href = data.url; return; }
    if (data.user) {
      currentUser = data.user;
      updateAccountUI();
      toast(data.message || 'Plan upgraded successfully.');
    }
  } catch (err) { toast(err.message, 'err'); }
}

async function resendVerification() {
  try {
    const data = await api('/api/auth/resend-verification', { method: 'POST', body: { email: $('#authEmail').value } });
    toast(data.message || 'Verification email sent.');
    $('#resendVerificationBtn').classList.add('hidden');
  } catch (err) { toast(err.message, 'err'); }
}

async function forgotPassword() {
  const email = $('#authEmail').value.trim();
  if (!email) { $('#authError').textContent = 'Enter your work email first.'; $('#authError').classList.remove('hidden'); return; }
  try {
    const data = await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
    $('#authError').textContent = data.message || 'Check your email for reset instructions.';
    $('#authError').classList.remove('hidden');
  } catch (err) { $('#authError').textContent = err.message; $('#authError').classList.remove('hidden'); }
}

async function showHistory() {
  try {
    const data = await api('/api/history');
    $('#historyList').innerHTML = data.reveals.length ? data.reveals.map(r => `<div class="history-row"><div><strong>${esc(r.contact?.name || 'Deleted contact')}</strong><small>${esc(r.contact?.company || '')} · ${esc(r.type)} · ${new Date(r.at).toLocaleString()}</small></div><div class="history-value">${esc(r.contact?.value || 'Unavailable')}<small>-${esc(r.cost)} credit${r.cost === 1 ? '' : 's'}</small></div></div>`).join('') : '<div class="loading-cell">No reveals yet. Unlock a contact to see it here.</div>';
    $('#historyModal').classList.remove('hidden');
  } catch (err) { toast(err.message, 'err'); }
}

function bindEvents() {
  bindAuthButtons();
  $$('.auth-tabs button').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.tab)));
  $('#authClose').addEventListener('click', closeAuth);
  $('#resetClose').addEventListener('click', closeResetPassword);
  $('#resetModal').addEventListener('click', e => { if (e.target === $('#resetModal')) closeResetPassword(); });
  $('#forgotPasswordBtn').addEventListener('click', forgotPassword);
  $('#resendVerificationBtn').addEventListener('click', resendVerification);
  $('#resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = $('#resetError'); errorEl.classList.add('hidden');
    if ($('#resetPassword').value !== $('#resetPasswordConfirm').value) { errorEl.textContent = 'Passwords do not match.'; errorEl.classList.remove('hidden'); return; }
    try {
      const data = await api('/api/auth/reset-password', { method: 'POST', body: { token: $('#resetForm').dataset.token, password: $('#resetPassword').value } });
      closeResetPassword();
      openAuth('login');
      $('#authEmail').value = data.user?.email || $('#authEmail').value;
      $('#authPassword').value = '';
      $('#authError').textContent = data.message || 'Password reset successfully. Please sign in with your new password.';
      $('#authError').classList.remove('hidden');
      toast('Password reset successfully. Please sign in with your new password.');
    } catch (err) { errorEl.textContent = err.message; errorEl.classList.remove('hidden'); }
  });
  $('#authModal').addEventListener('click', e => { if (e.target === $('#authModal')) closeAuth(); });
  $('#historyClose').addEventListener('click', () => $('#historyModal').classList.add('hidden'));
  $('#historyModal').addEventListener('click', e => { if (e.target === $('#historyModal')) $('#historyModal').classList.add('hidden'); });
  $('#historyBtn').addEventListener('click', showHistory);
  $('#searchBtn').addEventListener('click', searchContacts);
  $('#queryInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchContacts(); });
  $('#industryInput').addEventListener('change', searchContacts);
  $('#sizeInput').addEventListener('change', searchContacts);
  $('#clearFilters').addEventListener('click', () => { $('#queryInput').value = ''; $('#industryInput').value = ''; $('#sizeInput').value = ''; searchContacts(); });
  $('#heroSearch').addEventListener('submit', e => { e.preventDefault(); $('#queryInput').value = $('#heroQuery').value; document.querySelector('#search').scrollIntoView({ behavior: 'smooth' }); setTimeout(searchContacts, 250); });
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = { email: $('#authEmail').value, password: $('#authPassword').value };
    if (authMode === 'signup') payload.name = $('#authName').value;
    const errorEl = $('#authError'); errorEl.classList.add('hidden');
    try {
      const data = await api(authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', body: payload });
      if (data.requiresVerification) {
        $('#authError').textContent = data.message || 'Check your email to verify your account.';
        $('#authError').classList.remove('hidden');
        $('#authForm').reset();
        return;
      }
      currentUser = data.user;
      closeAuth();
      updateAccountUI();
      await searchContacts();
      toast(authMode === 'signup' ? 'Account created. Check your email to verify your address before signing in.' : 'Welcome back.');
      $('#authForm').reset();
    } catch (err) {
      errorEl.textContent = err.message; errorEl.classList.remove('hidden');
      $('#resendVerificationBtn').classList.toggle('hidden', !(err.status === 403 && err.data?.needsVerification));
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAuth(); $('#historyModal').classList.add('hidden'); } });
}

async function init() {
  bindEvents();
  await loadMeta();
  await Promise.all([loadMe(), loadPlans()]);
  await searchContacts();
  const params = new URLSearchParams(location.search);
  if (params.get('billing') === 'success') toast('Payment submitted. Your plan and credits update only after Stripe confirms payment.');
  if (params.get('billing') === 'cancelled') toast('Checkout was cancelled — no credits were added.', 'err');
  if (params.get('verified') === 'success') toast('Email verified. You can now sign in.');
  if (params.get('reset')) openResetPassword(params.get('reset'));
  if (params.get('admin') === 'login' && !currentUser) openAuth('login');
}

init();
