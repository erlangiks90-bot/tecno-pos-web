const API={user:JSON.parse(localStorage.getItem('tecno_user')||'null'),toko:JSON.parse(localStorage.getItem('tecno_toko')||'{}')};
if(!API.user && !location.pathname.endsWith('/login.html') && location.pathname!=='/') location.href='/';
const rp=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
async function api(url,opt={}){
  opt.headers=Object.assign({'Content-Type':'application/json','x-user-id':API.user?.id||''},opt.headers||{});
  if(opt.body&&typeof opt.body!=='string')opt.body=JSON.stringify(opt.body);
  const r=await fetch(url,opt);
  const text=await r.text();
  let j={};
  try{j=text?JSON.parse(text):{};}catch(e){j={ok:false,message:r.ok?'Response error':'Server tidak merespon JSON'};}
  if(j.code==='TOKO_NONAKTIF'){alert(j.message||'Toko nonaktif. Hubungi developer.');localStorage.removeItem('tecno_user');localStorage.removeItem('tecno_toko');location.href='/';throw new Error(j.message)}
  if(!r.ok||j.ok===false)throw new Error(j.message||'Error');
  return j;
}

function toast(t){let d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}

function applyTheme(){
  const theme=localStorage.getItem('tecno_theme')||API.toko?.mode_tema||'eye';
  document.documentElement.setAttribute('data-theme',theme);
  applyAccent();
}
function applyAccent(){
  const accent=localStorage.getItem('tecno_accent')||API.toko?.warna_tema||'blue';
  document.documentElement.setAttribute('data-accent',accent);
}
applyTheme();
function setTheme(theme){localStorage.setItem('tecno_theme',theme);document.documentElement.setAttribute('data-theme',theme);toast('Mode tampilan: '+theme)}
function setAccent(accent){localStorage.setItem('tecno_accent',accent);document.documentElement.setAttribute('data-accent',accent);toast('Warna tema: '+accent)}
function logout(){
  const m=modal(`<div class="modal-head"><b>Keluar dari akun?</b><button class="x" onclick="closeModal()">X</button></div><p>Apakah yakin ingin keluar?</p><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button class="btn" onclick="closeModal()">BATAL</button><button class="btn danger" onclick="confirmLogout()">LOGOUT</button></div>`);
  m.addEventListener('click',e=>{if(e.target===m)closeModal()});
}
function confirmLogout(){localStorage.removeItem('tecno_user');localStorage.removeItem('tecno_toko');location.href='/'}
async function uploadFileInput(input, type='produk'){
  const f=input.files?.[0]; if(!f) return '';
  if(f.size>5*1024*1024){alert('Ukuran foto maksimal 5 MB');input.value='';return ''}
  const data=await new Promise((ok,fail)=>{let r=new FileReader();r.onload=()=>ok(r.result);r.onerror=fail;r.readAsDataURL(f)});
  const j=await api('/api/upload',{method:'POST',body:{type,filename:f.name,data}});
  return j.url;
}

function setupShell(title, subtitle=''){qs('#pageTitle')&&(qs('#pageTitle').textContent=title);qs('#sideTitle')&&(qs('#sideTitle').textContent=title);qs('#sideSub')&&(qs('#sideSub').textContent=subtitle||API.user?.nama||'');qs('#hamb')&&(qs('#hamb').onclick=()=>qs('#sidebar').classList.toggle('open'));qsa('[data-nav]').forEach(b=>b.onclick=()=>showSection(b.dataset.nav));}
function showSection(id){qsa('.section').forEach(s=>s.classList.remove('active'));qsa('[data-nav]').forEach(b=>b.classList.remove('active'));qs('#'+id)?.classList.add('active');qs(`[data-nav="${id}"]`)?.classList.add('active');qs('#pageTitle')&&(qs('#pageTitle').textContent=qs(`[data-nav="${id}"]`)?.textContent.trim()||'TECNO POS');qs('#sidebar')?.classList.remove('open')}
function modal(html){let m=document.createElement('div');m.className='modal';if(String(html).includes('product-form'))m.classList.add('product-modal');m.innerHTML=`<div class="modal-card ${String(html).includes('product-form')?'product-sheet-card':''}">${html}</div>`;document.body.appendChild(m);return m}
function closeModal(){document.querySelector('.modal')?.remove()}
function table(rows, cols){return `<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof c[1]==='function'?c[1](r):(r[c[1]]??'')}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">Data kosong</td></tr>`}</tbody></table></div>`}
function receiptHTML(toko,tr,items){const freeBrand=(toko.paket||'GRATIS')==='GRATIS'?'<hr><div class="center-text">Powered by Erlang Tecno</div>':'';return `<div class="receipt print-area"><div class="center-text"><div class="big">${toko.nama_toko||'NAMA TOKO'}</div><div>${toko.alamat||''}</div><div>${toko.no_hp||''}</div></div><hr><div>No: ${tr.invoice}</div><div>Kasir: ${tr.kasir||API.user.nama}</div><div>Tgl: ${new Date(tr.created_at).toLocaleString('id-ID')}</div><hr>${items.map(i=>`<div>${i.nama}</div><div class="rrow"><span>${i.qty} x ${rp(i.harga)}</span><span>${rp(i.subtotal)}</span></div>`).join('')}<hr><div class="rrow"><span>Subtotal</span><span>${rp(tr.subtotal)}</span></div><div class="rrow"><span>Diskon</span><span>${rp(tr.diskon)}</span></div><div class="rrow"><span>Pajak</span><span>${rp(tr.pajak)}</span></div><div class="rrow big"><span>TOTAL</span><span>${rp(tr.total)}</span></div><div class="rrow"><span>${tr.metode}</span><span>${rp(tr.bayar)}</span></div><div class="rrow"><span>Kembali</span><span>${rp(tr.kembali)}</span></div><hr><div class="center-text">${toko.footer_struk||'Terima kasih'}</div>${freeBrand}</div>`}
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
  out.push(new Date(tr.created_at).toLocaleString('id-ID'));
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
  changePassForm.onsubmit=async e=>{e.preventDefault();try{await api('/api/change-password',{method:'POST',body:Object.fromEntries(new FormData(changePassForm).entries())});closeModal();toast('Password berhasil diubah. Silakan login ulang.');setTimeout(()=>{localStorage.clear();sessionStorage.clear();location.href='/'},900)}catch(err){alert(err.message)}}
}
function togglePassword(id){const el=document.getElementById(id); if(el) el.type=el.type==='password'?'text':'password'}
