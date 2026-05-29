const API={user:JSON.parse(localStorage.getItem('tecno_user')||'null'),toko:JSON.parse(localStorage.getItem('tecno_toko')||'{}')};
const TECNO_API_BASE=(window.TECNO_API_BASE||localStorage.getItem('TECNO_API_BASE')||'').replace(/\/$/,'');
function apiUrl(path){return TECNO_API_BASE && String(path).startsWith('/api') ? TECNO_API_BASE+path : path;}
if(!API.user && !location.pathname.endsWith('/login.html') && location.pathname!=='/') location.replace('/');
const rp=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
function parseAppDate(v){
  if(!v) return new Date();
  if(v instanceof Date) return v;
  return new Date(String(v).trim().replace(' ','T'));
}
function formatDateID(v){
  if(!v) return '-';
  const s=String(v).trim();
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if(m){
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]||'00'} WIB`;
  }
  const d=parseAppDate(v);
  if(isNaN(d.getTime())) return String(v||'-');
  return d.toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(/\./g,':')+' WIB';
}
function prefKey(name){return API.user?.id?`tecno_${name}_${API.user.id}`:`tecno_${name}`;}
function getUserTheme(){return localStorage.getItem(prefKey('theme'))||localStorage.getItem('tecno_theme')||API.user?.mode_tema||API.toko?.mode_tema||'eye';}
function getUserAccent(){return localStorage.getItem(prefKey('accent'))||localStorage.getItem('tecno_accent')||API.user?.warna_tema||API.toko?.warna_tema||'blue';}
const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
const HYBRID_QUEUE_KEY='tecno_offline_checkout_queue_v1';
function trxDateCode(){
  const d=new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
function makeLocalInvoice(){
  const day=trxDateCode();
  const key='tecno_local_trx_seq_'+day;
  const next=(Number(localStorage.getItem(key)||'0')||0)+1;
  localStorage.setItem(key,String(next));
  return `TRX-${day}-${String(next).padStart(6,'0')}`;
}
function ensureInvoice(body){
  if(!body.invoice || String(body.invoice).startsWith('OFF-')) body.invoice=makeLocalInvoice();
  if(!body.offline_client_id) body.offline_client_id=body.invoice;
  return body.invoice;
}
function numClean(v){
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  let s=String(v??'').trim();
  if(!s) return 0;
  s=s.replace(/Rp/gi,'').replace(/\s/g,'');
  if(s.includes('.') && s.includes(',')) s=s.replace(/\./g,'').replace(',', '.');
  else if(s.includes('.')) s=s.replace(/\./g,'');
  else s=s.replace(',', '.');
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}
function hybridQueue(){try{return JSON.parse(localStorage.getItem(HYBRID_QUEUE_KEY)||'[]')}catch(e){return []}}
function saveHybridQueue(q){localStorage.setItem(HYBRID_QUEUE_KEY,JSON.stringify(q));updateHybridBadge()}
function makeOfflineReceipt(body){
  const subtotal=(body.items||[]).reduce((s,i)=>s+Number(i.harga||0)*Number(i.qty||0),0);
  const diskon=Number(body.diskon||0), pajak=Number(body.pajak||0), biaya=Number(body.biaya||0);
  const total=subtotal-diskon+pajak+biaya, bayar=Number(body.bayar||0), kembali=Math.max(0,bayar-total);
  const id=ensureInvoice(body);
  const tr={id:-Date.now(),invoice:id,customer:body.customer||'Umum',subtotal,diskon,pajak,biaya,total,bayar,kembali,metode:body.metode||'TUNAI',status:body.metode==='UTANG'?'UTANG':'LUNAS',created_at:body.client_time||new Date().toISOString(),kasir:API.user?.nama||'Kasir',offline_client_id:id};
  return {ok:true,offline:true,message:'Transaksi disimpan offline. Akan sync otomatis saat internet aktif.',transaction:tr,items:(body.items||[]).map((x,i)=>({id:i+1,transaction_id:tr.id,product_id:x.id||0,nama:x.nama,qty:x.qty,harga:x.harga,subtotal:Number(x.qty)*Number(x.harga)})),toko:API.toko||{nama_toko:'TECNO POS'}};
}
async function api(url,opt={}){
  opt.headers=Object.assign({'Content-Type':'application/json','x-user-id':API.user?.id||''},opt.headers||{});
  const originalBody=opt.body;
  if(opt.body&&typeof opt.body!=='string')opt.body=JSON.stringify(opt.body);
  try{
    const r=await fetch(apiUrl(url),opt);
    const text=await r.text();
    let j={};
    try{j=text?JSON.parse(text):{};}catch(e){j={ok:false,message:r.ok?'Response error':'Server tidak merespon JSON'};}
    if(j.code==='TOKO_NONAKTIF'){alert(j.message||'Toko nonaktif. Hubungi developer.');localStorage.removeItem('tecno_user');localStorage.removeItem('tecno_toko');location.replace('/');throw new Error(j.message)}
    if(!r.ok||j.ok===false){ const e=new Error(j.message||'Error'); e.serverError=true; e.status=r.status; throw e; }
    return j;
  }catch(err){
    const isCheckout = url==='/api/kasir/checkout' && (opt.method||'').toUpperCase()==='POST';
    const bolehOffline = isCheckout && !err.serverError && navigator.onLine===false;
    if(bolehOffline){
      const body=typeof originalBody==='string'?JSON.parse(originalBody||'{}'):(originalBody||{});
      ensureInvoice(body);
      const q=hybridQueue();
      const exists=q.some(x=>x.body && x.body.offline_client_id===body.offline_client_id);
      if(!exists) q.push({url,method:'POST',body,user_id:API.user?.id||'',created_at:new Date().toISOString(),status:'pending'});
      saveHybridQueue(q);
      toast('OFFLINE: transaksi tersimpan lokal, belum masuk server');
      return makeOfflineReceipt(body);
    }
    throw err;
  }
}

function enqueueCheckout(body){
  ensureInvoice(body);
  const q=hybridQueue();
  const exists=q.some(x=>x.body && x.body.offline_client_id===body.offline_client_id);
  if(!exists){q.push({url:'/api/kasir/checkout',method:'POST',body,user_id:API.user?.id||'',created_at:new Date().toISOString(),status:'pending'});saveHybridQueue(q);}
  return body.offline_client_id;
}
function syncOneCheckout(body){
  return fetch(apiUrl('/api/kasir/checkout'),{method:'POST',headers:{'Content-Type':'application/json','x-user-id':API.user?.id||''},body:JSON.stringify(body)})
    .then(r=>r.json()).then(j=>{if(!j.ok)throw new Error(j.message||'Sync gagal'); return j;})
    .then(()=>syncOfflineQueue()).catch(()=>{});
}

async function syncOfflineQueue(){
  if(!API.user) return;
  let q=hybridQueue();
  if(!q.length){updateHybridBadge();return;}
  if(!navigator.onLine){updateHybridBadge();return;}
  let changed=false;
  for(const item of q){
    if(item.status==='synced') continue;
    try{
      const r=await fetch(apiUrl(item.url),{method:item.method||'POST',headers:{'Content-Type':'application/json','x-user-id':item.user_id||API.user.id},body:JSON.stringify(item.body)});
      const j=await r.json().catch(()=>({ok:false,message:'Server tidak JSON'}));
      if(r.ok && j.ok){item.status='synced';item.synced_at=new Date().toISOString();try{markLocalSaleSynced(item.body?.offline_client_id)}catch(e){} changed=true;}
    }catch(e){}
  }
  const before=q.length;
  q=q.filter(x=>x.status!=='synced');
  if(changed){saveHybridQueue(q);toast(before-q.length+' transaksi offline berhasil sync ke online')}
  updateHybridBadge();
}
function updateHybridBadge(){
  let el=document.getElementById('hybridStatus');
  if(!el){el=document.createElement('div');el.id='hybridStatus';el.className='hybrid-status';document.body.appendChild(el)}
  const n=hybridQueue().filter(x=>x.status!=='synced').length;
  el.textContent=(navigator.onLine?'ONLINE':'OFFLINE')+(n?` • pending sync ${n}`:' • tersinkron');
  el.classList.toggle('offline',!navigator.onLine||n>0);
}
window.addEventListener('online',()=>{updateHybridBadge();syncOfflineQueue()});
window.addEventListener('offline',updateHybridBadge);
setInterval(syncOfflineQueue,30000);
document.addEventListener('DOMContentLoaded',()=>{
  updateHybridBadge();
  syncOfflineQueue();
  // Service worker dimatikan agar WebView/browser tidak memakai file lama dari cache.
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistrations?.().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
    caches?.keys?.().then(keys=>keys.forEach(k=>caches.delete(k))).catch(()=>{});
  }
});

function toast(t){let d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}

function applyTheme(){
  const theme=getUserTheme();
  document.documentElement.setAttribute('data-theme',theme);
  applyAccent();
}
function applyAccent(){
  const accent=getUserAccent();
  document.documentElement.setAttribute('data-accent',accent);
}
applyTheme();
function syncThemeInputs(){
  document.querySelectorAll('[data-user-theme]').forEach(el=>el.value=getUserTheme());
  document.querySelectorAll('[data-user-accent]').forEach(el=>el.value=getUserAccent());
}
function setTheme(theme){localStorage.setItem(prefKey('theme'),theme);document.documentElement.setAttribute('data-theme',theme);syncThemeInputs();toast('Mode tampilan akun ini: '+theme)}
function setAccent(accent){localStorage.setItem(prefKey('accent'),accent);document.documentElement.setAttribute('data-accent',accent);syncThemeInputs();toast('Warna akun ini: '+accent)}
function themePanelHTML(){return `<div class="card"><h3>Tampilan Akun Saya</h3><p class="side-sub">Warna/tema ini hanya untuk akun yang sedang login. Kasir, admin, dan developer bisa beda sendiri-sendiri.</p><form class="form"><label>Mode Tampilan<select data-user-theme onchange="setTheme(this.value)"><option value="eye">Mode Nyaman Mata</option><option value="light">Mode Terang</option><option value="dark">Mode Gelap</option></select></label><label>Warna Tema<select data-user-accent onchange="setAccent(this.value)"><option value="blue">Biru</option><option value="green">Hijau</option><option value="purple">Ungu</option><option value="orange">Orange</option><option value="black">Hitam</option></select></label></form><div class="theme-row"><button class="btn" onclick="setTheme('eye')">Nyaman</button><button class="btn" onclick="setTheme('light')">Terang</button><button class="btn" onclick="setTheme('dark')">Gelap</button></div><div class="theme-swatch"><button class="btn" onclick="setAccent('blue')">Biru</button><button class="btn" onclick="setAccent('green')">Hijau</button><button class="btn" onclick="setAccent('purple')">Ungu</button><button class="btn" onclick="setAccent('orange')">Orange</button><button class="btn" onclick="setAccent('black')">Hitam</button></div></div>`}
function renderThemePanels(){document.querySelectorAll('[data-theme-panel]').forEach(el=>el.innerHTML=themePanelHTML());syncThemeInputs();}
document.addEventListener('DOMContentLoaded',renderThemePanels);
function logout(){
  const m=modal(`<div class="modal-head"><b>Keluar dari akun?</b><button class="x" onclick="closeModal()">X</button></div><p>Apakah yakin ingin keluar?</p><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button class="btn" onclick="closeModal()">BATAL</button><button class="btn danger" onclick="confirmLogout()">LOGOUT</button></div>`);
  m.addEventListener('click',e=>{if(e.target===m)closeModal()});
}
function confirmLogout(){localStorage.removeItem('tecno_user');localStorage.removeItem('tecno_toko');localStorage.removeItem('tecno_locked');location.replace('/')}
function lockKasir(){
  if(!API.user) return;
  localStorage.setItem('tecno_locked','1');
  showLockScreen();
}
function showLockScreen(){
  if(!API.user || localStorage.getItem('tecno_locked')!=='1') return;
  let old=document.getElementById('lockScreen'); if(old) old.remove();
  const d=document.createElement('div'); d.id='lockScreen'; d.className='lock-screen';
  d.innerHTML=`<div class="lock-card"><div class="lock-icon">🔒</div><h2>${API.toko?.nama_toko||'TECNO POS'}</h2><p>Akun: <b>${API.user.nama}</b></p><input id="lockPin" inputmode="numeric" maxlength="6" placeholder="PIN kasir" autofocus><button class="btn primary" onclick="unlockKasir()">Buka Kunci</button><button class="btn" onclick="openSwitchKasir()">Ganti Kasir</button><button class="btn danger" onclick="confirmLogout()">Logout</button><p class="side-sub">Default PIN awal mengikuti password akun. Ubah PIN di Profil.</p><div id="lockMsg" class="error hidden"></div></div>`;
  document.body.appendChild(d);
  setTimeout(()=>document.getElementById('lockPin')?.focus(),80);
  document.getElementById('lockPin')?.addEventListener('keydown',e=>{if(e.key==='Enter')unlockKasir()});
}
async function unlockKasir(){
  try{await api('/api/unlock-pin',{method:'POST',body:{pin:document.getElementById('lockPin').value}});localStorage.removeItem('tecno_locked');document.getElementById('lockScreen')?.remove();toast('Kasir terbuka')}catch(e){let m=document.getElementById('lockMsg');m.textContent=e.message;m.classList.remove('hidden')}
}
async function openSwitchKasir(){
  try{
    const j=await api('/api/kasir/users');
    const opts=j.data.map(u=>`<option value="${u.id}">${u.nama} (${u.username})</option>`).join('');
    modal(`<div class="modal-head"><b>Ganti Kasir</b><button class="x" onclick="closeModal()">X</button></div><form id="switchKasirForm" class="form"><label>Kasir<select name="kasir_id">${opts}</select></label><label>PIN Kasir<input name="pin" inputmode="numeric" maxlength="6" placeholder="PIN" required></label><button class="btn primary wide">Masuk Kasir Ini</button></form>`);
    switchKasirForm.onsubmit=async e=>{e.preventDefault();const r=await api('/api/switch-kasir-pin',{method:'POST',body:Object.fromEntries(new FormData(switchKasirForm).entries())});localStorage.setItem('tecno_user',JSON.stringify(r.user));localStorage.setItem('tecno_toko',JSON.stringify(r.toko||{}));localStorage.removeItem('tecno_locked');location.replace('/kasir.html')};
  }catch(e){alert(e.message)}
}
function proSessionButtons(){
  if(!API.user) return '';
  const pinBtn=API.user.role==='developer'?'':`<button class="btn" onclick="openChangePin()">Ubah PIN</button>`;
  const kasirBtns=API.user.role==='kasir'?`<button class="btn warn" onclick="lockKasir()">🔒 Kunci</button><button class="btn" onclick="openSwitchKasir()">Ganti Kasir</button>`:'';
  return `<div class="pro-session-actions">${kasirBtns}${pinBtn}</div>`;
}
function injectProSessionButtons(){
  const top=document.querySelector('.top-actions') || document.querySelector('.topbar > div:last-child');
  if(top && !document.getElementById('proSessionTop')){const w=document.createElement('span');w.id='proSessionTop';w.innerHTML=proSessionButtons();top.appendChild(w)}
  showLockScreen();
}
function openChangePin(){
  modal(`<div class="modal-head"><b>Ubah PIN Cepat</b><button class="x" onclick="closeModal()">X</button></div><form id="pinForm" class="form"><label>PIN Baru 4-6 digit<input name="pin" inputmode="numeric" maxlength="6" required></label><button class="btn primary wide">Simpan PIN</button></form>`);
  pinForm.onsubmit=async e=>{e.preventDefault();await api('/api/change-pin',{method:'POST',body:Object.fromEntries(new FormData(pinForm).entries())});closeModal();toast('PIN berhasil diubah')};
}
document.addEventListener('DOMContentLoaded',injectProSessionButtons);

async function uploadFileInput(input, type='produk'){
  const f=input.files?.[0]; if(!f) return '';
  if(f.size>5*1024*1024){alert('Ukuran foto maksimal 5 MB');input.value='';return ''}
  const data=await new Promise((ok,fail)=>{let r=new FileReader();r.onload=()=>ok(r.result);r.onerror=fail;r.readAsDataURL(f)});
  const j=await api('/api/upload',{method:'POST',body:{type,filename:f.name,data}});
  return j.url;
}

function setupShell(title, subtitle=''){
  qs('#pageTitle')&&(qs('#pageTitle').textContent=title);
  qs('#sideTitle')&&(qs('#sideTitle').textContent=title);
  qs('#sideSub')&&(qs('#sideSub').textContent=subtitle||API.user?.nama||'');
  
  qs('#hamb')&&(qs('#hamb').onclick=()=>toggleMobileSidebar());
  ensureSidebarBackdrop();

  qsa('[data-nav]').forEach(b=>b.onclick=()=>showSection(b.dataset.nav,true));
  setupMobileBackGuard();
}

function ensureSidebarBackdrop(){
  if(document.getElementById('sidebarBackdrop')) return;
  const b=document.createElement('div');
  b.id='sidebarBackdrop';
  b.className='sidebar-backdrop';
  b.onclick=closeMobileSidebar;
  document.body.appendChild(b);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileSidebar()});
}
function toggleMobileSidebar(){
  ensureSidebarBackdrop();
  const side=qs('#sidebar');
  if(!side) return;
  const open=!side.classList.contains('open');
  side.classList.toggle('open',open);
  document.body.classList.toggle('sidebar-is-open',open);
}
function closeMobileSidebar(){
  qs('#sidebar')?.classList.remove('open');
  document.body.classList.remove('sidebar-is-open');
}

function showSection(id, push=false){
  qsa('.section').forEach(s=>s.classList.remove('active'));
  qsa('[data-nav]').forEach(b=>b.classList.remove('active'));
  qs('#'+id)?.classList.add('active');
  qs(`[data-nav="${id}"]`)?.classList.add('active');
  qs('#pageTitle')&&(qs('#pageTitle').textContent=qs(`[data-nav="${id}"]`)?.textContent.trim()||'TECNO POS');
  closeMobileSidebar();
  if(push && window.__backGuardReady){try{history.pushState({app:true,section:id},'',location.href)}catch(e){}}
}
function modal(html){
  let m=document.createElement('div');m.className='modal';
  if(String(html).includes('product-form'))m.classList.add('product-modal');
  m.innerHTML=`<div class="modal-card ${String(html).includes('product-form')?'product-sheet-card':''}">${html}</div>`;
  document.body.appendChild(m);
  if(window.__backGuardReady){try{history.pushState({app:true,modal:true},'',location.href)}catch(e){}}
  return m
}
function closeModal(){try{window.__scannerStop?.()}catch(e){} document.querySelector('.modal')?.remove()}

// ===== HYBRID PRODUCT CACHE + CAMERA BARCODE SCANNER =====
const PRODUCT_CACHE_KEY='tecno_product_cache_v2';
function productCache(){try{return JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY)||'[]')}catch(e){return []}}
function saveProductCache(rows=[]){
  try{
    const map=new Map(productCache().map(p=>[String(p.id||p.barcode||p.nama),p]));
    (rows||[]).forEach(p=>{ if(p) map.set(String(p.id||p.barcode||p.nama),p); });
    localStorage.setItem(PRODUCT_CACHE_KEY,JSON.stringify(Array.from(map.values()).slice(0,5000)));
  }catch(e){}
}
function localProductSearch(q){
  q=String(q||'').trim().toLowerCase();
  if(!q) return [];
  return productCache().filter(p=>
    String(p.nama||'').toLowerCase().includes(q) ||
    String(p.barcode||'').toLowerCase()===q ||
    String(p.barcode||'').toLowerCase().includes(q) ||
    String(p.kategori||'').toLowerCase().includes(q)
  ).slice(0,80);
}

// ===== LOCAL-FIRST SALES, STOCK, AND SYNC REPORT =====
const LOCAL_SALES_KEY='tecno_local_sales_v1';
function localSales(){try{return JSON.parse(localStorage.getItem(LOCAL_SALES_KEY)||'[]')}catch(e){return []}}
function saveLocalSales(rows){try{localStorage.setItem(LOCAL_SALES_KEY,JSON.stringify((rows||[]).slice(-1000)))}catch(e){}}
function rememberLocalSale(receipt){
  try{
    const rows=localSales();
    const tr=receipt.transaction||receipt.tr||{};
    if(!rows.some(x=>x.offline_client_id===tr.offline_client_id || x.invoice===tr.invoice)){
      rows.push({invoice:tr.invoice,offline_client_id:tr.offline_client_id,created_at:tr.created_at,customer:tr.customer,metode:tr.metode,total:tr.total,status_sync:'PENDING',items:receipt.items||[]});
      saveLocalSales(rows);
    }
  }catch(e){}
}
function markLocalSaleSynced(offlineId){
  if(!offlineId) return;
  const rows=localSales(); let changed=false;
  rows.forEach(x=>{if(x.offline_client_id===offlineId){x.status_sync='SYNCED';x.synced_at=new Date().toISOString();changed=true;}});
  if(changed) saveLocalSales(rows);
}
function adjustLocalProductStock(items=[]){
  try{
    const rows=productCache();
    (items||[]).forEach(it=>{
      const p=rows.find(x=>String(x.id)===String(it.id||it.product_id) || (it.barcode && String(x.barcode)===String(it.barcode)));
      if(p && p.stok!==undefined){p.stok=Math.max(0,Number(p.stok||0)-Number(it.qty||0));}
    });
    localStorage.setItem(PRODUCT_CACHE_KEY,JSON.stringify(rows));
  }catch(e){}
}
function pendingSyncCount(){return hybridQueue().filter(x=>x.status!=='synced').length;}
async function reconcileLocalSalesWithServer(){
  // Tandai transaksi lokal sebagai SYNCED jika invoice sudah ada di server.
  if(!API.user || !navigator.onLine) return;
  try{
    const r = await fetch(apiUrl('/api/admin/transactions'),{
      headers:{'Content-Type':'application/json','x-user-id':API.user?.id||''}
    });
    const j = await r.json().catch(()=>null);
    if(!j || !j.ok || !Array.isArray(j.data)) return;
    const serverInvoices = new Set(j.data.map(x=>String(x.invoice||x.offline_client_id||'')));
    const rows = localSales();
    let changed=false;
    rows.forEach(x=>{
      if(serverInvoices.has(String(x.invoice||'')) || serverInvoices.has(String(x.offline_client_id||''))){
        if(x.status_sync!=='SYNCED'){x.status_sync='SYNCED';x.synced_at=new Date().toISOString();changed=true;}
      }
    });
    if(changed) saveLocalSales(rows);
  }catch(e){}
}

async function renderSyncReport(targetId='syncReportTable'){
  await reconcileLocalSalesWithServer();
  const el=document.getElementById(targetId); if(!el) return;
  const q=hybridQueue().filter(x=>x.status!=='synced');
  const sales=localSales().slice().reverse().slice(0,30);
  let html=`<div class="card"><h3>Status Sync</h3><p><b>${navigator.onLine?'ONLINE':'OFFLINE'}</b> • Pending upload: <b>${q.length}</b></p><button class="btn primary" onclick="syncOfflineQueue().then(()=>renderSyncReport('${targetId}'))">Sync Sekarang</button></div>`;
  html += '<h3>Transaksi Lokal Terakhir</h3>';
  html += '<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Tanggal</th><th>Customer</th><th>Metode</th><th>Total</th><th>Status</th></tr></thead><tbody>';
  html += (sales.map(r=>`<tr><td>${r.invoice||'-'}</td><td>${r.created_at||'-'}</td><td>${r.customer||'-'}</td><td>${r.metode||'-'}</td><td>${rp(r.total||0)}</td><td><span class="badge ${r.status_sync==='SYNCED'?'ok':'warn'}">${r.status_sync||'PENDING'}</span></td></tr>`).join('') || '<tr><td colspan="6">Belum ada transaksi lokal</td></tr>');
  html += '</tbody></table></div>';
  el.innerHTML=html;
}

async function openCameraScanner(targetSelector){
  // FIX ADMIN SCAN: jangan memakai modal() karena modal scanner akan menghapus popup Tambah Produk.
  // Scanner dibuat sebagai overlay sendiri, supaya input #productBarcodeInput tetap ada dan bisa diisi.
  const target = targetSelector ? document.querySelector(targetSelector) : (document.activeElement?.matches?.('input') ? document.activeElement : document.getElementById('search'));
  if(!target){alert('Kolom barcode tidak ditemukan. Tutup popup lalu buka Tambah Produk lagi.');return;}
  if(!navigator.mediaDevices?.getUserMedia){alert('Kamera browser belum didukung. Ketik barcode manual.');return;}

  closeScannerModal(true);
  let stream=null, stopped=false, detector=null;
  try{
    if('BarcodeDetector' in window){
      detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','code_93','itf','qr_code','upc_a','upc_e']});
    }
  }catch(e){}

  const overlay=document.createElement('div');
  overlay.className='scanner-overlay no-print';
  overlay.innerHTML=`
    <div class="scanner-card">
      <div class="modal-head">
        <b>Scan Barcode Kamera</b>
        <button class="x" type="button" onclick="closeScannerModal()">X</button>
      </div>
      <div class="scanner-box">
        <video id="scanVideo" playsinline autoplay muted></video>
        <div class="scan-line"></div>
      </div>
      <p class="side-sub">Arahkan kamera ke barcode. Untuk label kecil, mundurkan HP 10–15 cm dan jangan goyang.</p>
      <div class="searchbar">
        <input id="manualBarcode" placeholder="Ketik kode barcode manual">
        <button class="btn primary" type="button" onclick="applyManualBarcode('${target.id||''}')">Pakai</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn" type="button" onclick="toggleScannerTorch()">Lampu</button>
        <button class="btn" type="button" onclick="closeScannerModal()">Tutup</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  window.__scannerStop=()=>{stopped=true; try{stream?.getTracks()?.forEach(t=>t.stop())}catch(e){}};
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}});
    window.__scannerStream=stream;
    const video=document.getElementById('scanVideo');
    video.srcObject=stream;
    await video.play();
    if(!detector){toast('Browser belum support scan otomatis. Ketik kode manual.');return;}
    const tick=async()=>{
      if(stopped || !document.getElementById('scanVideo')) return;
      try{
        const codes=await detector.detect(video);
        if(codes && codes.length){
          const val=String(codes[0].rawValue||'').trim();
          if(val){ applyScannedBarcode(val,target); return; }
        }
      }catch(e){}
      requestAnimationFrame(tick);
    };
    tick();
  }catch(err){
    alert('Kamera tidak bisa dibuka. Izinkan permission kamera di browser, atau ketik barcode manual.');
    try{stream?.getTracks()?.forEach(t=>t.stop())}catch(e){}
  }
}
function applyScannedBarcode(val,target){
  try{window.__scannerStop?.()}catch(e){}
  const el=target || document.getElementById('productBarcodeInput') || document.getElementById('search');
  if(el){
    el.value=val;
    el.setAttribute('value',val);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    try{el.focus()}catch(e){}
  }
  closeScannerModal(true);
  toast('Barcode terbaca: '+val);
  if(el?.id==='search' && typeof scanOrSearch==='function') scanOrSearch();
}
function closeScannerModal(skipStop=false){
  if(!skipStop){try{window.__scannerStop?.()}catch(e){}}
  document.querySelector('.scanner-overlay')?.remove();
}
function applyManualBarcode(targetId){
  const val=document.getElementById('manualBarcode')?.value?.trim();
  if(!val) return alert('Isi kode dulu');
  const target=targetId?document.getElementById(targetId):(document.getElementById('productBarcodeInput')||document.getElementById('search'));
  applyScannedBarcode(val,target);
}
async function toggleScannerTorch(){
  try{
    const track=window.__scannerStream?.getVideoTracks?.()[0];
    const caps=track?.getCapabilities?.();
    if(!caps?.torch){toast('Lampu kamera tidak didukung browser ini');return;}
    window.__torchOn=!window.__torchOn;
    await track.applyConstraints({advanced:[{torch:window.__torchOn}]});
  }catch(e){toast('Lampu tidak bisa aktif');}
}

function setupMobileBackGuard(){
  if(window.__backGuardReady || !API.user) return;
  window.__backGuardReady=true;
  try{history.replaceState({app:true},'',location.href);history.pushState({app:true},'',location.href)}catch(e){}
  window.addEventListener('popstate',()=>{
    const modalEl=document.querySelector('.modal');
    if(modalEl){modalEl.remove(); try{history.pushState({app:true},'',location.href)}catch(e){}; return;}
    const extra=document.getElementById('extraModal');
    if(extra && !extra.classList.contains('hidden')){extra.classList.add('hidden'); try{history.pushState({app:true},'',location.href)}catch(e){}; return;}
    if(document.body.classList.contains('search-open') && typeof closeSearchPopup==='function'){closeSearchPopup(); try{history.pushState({app:true},'',location.href)}catch(e){}; return;}
    const side=qs('#sidebar');
    if(side?.classList.contains('open')){closeMobileSidebar(); try{history.pushState({app:true},'',location.href)}catch(e){}; return;}
    const first=qsa('[data-nav]')[0]?.dataset.nav;
    const active=qs('.section.active')?.id;
    if(first && active && active!==first){showSection(first,false); try{history.pushState({app:true},'',location.href)}catch(e){}; return;}
    toast('Gunakan tombol Logout untuk keluar akun');
    try{history.pushState({app:true},'',location.href)}catch(e){}
  });
}
function table(rows, cols){return `<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>{let v=typeof c[1]==='function'?c[1](r):(r[c[1]]??''); if(typeof c[1]==='string' && /(_at|tanggal|created_at)$/i.test(c[1]) && v) v=formatDateID(v); return `<td>${v}</td>`}).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">Data kosong</td></tr>`}</tbody></table></div>`}
function receiptHTML(toko,tr,items){const freeBrand=(toko.paket||'GRATIS')==='GRATIS'?'<hr><div class="center-text">Powered by Erlang Tecno</div>':'';return `<div class="receipt print-area"><div class="center-text"><div class="big">${toko.nama_toko||'NAMA TOKO'}</div><div>${toko.alamat||''}</div><div>${toko.no_hp||''}</div></div><hr><div>No Transaksi: ${tr.invoice||tr.offline_client_id||'-'}</div><div>Kasir: ${tr.kasir||API.user.nama}</div><div>Tgl: ${formatDateID(tr.created_at)}</div><hr>${items.map(i=>`<div>${i.nama}</div><div class="rrow"><span>${i.qty} x ${rp(i.harga)}</span><span>${rp(i.subtotal)}</span></div>`).join('')}<hr><div class="rrow"><span>Subtotal</span><span>${rp(tr.subtotal)}</span></div><div class="rrow"><span>Diskon</span><span>${rp(tr.diskon)}</span></div><div class="rrow"><span>Pajak</span><span>${rp(tr.pajak)}</span></div><div class="rrow big"><span>TOTAL</span><span>${rp(tr.total)}</span></div><div class="rrow"><span>${tr.metode}</span><span>${rp(tr.bayar)}</span></div><div class="rrow"><span>Kembali</span><span>${rp(tr.kembali)}</span></div><hr><div class="center-text">${toko.footer_struk||'Terima kasih'}</div>${freeBrand}</div>`}
function escposText(toko,tr,items){
  const line='--------------------------------';
  const cut=(txt,w=32)=>String(txt||'').slice(0,w);
  const money=n=>Number(n||0).toLocaleString('id-ID');
  const row=(l,r)=>cut(l,20).padEnd(20,' ')+cut(r,12).padStart(12,' ');
  let out=[];
  out.push((toko.nama_toko||'NAMA TOKO').toUpperCase());
  if(toko.alamat)out.push(cut(toko.alamat));
  if(toko.no_hp)out.push(cut(toko.no_hp));
  out.push(line);
  out.push('No Transaksi: '+(tr.invoice||tr.offline_client_id||'-'));
  out.push('Kasir: '+(tr.kasir||API.user?.nama||'-'));
  out.push(formatDateID(tr.created_at));
  out.push(line);
  items.forEach(i=>{out.push(cut(i.nama));out.push(row(`${i.qty} x ${money(i.harga)}`,money(i.subtotal)));});
  out.push(line);
  out.push(row('Subtotal',money(tr.subtotal)));
  out.push(row('Diskon',money(tr.diskon)));
  out.push(row('Pajak',money(tr.pajak)));
  out.push(row('TOTAL',money(tr.total)));
  out.push(row(tr.metode,money(tr.bayar)));
  out.push(row('Kembali',money(tr.kembali)));
  out.push(line);
  out.push(toko.footer_struk||'Terima kasih');
  if((toko.paket||'GRATIS')==='GRATIS')out.push('Powered by Erlang Tecno');
  out.push('\n\n\n');
  return out.join('\n');
}
function getBluetoothSerialPlugin(){
  return window.bluetoothSerial || window.cordova?.plugins?.bluetoothSerial || null;
}
function requestAndroidBluetoothPermission(callback){
  // Android 12+ wajib minta izin runtime: Nearby Devices / BLUETOOTH_CONNECT.
  // OPPO A16k sering bisa tanpa ini, tapi OPPO Reno/Samsung/Vivo Android baru butuh ini.
  const perms = window.cordova?.plugins?.permissions;
  if(!perms){ callback(); return; }
  const list = [];
  if(perms.BLUETOOTH_CONNECT) list.push(perms.BLUETOOTH_CONNECT);
  if(perms.BLUETOOTH_SCAN) list.push(perms.BLUETOOTH_SCAN);
  if(perms.ACCESS_FINE_LOCATION) list.push(perms.ACCESS_FINE_LOCATION);
  if(!list.length){ callback(); return; }
  perms.requestPermissions(list, function(){ callback(); }, function(err){
    alert('Izin Bluetooth belum diberikan. Buka Info Aplikasi > Izin > aktifkan Perangkat sekitar/Bluetooth.\n'+JSON.stringify(err));
  });
}
async function printBluetoothThermal(toko,tr,items){
  const text = escposText(toko,tr,items);
  const doPrint = function(){
    const bt = getBluetoothSerialPlugin();
    if(!bt){
      alert('Bluetooth native belum aktif di APK. Install: npm install cordova-plugin-bluetooth-serial cordova-plugin-android-permissions lalu npx cap sync android dan build ulang APK.');
      return;
    }
    try{
      bt.list(function(devices){
        if(!devices || !devices.length){
          alert('Printer belum dipairing. Pair RPP02N/POS58 dulu di Bluetooth HP. PIN biasanya 0000 / 1234.');
          return;
        }
        const printer = devices.find(d=>{
          const n=(d.name||'').toLowerCase();
          return n.includes('rpp') || n.includes('pos') || n.includes('printer') || n.includes('thermal') || n.includes('mtp') || n.includes('58') || n.includes('80');
        }) || devices[0];
        const address = printer.address || printer.id || printer.uuid;
        if(!address){
          alert('Alamat printer tidak ditemukan. Hapus pairing lalu pair ulang printer.');
          return;
        }
        bt.connect(address, function(){
          // ESC/POS: reset, center+bold nama toko sudah dibentuk di escposText, feed, cut jika support.
          const payload = '\x1B\x40' + text + '\n\n\n\x1D\x56\x00';
          bt.write(payload, function(){
            toast('Struk dikirim ke printer: '+(printer.name||address));
            try{ bt.disconnect(); }catch(e){}
          }, function(err){
            alert('Gagal cetak: '+JSON.stringify(err));
            try{ bt.disconnect(); }catch(e){}
          });
        }, function(err){
          alert('Gagal konek printer: '+JSON.stringify(err)+'\nPastikan printer ON, tidak sedang tersambung ke HP lain, dan sudah dipairing.');
        });
      }, function(err){
        alert('Gagal membaca Bluetooth: '+JSON.stringify(err));
      });
    }catch(e){ alert('Bluetooth Native error: '+(e.message||e)); }
  };
  requestAndroidBluetoothPermission(doPrint);
}
function printReceipt(toko,tr,items){window.LAST_RECEIPT={toko,tr,items};let m=modal(`<div class="modal-head no-print"><b>Cetak Struk Thermal</b><button class="x" onclick="closeModal()">X</button></div>${receiptHTML(toko,tr,items)}<div class="no-print receipt-actions"><button class="btn primary" onclick="window.print()">Print HP/Chrome</button><button class="btn ok" onclick="printBluetoothThermal(window.LAST_RECEIPT.toko,window.LAST_RECEIPT.tr,window.LAST_RECEIPT.items)">Bluetooth Thermal</button><button class="btn" onclick="navigator.share?navigator.share({title:'Struk',text:escposText(window.LAST_RECEIPT.toko,window.LAST_RECEIPT.tr,window.LAST_RECEIPT.items)}):alert(escposText(window.LAST_RECEIPT.toko,window.LAST_RECEIPT.tr,window.LAST_RECEIPT.items))">Share Teks</button><button class="btn" onclick="closeModal()">Tutup</button></div><p class="no-print side-sub">Catatan: tombol Bluetooth Thermal memakai APK native. Pair printer RPP02N dulu di Bluetooth HP.</p>`)}

function openChangePassword(){
  modal(`<div class="modal-head"><b>Ubah Password</b><button class="x" onclick="closeModal()">X</button></div>
  <form id="changePassForm" class="form">
    <label>Password Lama<input name="old_password" type="password" minlength="6" required></label>
    <label>Password Baru<input name="new_password" type="password" minlength="6" required></label>
    <label>Ulangi Password<input name="repeat_password" type="password" minlength="6" required></label>
    <button class="btn primary wide">Simpan Password</button>
  </form>`);
  changePassForm.onsubmit=async e=>{e.preventDefault();try{await api('/api/change-password',{method:'POST',body:Object.fromEntries(new FormData(changePassForm).entries())});closeModal();toast('Password berhasil diubah. Silakan login ulang.');setTimeout(()=>{localStorage.clear();sessionStorage.clear();location.replace('/')},900)}catch(err){alert(err.message)}}
}
function togglePassword(id){const el=document.getElementById(id); if(el) el.type=el.type==='password'?'text':'password'}
