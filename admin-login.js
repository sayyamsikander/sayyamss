const form=document.getElementById('adminLoginForm');
const email=document.getElementById('adminEmail');
const password=document.getElementById('adminPassword');
const error=document.getElementById('adminLoginError');
const button=document.getElementById('adminLoginButton');

function showError(message){ error.textContent=message; error.style.display='block'; }
async function api(url, options={}){
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const err=new Error(data.error||'Login failed.');err.status=res.status;throw err;}
  return data;
}
async function checkExistingAdmin(){
  try{
    const data=await api('/api/me',{headers:{Accept:'application/json'}});
    if(data.user?.role==='admin') location.replace('/admin');
  }catch{}
}
form.addEventListener('submit',async e=>{
  e.preventDefault();
  error.style.display='none';
  button.disabled=true;
  button.textContent='Signing in…';
  try{
    const data=await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:email.value.trim(),password:password.value})});
    if(data.user?.role!=='admin') throw new Error('Administrator access was not granted.');
    location.replace('/admin');
  }catch(err){
    showError(err.message);
  }finally{
    button.disabled=false;
    button.textContent='Sign in to admin';
  }
});
checkExistingAdmin();
