/* GitHub Pages compatibility: browser-only demo API. Production/Render uses server.js. */
(() => {
  const isPagesDemo = location.protocol === 'file:' || /(^|\.)github\.io$/i.test(location.hostname);
  if (!isPagesDemo) return;
  window.__CONTACTSCOPE_PAGES_DEMO__ = true;

  const isAdminPage = /\/admin(?:\.html)?\/?$/i.test(location.pathname);
  const STORAGE_KEY = 'contactscope-pages-v2';
  const USER_KEY = `${STORAGE_KEY}:user`;
  const ADMIN_KEY = `${STORAGE_KEY}:admin`;
  const ADMIN_PROFILE_KEY = `${STORAGE_KEY}:admin-profile`;
  const ADMIN_PASSWORD_KEY = `${STORAGE_KEY}:admin-password`;
  const DEFAULT_ADMIN = {id:'demo-admin',name:'Demo Administrator',email:'admin@contactscope.demo',role:'admin',planId:'business',credits:0,createdAt:new Date().toISOString()};
  const seedContacts = [
    ['c_1001','Maya Chen','VP of Growth','Northstar Labs','northstarlabs.example','SaaS','San Francisco, US','51–200','maya.chen@northstarlabs.example','+1 415 555 0142',97,'Company leadership page','2026-09-28'],
    ['c_1002','Owen Brooks','Head of Sales','OrbitIQ','orbitiq.example','Analytics','Austin, US','11–50','owen.brooks@orbitiq.example','+1 512 555 0188',94,'Public company directory','2026-09-26'],
    ['c_1003','Amina Rahman','Chief Marketing Officer','ClarityWorks','clarityworks.example','MarTech','London, UK','201–500','amina.rahman@clarityworks.example','+44 20 7946 0321',96,'Conference speaker profile','2026-10-01'],
    ['c_1004','Lucas Martin','Co-Founder & CEO','VertexCloud','vertexcloud.example','Cloud Infrastructure','Berlin, DE','51–200','lucas@vertexcloud.example','+49 30 5557 0194',92,'Public press release','2026-09-22'],
    ['c_1005','Sofia Alvarez','Director of Partnerships','BrightPath AI','brightpath.example','Artificial Intelligence','Madrid, ES','11–50','sofia.alvarez@brightpath.example','+34 91 555 0147',95,'Company team page','2026-09-30'],
    ['c_1006','Noah Wilson','VP Engineering','SignalNest','signalnest.example','Developer Tools','Toronto, CA','51–200','noah.wilson@signalnest.example','+1 416 555 0166',91,'Engineering blog author page','2026-09-19'],
    ['c_1007','Hana Suzuki','Revenue Operations Lead','KiteMetric','kitemetric.example','Revenue Intelligence','Tokyo, JP','11–50','hana.suzuki@kitemetric.example','+81 3 5550 0118',93,'Public event profile','2026-09-25'],
    ['c_1008','Daniel Okafor','Head of Business Development','LedgerPeak','ledgerpeak.example','Fintech','Lagos, NG','51–200','daniel.okafor@ledgerpeak.example','+234 1 555 0144',90,'Company newsroom','2026-09-21']
  ].map(([id,name,title,company,domain,industry,location,employees,email,phone,confidence,source,verified]) => ({id,name,title,company,domain,industry,location,employees,email,phone,confidence,source,verified}));

  const plans = [
    {id:'free',name:'Free',price:0,credits:15,features:['15 reveal credits','People & company search','Save reveal history','Community support']},
    {id:'starter',name:'Starter',price:39,credits:1000,features:['1,000 reveal credits','Email + phone reveals','CSV-ready contact history','Standard support']},
    {id:'growth',name:'Growth',price:99,credits:5000,popular:true,features:['5,000 reveal credits','Advanced search filters','Priority verification queue','Priority support']},
    {id:'business',name:'Business',price:249,credits:15000,features:['15,000 reveal credits','Team-ready architecture','Higher rate limits','API-ready access model']}
  ];

  const freshState = () => ({
    version: 2,
    contacts: seedContacts.map(c => ({...c})),
    users: [],
    reveals: [],
    imports: [],
    settings: {siteName:'ContactScope',tagline:'Verified B2B contact intelligence',signupCredits:15,emailRevealCost:1,phoneRevealCost:5,social:{linkedin:'',facebook:'',instagram:''},plans:plans.map(p => ({...p,features:[...p.features]}))}
  });

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.contacts) && saved.settings) {
        saved.users ||= [];
        saved.reveals ||= [];
        saved.imports ||= [];
        return saved;
      }
    } catch {}
    const initial = freshState();
    save(initial);
    return initial;
  }
  function save(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function currentUser(state) {
    const id = localStorage.getItem(USER_KEY);
    return state.users.find(user => user.id === id) || null;
  }
  function adminProfile() {
    try { const saved = JSON.parse(localStorage.getItem(ADMIN_PROFILE_KEY) || 'null'); return saved && saved.email ? {...DEFAULT_ADMIN, ...saved} : {...DEFAULT_ADMIN}; }
    catch { return {...DEFAULT_ADMIN}; }
  }
  function currentAdmin() {
    return localStorage.getItem(ADMIN_KEY) === '1' ? adminProfile() : null;
  }
  function publicUser(user) {
    if (!user) return null;
    const {password, ...safe} = user;
    return safe;
  }
  function emailMask(email) {
    const [local, domain=''] = String(email || '').split('@');
    return `${local ? local[0] : '•'}•••••@${domain}`;
  }
  function phoneMask(phone) {
    const value = String(phone || '');
    return value ? `${value.slice(0,3)} ••• •••• ${value.slice(-2)}` : '';
  }
  function contactView(contact, user, state) {
    const emailRevealed = Boolean(user && state.reveals.some(r => r.userId === user.id && r.contactId === contact.id && r.type === 'email'));
    const phoneRevealed = Boolean(user && state.reveals.some(r => r.userId === user.id && r.contactId === contact.id && r.type === 'phone'));
    return {...contact,linkedin:safeExternalUrl(contact.linkedin),facebook:safeExternalUrl(contact.facebook),instagram:safeExternalUrl(contact.instagram),importedAt:contact.importedAt||'',modifiedAt:contact.modifiedAt||'',email:{available:Boolean(contact.email),masked:emailMask(contact.email),revealed:emailRevealed ? contact.email : null,cost:state.settings.emailRevealCost},phone:{available:Boolean(contact.phone),masked:phoneMask(contact.phone),revealed:phoneRevealed ? contact.phone : null,cost:state.settings.phoneRevealCost}};
  }
  function json(data, status=200, headers={}) {
    return Promise.resolve(new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json', ...headers}}));
  }
  function error(message, status=400) { return json({error:message}, status); }
  function parseBody(options) {
    if (!options?.body) return {};
    if (typeof options.body === 'string') { try { return JSON.parse(options.body); } catch { return {}; } }
    return options.body;
  }
  function routeUrl(input) {
    const raw = typeof input === 'string' ? input : input.url;
    return new URL(raw, location.href);
  }
  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320; }
  function safeExternalUrl(value, max=500) { const s=String(value || '').trim().slice(0,max); if(!s) return ''; try { const u=new URL(s, location.href); return (u.protocol==='https:' || u.protocol==='http:') ? s : ''; } catch { return ''; } }
  function parseCsv(input, delimiter=',') { const text=String(input||'').replace(/^\uFEFF/,''); const rows=[]; let row=[],field='',quoted=false; for(let i=0;i<text.length;i++){const ch=text[i]; if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}else if(ch==='"')quoted=true;else if(ch===delimiter){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=ch;} if(quoted)throw new Error('CSV contains an unclosed quoted field.'); if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);} return rows.filter(r=>r.some(v=>String(v).trim()!=='')); }
  function canonicalCsvHeader(value) {
    const key=String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
    const aliases={id:'id',name:'name',fullname:'name',person:'name',contactname:'name',firstname:'firstName',givenname:'firstName',lastname:'lastName',surname:'lastName',title:'title',jobtitle:'title',role:'title',position:'title',company:'company',companyname:'company',organization:'company',organisation:'company',employer:'company',domain:'domain',website:'domain',companydomain:'domain',industry:'industry',location:'location',city:'location',country:'location',employees:'employees',companysize:'employees',size:'employees',headcount:'employees',email:'email',workemail:'email',businessemail:'email',emailaddress:'email',phone:'phone',mobile:'phone',phonenumber:'phone',directphone:'phone',workphone:'phone',confidence:'confidence',score:'confidence',source:'source',datasource:'source',verified:'verified',verifieddate:'verified',lastverified:'verified',linkedin:'linkedin',linkedinurl:'linkedin',linkedinprofile:'linkedin',facebook:'facebook',facebookurl:'facebook',facebookprofile:'facebook',instagram:'instagram',instagramurl:'instagram',instagramprofile:'instagram'};
    return aliases[key] || '';
  }
  const CSV_FIELDS=['id','name','firstName','lastName','title','company','domain','industry','location','employees','email','phone','confidence','source','verified','linkedin','facebook','instagram'];
  function detectCsvDelimiter(text) { const header=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).find(Boolean)||''; const candidates=[',',';','\t','|']; let best=',',score=-1; for(const delimiter of candidates){let count=0,quoted=false;for(let i=0;i<header.length;i++){const ch=header[i];if(ch==='"'&&header[i+1]==='"'){i++;continue;}if(ch==='"')quoted=!quoted;else if(!quoted&&ch===delimiter)count++;}if(count>score){score=count;best=delimiter;}}return best; }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options={}) => {
    const url = routeUrl(input);
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, options);
    const method = String(options.method || (typeof input === 'object' ? input.method : 'GET') || 'GET').toUpperCase();
    const body = parseBody(options);
    const state = load();
    const user = currentUser(state);
    const admin = currentAdmin();
    const actor = admin || user;
    const path = url.pathname;

    if (path === '/api/health' && method === 'GET') return json({ok:true,storage:'browser-demo',version:2});
    if (path === '/api/meta' && method === 'GET') return json({siteName:state.settings.siteName,tagline:state.settings.tagline,signupCredits:state.settings.signupCredits,emailRevealCost:state.settings.emailRevealCost,phoneRevealCost:state.settings.phoneRevealCost,social:state.settings.social || {},industries:[...new Set(state.contacts.map(c=>c.industry).filter(Boolean))].sort(),sizes:[...new Set(state.contacts.map(c=>c.employees).filter(Boolean))].sort()});
    if (path === '/api/plans' && method === 'GET') return json({plans:state.settings.plans,demoBilling:false});
    if (path === '/api/me' && method === 'GET') {
      const adminConsole = location.pathname.endsWith('admin.html') || location.pathname.endsWith('admin-login.html');
      return json({user:publicUser(adminConsole ? (admin || user) : (admin ? null : user))});
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ADMIN_KEY);
      return json({ok:true});
    }

    if (path === '/api/admin/login' && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const profile = adminProfile();
      const expectedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY) || 'DemoAdmin!2026';
      if (email !== profile.email || password !== expectedPassword) return error('Invalid administrator email or password.', 401);
      localStorage.removeItem(USER_KEY); localStorage.setItem(ADMIN_KEY, '1');
      return json({user:publicUser(profile)});
    }
    if (path === '/api/auth/signup' && method === 'POST') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (name.length < 2) return error('Enter your name.');
      if (!validEmail(email)) return error('Enter a valid email address.');
      if (password.length < 10 || password.length > 200) return error('Password must be 10–200 characters.');
      if (state.users.some(x => x.email === email)) return error('An account already exists for this email.', 409);
      const newUser = {id:`u_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name,email,password,role:'user',planId:'free',credits:state.settings.signupCredits,createdAt:new Date().toISOString()};
      state.users.push(newUser);
      save(state);
      localStorage.setItem(USER_KEY, newUser.id);
      localStorage.removeItem(ADMIN_KEY);
      return json({user:publicUser(newUser)}, 201);
    }
    if (path === '/api/auth/forgot-password' && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const target = state.users.find(u => u.email === email);
      if (!target) return json({ok:true,message:'If that account exists, reset instructions have been generated for this demo.'});
      const token = 'demo-reset-' + crypto.randomUUID();
      target.resetToken = token;
      target.resetExpiresAt = Date.now() + 30 * 60 * 1000;
      save(state);
      const resetUrl = new URL(location.href);
      resetUrl.search = '';
      resetUrl.searchParams.set('reset', token);
      return json({ok:true,message:'Demo reset link generated below. In production, this link is sent by email.',resetUrl:resetUrl.toString()});
    }

    if (path === '/api/auth/reset-password' && method === 'POST') {
      const token = String(body.token || '');
      const password = String(body.password || '');
      const passwordConfirm = String(body.passwordConfirm ?? body.confirmPassword ?? '');
      if (!token) return error('Reset token is missing.', 400);
      if (password.length < 10 || password.length > 200) return error('Password must be 10–200 characters.', 400);
      if (password !== passwordConfirm) return error('Passwords do not match.', 400);
      const target = state.users.find(u => u.resetToken === token && Number(u.resetExpiresAt) > Date.now());
      if (!target) return error('This password reset link is invalid or expired.', 400);
      target.password = password;
      target.emailVerified = true;
      delete target.resetToken;
      delete target.resetExpiresAt;
      if (localStorage.getItem(USER_KEY) === target.id) localStorage.removeItem(USER_KEY);
      save(state);
      return json({user:publicUser(target),message:'Password reset successfully. Please sign in with your new password.'});
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const found = state.users.find(x => x.email === email && x.password === password);
      if (!found) return error('Invalid email or password.', 401);
      localStorage.setItem(USER_KEY, found.id);
      localStorage.removeItem(ADMIN_KEY);
      return json({user:publicUser(found)});
    }

    if (path === '/api/contacts' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const industry = url.searchParams.get('industry') || '';
      const size = url.searchParams.get('size') || '';
      const page = Math.max(1, Number(url.searchParams.get('page') || 1)); const pageSize = [10,25,50].includes(Number(url.searchParams.get('pageSize'))) ? Number(url.searchParams.get('pageSize')) : 25;
      const filtered = state.contacts.filter(c => {
        const hay = [c.name,c.title,c.company,c.domain,c.industry,c.location,c.employees].join(' ').toLowerCase();
        return (!q || hay.includes(q)) && (!industry || c.industry === industry) && (!size || c.employees === size);
      });
      const total=filtered.length; const rows=filtered.slice((page-1)*pageSize,page*pageSize); return json({total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize)),contacts:rows.map(c => contactView(c, actor, state))});
    }

    const revealMatch = path.match(/^\/api\/contacts\/([^/]+)\/reveal$/);
    if (revealMatch && method === 'POST') {
      if (!user) return error('Please sign in.', 401);
      const contact = state.contacts.find(c => c.id === decodeURIComponent(revealMatch[1]));
      if (!contact) return error('Contact not found.', 404);
      const type = body.type === 'phone' ? 'phone' : body.type === 'email' ? 'email' : null;
      if (!type || !contact[type]) return error('Contact detail is not available.', 404);
      const existing = state.reveals.find(r => r.userId === user.id && r.contactId === contact.id && r.type === type);
      const cost = type === 'phone' ? state.settings.phoneRevealCost : state.settings.emailRevealCost;
      if (existing) return json({value:contact[type],credits:user.credits,cost,alreadyRevealed:true});
      if (Number(user.credits) < cost) return error('Not enough credits.', 402);
      user.credits -= cost;
      state.reveals.push({id:`r_${Date.now()}`,userId:user.id,contactId:contact.id,type,cost,at:new Date().toISOString()});
      save(state);
      return json({value:contact[type],credits:user.credits,cost,alreadyRevealed:false});
    }

    if (path === '/api/history' && method === 'GET') {
      if (!user) return error('Please sign in.', 401);
      return json({reveals:state.reveals.filter(r => r.userId === user.id).map(r => {
        const contact = state.contacts.find(c => c.id === r.contactId);
        return {...r,contact:contact ? {id:contact.id,name:contact.name,title:contact.title,company:contact.company,value:contact[r.type]} : {id:r.contactId,name:'Deleted contact',title:'',company:'',value:r.value || ''}};
      })});
    }

    if (path === '/api/billing/checkout' && method === 'POST') {
      if (!user) return error('Please sign in.', 401);
      return error('Real payments are disabled on the GitHub Pages demo. Deploy the server-backed app and configure Stripe.', 503);
      const plan = state.settings.plans.find(x => x.id === body.planId);
      if (!plan || plan.id === 'free') return error('Choose a paid plan.');
      user.planId = plan.id;
      user.credits = Number(user.credits || 0) + Number(plan.credits || 0);
      save(state);
      return json({demo:true,user:publicUser(user),message:`Demo upgrade complete: ${plan.name}.`});
    }

    if (!admin && path.startsWith('/api/admin/')) return error('Administrator access required.', 403);
    if (path === '/api/admin/stats' && method === 'GET') return json({contacts:state.contacts.length,users:state.users.length,reveals:state.reveals.length,payments:0,failedPayments:0,totalCredits:state.users.reduce((n,u)=>n+Number(u.credits||0),0),storage:'Browser demo',demoBilling:true,lastImport:state.imports.at(-1)||null});
    if (path === '/api/admin/payments' && method === 'GET') return json({payments:[]});
    if (path === '/api/admin/contacts' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase(); const page=Math.max(1,Number(url.searchParams.get('page')||1)); const pageSize=[10,25,50].includes(Number(url.searchParams.get('pageSize')))?Number(url.searchParams.get('pageSize')):25;
      const all=state.contacts.filter(c => !q || Object.values(c).join(' ').toLowerCase().includes(q)); const total=all.length; return json({contacts:all.slice((page-1)*pageSize,page*pageSize),total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize))});
    }
    if (path === '/api/admin/contacts' && method === 'POST') {
      const now=new Date().toISOString(); const contact = {...body,id:`c_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,linkedin:safeExternalUrl(body.linkedin),facebook:safeExternalUrl(body.facebook),instagram:safeExternalUrl(body.instagram),importedAt:body.importedAt||now,modifiedAt:now};
      state.contacts.push(contact); save(state); return json({contact}, 201);
    }
    const contactMatch = path.match(/^\/api\/admin\/contacts\/([^/]+)$/);
    if (contactMatch && method === 'PUT') {
      const id = decodeURIComponent(contactMatch[1]);
      const index = state.contacts.findIndex(c => c.id === id);
      if (index < 0) return error('Contact not found.',404);
      state.contacts[index] = {...state.contacts[index],...body,importedAt:state.contacts[index].importedAt||new Date().toISOString(),modifiedAt:new Date().toISOString()}; save(state); return json({contact:state.contacts[index]});
    }
    if (contactMatch && method === 'DELETE') {
      const id = decodeURIComponent(contactMatch[1]); state.contacts = state.contacts.filter(c => c.id !== id); save(state); return json({ok:true});
    }
    if (path === '/api/admin/users' && method === 'GET') return json({users:state.users.map(u=>({...publicUser(u),revealCount:state.reveals.filter(r=>r.userId===u.id).length}))});

    if (path === '/api/admin/users' && method === 'POST') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (name.length < 2) return error('Enter a name.');
      if (!validEmail(email)) return error('Enter a valid email address.');
      if (password.length < 10 || password.length > 200) return error('Password must be 10–200 characters.');
      if (state.users.some(x => x.email === email)) return error('An account already exists for this email.', 409);
      const plan = state.settings.plans.find(x => x.id === body.planId) || state.settings.plans[0];
      const newUser = {id:`u_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name,email,password,role:body.role === 'admin' ? 'admin' : 'user',planId:plan.id,credits:Math.max(0,Number(body.credits || 0)),emailVerified:true,createdAt:new Date().toISOString()};
      state.users.push(newUser);
      save(state);
      return json({user:publicUser(newUser)}, 201);
    }

    const userDeleteMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userDeleteMatch && method === 'DELETE') {
      const id = decodeURIComponent(userDeleteMatch[1]);
      const target = state.users.find(x => x.id === id);
      if (!target) return error('User not found.', 404);
      if (target.id === 'demo-admin') return error('You cannot delete the demo administrator.', 400);
      state.users = state.users.filter(x => x.id !== id);
      state.reveals = state.reveals.filter(r => r.userId !== id);
      save(state);
      return json({ok:true});
    }

    const userResetMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (userResetMatch && method === 'POST') {
      const id = decodeURIComponent(userResetMatch[1]);
      const target = state.users.find(x => x.id === id);
      if (!target) return error('User not found.', 404);
      const token = 'demo-reset-' + crypto.randomUUID();
      target.resetToken = token;
      target.resetExpiresAt = Date.now() + 30 * 60 * 1000;
      save(state);
      const resetUrl = new URL('index.html', location.href);
      resetUrl.search = '';
      resetUrl.searchParams.set('reset', token);
      return json({
        ok: true,
        message: 'Demo reset link generated for ' + target.email + '.',
        resetUrl: resetUrl.toString()
      });
    }

    const userPasswordMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
    if (userPasswordMatch && method === 'POST') {
      const target = state.users.find(x => x.id === decodeURIComponent(userPasswordMatch[1]));
      if (!target) return error('User not found.',404);
      const password = String(body.password || '');
      if (password.length < 10 || password.length > 200) return error('Password must be 10–200 characters.');
      target.password = password;
      delete target.resetToken;
      delete target.resetExpiresAt;
      if (localStorage.getItem(USER_KEY) === target.id) localStorage.removeItem(USER_KEY);
      save(state);
      return json({user:publicUser(target),message:'User password changed successfully.'});
    }

    const userMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/(plan|role|credits)$/);
    if (userMatch && method === 'POST') {
      const target = state.users.find(x => x.id === decodeURIComponent(userMatch[1]));
      if (!target) return error('User not found.',404);
      if (userMatch[2] === 'plan') target.planId = body.planId;
      else if (userMatch[2] === 'role') target.role = body.role === 'admin' ? 'admin' : 'user';
      else target.credits = Math.max(0,Number(target.credits||0)+Number(body.delta||0));
      save(state); return json({user:publicUser(target)});
    }
    if (path === '/api/admin/settings' && method === 'GET') return json({settings:state.settings,storage:'Browser demo',demoBilling:true});
    if (path === '/api/admin/settings' && method === 'PUT') {
      state.settings = {...state.settings,...body,social:{linkedin:safeExternalUrl(body.social?.linkedin),facebook:safeExternalUrl(body.social?.facebook),instagram:safeExternalUrl(body.social?.instagram)},plans:state.settings.plans.map(p => ({...p,...((body.plans || []).find(x=>x.id===p.id)||{})}))};
      save(state); return json({settings:state.settings});
    }
    if (path === '/api/admin/account' && method === 'POST') {
      const profile = adminProfile();
      const currentPassword = String(body.currentPassword || '');
      const newEmail = String(body.email || '').trim().toLowerCase();
      const newPassword = String(body.newPassword || '');
      const expectedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY) || 'DemoAdmin!2026';
      if (currentPassword !== expectedPassword) return error('Current administrator password is incorrect.', 401);
      if (!validEmail(newEmail)) return error('Enter a valid administrator email address.');
      if (newPassword && (newPassword.length < 10 || newPassword.length > 200)) return error('New administrator password must be 10–200 characters.');
      profile.email = newEmail; localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(profile));
      if (newPassword) localStorage.setItem(ADMIN_PASSWORD_KEY, newPassword);
      return json({user:publicUser(profile),message:'Administrator account updated. Use the new credentials next time you sign in.'});
    }

    if (path === '/api/admin/import/preview' && method === 'POST') {
      const rawCsv=String(body.csv||''); const delimiter=detectCsvDelimiter(rawCsv); const rows=parseCsv(rawCsv,delimiter);
      if(rows.length<2) return error('CSV must include a header row and at least one contact.');
      const headers=rows[0].map(v=>String(v||'').trim());
      const sample=rows.slice(1,6).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
      const suggestedMapping=Object.fromEntries(headers.map(h=>[h,canonicalCsvHeader(h)]));
      return json({headers,sample,suggestedMapping,fields:CSV_FIELDS,delimiter:delimiter==='\t'?'tab':delimiter});
    }

    if (path === '/api/admin/import' && method === 'POST') {
      const rawCsv = String(body.csv || ''); const delimiter = detectCsvDelimiter(rawCsv); const rows = parseCsv(rawCsv, delimiter);
      if (rows.length < 2) return error('CSV must include a header row and at least one contact.');
      const sourceHeaders = rows[0].map(x => String(x).trim());
      const headers = sourceHeaders.map(h => Object.prototype.hasOwnProperty.call(body.mapping || {}, h) ? body.mapping[h] : canonicalCsvHeader(h));
      let added=0,updated=0,skipped=0; const rowErrors=[];
      if (body.mode === 'replace') state.contacts = [];
      rows.slice(1).forEach((values,rowIndex) => {
        const contact={}; headers.forEach((header,i)=>{if(header) contact[header]=values[i] || '';});
        if (!contact.name && (contact.firstName || contact.lastName)) contact.name=[contact.firstName,contact.lastName].filter(Boolean).join(' ');
        if (!contact.name && contact.email) contact.name=contact.email.split('@')[0];
        if (!contact.company && contact.domain) contact.company=String(contact.domain).split('.')[0];
        if (!contact.name || (!contact.company && !contact.email && !contact.phone)) { skipped++; rowErrors.push({row:rowIndex+2,error:'Row needs a name plus company, email, or phone.'}); return; }
        contact.linkedin=safeExternalUrl(contact.linkedin); contact.facebook=safeExternalUrl(contact.facebook); contact.instagram=safeExternalUrl(contact.instagram);
        contact.id=contact.id || `c_${Date.now()}_${rowIndex}_${Math.random().toString(36).slice(2,6)}`;
        const index=state.contacts.findIndex(x=>x.id===contact.id || (contact.email && x.email===contact.email));
        if(index>=0 && body.mode !== 'append'){state.contacts[index]={...state.contacts[index],...contact,modifiedAt:new Date().toISOString()};updated++;}
        else {if(index>=0) contact.id=`c_${Date.now()}_${rowIndex}_${Math.random().toString(36).slice(2,6)}`;contact.confidence=Number(contact.confidence||90);contact.verified=contact.verified||new Date().toISOString().slice(0,10);contact.importedAt=new Date().toISOString();contact.modifiedAt=contact.importedAt;state.contacts.push(contact);added++;}
      });
      const summary={at:new Date().toISOString(),mode:body.mode||'upsert',added,updated,skipped,totalErrors:rowErrors.length,rowErrors};
      state.imports.push(summary); save(state); return json(summary);
    }
if (path === '/api/admin/contacts.csv' && method === 'GET') {
      const keys=['id','name','title','company','domain','industry','location','employees','email','phone','confidence','source','verified'];
      const csv=[keys.join(','),...state.contacts.map(c=>keys.map(k=>String(c[k] ?? '').replace(/"/g,'""')).map(v=>`"${v}"`).join(','))].join('\n');
      return json({csv});
    }
    return error('Demo API route unavailable.',404);
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('#downloadCsv');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const response = await window.fetch('/api/admin/contacts.csv');
      const data = await response.json();
      const blob = new Blob([data.csv], {type:'text/csv;charset=utf-8'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'contactscope-contacts.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {}
  }, true);
})();