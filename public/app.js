const API={user:JSON.parse(localStorage.getItem('tecno_user')||'null'),toko:JSON.parse(localStorage.getItem('tecno_toko')||'{}')};
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
function hybridQueue(){try{return JSON.parse(localStorage.getItem(HYBRID_QUEUE_KEY)||'[]')}catch(e){return []}}
function saveHybridQueue(q){localStorage.setItem(HYBRID_QUEUE_KEY,JSON.stringify(q));updateHybridBadge()}
function makeOfflineReceipt(body){
  const subtotal=(body.items||[]).reduce((s,i)=>s+Number(i.harga||0)*Number(i.qty||0),0);
  const diskon=Number(body.diskon||0), pajak=Number(body.pajak||0), biaya=Number(body.biaya||0);
  const total=subtotal-diskon+pajak+biaya, bayar=Number(body.bayar||0), kembali=Math.max(0,bayar-total);
  const id='OFF-'+Date.now().toString(36).toUpperCase()+'-'+Math.floor(Math.random()*9999);
  const tr={id:-Date.now(),invoice:id,customer:body.customer||'Umum',subtotal,diskon,pajak,biaya,total,bayar,kembali,metode:body.metode||'TUNAI',status:body.metode==='UTANG'?'UTANG':'LUNAS',created_at:body.client_time||new Date().toISOString(),kasir:API.user?.nama||'Kasir',offline_client_id:id};
  return {ok:true,offline:true,message:'Transaksi disimpan offline. Akan sync otomatis saat internet aktif.',transaction:tr,items:(body.items||[]).map((x,i)=>({id:i+1,transaction_id:tr.id,product_id:x.id||0,nama:x.nama,qty:x.qty,harga:x.harga,subtotal:Number(x.qty)*Number(x.harga)})),toko:API.toko||{nama_toko:'TECNO POS'}};
}
async function api(url,opt={}){
  opt.headers=Object.assign({'Content-Type':'application/json','x-user-id':API.user?.id||''},opt.headers||{});
  const originalBody=opt.body;
  if(opt.body&&typeof opt.body!=='string')opt.body=JSON.stringify(opt.body);
  try{
    const r=await fetch(url,opt);
    const text=await r.text();
    let j={};
    try{j=text?JSON.parse(text):{};}catch(e){j={ok:false,message:r.ok?'Response error':'Server tidak merespon JSON'};}
    if(j.code==='TOKO_NONAKTIF'){alert(j.message||'Toko nonaktif. Hubungi developer.');localStorage.removeItem('tecno_user');localStorage.removeItem('tecno_toko');location.replace('/');throw new Error(j.message)}
    if(!r.ok||j.ok===false)throw new Error(j.message||'Error');
    return j;
  }catch(err){
    if(url==='/api/kasir/checkout' && (opt.method||'').toUpperCase()==='POST'){
      const body=typeof originalBody==='string'?JSON.parse(originalBody||'{}'):(originalBody||{});
      if(!body.offline_client_id) body.offline_client_id='OFF-'+Date.now().toString(36).toUpperCase()+'-'+Math.floor(Math.random()*9999);
      const q=hybridQueue();
      q.push({url,method:'POST',body,user_id:API.user?.id||'',created_at:new Date().toISOString(),status:'pending'});
      saveHybridQueue(q);
      toast('MODE OFFLINE: transaksi tersimpan, nanti auto-sync');
      return makeOfflineReceipt(body);
    }
    throw err;
  }
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
      const r=await fetch(item.url,{method:item.method||'POST',headers:{'Content-Type':'application/json','x-user-id':item.user_id||API.user.id},body:JSON.stringify(item.body)});
      const j=await r.json().catch(()=>({ok:false,message:'Server tidak JSON'}));
      if(r.ok && j.ok){item.status='synced';item.synced_at=new Date().toISOString();changed=true;}
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
document.addEventListener('DOMContentLoaded',()=>{updateHybridBadge();syncOfflineQueue(); if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});});

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
  qs('#hamb')&&(qs('#hamb').onclick=()=>qs('#sidebar').classList.toggle('open'));
  qsa('[data-nav]').forEach(b=>b.onclick=()=>showSection(b.dataset.nav,true));
  setupMobileBackGuard();
}
function showSection(id, push=false){
  qsa('.section').forEach(s=>s.classList.remove('active'));
  qsa('[data-nav]').forEach(b=>b.classList.remove('active'));
  qs('#'+id)?.classList.add('active');
  qs(`[data-nav="${id}"]`)?.classList.add('active');
  qs('#pageTitle')&&(qs('#pageTitle').textContent=qs(`[data-nav="${id}"]`)?.textContent.trim()||'TECNO POS');
  qs('#sidebar')?.classList.remove('open');
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
function closeModal(){document.querySelector('.modal')?.remove()}
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
    if(side?.classList.contains('open')){side.classList.remove('open'); try{history.pushState({app:true},'',location.href)}catch(e){}; return;}
    const first=qsa('[data-nav]')[0]?.dataset.nav;
    const active=qs('.section.active')?.id;
    if(first && active && active!==first){showSection(first,false); try{history.pushState({app:true},'',location.href)}catch(e){}; return;}
    toast('Gunakan tombol Logout untuk keluar akun');
    try{history.pushState({app:true},'',location.href)}catch(e){}
  });
}
function table(rows, cols){return `<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>{let v=typeof c[1]==='function'?c[1](r):(r[c[1]]??''); if(typeof c[1]==='string' && /(_at|tanggal|created_at)$/i.test(c[1]) && v) v=formatDateID(v); return `<td>${v}</td>`}).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">Data kosong</td></tr>`}</tbody></table></div>`}
function receiptHTML(toko,tr,items){const freeBrand=(toko.paket||'GRATIS')==='GRATIS'?'<hr><div class="center-text">Powered by Erlang Tecno</div>':'';return `<div class="receipt print-area"><div class="center-text"><div class="big">${toko.nama_toko||'NAMA TOKO'}</div><div>${toko.alamat||''}</div><div>${toko.no_hp||''}</div></div><hr><div>No: ${tr.invoice}</div><div>Kasir: ${tr.kasir||API.user.nama}</div><div>Tgl: ${formatDateID(tr.created_at)}</div><hr>${items.map(i=>`<div>${i.nama}</div><div class="rrow"><span>${i.qty} x ${rp(i.harga)}</span><span>${rp(i.subtotal)}</span></div>`).join('')}<hr><div class="rrow"><span>Subtotal</span><span>${rp(tr.subtotal)}</span></div><div class="rrow"><span>Diskon</span><span>${rp(tr.diskon)}</span></div><div class="rrow"><span>Pajak</span><span>${rp(tr.pajak)}</span></div><div class="rrow big"><span>TOTAL</span><span>${rp(tr.total)}</span></div><div class="rrow"><span>${tr.metode}</span><span>${rp(tr.bayar)}</span></div><div class="rrow"><span>Kembali</span><span>${rp(tr.kembali)}</span></div><hr><div class="center-text">${toko.footer_struk||'Terima kasih'}</div>${freeBrand}</div>`}
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
  out.push('No: '+tr.invoice);
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
async function printBluetoothThermal(toko,tr,items){
  if(!('bluetooth' in navigator)){alert('Browser ini belum mendukung Web Bluetooth. Di HP Android coba buka lewat Chrome, atau pakai tombol Print HP.');return}
  try{
    const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:['0000ffe0-0000-1000-8000-00805f9b34fb','49535343-fe7d-4ae5-8fa9-9fafd205e455','e7810a71-73ae-499d-8c15-faa9aef0c3f2']});
    const server=await device.gatt.connect();
    const services=await server.getPrimaryServices();
    let writable=null;
    for(const svc of services){
      const chars=await svc.getCharacteristics();
      writable=chars.find(c=>c.properties.write||c.properties.writeWithoutResponse);
      if(writable)break;
    }
    if(!writable)throw new Error('Printer ditemukan, tapi channel tulis tidak ditemukan. Banyak printer thermal Bluetooth classic/SPP tidak bisa lewat browser, harus APK native.');
    const enc=new TextEncoder();
    const bytes=[...new Uint8Array([0x1b,0x40]),...enc.encode(escposText(toko,tr,items)),...new Uint8Array([0x1d,0x56,0x00])];
    for(let i=0;i<bytes.length;i+=160){await writable.writeValue(new Uint8Array(bytes.slice(i,i+160)))}
    toast('Struk dikirim ke thermal Bluetooth');
  }catch(e){alert('Bluetooth gagal: '+e.message+'\n\nSolusi aman: pakai tombol Print HP/Chrome, atau nanti jadikan APK native Bluetooth ESC/POS untuk printer RPP02N/classic.');}
}
function printReceipt(toko,tr,items){window.LAST_RECEIPT={toko,tr,items};let m=modal(`<div class="modal-head no-print"><b>Cetak Struk Thermal</b><button class="x" onclick="closeModal()">X</button></div>${receiptHTML(toko,tr,items)}<div class="no-print receipt-actions"><button class="btn primary" onclick="window.print()">Print HP/Chrome</button><button class="btn ok" onclick="printBluetoothThermal(window.LAST_RECEIPT.toko,window.LAST_RECEIPT.tr,window.LAST_RECEIPT.items)">Bluetooth Thermal</button><button class="btn" onclick="navigator.share?navigator.share({title:'Struk',text:escposText(window.LAST_RECEIPT.toko,window.LAST_RECEIPT.tr,window.LAST_RECEIPT.items)}):alert(escposText(window.LAST_RECEIPT.toko,window.LAST_RECEIPT.tr,window.LAST_RECEIPT.items))">Share Teks</button><button class="btn" onclick="closeModal()">Tutup</button></div><p class="no-print side-sub">Catatan: tombol Bluetooth langsung bekerja untuk printer BLE. Printer thermal Bluetooth classic seperti sebagian RPP02N biasanya perlu Print HP/Chrome atau APK native.</p>`)}

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
