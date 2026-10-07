const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC = ROOT;

function loadEnv() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let value = t.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 4173);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const DEMO_BILLING = String(process.env.DEMO_BILLING ?? 'false').toLowerCase() === 'true';
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '');
const EMAIL_FROM = String(process.env.EMAIL_FROM || '');
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60_000;
const PASSWORD_RESET_TTL_MS = 60 * 60_000;
const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? 'false').toLowerCase() === 'true';
const DATA_FILE = process.env.DATA_FILE ? path.resolve(ROOT, process.env.DATA_FILE) : path.join(ROOT, 'db.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_PLANS = [
  { id: 'free', name: 'Free', price: 0, credits: 15, period: 'forever', features: ['15 reveal credits', 'People & company search', 'Save reveal history', 'Community support'] },
  { id: 'starter', name: 'Starter', price: 39, credits: 1000, period: 'month', popular: false, features: ['1,000 reveal credits', 'Email + phone reveals', 'CSV-ready contact history', 'Standard support'] },
  { id: 'growth', name: 'Growth', price: 99, credits: 5000, period: 'month', popular: true, features: ['5,000 reveal credits', 'Advanced search filters', 'Priority verification queue', 'Priority support'] },
  { id: 'business', name: 'Business', price: 249, credits: 15000, period: 'month', popular: false, features: ['15,000 reveal credits', 'Team-ready architecture', 'Higher rate limits', 'API-ready access model'] }
];

const SEED_CONTACTS = [
  { id: 'c_1001', name: 'Maya Chen', title: 'VP of Growth', company: 'Northstar Labs', domain: 'northstarlabs.example', industry: 'SaaS', location: 'San Francisco, US', employees: '51–200', email: 'maya.chen@northstarlabs.example', phone: '+1 415 555 0142', confidence: 97, source: 'Company leadership page', verified: '2026-09-28' },
  { id: 'c_1002', name: 'Owen Brooks', title: 'Head of Sales', company: 'OrbitIQ', domain: 'orbitiq.example', industry: 'Analytics', location: 'Austin, US', employees: '11–50', email: 'owen.brooks@orbitiq.example', phone: '+1 512 555 0188', confidence: 94, source: 'Public company directory', verified: '2026-09-26' },
  { id: 'c_1003', name: 'Amina Rahman', title: 'Chief Marketing Officer', company: 'ClarityWorks', domain: 'clarityworks.example', industry: 'MarTech', location: 'London, UK', employees: '201–500', email: 'amina.rahman@clarityworks.example', phone: '+44 20 7946 0321', confidence: 96, source: 'Conference speaker profile', verified: '2026-10-01' },
  { id: 'c_1004', name: 'Lucas Martin', title: 'Co-Founder & CEO', company: 'VertexCloud', domain: 'vertexcloud.example', industry: 'Cloud Infrastructure', location: 'Berlin, DE', employees: '51–200', email: 'lucas@vertexcloud.example', phone: '+49 30 5557 0194', confidence: 92, source: 'Public press release', verified: '2026-09-22' },
  { id: 'c_1005', name: 'Sofia Alvarez', title: 'Director of Partnerships', company: 'BrightPath AI', domain: 'brightpath.example', industry: 'Artificial Intelligence', location: 'Madrid, ES', employees: '11–50', email: 'sofia.alvarez@brightpath.example', phone: '+34 91 555 0147', confidence: 95, source: 'Company team page', verified: '2026-09-30' },
  { id: 'c_1006', name: 'Noah Wilson', title: 'VP Engineering', company: 'SignalNest', domain: 'signalnest.example', industry: 'Developer Tools', location: 'Toronto, CA', employees: '51–200', email: 'noah.wilson@signalnest.example', phone: '+1 416 555 0166', confidence: 91, source: 'Engineering blog author page', verified: '2026-09-19' },
  { id: 'c_1007', name: 'Hana Suzuki', title: 'Revenue Operations Lead', company: 'KiteMetric', domain: 'kitemetric.example', industry: 'Revenue Intelligence', location: 'Tokyo, JP', employees: '11–50', email: 'hana.suzuki@kitemetric.example', phone: '+81 3 5550 0118', confidence: 93, source: 'Public event profile', verified: '2026-09-25' },
  { id: 'c_1008', name: 'Daniel Okafor', title: 'Head of Business Development', company: 'LedgerPeak', domain: 'ledgerpeak.example', industry: 'Fintech', location: 'Lagos, NG', employees: '51–200', email: 'daniel.okafor@ledgerpeak.example', phone: '+234 1 555 0144', confidence: 90, source: 'Company newsroom', verified: '2026-09-21' }
];

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function defaultState() {
  return {
    version: 2,
    settings: {
      siteName: 'ContactScope',
      tagline: 'Verified B2B contact intelligence',
      signupCredits: 15,
      emailRevealCost: 1,
      phoneRevealCost: 5,
      plans: clone(DEFAULT_PLANS),
      social: { linkedin: '', facebook: '', instagram: '' }
    },
    contacts: clone(SEED_CONTACTS),
    users: [],
    sessions: [],
    creditLedger: [],
    reveals: [],
    imports: [],
    payments: []
  };
}

function normalizeState(raw) {
  const base = defaultState();
  const db = raw && typeof raw === 'object' ? raw : {};
  base.version = 2;
  base.settings = { ...base.settings, ...(db.settings || {}) };
  base.settings.social = { ...base.settings.social, ...(db.settings?.social || {}) };
  const incomingPlans = Array.isArray(db.settings?.plans) ? db.settings.plans : null;
  if (incomingPlans) {
    base.settings.plans = DEFAULT_PLANS.map(p => ({ ...p, ...(incomingPlans.find(x => x.id === p.id) || {}) }));
  }
  base.settings.signupCredits = cleanInt(base.settings.signupCredits, 0, 100000, 15);
  base.settings.emailRevealCost = cleanInt(base.settings.emailRevealCost, 0, 10000, 1);
  base.settings.phoneRevealCost = cleanInt(base.settings.phoneRevealCost, 0, 10000, 5);
  base.settings.plans = base.settings.plans.map(p => {
    const credits = p.id === 'free' ? base.settings.signupCredits : cleanInt(p.credits, 0, 10000000, 0);
    const features = Array.isArray(p.features) ? [...p.features] : [];
    if (features.length) features[0] = `${credits.toLocaleString()} reveal credits`;
    return { ...p, credits, price: cleanInt(p.price, 0, 1000000, 0), features };
  });
  for (const key of ['contacts', 'users', 'sessions', 'creditLedger', 'reveals', 'imports', 'payments']) {
    if (Array.isArray(db[key])) base[key] = db[key];
  }
  if (!base.contacts.length) base.contacts = clone(SEED_CONTACTS);
  for (const user of base.users) {
    if (!user.role) user.role = 'user';
    if (!user.planId) user.planId = 'free';
    if (!Number.isFinite(Number(user.credits))) user.credits = 0;
    if (typeof user.emailVerified !== 'boolean') user.emailVerified = true;
    if (!user.billingStatus) user.billingStatus = user.planId === 'free' ? 'free' : 'active';
  }
  return base;
}

let state = defaultState();
let mutationQueue = Promise.resolve();

async function supabaseRequest(method, suffix, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${suffix}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Supabase storage error (${res.status}): ${message.slice(0, 500)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function initStore() {
  if (USE_SUPABASE) {
    const rows = await supabaseRequest('GET', 'contactscope_state?id=eq.main&select=data', undefined);
    if (Array.isArray(rows) && rows[0]?.data) {
      state = normalizeState(rows[0].data);
    } else {
      state = defaultState();
      await supabaseRequest('POST', 'contactscope_state?on_conflict=id', [{ id: 'main', data: state, updated_at: new Date().toISOString() }]);
    }
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    state = normalizeState(raw);
  } catch {
    state = defaultState();
  }
  await persistState(state);
}

async function persistState(db) {
  if (USE_SUPABASE) {
    await supabaseRequest('POST', 'contactscope_state?on_conflict=id', [{ id: 'main', data: db, updated_at: new Date().toISOString() }]);
    return;
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

function readDb() { return state; }
function mutateDb(mutator) {
  const job = mutationQueue.then(async () => {
    const draft = clone(state);
    const result = await mutator(draft);
    const normalized = normalizeState(draft);
    await persistState(normalized);
    state = normalized;
    return result;
  });
  mutationQueue = job.catch(err => { console.error('Mutation failed:', err); });
  return job;
}

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const rateBuckets = new Map();
function rateLimit(ip, key, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  if (rateBuckets.size > 10000) {
    for (const [k, v] of rateBuckets) if (now - v.start > windowMs * 3) rateBuckets.delete(k);
  }
  const bucketKey = `${ip}:${key}`;
  let b = rateBuckets.get(bucketKey);
  if (!b || now - b.start > windowMs) b = { start: now, count: 0 };
  b.count += 1;
  rateBuckets.set(bucketKey, b);
  return b.count <= limit;
}

function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}
function text(res, status, body, type = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extraHeaders });
  res.end(body);
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if (COOKIE_SECURE) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionHash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function setSessionCookie(res, token) {
  const attrs = [`session=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000'];
  if (COOKIE_SECURE) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}
function clearSessionCookie(res) {
  const attrs = ['session=', 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (COOKIE_SECURE) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}
function readBody(req, max = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let done = false;
    req.on('data', c => {
      if (done) return;
      total += c.length;
      if (total > max) {
        done = true;
        reject(new HttpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) resolve(Buffer.concat(chunks)); });
    req.on('error', err => { if (!done) reject(err); });
  });
}
async function readJson(req, max = 1_000_000) {
  const raw = await readBody(req, max);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON request body.'); }
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === attempt.length && crypto.timingSafeEqual(expected, attempt);
}
function getAuth(req, db = readDb()) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const hash = sessionHash(token);
  const session = db.sessions.find(s => (s.tokenHash === hash || s.token === token) && Number(s.expiresAt) > Date.now());
  if (!session) return null;
  const user = db.users.find(u => u.id === session.userId);
  if (!user) return null;
  return { user, session };
}
function requireAuth(req, db) {
  const auth = getAuth(req, db);
  if (!auth) throw new HttpError(401, 'Please sign in.');
  return auth;
}
function requireAdmin(req, db) {
  const auth = requireAuth(req, db);
  if (auth.user.role !== 'admin') throw new HttpError(403, 'Administrator access required.');
  return auth;
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role || 'user', planId: user.planId, credits: Number(user.credits || 0), createdAt: user.createdAt, emailVerified: user.emailVerified !== false, billingStatus: user.billingStatus || 'free', hasBilling: Boolean(user.stripeCustomerId) };
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320; }
function cleanString(value, max = 180) { return String(value ?? '').trim().slice(0, max); }
function cleanInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function today() { return new Date().toISOString().slice(0, 10); }
function createId(prefix) { return `${prefix}_${crypto.randomBytes(7).toString('hex')}`; }
function sanitizeId(value) {
  const id = cleanString(value, 80);
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : '';
}
function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '••••••';
  const left = local.length <= 2 ? `${local[0] || ''}*` : `${local[0]}${'*'.repeat(Math.min(5, Math.max(1, local.length - 1)))}`;
  return `${left}@${domain}`;
}
function maskPhone(phone) {
  if (!phone) return '';
  const total = (phone.match(/\d/g) || []).length;
  let seen = 0;
  return phone.replace(/\d/g, d => { seen += 1; return seen > total - 2 ? d : '•'; });
}
function hasReveal(db, userId, contactId, type) { return db.reveals.some(r => r.userId === userId && r.contactId === contactId && r.type === type); }
function contactDto(c, db, userId) {
  const emailUnlocked = Boolean(userId && c.email && hasReveal(db, userId, c.id, 'email'));
  const phoneUnlocked = Boolean(userId && c.phone && hasReveal(db, userId, c.id, 'phone'));
  return {
    id: c.id, name: c.name, title: c.title, company: c.company, domain: c.domain,
    industry: c.industry, location: c.location, employees: c.employees,
    confidence: c.confidence, source: c.source, verified: c.verified,
    email: { available: Boolean(c.email), masked: c.email ? maskEmail(c.email) : '', revealed: emailUnlocked ? c.email : null, cost: db.settings.emailRevealCost },
    phone: { available: Boolean(c.phone), masked: c.phone ? maskPhone(c.phone) : '', revealed: phoneUnlocked ? c.phone : null, cost: db.settings.phoneRevealCost }
  };
}
function findPlan(db, id) { return db.settings.plans.find(p => p.id === id); }
function stripePriceFor(planId) {
  const map = { starter: process.env.STRIPE_PRICE_STARTER, growth: process.env.STRIPE_PRICE_GROWTH, business: process.env.STRIPE_PRICE_BUSINESS };
  return map[planId];
}
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function emailHtmlEscape(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c])); }
async function sendEmail({ to, subject, html, idempotencyKey }) {
  if (!RESEND_API_KEY || !EMAIL_FROM) throw new HttpError(503, 'Email service is not configured. Add RESEND_API_KEY and EMAIL_FROM.');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, data.message || data.error?.message || 'Email delivery failed.');
  return data;
}
function emailVerificationUrl(token) { return APP_URL + '/?verify=' + encodeURIComponent(token); }
function passwordResetUrl(token) { return APP_URL + '/?reset=' + encodeURIComponent(token); }
async function sendVerificationEmail(user, token) {
  const url = emailVerificationUrl(token);
  return sendEmail({ to: user.email, subject: 'Verify your ContactScope email', idempotencyKey: 'verify-' + user.id + '-' + hashToken(token), html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Verify your ContactScope email</h2><p>Hello ' + emailHtmlEscape(user.name) + ',</p><p>Confirm your email address before signing in.</p><p><a href="' + url + '" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:8px">Verify email</a></p><p>This link expires in 24 hours.</p></div>' });
}
async function sendPasswordResetEmail(user, token) {
  const url = passwordResetUrl(token);
  return sendEmail({ to: user.email, subject: 'Reset your ContactScope password', idempotencyKey: 'reset-' + user.id + '-' + hashToken(token), html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Reset your ContactScope password</h2><p>Hello ' + emailHtmlEscape(user.name) + ',</p><p>Use the button below to choose a new password.</p><p><a href="' + url + '" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:8px">Reset password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p></div>' });
}
async function sendPaymentFailureEmail(user, payment, reason) {
  if (!user?.email || !RESEND_API_KEY || !EMAIL_FROM) return;
  const safeReason = emailHtmlEscape(reason || 'Your payment was declined.');
  try { await sendEmail({ to: user.email, subject: 'ContactScope payment was declined', idempotencyKey: 'payment-failed-' + (payment.eventId || payment.id), html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Payment was not completed</h2><p>Hello ' + emailHtmlEscape(user.name) + ',</p><p>We could not complete your payment for the ' + emailHtmlEscape(payment.planName || 'selected') + ' plan.</p><p><strong>Reason:</strong> ' + safeReason + '</p><p>No credits were added for this failed payment. Please return to ContactScope and try another payment method.</p></div>' }); } catch (err) { console.error('Payment failure email failed:', err.message); }
}
async function stripeRequest(secret, method, pathname, params) {
  const init = { method, headers: { Authorization: 'Bearer ' + secret } };
  if (params) { init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; init.body = params; }
  const response = await fetch('https://api.stripe.com/v1/' + pathname, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status === 402 ? 402 : 502, data.error?.message || 'Stripe request failed.');
  return data;
}
function timingSafeHex(a, b) {
  try {
    const ba = Buffer.from(a, 'hex'); const bb = Buffer.from(b, 'hex');
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}
function sameOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return o.host === host;
  } catch { return false; }
}
function titleCaseName(value) {
  return String(value || '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
function validateContact(input, existing = {}) {
  let email = cleanString(input.email ?? existing.email, 320).toLowerCase();
  let domain = cleanString(input.domain ?? existing.domain, 253).toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!domain && email.includes('@')) domain = email.split('@')[1];
  let name = cleanString(input.name ?? existing.name, 140);
  const firstName = cleanString(input.firstName, 80);
  const lastName = cleanString(input.lastName, 80);
  if (!name && (firstName || lastName)) name = [firstName, lastName].filter(Boolean).join(' ');
  if (!name && email) name = titleCaseName(email.split('@')[0]);
  if (!name && input.phone) name = 'Contact ' + String(input.phone).replace(/\D/g, '').slice(-4);
  let company = cleanString(input.company ?? existing.company, 160);
  if (!company && domain) company = titleCaseName(domain.split('.')[0]);
  const c = {
    id: sanitizeId(input.id || existing.id) || createId('c'),
    name,
    title: cleanString(input.title ?? existing.title, 160),
    company,
    domain,
    industry: cleanString(input.industry ?? existing.industry, 120),
    location: cleanString(input.location ?? existing.location, 160),
    employees: cleanString(input.employees ?? existing.employees, 60),
    email,
    phone: cleanString(input.phone ?? existing.phone, 50),
    confidence: cleanInt(input.confidence ?? existing.confidence, 0, 100, 80),
    source: cleanString(input.source ?? existing.source, 240),
    verified: cleanString(input.verified ?? existing.verified ?? today(), 10)
  };
  if (!c.name && !c.email && !c.phone) throw new HttpError(400, 'Row needs at least a name, email, or phone.');
  if (c.email && !validEmail(c.email)) throw new HttpError(400, 'Invalid email: ' + c.email);
  if (c.verified && !/^\d{4}-\d{2}-\d{2}$/.test(c.verified)) c.verified = today();
  return c;
}

function parseCsv(input) {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (quoted) throw new HttpError(400, 'CSV contains an unclosed quoted field.');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}
function parseDelimitedCsv(input, delimiter) {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (quoted) throw new HttpError(400, 'CSV contains an unclosed quoted field.');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}
function canonicalHeader(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    id: 'id', name: 'name', fullname: 'name', person: 'name', contactname: 'name',
    firstname: 'firstName', givenname: 'firstName', lastname: 'lastName', surname: 'lastName', familyname: 'lastName',
    title: 'title', jobtitle: 'title', role: 'title', position: 'title',
    company: 'company', companyname: 'company', organization: 'company', organisation: 'company', employer: 'company',
    domain: 'domain', website: 'domain', companydomain: 'domain',
    industry: 'industry', location: 'location', city: 'location', country: 'location',
    employees: 'employees', companysize: 'employees', size: 'employees', headcount: 'employees',
    email: 'email', workemail: 'email', businessemail: 'email', emailaddress: 'email',
    phone: 'phone', mobile: 'phone', phonenumber: 'phone', directphone: 'phone', workphone: 'phone',
    confidence: 'confidence', score: 'confidence', source: 'source', datasource: 'source',
    verified: 'verified', verifieddate: 'verified', lastverified: 'verified', lastverifieddate: 'verified'
  };
  return aliases[key] || null;
}
function detectCsvDelimiter(text) {
  const header = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find(Boolean) || '';
  const candidates = [',',';','\t','|'];
  let best = ',', score = -1;
  for (const delimiter of candidates) {
    let count = 0, quoted = false;
    for (let i = 0; i < header.length; i++) {
      const ch = header[i];
      if (ch === '"' && header[i + 1] === '"') { i++; continue; }
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === delimiter) count++;
    }
    if (count > score) { score = count; best = delimiter; }
  }
  return best;
}
function contactsFromCsv(csv) {
  const raw = String(csv || '').replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(raw);
  const rows = delimiter === ',' ? parseCsv(raw) : parseDelimitedCsv(raw, delimiter);
  if (rows.length < 2) throw new HttpError(400, 'CSV must include a header row and at least one contact.');
  if (rows.length > 10001) throw new HttpError(413, 'CSV is limited to 10,000 contacts per import.');
  const headers = rows[0].map(canonicalHeader);
  if (!headers.some(Boolean)) throw new HttpError(400, 'CSV headers were not recognized. Use names, email, phone, company, title, or similar fields.');
  const contacts = [], errors = [];
  rows.slice(1).forEach((values, index) => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = values[i] ?? ''; });
    try {
      contacts.push(validateContact(obj));
    } catch (err) {
      errors.push({ row: index + 2, error: err.message });
    }
  });
  return { contacts, errors };
}
function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function contactsToCsv(contacts) {
  const keys = ['id','name','title','company','domain','industry','location','employees','email','phone','confidence','source','verified'];
  return [keys.join(','), ...contacts.map(c => keys.map(k => csvEscape(c[k])).join(','))].join('\n');
}

async function ensureAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return;
  if (!validEmail(email)) throw new Error('ADMIN_EMAIL is invalid.');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  await mutateDb(db => {
    let user = db.users.find(u => u.email === email);
    if (!user) {
      user = { id: createId('u'), name: cleanString(process.env.ADMIN_NAME || 'Administrator', 120), email, passwordHash: hashPassword(password), role: 'admin', planId: 'business', credits: 0, createdAt: new Date().toISOString() };
      db.users.push(user);
    } else {
      user.role = 'admin';
      if (String(process.env.ADMIN_RESET_PASSWORD || '').toLowerCase() === 'true') user.passwordHash = hashPassword(password);
    }
  });
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sessionHash(token);
  await mutateDb(db => {
    db.sessions = db.sessions.filter(s => Number(s.expiresAt) > Date.now() && s.userId !== userId);
    db.sessions.push({ tokenHash, userId, expiresAt: Date.now() + 30 * 24 * 60 * 60_000, createdAt: new Date().toISOString() });
  });
  return token;
}

async function api(req, res, url) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (!rateLimit(ip, 'global', 300, 60_000)) throw new HttpError(429, 'Too many requests. Try again shortly.');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && url.pathname !== '/api/billing/stripe-webhook' && !sameOriginAllowed(req)) throw new HttpError(403, 'Cross-site request blocked.');

  let db = readDb();
  const auth = getAuth(req, db);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, storage: USE_SUPABASE ? 'supabase' : 'local-json', uptimeSeconds: Math.round(process.uptime()), version: 2 });
  }

  if (req.method === 'GET' && url.pathname === '/api/meta') {
    const industries = [...new Set(db.contacts.map(c => c.industry).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    const sizes = [...new Set(db.contacts.map(c => c.employees).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    return json(res, 200, {
      siteName: db.settings.siteName,
      tagline: db.settings.tagline,
      signupCredits: db.settings.signupCredits,
      emailRevealCost: db.settings.emailRevealCost,
      phoneRevealCost: db.settings.phoneRevealCost,
      social: db.settings.social || { linkedin: '', facebook: '', instagram: '' },
      industries,
      sizes
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/plans') {
    return json(res, 200, { plans: db.settings.plans, demoBilling: DEMO_BILLING });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    return json(res, 200, { user: auth ? publicUser(auth.user) : null });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
    if (!rateLimit(ip, 'signup', 10, 60 * 60_000)) throw new HttpError(429, 'Too many signup attempts.');
    const body = await readJson(req);
    const name = cleanString(body.name, 120);
    const email = cleanString(body.email, 320).toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2) throw new HttpError(400, 'Enter your name.');
    if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 10 || password.length > 200) throw new HttpError(400, 'Password must be 10–200 characters.');
    if (!RESEND_API_KEY || !EMAIL_FROM) throw new HttpError(503, 'Email verification is required. Connect Resend and configure RESEND_API_KEY and EMAIL_FROM first.');
    const token = crypto.randomBytes(32).toString('hex');
    let created;
    await mutateDb(live => {
      if (live.users.some(u => u.email === email)) throw new HttpError(409, 'An account already exists for this email.');
      created = { id: createId('u'), name, email, passwordHash: hashPassword(password), role: 'user', planId: 'free', credits: 0, emailVerified: false, verificationTokenHash: hashToken(token), verificationExpiresAt: Date.now() + EMAIL_TOKEN_TTL_MS, billingStatus: 'free', createdAt: new Date().toISOString() };
      live.users.push(created);
    });
    try { await sendVerificationEmail(created, token); } catch (err) { console.error('Verification email failed:', err.message); throw new HttpError(503, 'Your account was created, but the verification email could not be sent. Request a new verification email after email service is configured.'); }
    return json(res, 201, { requiresVerification: true, message: 'Account created. Check your email and verify your address before signing in.' });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/verify-email') {
    const token = cleanString(url.searchParams.get('token'), 200);
    if (!token) throw new HttpError(400, 'Verification token is missing.');
    let verifiedUser;
    await mutateDb(live => {
      const tokenHash = hashToken(token);
      const user = live.users.find(u => u.verificationTokenHash === tokenHash && Number(u.verificationExpiresAt) > Date.now());
      if (!user) throw new HttpError(400, 'This verification link is invalid or expired.');
      user.emailVerified = true;
      delete user.verificationTokenHash;
      delete user.verificationExpiresAt;
      if (!live.creditLedger.some(x => x.userId === user.id && x.reason === 'free_signup')) {
        const credits = live.settings.signupCredits;
        user.credits = credits;
        live.creditLedger.push({ id: createId('txn'), userId: user.id, delta: credits, reason: 'free_signup', at: new Date().toISOString() });
      }
      verifiedUser = user;
    });
    return text(res, 302, '', 'text/plain; charset=utf-8', { Location: APP_URL + '/?verified=success' });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/resend-verification') {
    if (!rateLimit(ip, 'resend-verification', 10, 60 * 60_000)) throw new HttpError(429, 'Too many verification requests.');
    const body = await readJson(req);
    const email = cleanString(body.email, 320).toLowerCase();
    const user = readDb().users.find(u => u.email === email);
    if (!user || user.emailVerified !== false) return json(res, 200, { ok: true, message: 'If that account exists and still needs verification, a new email has been sent.' });
    const token = crypto.randomBytes(32).toString('hex');
    await mutateDb(live => { const target = live.users.find(u => u.id === user.id); target.verificationTokenHash = hashToken(token); target.verificationExpiresAt = Date.now() + EMAIL_TOKEN_TTL_MS; });
    await sendVerificationEmail(user, token);
    return json(res, 200, { ok: true, message: 'A new verification email has been sent.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
    if (!rateLimit(ip, 'forgot-password', 10, 60 * 60_000)) throw new HttpError(429, 'Too many password reset requests.');
    const body = await readJson(req);
    const email = cleanString(body.email, 320).toLowerCase();
    const user = readDb().users.find(u => u.email === email);
    if (!user) return json(res, 200, { ok: true, message: 'If that account exists, reset instructions have been sent.' });
    const token = crypto.randomBytes(32).toString('hex');
    await mutateDb(live => { const target = live.users.find(u => u.id === user.id); target.resetTokenHash = hashToken(token); target.resetExpiresAt = Date.now() + PASSWORD_RESET_TTL_MS; });
    try { await sendPasswordResetEmail(user, token); } catch (err) { console.error('Password reset email failed:', err.message); }
    return json(res, 200, { ok: true, message: 'If that account exists, reset instructions have been sent.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const body = await readJson(req);
    const token = cleanString(body.token, 200);
    const password = String(body.password || '');
    if (!token) throw new HttpError(400, 'Reset token is missing.');
    if (password.length < 10 || password.length > 200) throw new HttpError(400, 'Password must be 10–200 characters.');
    let resetUser;
    await mutateDb(live => {
      const tokenHash = hashToken(token);
      const user = live.users.find(u => u.resetTokenHash === tokenHash && Number(u.resetExpiresAt) > Date.now());
      if (!user) throw new HttpError(400, 'This password reset link is invalid or expired.');
      user.passwordHash = hashPassword(password);
      user.emailVerified = true;
      delete user.resetTokenHash;
      delete user.resetExpiresAt;
      live.sessions = live.sessions.filter(s => s.userId !== user.id);
      resetUser = user;
    });
    const sessionToken = await createSession(resetUser.id);
    setSessionCookie(res, sessionToken);
    return json(res, 200, { user: publicUser(readDb().users.find(u => u.id === resetUser.id)), message: 'Password reset successfully.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    if (!rateLimit(ip, 'login', 30, 10 * 60_000)) throw new HttpError(429, 'Too many login attempts.');
    const body = await readJson(req);
    const email = cleanString(body.email, 320).toLowerCase();
    const password = String(body.password || '');
    const user = readDb().users.find(u => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) throw new HttpError(401, 'Invalid email or password.');
    if (user.emailVerified === false) throw new HttpError(403, 'Please verify your email before signing in.', { needsVerification: true });
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    return json(res, 200, { user: publicUser(readDb().users.find(u => u.id === user.id)) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(req).session;
    if (token) {
      const hash = sessionHash(token);
      await mutateDb(live => { live.sessions = live.sessions.filter(s => s.tokenHash !== hash && s.token !== token); });
    }
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/contacts') {
    db = readDb();
    const liveAuth = getAuth(req, db);
    const q = cleanString(url.searchParams.get('q'), 160).toLowerCase();
    const industry = cleanString(url.searchParams.get('industry'), 120).toLowerCase();
    const size = cleanString(url.searchParams.get('size'), 60).toLowerCase();
    const filtered = db.contacts.filter(c => {
      const hay = [c.name, c.title, c.company, c.domain, c.industry, c.location].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!industry || String(c.industry).toLowerCase() === industry) && (!size || String(c.employees).toLowerCase() === size);
    }).slice(0, 250);
    return json(res, 200, { contacts: filtered.map(c => contactDto(c, db, liveAuth?.user.id || null)), total: filtered.length });
  }

  const revealMatch = url.pathname.match(/^\/api\/contacts\/([^/]+)\/reveal$/);
  if (req.method === 'POST' && revealMatch) {
    const liveDb = readDb();
    const liveAuth = requireAuth(req, liveDb);
    if (!rateLimit(ip, `reveal:${liveAuth.user.id}`, 80, 60_000)) throw new HttpError(429, 'Reveal rate limit reached.');
    const body = await readJson(req);
    const type = body.type === 'phone' ? 'phone' : body.type === 'email' ? 'email' : null;
    if (!type) throw new HttpError(400, 'Reveal type must be email or phone.');
    let result;
    await mutateDb(live => {
      const user = live.users.find(u => u.id === liveAuth.user.id);
      const contact = live.contacts.find(c => c.id === revealMatch[1]);
      if (!contact) throw new HttpError(404, 'Contact not found.');
      if (!contact[type]) throw new HttpError(404, `${type === 'email' ? 'Email' : 'Phone'} is not available for this contact.`);
      const cost = type === 'phone' ? live.settings.phoneRevealCost : live.settings.emailRevealCost;
      const already = hasReveal(live, user.id, contact.id, type);
      if (!already) {
        if (Number(user.credits) < cost) throw new HttpError(402, 'Not enough credits.', { required: cost, credits: user.credits });
        user.credits = Number(user.credits) - cost;
        live.reveals.push({ id: createId('rev'), userId: user.id, contactId: contact.id, type, value: contact[type], cost, at: new Date().toISOString() });
        live.creditLedger.push({ id: createId('txn'), userId: user.id, delta: -cost, reason: `${type}_reveal`, contactId: contact.id, at: new Date().toISOString() });
      }
      result = { value: contact[type], type, credits: user.credits, alreadyRevealed: already, cost };
    });
    return json(res, 200, result);
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    db = readDb();
    const liveAuth = requireAuth(req, db);
    const rows = db.reveals.filter(r => r.userId === liveAuth.user.id).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200).map(r => {
      const c = db.contacts.find(x => x.id === r.contactId);
      return { ...r, contact: c ? { id: c.id, name: c.name, title: c.title, company: c.company, value: r.value || c[r.type] || '' } : { id: r.contactId, name: 'Deleted contact', title: '', company: '', value: r.value || '' } };
    });
    return json(res, 200, { reveals: rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/checkout') {
    db = readDb();
    const liveAuth = requireAuth(req, db);
    if (liveAuth.user.emailVerified === false) throw new HttpError(403, 'Verify your email before purchasing credits.');
    const body = await readJson(req);
    const plan = findPlan(db, body.planId);
    if (!plan || plan.id === 'free') throw new HttpError(400, 'Choose a paid plan.');
    if (DEMO_BILLING) throw new HttpError(503, 'Demo billing is disabled for customer accounts. Configure Stripe to accept real payments.');
    const secret = process.env.STRIPE_SECRET_KEY;
    const price = stripePriceFor(plan.id);
    if (!secret || !price) throw new HttpError(503, 'Stripe is not configured for this plan.');
    if (liveAuth.user.stripeSubscriptionId && ['active','trialing','past_due','incomplete'].includes(liveAuth.user.billingStatus || 'active')) throw new HttpError(409, 'You already have a billing subscription. Use Manage billing to change payment details or your plan.');
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', APP_URL + '/?billing=success');
    params.set('cancel_url', APP_URL + '/?billing=cancelled');
    params.set('customer_email', liveAuth.user.email);
    params.set('client_reference_id', liveAuth.user.id);
    params.set('line_items[0][price]', price);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[userId]', liveAuth.user.id);
    params.set('metadata[planId]', plan.id);
    params.set('subscription_data[metadata][userId]', liveAuth.user.id);
    params.set('subscription_data[metadata][planId]', plan.id);
    params.set('payment_intent_data[metadata][userId]', liveAuth.user.id);
    params.set('payment_intent_data[metadata][planId]', plan.id);
    params.set('adaptive_pricing[enabled]', 'true');
    params.set('billing_address_collection', 'auto');
    params.set('locale', 'auto');
    params.set('allow_promotion_codes', 'true');
    const stripeData = await stripeRequest(secret, 'POST', 'checkout/sessions', params);
    await mutateDb(live => {
      const user = live.users.find(u => u.id === liveAuth.user.id);
      live.payments.push({ id: createId('pay'), eventId: '', userId: user.id, planId: plan.id, planName: plan.name, status: 'pending', stripeSessionId: stripeData.id, amount: plan.price, currency: 'usd', at: new Date().toISOString() });
    });
    return json(res, 200, { url: stripeData.url, sessionId: stripeData.id });
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/portal') {
    db = readDb();
    const liveAuth = requireAuth(req, db);
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new HttpError(503, 'Stripe is not configured.');
    if (!liveAuth.user.stripeCustomerId) throw new HttpError(400, 'No Stripe billing profile exists yet.');
    const params = new URLSearchParams();
    params.set('customer', liveAuth.user.stripeCustomerId);
    params.set('return_url', APP_URL);
    params.set('locale', 'auto');
    const portal = await stripeRequest(secret, 'POST', 'billing_portal/sessions', params);
    return json(res, 200, { url: portal.url });
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/stripe-webhook') {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, 'Webhook secret is not configured.');
    const raw = await readBody(req, 2_000_000);
    const sig = String(req.headers['stripe-signature'] || '');
    const pairs = sig.split(',').map(p => p.split('=').map(s => s.trim())).filter(x => x.length === 2);
    const timestamp = pairs.find(([k]) => k === 't')?.[1];
    const signatures = pairs.filter(([k]) => k === 'v1').map(([,v]) => v);
    if (!timestamp || !signatures.length) throw new HttpError(400, 'Invalid Stripe signature.');
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new HttpError(400, 'Stale Stripe signature.');
    const expected = crypto.createHmac('sha256', secret).update(timestamp + '.' + raw.toString('utf8')).digest('hex');
    if (!signatures.some(v => timingSafeHex(expected, v))) throw new HttpError(400, 'Signature verification failed.');
    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid Stripe event JSON.'); }
    const object = event.data?.object || {};

    if (event.type === 'checkout.session.completed') {
      const metadata = object.metadata || {};
      await mutateDb(live => {
        const user = live.users.find(u => u.id === metadata.userId);
        if (user) {
          user.stripeCustomerId = object.customer || user.stripeCustomerId;
          user.stripeSubscriptionId = object.subscription || user.stripeSubscriptionId;
          user.billingStatus = object.payment_status === 'paid' ? 'active' : 'pending';
          const payment = live.payments.find(p => p.stripeSessionId === object.id);
          if (payment) { payment.status = object.payment_status === 'paid' ? 'paid' : 'pending'; payment.eventId = event.id; payment.stripeCustomerId = object.customer || ''; payment.stripeSubscriptionId = object.subscription || ''; payment.updatedAt = new Date().toISOString(); }
        }
      });
    }

    if (event.type === 'invoice.paid') {
      const invoice = object;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      let metadata = invoice.metadata || {};
      if (subscriptionId && (!metadata.userId || !metadata.planId)) {
        try { const subscription = await stripeRequest(secret, 'GET', 'subscriptions/' + encodeURIComponent(subscriptionId)); metadata = { ...metadata, ...(subscription.metadata || {}) }; }
        catch (err) { console.error('Could not retrieve Stripe subscription metadata:', err.message); }
      }
      const userId = metadata.userId; const planId = metadata.planId;
      await mutateDb(live => {
        const user = live.users.find(u => u.id === userId);
        const plan = findPlan(live, planId);
        const marker = 'stripe_invoice_' + invoice.id;
        if (!user || !plan || plan.id === 'free' || live.creditLedger.some(x => x.reason === marker)) return;
        user.planId = plan.id; user.credits = Number(user.credits) + Number(plan.credits); user.billingStatus = 'active'; user.stripeSubscriptionId = subscriptionId || user.stripeSubscriptionId; user.stripeCustomerId = invoice.customer || user.stripeCustomerId;
        live.creditLedger.push({ id: createId('txn'), userId: user.id, delta: Number(plan.credits), reason: marker, planId: plan.id, at: new Date().toISOString() });
        const payment = live.payments.find(p => p.stripeSubscriptionId === subscriptionId && p.status !== 'paid');
        if (payment) { payment.status = 'paid'; payment.eventId = event.id; payment.invoiceId = invoice.id; payment.updatedAt = new Date().toISOString(); }
      });
      const user = readDb().users.find(u => u.id === userId);
      if (user && RESEND_API_KEY && EMAIL_FROM) {
        try { await sendEmail({ to: user.email, subject: 'ContactScope payment received', idempotencyKey: 'invoice-paid-' + invoice.id, html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Payment received</h2><p>Hello ' + emailHtmlEscape(user.name) + ',</p><p>Your ContactScope subscription payment was received and your credits were added.</p></div>' }); }
        catch (err) { console.error('Payment success email failed:', err.message); }
      }
    }

    if (event.type === 'invoice.payment_failed' || event.type === 'payment_intent.payment_failed' || event.type === 'checkout.session.async_payment_failed') {
      let metadata = object.metadata || {};
      let userId = metadata.userId; let planId = metadata.planId;
      const subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
      if (event.type === 'invoice.payment_failed' && subscriptionId && (!userId || !planId)) {
        try { const subscription = await stripeRequest(secret, 'GET', 'subscriptions/' + encodeURIComponent(subscriptionId)); metadata = { ...metadata, ...(subscription.metadata || {}) }; userId = metadata.userId; planId = metadata.planId; }
        catch (err) { console.error('Could not retrieve failed subscription metadata:', err.message); }
      }
      const reason = object.last_payment_error?.message || object.failure_message || object.billing_reason || object.status || 'Payment was declined or could not be completed.';
      let paymentRecord;
      await mutateDb(live => {
        const user = live.users.find(u => u.id === userId); const plan = findPlan(live, planId);
        if (user) user.billingStatus = 'payment_failed';
        paymentRecord = { id: createId('pay'), eventId: event.id, userId, planId, planName: plan?.name || planId || 'selected', status: 'failed', stripeSessionId: object.id || '', stripeSubscriptionId: subscriptionId || '', reason, at: new Date().toISOString() };
        if (!live.payments.some(p => p.eventId === event.id)) live.payments.push(paymentRecord);
      });
      const user = readDb().users.find(u => u.id === userId);
      if (user) await sendPaymentFailureEmail(user, paymentRecord, reason);
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = object; const metadata = subscription.metadata || {};
      await mutateDb(live => { const user = live.users.find(u => u.id === metadata.userId); if (user) { user.billingStatus = subscription.status || user.billingStatus; user.stripeSubscriptionId = subscription.id; user.stripeCustomerId = subscription.customer || user.stripeCustomerId; } });
    }
    if (event.type === 'customer.subscription.deleted') {
      const subscription = object; const metadata = subscription.metadata || {};
      await mutateDb(live => { const user = live.users.find(u => u.id === metadata.userId); if (user) { user.billingStatus = 'canceled'; user.stripeSubscriptionId = subscription.id; } });
    }
    return json(res, 200, { received: true });
  }

  // ---------- Admin API ----------
  if (url.pathname.startsWith('/api/admin/')) {
    db = readDb();
    const admin = requireAdmin(req, db);

    if (req.method === 'GET' && url.pathname === '/api/admin/stats') {
      const totalCredits = db.users.reduce((sum, u) => sum + Number(u.credits || 0), 0);
      const lastImport = [...db.imports].sort((a,b) => String(b.at).localeCompare(String(a.at)))[0] || null;
      return json(res, 200, { contacts: db.contacts.length, users: db.users.length, reveals: db.reveals.length, totalCredits, imports: db.imports.length, payments: db.payments.length, failedPayments: db.payments.filter(p => p.status === 'failed').length, lastImport, storage: USE_SUPABASE ? 'Supabase' : 'Local JSON', demoBilling: DEMO_BILLING });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/contacts') {
      const q = cleanString(url.searchParams.get('q'), 160).toLowerCase();
      const rows = db.contacts.filter(c => !q || [c.name,c.title,c.company,c.domain,c.email,c.phone,c.industry,c.location].join(' ').toLowerCase().includes(q)).slice(0, 1000);
      return json(res, 200, { contacts: rows, total: rows.length });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/contacts.csv') {
      const csv = contactsToCsv(db.contacts);
      return text(res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="contactscope-contacts.csv"', 'Cache-Control': 'no-store' });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/contacts') {
      const body = await readJson(req);
      const contact = validateContact(body);
      await mutateDb(live => {
        if (live.contacts.some(c => c.id === contact.id)) contact.id = createId('c');
        if (contact.email && live.contacts.some(c => c.email && c.email.toLowerCase() === contact.email.toLowerCase())) throw new HttpError(409, 'A contact with that email already exists.');
        live.contacts.unshift(contact);
      });
      return json(res, 201, { contact });
    }

    const contactAdminMatch = url.pathname.match(/^\/api\/admin\/contacts\/([^/]+)$/);
    if (contactAdminMatch && req.method === 'PUT') {
      const body = await readJson(req);
      let updated;
      await mutateDb(live => {
        const idx = live.contacts.findIndex(c => c.id === contactAdminMatch[1]);
        if (idx === -1) throw new HttpError(404, 'Contact not found.');
        updated = validateContact({ ...body, id: live.contacts[idx].id }, live.contacts[idx]);
        const duplicate = updated.email && live.contacts.some((c, i) => i !== idx && c.email && c.email.toLowerCase() === updated.email.toLowerCase());
        if (duplicate) throw new HttpError(409, 'Another contact already uses that email.');
        live.contacts[idx] = updated;
      });
      return json(res, 200, { contact: updated });
    }

    if (contactAdminMatch && req.method === 'DELETE') {
      await mutateDb(live => {
        const exists = live.contacts.some(c => c.id === contactAdminMatch[1]);
        if (!exists) throw new HttpError(404, 'Contact not found.');
        live.contacts = live.contacts.filter(c => c.id !== contactAdminMatch[1]);
      });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/import') {
      if (!rateLimit(ip, `admin-import:${admin.user.id}`, 20, 60 * 60_000)) throw new HttpError(429, 'Import rate limit reached.');
      const body = await readJson(req, 6_000_000);
      const mode = ['append','upsert','replace'].includes(body.mode) ? body.mode : 'upsert';
      const parsed = contactsFromCsv(body.csv);
      if (!parsed.contacts.length) throw new HttpError(400, 'No valid contacts found in CSV.', { rowErrors: parsed.errors.slice(0, 20) });
      let counts = { added: 0, updated: 0, skipped: parsed.errors.length };
      await mutateDb(live => {
        if (mode === 'replace') {
          const usedIds = new Set();
          live.contacts = parsed.contacts.map(c => {
            let id = sanitizeId(c.id) || createId('c');
            while (usedIds.has(id)) id = createId('c');
            usedIds.add(id);
            return { ...c, id };
          });
          counts.added = live.contacts.length;
        } else {
          for (const incoming of parsed.contacts) {
            const idx = mode === 'upsert' ? live.contacts.findIndex(c => (incoming.email && c.email && incoming.email.toLowerCase() === c.email.toLowerCase()) || (!incoming.email && c.name.toLowerCase() === incoming.name.toLowerCase() && c.company.toLowerCase() === incoming.company.toLowerCase())) : -1;
            if (idx >= 0) {
              live.contacts[idx] = { ...live.contacts[idx], ...incoming, id: live.contacts[idx].id };
              counts.updated += 1;
            } else {
              if (live.contacts.some(c => c.id === incoming.id)) incoming.id = createId('c');
              live.contacts.push(incoming);
              counts.added += 1;
            }
          }
        }
        live.imports.push({ id: createId('imp'), adminUserId: admin.user.id, mode, ...counts, totalRows: parsed.contacts.length + parsed.errors.length, at: new Date().toISOString() });
      });
      return json(res, 200, { ok: true, ...counts, rowErrors: parsed.errors.slice(0, 20), totalErrors: parsed.errors.length });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/payments') {
      const payments = db.payments.slice().sort((a,b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 500).map(p => ({ ...p, userEmail: db.users.find(u => u.id === p.userId)?.email || 'Unknown' }));
      return json(res, 200, { payments });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/users') {
      const users = db.users.map(u => ({ ...publicUser(u), revealCount: db.reveals.filter(r => r.userId === u.id).length })).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json(res, 200, { users });
    }

    const userCreditsMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits$/);
    if (userCreditsMatch && req.method === 'POST') {
      const body = await readJson(req);
      const delta = cleanInt(body.delta, -1000000, 1000000, NaN);
      if (!Number.isFinite(delta) || delta === 0) throw new HttpError(400, 'Credit adjustment must be a non-zero integer.');
      let userOut;
      await mutateDb(live => {
        const user = live.users.find(u => u.id === userCreditsMatch[1]);
        if (!user) throw new HttpError(404, 'User not found.');
        if (Number(user.credits) + delta < 0) throw new HttpError(400, 'Credit adjustment would make the balance negative.');
        user.credits = Number(user.credits) + delta;
        live.creditLedger.push({ id: createId('txn'), userId: user.id, delta, reason: cleanString(body.reason || 'admin_adjustment', 120), adminUserId: admin.user.id, at: new Date().toISOString() });
        userOut = publicUser(user);
      });
      return json(res, 200, { user: userOut });
    }

    const userPlanMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/plan$/);
    if (userPlanMatch && req.method === 'POST') {
      const body = await readJson(req);
      let userOut;
      await mutateDb(live => {
        const user = live.users.find(u => u.id === userPlanMatch[1]);
        if (!user) throw new HttpError(404, 'User not found.');
        const plan = findPlan(live, body.planId);
        if (!plan) throw new HttpError(400, 'Unknown plan.');
        user.planId = plan.id;
        userOut = publicUser(user);
      });
      return json(res, 200, { user: userOut });
    }

    const userRoleMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
    if (userRoleMatch && req.method === 'POST') {
      const body = await readJson(req);
      const role = body.role === 'admin' ? 'admin' : body.role === 'user' ? 'user' : null;
      if (!role) throw new HttpError(400, 'Role must be admin or user.');
      let userOut;
      await mutateDb(live => {
        const user = live.users.find(u => u.id === userRoleMatch[1]);
        if (!user) throw new HttpError(404, 'User not found.');
        if (user.id === admin.user.id && role !== 'admin') throw new HttpError(400, 'You cannot remove your own admin role.');
        user.role = role;
        userOut = publicUser(user);
      });
      return json(res, 200, { user: userOut });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/settings') {
      return json(res, 200, { settings: db.settings, demoBilling: DEMO_BILLING, storage: USE_SUPABASE ? 'supabase' : 'local-json' });
    }

    if (req.method === 'PUT' && url.pathname === '/api/admin/settings') {
      const body = await readJson(req);
      let settingsOut;
      await mutateDb(live => {
        live.settings.siteName = cleanString(body.siteName || live.settings.siteName, 80) || 'ContactScope';
        live.settings.tagline = cleanString(body.tagline || live.settings.tagline, 180);
        live.settings.signupCredits = cleanInt(body.signupCredits, 0, 100000, live.settings.signupCredits);
        live.settings.emailRevealCost = cleanInt(body.emailRevealCost, 0, 10000, live.settings.emailRevealCost);
        live.settings.phoneRevealCost = cleanInt(body.phoneRevealCost, 0, 10000, live.settings.phoneRevealCost);
        if (body.social && typeof body.social === 'object') live.settings.social = { linkedin: cleanString(body.social.linkedin, 500), facebook: cleanString(body.social.facebook, 500), instagram: cleanString(body.social.instagram, 500) };
        if (Array.isArray(body.plans)) {
          live.settings.plans = live.settings.plans.map(p => {
            const incoming = body.plans.find(x => x.id === p.id);
            if (!incoming) return p;
            return { ...p, price: cleanInt(incoming.price, 0, 1000000, p.price), credits: cleanInt(incoming.credits, 0, 10000000, p.credits) };
          });
        }
        const freePlan = live.settings.plans.find(p => p.id === 'free');
        if (freePlan) freePlan.credits = live.settings.signupCredits;
        for (const p of live.settings.plans) if (Array.isArray(p.features) && p.features.length) p.features[0] = `${Number(p.credits).toLocaleString()} reveal credits`;
        settingsOut = clone(live.settings);
      });
      return json(res, 200, { settings: settingsOut });
    }

    return json(res, 404, { error: 'Admin API route not found.' });
  }

  return json(res, 404, { error: 'API route not found.' });
}

function serveStatic(res, pathname) {
  let relative;
  if (pathname === '/') relative = 'index.html';
  else if (pathname === '/admin' || pathname === '/admin/') relative = 'admin.html';
  else relative = pathname.replace(/^\//, '');
  relative = path.normalize(relative).replace(/^\.\.(\/|\\|$)+/, '');
  const allowed = new Set(['index.html', 'admin.html', 'app.js', 'admin.js', 'static-demo.js', 'styles.css', 'admin.css', 'sample-contacts.csv']);
  if (!allowed.has(relative)) return text(res, 404, 'Not found');
  const file = path.join(PUBLIC, relative);
  if (!file.startsWith(PUBLIC)) return text(res, 403, 'Forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const index = path.join(PUBLIC, 'index.html');
    return text(res, 200, fs.readFileSync(index), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
  }
  const ext = path.extname(file).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8' };
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
  text(res, 200, fs.readFileSync(file), types[ext] || 'application/octet-stream', { 'Cache-Control': cache });
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, APP_URL);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err.status ? `${err.status} ${err.message}` : err);
    if (!res.headersSent) return json(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.', ...(err.extra || {}) });
    res.end();
  }
});

async function start() {
  await initStore();
  await ensureAdmin();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ContactScope running at ${APP_URL}`);
    console.log(`Storage: ${USE_SUPABASE ? 'Supabase' : `local JSON (${DATA_FILE})`}`);
    console.log(`Demo billing: ${DEMO_BILLING ? 'enabled' : 'disabled'}`);
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) console.warn('Admin bootstrap is disabled. Set ADMIN_EMAIL and ADMIN_PASSWORD to create an administrator.');
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
