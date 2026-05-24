const API={user:null,toko:null,settings:null};
const rp=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
function saveSession(user,toko){localStorage.setItem('tp_user',JSON.stringify(user));localStorage.setItem('tp_toko',JSON.stringify(toko||{}));}
function loadSession(){try{API.user=JSON.parse(localStorage.getItem('tp_user')||'null');API.toko=JSON.parse(localStorage.getItem('tp_toko')||'null')}catch{}}
function logout(){if(confirm('Apakah yakin ingin keluar?')){localStorage.clear();sessionStorage.clear();location.href='/'}}
async function api(url,opt={}){loadSession();const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json','x-user':API.user?.username||'',...(opt.headers||{})}});const j=await r.json().catch(()=>({ok:false,message:'Response error'}));if(!r.ok) throw new Error(j.message||'Response error');return j}
function show(id){qsa('.section').forEach(x=>x.classList.remove('active'));qs('#'+id)?.classList.add('active');qsa('[data-menu]').forEach(b=>b.classList.toggle('active',b.dataset.menu===id));}
function applyTheme(mode,color){document.body.className='theme-'+(mode||localStorage.getItem('tp_mode')||'eye')+' color-'+(color||localStorage.getItem('tp_color')||'blue');}
function setTheme(mode,color){localStorage.setItem('tp_mode',mode);localStorage.setItem('tp_color',color||localStorage.getItem('tp_color')||'blue');applyTheme(mode,color)}
function modal(html){let m=qs('#modal'); if(!m){m=document.createElement('div');m.id='modal';document.body.appendChild(m)}m.innerHTML=`<div class="modal-bg" onclick="closeModal()"></div><div class="modal-card">${html}</div>`;m.style.display='block'}
function closeModal(){const m=qs('#modal'); if(m)m.style.display='none'}
async function uploadFile(kind,input,cb){const f=input.files[0];if(!f)return;const fd=new FormData();fd.append('file',f);loadSession();const r=await fetch('/api/upload/'+kind,{method:'POST',headers:{'x-user':API.user?.username||''},body:fd});const j=await r.json();if(j.ok)cb(j.url);else alert('Upload gagal')}
function initBrand(){loadSession();if(qs('#brandName'))qs('#brandName').textContent=API.toko?.nama||'TECNO POS';if(qs('#brandRole'))qs('#brandRole').textContent=API.user?.role==='admin'?'Admin Toko':API.user?.role==='kasir'?'Kasir':'Developer';if(qs('#brandLogo')&&API.toko?.logo)qs('#brandLogo').src=API.toko.logo;applyTheme()}
