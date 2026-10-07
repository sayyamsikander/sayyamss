const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT = __dirname;
const mockPort = 4398;
const appPort = 4399;
const supabaseUrl = `http://127.0.0.1:${mockPort}`;
const base = `http://127.0.0.1:${appPort}`;
let row = null;

const mock = http.createServer((req, res) => {
  if (!req.url.startsWith('/rest/v1/contactscope_state')) {
    res.writeHead(404); return res.end();
  }
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(row ? [{ data: row.data }] : []));
  }
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]');
      row = body[0];
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end('');
    });
    return;
  }
  res.writeHead(405); res.end();
});

function startApp() {
  return spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(appPort), APP_URL: base, COOKIE_SECURE: 'false', DEMO_BILLING: 'true',
      SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
      ADMIN_NAME: 'Persistence Admin', ADMIN_EMAIL: 'persist.admin@example.com', ADMIN_PASSWORD: 'PersistenceAdmin!2026'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForApp() {
  const end = Date.now() + 7000;
  while (Date.now() < end) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) return await r.json(); } catch {}
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error('App did not start');
}

async function post(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = {}; try { data = await res.json(); } catch {}
  return { res, data };
}

async function stop(proc) {
  proc.kill('SIGTERM');
  await new Promise(resolve => {
    const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 1200);
    proc.once('exit', () => { clearTimeout(t); resolve(); });
  });
}

async function main() {
  await new Promise(resolve => mock.listen(mockPort, '127.0.0.1', resolve));
  let app = startApp();
  try {
    let health = await waitForApp();
    assert.equal(health.storage, 'supabase');

    let r = await post('/api/auth/signup', { name: 'Persistent User', email: 'persistent.user@example.com', password: 'Persistent!2026' });
    assert.equal(r.res.status, 201);
    assert.ok(row && row.data && row.data.users.some(u => u.email === 'persistent.user@example.com'));

    await stop(app);
    app = startApp();
    health = await waitForApp();
    assert.equal(health.storage, 'supabase');

    r = await post('/api/auth/login', { email: 'persistent.user@example.com', password: 'Persistent!2026' });
    assert.equal(r.res.status, 200);
    assert.equal(r.data.user.email, 'persistent.user@example.com');
    console.log('Supabase adapter mock test passed: state survives an application restart.');
  } finally {
    await stop(app);
    await new Promise(resolve => mock.close(resolve));
  }
}

main().catch(err => { console.error(err.stack || err); process.exit(1); });
