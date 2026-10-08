const form=document.getElementById('adminLoginForm');
const email=document.getElementById('adminEmail');
const password=document.getElementById('adminPassword');
const error=document.getElementById('adminLoginError');
const button=document.getElementById('adminLoginButton');

function showError(message){ error.textContent=message; error.style.display='block'; }
async function api(url, options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try {
  const res=await fetch(url,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},signal:controller.signal});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const err=new Error(data.error||'Login failed.');err.status=res.status;throw err;}
  return data;
  }catch(err){
    if(err.name==='AbortError') throw new Error('Admin login request timed out. Please refresh and try again.');
    if(err instanceof TypeError) throw new Error('Unable to connect to the admin API. Check your connection or deployment.');
    throw err;
  }finally{clearTimeout(timer);}
}
async function ensurePagesDemo(){
  if(!/github\.io$/i.test(location.hostname)) return;
  if(window.__CONTACTSCOPE_PAGES_DEMO__) return;
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='static-demo.js?v=20261020-'+Date.now();
    let settled=false;
    const finish=(err)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve();};
    script.onload=()=>window.__CONTACTSCOPE_PAGES_DEMO__?finish():finish(new Error('GitHub Pages demo API did not initialize.'));
    script.onerror=()=>finish(new Error('GitHub Pages demo API failed to load.'));
    document.head.appendChild(script);
    const timer=setTimeout(()=>finish(new Error('GitHub Pages demo API load timed out.')),5000);
  });
}
async function checkExistingAdmin(){
  try{
    await ensurePagesDemo();
    const data=await api('/api/me',{headers:{Accept:'application/json'}});
    if(data.user?.role==='admin') location.replace('admin.html');
  }catch(err){
    showError(err.message);
  }
}
form.addEventListener('submit',async e=>{
  e.preventDefault();
  error.style.display='none';
  button.disabled=true;
  button.textContent='Signing in…';
  try{
    const data=await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:email.value.trim(),password:password.value})});
    if(data.user?.role!=='admin') throw new Error('Administrator access was not granted.');
    location.replace('admin.html');
  }catch(err){
    showError(err.message);
  }finally{
    button.disabled=false;
    button.textContent='Sign in to admin';
  }
});
checkExistingAdmin();
