const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT = __dirname;
const port = 4387;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contactscope-test-'));
const dataFile = path.join(tmp, 'db.json');
const base = `http://127.0.0.1:${port}`;
const adminEmail = 'admin@test.example';
const adminPassword = 'AdminTest!2026';

const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    APP_URL: base,
    COOKIE_SECURE: 'false',
    DEMO_BILLING: 'true',
    DATA_FILE: dataFile,
    ADMIN_NAME: 'Test Admin',
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
    ADMIN_RESET_PASSWORD: 'false',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: ''
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', d => { logs += d.toString(); });
child.stderr.on('data', d => { logs += d.toString(); });

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function request(url, { method = 'GET', body, cookie, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await res.json() : await res.text();
  return { res, data };
}

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Server did not start. Logs:\n${logs}`);
}

async function main() {
  await waitForServer();

  let r = await request('/api/health');
  assert.equal(r.res.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.storage, 'local-json');

  r = await request('/api/contacts');
  assert.equal(r.res.status, 200);
  assert.ok(r.data.contacts.length >= 8);
  assert.equal(r.data.contacts[0].email.revealed, null);
  assert.ok(r.data.contacts[0].email.masked);

  r = await request('/api/auth/signup', { method: 'POST', body: { name: 'Smoke User', email: 'smoke.user@example.com', password: 'SmokePass!123' } });
  assert.equal(r.res.status, 201);
  const userCookie = cookieFrom(r.res);
  assert.ok(userCookie.startsWith('session='));
  const setCookie = r.res.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('SameSite=Lax'));
  const diskAfterSignup = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.ok(diskAfterSignup.sessions[0].tokenHash);
  assert.equal('token' in diskAfterSignup.sessions[0], false);
  assert.equal(r.data.user.credits, 15);
  const userId = r.data.user.id;

  r = await request('/api/contacts', { cookie: userCookie });
  const contactId = r.data.contacts[0].id;
  r = await request(`/api/contacts/${contactId}/reveal`, { method: 'POST', body: { type: 'email' }, cookie: userCookie });
  assert.equal(r.res.status, 200);
  assert.equal(r.data.credits, 14);
  assert.ok(r.data.value.includes('@'));

  r = await request(`/api/contacts/${contactId}/reveal`, { method: 'POST', body: { type: 'email' }, cookie: userCookie });
  assert.equal(r.data.credits, 14);
  assert.equal(r.data.alreadyRevealed, true);

  r = await request('/api/admin/stats', { cookie: userCookie });
  assert.equal(r.res.status, 403);

  r = await request('/api/auth/login', { method: 'POST', body: { email: adminEmail, password: adminPassword } });
  assert.equal(r.res.status, 200);
  const adminCookie = cookieFrom(r.res);
  assert.equal(r.data.user.role, 'admin');

  r = await request('/api/admin/stats', { cookie: adminCookie });
  assert.equal(r.res.status, 200);
  assert.ok(r.data.contacts >= 8);

  const exportRes = await fetch(base + '/api/admin/contacts.csv', { headers: { cookie: adminCookie } });
  assert.equal(exportRes.status, 200);
  assert.ok((await exportRes.text()).startsWith('id,name,title,company'));

  r = await request('/api/admin/contacts', { method: 'POST', cookie: adminCookie, body: {
    name: 'Test Contact', title: 'CTO', company: 'Smoke Labs', domain: 'smoke.example', industry: 'Testing', location: 'Remote', employees: '11–50', email: 'test.contact@smoke.example', phone: '+1 555 000 0001', confidence: 88, source: 'Smoke test', verified: '2026-10-07'
  }});
  assert.equal(r.res.status, 201);
  const createdContactId = r.data.contact.id;

  const csv = 'name,title,company,email,phone,confidence,source,verified\nCSV Person,Founder,CSV Labs,csv.person@csv.example,+1 555 000 0002,91,CSV test,2026-10-07';
  r = await request('/api/admin/import', { method: 'POST', cookie: adminCookie, body: { csv, mode: 'upsert' } });
  assert.equal(r.res.status, 200);
  assert.equal(r.data.added, 1);

  r = await request('/api/admin/settings', { method: 'PUT', cookie: adminCookie, body: {
    siteName: 'ContactScope Test', tagline: 'Test tagline', signupCredits: 20, emailRevealCost: 2, phoneRevealCost: 7,
    plans: [{id:'starter',price:49,credits:1200},{id:'growth',price:109,credits:5200},{id:'business',price:299,credits:16000},{id:'free',price:0,credits:20}]
  }});
  assert.equal(r.res.status, 200);
  assert.equal(r.data.settings.emailRevealCost, 2);

  r = await request('/api/auth/signup', { method: 'POST', body: { name: 'Second User', email: 'second.user@example.com', password: 'SecondPass!123' } });
  assert.equal(r.res.status, 201);
  assert.equal(r.data.user.credits, 20);

  r = await request(`/api/admin/users/${userId}/credits`, { method: 'POST', cookie: adminCookie, body: { delta: 6, reason: 'smoke_bonus' } });
  assert.equal(r.res.status, 200);
  assert.equal(r.data.user.credits, 20);

  r = await request(`/api/admin/contacts/${createdContactId}`, { method: 'DELETE', cookie: adminCookie });
  assert.equal(r.res.status, 200);

  r = await request('/api/auth/signup', { method: 'POST', origin: 'https://evil.example', body: { name: 'Bad Origin', email: 'bad.origin@example.com', password: 'LongPassword!1' } });
  assert.equal(r.res.status, 403);

  r = await request('/api/auth/signup', { method: 'POST', body: { name: 'Short Password', email: 'short.password@example.com', password: 'short' } });
  assert.equal(r.res.status, 400);

  r = await request('/api/admin/import', { method: 'POST', cookie: adminCookie, body: { csv: 'name,company,email\nBad,Bad Co,not-an-email', mode: 'upsert' } });
  assert.equal(r.res.status, 400);

  console.log('Smoke test passed: auth, masking, reveals, admin RBAC, contact CRUD, CSV import, settings, credits, CSRF-origin check, validation.');
}

main().then(() => {
  child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 80);
}).catch(err => {
  console.error(err.stack || err);
  console.error('\nServer logs:\n' + logs);
  child.kill('SIGTERM');
  setTimeout(() => process.exit(1), 80);
});
