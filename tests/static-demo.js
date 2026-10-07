const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(require('path').join(__dirname, '..', 'static-demo.js'), 'utf8');
const store = new Map();
const listeners = {};
const localStorage = {
  getItem: key => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};
const document = {
  addEventListener: (type, handler) => { listeners[type] = handler; },
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} }
};
const window = { fetch: async () => new Response('native') };
const context = {
  location: {
    protocol: 'https:',
    hostname: 'sayyamsikander.github.io',
    pathname: '/',
    href: 'https://sayyamsikander.github.io/sayyamss/'
  },
  localStorage,
  window,
  document,
  Response,
  URL,
  Blob,
  setTimeout,
  Math,
  Date,
  console
};

vm.runInNewContext(code, context, { filename: 'static-demo.js' });

async function request(path, options) {
  return context.window.fetch(path, options);
}

(async () => {
  let response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);

  response = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Pages User', email: 'pages.user@example.com', password: 'PagesPass!123' })
  });
  assert.equal(response.status, 201);

  response = await request('/api/me');
  assert.equal((await response.json()).user.email, 'pages.user@example.com');

  response = await request('/api/contacts');
  assert.equal(response.status, 200);
  assert.ok((await response.json()).contacts.length >= 8);

  response = await request('/api/admin/users');
  assert.equal(response.status, 403);

  response = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(response.status, 200);

  response = await request('/api/me');
  assert.equal((await response.json()).user, null);

  context.location.pathname = '/sayyamss/admin.html';
  vm.runInNewContext(code, context, { filename: 'static-demo-admin.js' });

  response = await request('/api/me');
  assert.equal((await response.json()).user.role, 'admin');

  response = await request('/api/admin/users');
  assert.equal(response.status, 200);

  console.log('Pages demo smoke test passed: health, signup, login session, contacts, logout, admin access.');
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
