const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.warn('PERINGATAN: DATABASE_URL belum disetel. Buat Supabase lalu isi DATABASE_URL di Railway Variables.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

function nowJakartaSQL(){
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date()).replace(' ', 'T');
  return parts.replace('T',' ');
}
function todayJakartaDate(){
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function toPgSql(sql){
  let i=0;
  let out='';
  let inSingle=false, inDouble=false;
  for (let c of sql){
    if(c==="'" && !inDouble) inSingle=!inSingle;
    if(c==='"' && !inSingle) inDouble=!inDouble;
    if(c==='?' && !inSingle && !inDouble){ out += '$'+(++i); }
    else out += c;
  }
  return out
    .replace(/date\(([^)]+)\)/g, 'DATE($1)')
    .replace(/datetime\(([^)]+)\)/g, '($1)::timestamp')
    .replace(/substr\(/g, 'substring(')
    .replace(/CURRENT_TIMESTAMP/g, "(NOW() AT TIME ZONE 'Asia/Jakarta')")
    .replace(/role="kasir"/g, "role='kasir'")
    .replace(/role IN \("admin","kasir"\)/g, "role IN ('admin','kasir')")
    .replace(/NULLIF\(\$,''\)/g, "NULLIF($")
}
async function run(sql, params = []) {
  let q = toPgSql(sql);
  if (/^\s*INSERT\s+/i.test(q) && !/RETURNING\s+/i.test(q)) q += ' RETURNING id';
  const r = await pool.query(q, params);
  return { changes: r.rowCount || 0, lastInsertRowid: r.rows?.[0]?.id || 0 };
}
async function get(sql, params = []) { const r = await pool.query(toPgSql(sql), params); return r.rows[0]; }
async function all(sql, params = []) { const r = await pool.query(toPgSql(sql), params); return r.rows; }
async function exec(sql) { await pool.query(sql); }


async function createJsonBackup(createdBy=0, prefix='backup') {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const tables = [
    'tokos','users','products','transactions','transaction_items','debts','audit_logs','holds',
    'suppliers','restocks','members','promos','attendances','targets','price_approvals','billings',
    'cashbooks','cash_closings','security_settings','void_requests','backup_reminders','shift_sessions'
  ];
  const data = {
    app: 'TECNO POS',
    type: 'SUPABASE_POSTGRES_JSON_BACKUP',
    created_at: new Date().toISOString(),
    created_by: createdBy,
    tables: {}
  };

  for (const table of tables) {
    try {
      data.tables[table] = await all(`SELECT * FROM ${table} ORDER BY id ASC`);
    } catch (e) {
      data.tables[table] = { error: e.message };
    }
  }

  const fileName = `${prefix}-${Date.now()}.json`;
  const fullPath = path.join(backupDir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
  try { await run('INSERT INTO app_backups(file,created_by) VALUES(?,?)', [fileName, createdBy]); } catch(e) {}
  return fileName;
}

async function log(user, aksi, detail='') {
  try {
    const userId = user?.id || 0;
    const tokoId = user?.toko_id || 0;
    await run('INSERT INTO audit_logs (user_id,toko_id,aksi,detail) VALUES (?,?,?,?)', [userId, tokoId, String(aksi||''), String(detail||'')]);
  } catch (e) {
    console.log('AUDIT LOG SKIP:', e.message);
  }
}
async function initDb(){ await pool.query('SELECT 1'); }
function now() { return new Date().toISOString(); }
function rupiah(n) { return Number(n || 0); }
function code(prefix) {
  const d=new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  const seq=Date.now().toString(36).toUpperCase().slice(-5)+Math.floor(Math.random()*999).toString().padStart(3,'0');
  return `${prefix}-${y}${m}${day}-${seq}`;
}
async function uniqueInvoice(tokoId, preferred='') {
  let inv = String(preferred || '').trim();
  if (!inv || inv.startsWith('OFF-') || inv === 'OFF') inv = code('TRX');

  // Cegah invoice dobel ketika transaksi offline disync bersamaan.
  for (let i = 0; i < 5; i++) {
    const exists = await get('SELECT id FROM transactions WHERE invoice=? AND toko_id=?', [inv, tokoId]);
    if (!exists) return inv;
    inv = code('TRX');
  }
  return code('TRX');
}
function safeNum(v){
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  let x=String(v??'').trim().replace(/Rp/gi,'').replace(/\s/g,'');
  if(!x) return 0;
  if(x.includes('.') && x.includes(',')) x=x.replace(/\./g,'').replace(',', '.');
  else if(x.includes('.')) x=x.replace(/\./g,'');
  else x=x.replace(',', '.');
  const n=Number(x);
  return Number.isFinite(n)?n:0;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const PACKAGE_LIMITS = {
  GRATIS: { kasir: 10, produk: 1000, qris: 1, hutang: 1, barcode: 1, laporan: 1, thermal: 1, multi_device: 1 },
  BASIC: { kasir: 3, produk: 999999, qris: 1, hutang: 1, barcode: 1, laporan: 1, thermal: 1, multi_device: 1 },
  PRO: { kasir: 10, produk: 999999, qris: 1, hutang: 1, barcode: 1, laporan: 1, thermal: 1, multi_device: 1 },
  ENTERPRISE: { kasir: 999999, produk: 999999, qris: 1, hutang: 1, barcode: 1, laporan: 1, thermal: 1, multi_device: 1 }
};

async function migrate() {
  await exec(`
  CREATE TABLE IF NOT EXISTS tokos (
    id SERIAL PRIMARY KEY,
    nama_toko TEXT NOT NULL,
    pemilik TEXT DEFAULT '', logo TEXT DEFAULT '', alamat TEXT DEFAULT '', no_hp TEXT DEFAULT '',
    footer_struk TEXT DEFAULT 'Terima kasih, belanja kembali', ukuran_struk TEXT DEFAULT '58',
    paket TEXT DEFAULT 'GRATIS', status TEXT DEFAULT 'AKTIF', expired_at TEXT DEFAULT '',
    qris TEXT DEFAULT '', rekening TEXT DEFAULT '', payment_status TEXT DEFAULT 'PAID',
    mode_tema TEXT DEFAULT 'eye', warna_tema TEXT DEFAULT 'blue', billing_cycle TEXT DEFAULT 'MONTHLY',
    last_paid_at TEXT DEFAULT '', next_invoice_amount INTEGER DEFAULT 0, catatan_billing TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta')
  );
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, toko_id INTEGER, nama TEXT NOT NULL, username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, pin TEXT DEFAULT '123456', role TEXT NOT NULL, status TEXT DEFAULT 'AKTIF',
    mode_tema TEXT DEFAULT 'eye', warna_tema TEXT DEFAULT 'blue',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta')
  );
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, toko_id INTEGER NOT NULL, barcode TEXT DEFAULT '', nama TEXT NOT NULL,
    kategori TEXT DEFAULT 'Umum', satuan TEXT DEFAULT 'PCS', harga_beli INTEGER DEFAULT 0,
    harga_jual INTEGER DEFAULT 0, harga_grosir INTEGER DEFAULT 0, stok INTEGER DEFAULT 0,
    min_stok INTEGER DEFAULT 5, supplier_id INTEGER DEFAULT 0, expired_at TEXT DEFAULT '', rak TEXT DEFAULT '',
    harga_member INTEGER DEFAULT 0, foto TEXT DEFAULT '', deskripsi TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta')
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY, toko_id INTEGER NOT NULL, kasir_id INTEGER, invoice TEXT UNIQUE NOT NULL,
    customer TEXT DEFAULT 'Umum', subtotal INTEGER DEFAULT 0, diskon INTEGER DEFAULT 0, pajak INTEGER DEFAULT 0,
    biaya INTEGER DEFAULT 0, total INTEGER DEFAULT 0, bayar INTEGER DEFAULT 0, kembali INTEGER DEFAULT 0,
    metode TEXT DEFAULT 'TUNAI', status TEXT DEFAULT 'LUNAS', member_id INTEGER DEFAULT 0, voucher TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta')
  );
  CREATE TABLE IF NOT EXISTS transaction_items (
    id SERIAL PRIMARY KEY, transaction_id INTEGER NOT NULL, product_id INTEGER, nama TEXT NOT NULL,
    qty INTEGER DEFAULT 1, harga INTEGER DEFAULT 0, subtotal INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS debts (
    id SERIAL PRIMARY KEY, toko_id INTEGER NOT NULL, transaction_id INTEGER, nama_pelanggan TEXT NOT NULL,
    total INTEGER DEFAULT 0, dibayar INTEGER DEFAULT 0, status TEXT DEFAULT 'BELUM LUNAS',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta')
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY, user_id INTEGER, toko_id INTEGER, aksi TEXT NOT NULL, detail TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta')
  );
  CREATE TABLE IF NOT EXISTS holds (
    id SERIAL PRIMARY KEY, toko_id INTEGER NOT NULL, kasir_id INTEGER, kode TEXT NOT NULL,
    customer TEXT DEFAULT 'Umum', items_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta')
  );
  CREATE TABLE IF NOT EXISTS suppliers (id SERIAL PRIMARY KEY, toko_id INTEGER, nama TEXT, hp TEXT, alamat TEXT, catatan TEXT DEFAULT '', created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS restocks (id SERIAL PRIMARY KEY, toko_id INTEGER, supplier_id INTEGER DEFAULT 0, product_id INTEGER, qty INTEGER DEFAULT 0, harga_beli INTEGER DEFAULT 0, total INTEGER DEFAULT 0, catatan TEXT DEFAULT '', created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS members (id SERIAL PRIMARY KEY, toko_id INTEGER, nama TEXT, hp TEXT, alamat TEXT, poin INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS promos (id SERIAL PRIMARY KEY, toko_id INTEGER, kode TEXT, nama TEXT, tipe TEXT DEFAULT 'NOMINAL', nilai INTEGER DEFAULT 0, status TEXT DEFAULT 'AKTIF', created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS attendances (id SERIAL PRIMARY KEY, toko_id INTEGER, kasir_id INTEGER, kasir_nama TEXT, masuk_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'), pulang_at TEXT DEFAULT '', status TEXT DEFAULT 'MASUK');
  CREATE TABLE IF NOT EXISTS targets (id SERIAL PRIMARY KEY, toko_id INTEGER UNIQUE, target_bulanan INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS price_approvals (id SERIAL PRIMARY KEY, toko_id INTEGER, kasir_id INTEGER, product_id INTEGER, harga_lama INTEGER, harga_baru INTEGER, alasan TEXT, status TEXT DEFAULT 'PENDING', created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS billings (id SERIAL PRIMARY KEY, toko_id INTEGER, invoice TEXT UNIQUE, paket TEXT, nominal INTEGER DEFAULT 0, status TEXT DEFAULT 'BELUM BAYAR', bukti_url TEXT DEFAULT '', catatan TEXT DEFAULT '', jatuh_tempo TEXT DEFAULT '', paid_at TEXT DEFAULT '', created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS app_backups (id SERIAL PRIMARY KEY, file TEXT, created_by INTEGER, created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS cashbooks (id SERIAL PRIMARY KEY, toko_id INTEGER, tipe TEXT DEFAULT 'KELUAR', kategori TEXT DEFAULT '', nominal INTEGER DEFAULT 0, catatan TEXT DEFAULT '', user_id INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS cash_closings (id SERIAL PRIMARY KEY, toko_id INTEGER, kasir_id INTEGER DEFAULT 0, uang_awal INTEGER DEFAULT 0, uang_sistem INTEGER DEFAULT 0, uang_fisik INTEGER DEFAULT 0, selisih INTEGER DEFAULT 0, catatan TEXT DEFAULT '', status TEXT DEFAULT 'TUTUP', created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS security_settings (id SERIAL PRIMARY KEY, toko_id INTEGER UNIQUE, pin_refund TEXT DEFAULT '1234', pin_setting TEXT DEFAULT '1234', lock_harga INTEGER DEFAULT 1, mode_toko TEXT DEFAULT 'BUKA', updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'));
  CREATE TABLE IF NOT EXISTS void_requests (id SERIAL PRIMARY KEY, toko_id INTEGER, transaksi_id INTEGER, kasir_id INTEGER, alasan TEXT DEFAULT '', status TEXT DEFAULT 'PENDING', approved_by INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'), approved_at TEXT DEFAULT '');
  CREATE TABLE IF NOT EXISTS backup_reminders (id SERIAL PRIMARY KEY, toko_id INTEGER UNIQUE, last_backup_at TEXT DEFAULT '', remind_days INTEGER DEFAULT 7);
  CREATE TABLE IF NOT EXISTS shift_sessions (id SERIAL PRIMARY KEY, toko_id INTEGER NOT NULL, kasir_id INTEGER NOT NULL, kasir_nama TEXT DEFAULT '', uang_awal INTEGER DEFAULT 0, uang_sistem INTEGER DEFAULT 0, uang_fisik INTEGER DEFAULT 0, selisih INTEGER DEFAULT 0, status TEXT DEFAULT 'OPEN', catatan_buka TEXT DEFAULT '', catatan_tutup TEXT DEFAULT '', buka_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Jakarta'), tutup_at TEXT DEFAULT '');
  `);

  try { await exec("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS offline_client_id TEXT UNIQUE"); } catch(e) { console.log('offline_client_id skip', e.message); }
  try { await exec("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS poin_didapat INTEGER DEFAULT 0"); } catch(e) { console.log('poin_didapat skip', e.message); }
  try { await exec("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS poin_sisa INTEGER DEFAULT 0"); } catch(e) { console.log('poin_sisa skip', e.message); }
  try { await exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT '123456'"); } catch(e) { console.log('pin skip', e.message); }

  let toko = await get('SELECT * FROM tokos LIMIT 1');
  if (!toko) {
    await run(`INSERT INTO tokos (nama_toko,pemilik,alamat,no_hp,paket,status,qris,rekening) VALUES (?,?,?,?,?,?,?,?)`,
      ['Handoko Net Store','Pemilik Toko','Alamat toko belum disetel','08xxxxxxxxxx','PRO','AKTIF','QRIS toko belum disetel','BCA 000000 a.n Toko']);
    toko = await get('SELECT * FROM tokos LIMIT 1');
  }
  if (!(await get('SELECT * FROM users WHERE username=?', ['developer']))) await run('INSERT INTO users (toko_id,nama,username,password,role) VALUES (?,?,?,?,?)', [0,'Developer','developer','dev123','developer']);
  if (!(await get('SELECT * FROM users WHERE username=?', ['admin']))) await run('INSERT INTO users (toko_id,nama,username,password,role) VALUES (?,?,?,?,?)', [toko.id,'Admin Toko','admin','admin123','admin']);
  if (!(await get('SELECT * FROM users WHERE username=?', ['kasir']))) await run('INSERT INTO users (toko_id,nama,username,password,role) VALUES (?,?,?,?,?)', [toko.id,'Kasir','kasir','kasir123','kasir']);
  const cnt = await get('SELECT COUNT(*)::int c FROM products WHERE toko_id=?', [toko.id]);
  if (Number(cnt.c) === 0) {
    const sample = [
      ['899999900001','Indomie Goreng','Makanan','PCS',2500,3500,3200,40],
      ['899999900002','Aqua 600ml','Minuman','PCS',2500,4000,3700,25],
      ['899999900003','Kopi Sachet','Minuman','PCS',1000,2000,1800,60]
    ];
    for (const p of sample) await run('INSERT INTO products (toko_id,barcode,nama,kategori,satuan,harga_beli,harga_jual,harga_grosir,stok) VALUES (?,?,?,?,?,?,?,?,?)', [toko.id, ...p]);
  }
}
async function migrateProTables(){}
async function migrateBillingTables(){}
async function auth(req, res, next) {
  const id = Number(req.headers['x-user-id'] || req.query.user_id || 0);
  const user = await get('SELECT * FROM users WHERE id=?', [id]);
  if (!user || user.status !== 'AKTIF') return res.status(401).json({ ok:false, message:'Sesi tidak valid' });

  // Developer boleh tetap masuk walaupun toko lain nonaktif.
  // Admin/Kasir otomatis terkunci jika toko disuspend/nonaktif oleh developer.
  if (user.role !== 'developer') {
    let toko = await get('SELECT * FROM tokos WHERE id=?', [user.toko_id]);
    if (!toko) return res.status(403).json({ ok:false, message:'Toko tidak ditemukan' });
    toko = await suspendExpiredToko(toko);
    if (toko.status !== 'AKTIF') {
      return res.status(403).json({
        ok:false,
        code:'TOKO_NONAKTIF',
        message: toko.status==='SUSPEND' ? 'Toko disuspend / masa aktif habis. Hubungi developer untuk aktivasi paket.' : 'Toko nonaktif. Hubungi developer.'
      });
    }
  }

  req.user = user;
  next();
}
async function tokoFor(user) {
  if (user.role === 'developer') return null;
  return await get('SELECT * FROM tokos WHERE id=?', [user.toko_id]);
}
function ensureRole(roles) {
  return (req,res,next)=> roles.includes(req.user.role) ? next() : res.status(403).json({ ok:false, message:'Akses ditolak' });
}
function packageLimit(toko) { return PACKAGE_LIMITS[toko?.paket || 'GRATIS'] || PACKAGE_LIMITS.GRATIS; }

function addMonthsISO(months=1){ const d=new Date(); d.setMonth(d.getMonth()+Number(months||1)); return d.toISOString().slice(0,10); }
function isExpiredDate(v){ if(!v) return false; return new Date(String(v).slice(0,10)+'T23:59:59') < new Date(); }
function daysLeft(v){ if(!v) return null; return Math.ceil((new Date(String(v).slice(0,10)+'T23:59:59')-new Date())/86400000); }
function billingStatus(toko){ if(!toko) return {expired:false,days_left:null,reminder:''}; const dl=daysLeft(toko.expired_at); const expired=isExpiredDate(toko.expired_at); let reminder=''; if(expired) reminder='Masa aktif habis'; else if(dl!==null && dl<=7) reminder=`Masa aktif tinggal ${dl} hari`; return {expired,days_left:dl,reminder}; }
async function suspendExpiredToko(toko){ if(toko && toko.status==='AKTIF' && isExpiredDate(toko.expired_at)){ await run("UPDATE tokos SET status='SUSPEND', payment_status='EXPIRED' WHERE id=?", [toko.id]); return {...toko,status:'SUSPEND',payment_status:'EXPIRED'}; } return toko; }

app.get('/', async (req,res)=>res.sendFile(path.join(__dirname,'public','login.html')));
app.get('/developer.html', async (req,res)=>res.sendFile(path.join(__dirname,'public','developer.html')));
app.get('/admin.html', async (req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/kasir.html', async (req,res)=>res.sendFile(path.join(__dirname,'public','kasir.html')));

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  const user = await get('SELECT * FROM users WHERE username=? AND password=?', [username, password]);
  if (!user) return res.status(401).json({ ok:false, message:'Username atau password salah' });
  if (user.status !== 'AKTIF') return res.status(403).json({ ok:false, message:'Akun nonaktif' });
  let toko = user.role === 'developer' ? null : await get('SELECT * FROM tokos WHERE id=?', [user.toko_id]);
  toko = toko ? await suspendExpiredToko(toko) : toko;
  if (toko && toko.status !== 'AKTIF') return res.status(403).json({ ok:false, message: toko.status==='SUSPEND' ? 'Toko disuspend / masa aktif habis. Hubungi developer.' : 'Toko nonaktif, hubungi developer' });
  await log(user, 'LOGIN', user.username);
  res.json({ ok:true, user: { id:user.id, nama:user.nama, username:user.username, role:user.role, toko_id:user.toko_id, pin_set: !!user.pin, remember_until: new Date(Date.now() + (user.role==='kasir'?7:30)*86400000).toISOString() }, toko });
});

app.get('/api/me', auth, async (req,res)=> { const toko=await tokoFor(req.user); res.json({ ok:true, user:req.user, toko, limits: packageLimit(toko), billing: billingStatus(toko) }); });

// POS sungguhan: lock screen pakai PIN dan ganti kasir cepat tanpa logout perangkat.
app.post('/api/unlock-pin', auth, async (req,res)=>{
  const pin = String(req.body.pin || '').trim();
  if(!pin) return res.status(400).json({ok:false,message:'PIN wajib diisi'});
  const user = await get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if(!user || String(user.pin || user.password) !== pin) return res.status(401).json({ok:false,message:'PIN salah'});
  await log(user,'UNLOCK PIN','Buka kunci kasir');
  res.json({ok:true});
});
app.post('/api/change-pin', auth, ensureRole(['admin','kasir']), async (req,res)=>{
  const pin = String(req.body.pin || '').trim();
  if(!/^\d{4,6}$/.test(pin)) return res.status(400).json({ok:false,message:'PIN harus angka 4-6 digit'});
  await run('UPDATE users SET pin=? WHERE id=?', [pin, req.user.id]);
  await log(req.user,'UBAH PIN','PIN akun diubah');
  res.json({ok:true});
});
app.get('/api/kasir/users', auth, ensureRole(['admin','kasir']), async (req,res)=>{
  res.json({ok:true,data:await all("SELECT id,nama,username,role,status FROM users WHERE toko_id=? AND role='kasir' AND status='AKTIF' ORDER BY nama ASC", [req.user.toko_id])});
});
app.post('/api/switch-kasir-pin', auth, ensureRole(['admin','kasir']), async (req,res)=>{
  const kasirId = Number(req.body.kasir_id||0);
  const pin = String(req.body.pin||'').trim();
  const user = await get("SELECT * FROM users WHERE id=? AND toko_id=? AND role='kasir' AND status='AKTIF'", [kasirId, req.user.toko_id]);
  if(!user) return res.status(404).json({ok:false,message:'Kasir tidak ditemukan'});
  if(String(user.pin || user.password) !== pin) return res.status(401).json({ok:false,message:'PIN kasir salah'});
  const toko = await tokoFor(user);
  await log(user,'GANTI KASIR PIN',`Perangkat masuk ke ${user.username}`);
  res.json({ok:true,user:{id:user.id,nama:user.nama,username:user.username,role:user.role,toko_id:user.toko_id,pin_set:!!user.pin,remember_until:new Date(Date.now()+7*86400000).toISOString()},toko});
});


app.get('/api/developer/summary', auth, ensureRole(['developer']), async (req,res)=>{
  const toko = (await get('SELECT COUNT(*)::int c FROM tokos')).c;
  const aktif = (await get("SELECT COUNT(*)::int c FROM tokos WHERE status='AKTIF'")).c;
  const trx = await get('SELECT COUNT(*) c, COALESCE(SUM(total),0) omzet FROM transactions');
  const kasir = (await get("SELECT COUNT(*)::int c FROM users WHERE role='kasir'")).c;
  res.json({ ok:true, data:{ toko, aktif, transaksi:trx.c, omzet:trx.omzet, kasir } });
});
app.get('/api/developer/tokos', auth, ensureRole(['developer']), async (req,res)=>{
  res.json({ ok:true, data: await all(`SELECT t.*, 
    (SELECT COUNT(*) FROM users u WHERE u.toko_id=t.id AND u.role='kasir') kasir_count,
    (SELECT COUNT(*) FROM products p WHERE p.toko_id=t.id) product_count,
    (SELECT COALESCE(SUM(total),0) FROM transactions tr WHERE tr.toko_id=t.id) omzet
    FROM tokos t ORDER BY id DESC`) });
});
app.post('/api/developer/tokos', auth, ensureRole(['developer']), async (req,res)=>{
  const b=req.body; const paket=b.paket || 'GRATIS';
  const info = await run('INSERT INTO tokos (nama_toko,pemilik,alamat,no_hp,paket,status,footer_struk,ukuran_struk,qris,rekening,expired_at,payment_status,next_invoice_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [b.nama_toko,b.pemilik||'',b.alamat||'',b.no_hp||'',paket,b.status||'AKTIF',b.footer_struk||'Terima kasih',b.ukuran_struk||'58',b.qris||'',b.rekening||'',b.expired_at||addMonthsISO(1),b.payment_status||'PAID',Number(b.next_invoice_amount||0)]);
  const tokoId = info.lastInsertRowid;
  const userAdmin = b.admin_username || `admin${tokoId}`;
  await run('INSERT INTO users (toko_id,nama,username,password,role) VALUES (?,?,?,?,?)', [tokoId, b.admin_nama || 'Admin Toko', userAdmin, b.admin_password || 'admin123', 'admin']);
  await log(req.user,'TAMBAH TOKO',b.nama_toko);
  res.json({ ok:true, id:tokoId });
});
app.put('/api/developer/tokos/:id', auth, ensureRole(['developer']), async (req,res)=>{
  const b=req.body;
  await run(`UPDATE tokos SET nama_toko=?, pemilik=?, alamat=?, no_hp=?, paket=?, status=?, footer_struk=?, ukuran_struk=?, qris=?, rekening=?, expired_at=?, payment_status=?, next_invoice_amount=? WHERE id=?`,
    [b.nama_toko,b.pemilik||'',b.alamat||'',b.no_hp||'',b.paket||'GRATIS',b.status||'AKTIF',b.footer_struk||'Terima kasih',b.ukuran_struk||'58',b.qris||'',b.rekening||'',b.expired_at||'',b.payment_status||'PAID',Number(b.next_invoice_amount||0),req.params.id]);
  await log(req.user,'EDIT TOKO',String(req.params.id));
  res.json({ ok:true });
});
app.post('/api/developer/reset-password', auth, ensureRole(['developer']), async (req,res)=>{
  const password = String(req.body.password || '123456').trim();
  if(password.length < 6) return res.status(400).json({ ok:false, message:'Password minimal 6 karakter' });
  await run('UPDATE users SET password=? WHERE id=?', [password, req.body.user_id]);
  await log(req.user,'RESET PASSWORD',String(req.body.user_id));
  res.json({ ok:true });
});
app.post('/api/developer/reset-all-passwords', auth, ensureRole(['developer']), async (req,res)=>{
  const password = String(req.body.password || '123456').trim();
  if(password.length < 6) return res.status(400).json({ ok:false, message:'Password minimal 6 karakter' });
  const info = await run('UPDATE users SET password=? WHERE role IN ("admin","kasir")', [password]);
  await log(req.user,'RESET ALL PASSWORDS',`Admin/Kasir direset: ${info.changes || 0} akun`);
  res.json({ ok:true, updated: info.changes || 0 });
});
app.get('/api/developer/users', auth, ensureRole(['developer']), async (req,res)=>{
  res.json({ ok:true, data: await all(`SELECT u.id,u.nama,u.username,u.role,u.status,u.toko_id,t.nama_toko FROM users u LEFT JOIN tokos t ON t.id=u.toko_id ORDER BY u.id DESC`) });
});
app.get('/api/developer/logs', auth, ensureRole(['developer']), async (req,res)=> res.json({ ok:true, data: await all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100') }));
app.post('/api/developer/backup', auth, ensureRole(['developer']), async (req,res)=>{
  const file = await createJsonBackup(req.user.id, 'backup');
  res.json({ ok:true, file });
});

app.get('/api/admin/summary', auth, ensureRole(['admin']), async (req,res)=>{
  const tid=req.user.toko_id; const toko=await tokoFor(req.user);
  // FIX AMAN: jangan batasi tanggal di summary. Ini mencegah transaksi sore/maghrib tidak terbaca karena beda timezone.
  const tr = await get("SELECT COUNT(*) c, COALESCE(SUM(total),0) omzet FROM transactions WHERE toko_id=? AND status<>'VOID'", [tid]);
  const prod = (await get('SELECT COUNT(*)::int c FROM products WHERE toko_id=?', [tid])).c;
  const low = (await get('SELECT COUNT(*)::int c FROM products WHERE toko_id=? AND stok<=min_stok', [tid])).c;
  const kasir = (await get("SELECT COUNT(*)::int c FROM users WHERE toko_id=? AND role='kasir'", [tid])).c;
  res.json({ ok:true, data:{ toko, transaksi:tr.c, omzet:tr.omzet, produk:prod, stok_menipis:low, kasir, limits:packageLimit(toko) } });
});
app.get('/api/admin/products', auth, ensureRole(['admin','kasir']), async (req,res)=>{
  const q = `%${req.query.q || ''}%`;
  res.json({ ok:true, data: await all('SELECT * FROM products WHERE toko_id=? AND (nama LIKE ? OR barcode LIKE ? OR kategori LIKE ?) ORDER BY nama ASC', [req.user.toko_id,q,q,q]) });
});
app.get('/api/products', auth, ensureRole(['admin','kasir']), async (req,res)=>{
  const q = `%${req.query.q || ''}%`;
  res.json({ ok:true, data: await all('SELECT * FROM products WHERE toko_id=? AND (nama LIKE ? OR barcode LIKE ? OR kategori LIKE ?) ORDER BY nama ASC', [req.user.toko_id,q,q,q]) });
});
app.post('/api/admin/products', auth, ensureRole(['admin']), async (req,res)=>{
  const toko=await tokoFor(req.user); const lim=packageLimit(toko);
  const count=(await get('SELECT COUNT(*)::int c FROM products WHERE toko_id=?',[req.user.toko_id])).c;
  if (count >= lim.produk) return res.status(403).json({ ok:false, message:`Paket ${toko.paket} maksimal ${lim.produk} produk` });
  const b=req.body;
  await run('INSERT INTO products (toko_id,barcode,nama,kategori,satuan,harga_beli,harga_jual,harga_grosir,stok,min_stok,supplier_id,expired_at,rak,harga_member,foto,deskripsi) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [req.user.toko_id,b.barcode||'',b.nama,b.kategori||'Umum',b.satuan||'PCS',rupiah(b.harga_beli),rupiah(b.harga_jual),rupiah(b.harga_grosir),Number(b.stok||0),Number(b.min_stok||5),Number(b.supplier_id||0),b.expired_at||'',b.rak||'',rupiah(b.harga_member),b.foto||'',b.deskripsi||'']);
  await log(req.user,'TAMBAH PRODUK',b.nama);
  res.json({ ok:true });
});
app.put('/api/admin/products/:id', auth, ensureRole(['admin']), async (req,res)=>{
  const b=req.body;
  await run('UPDATE products SET barcode=?,nama=?,kategori=?,satuan=?,harga_beli=?,harga_jual=?,harga_grosir=?,stok=?,min_stok=?,supplier_id=?,expired_at=?,rak=?,harga_member=?,foto=?,deskripsi=? WHERE id=? AND toko_id=?',
    [b.barcode||'',b.nama,b.kategori||'Umum',b.satuan||'PCS',rupiah(b.harga_beli),rupiah(b.harga_jual),rupiah(b.harga_grosir),Number(b.stok||0),Number(b.min_stok||5),Number(b.supplier_id||0),b.expired_at||'',b.rak||'',rupiah(b.harga_member),b.foto||'',b.deskripsi||'',req.params.id,req.user.toko_id]);
  await log(req.user,'EDIT PRODUK',String(req.params.id));
  res.json({ ok:true });
});
app.delete('/api/admin/products/:id', auth, ensureRole(['admin']), async (req,res)=>{ await run('DELETE FROM products WHERE id=? AND toko_id=?',[req.params.id,req.user.toko_id]); res.json({ok:true}); });
app.get('/api/admin/kasir', auth, ensureRole(['admin']), async (req,res)=> res.json({ ok:true, data: await all("SELECT id,nama,username,status,created_at FROM users WHERE toko_id=? AND role='kasir' ORDER BY id DESC", [req.user.toko_id]) }));
app.post('/api/admin/kasir', auth, ensureRole(['admin']), async (req,res)=>{
  const toko=await tokoFor(req.user); const lim=packageLimit(toko);
  const count=(await get("SELECT COUNT(*)::int c FROM users WHERE toko_id=? AND role='kasir'",[req.user.toko_id])).c;
  if (count >= lim.kasir) return res.status(403).json({ ok:false, message:`Paket ${toko.paket} hanya mendukung ${lim.kasir} kasir. Upgrade paket di developer.` });
  const b=req.body;
  const nama = String(b.nama || '').trim();
  const username = String(b.username || '').trim();
  const password = String(b.password || '123456').trim();
  const pin = String(b.pin || password || '123456').trim().slice(0,6);
  if(!nama || !username) return res.status(400).json({ok:false,message:'Nama dan username kasir wajib diisi'});
  const exists = await get('SELECT id FROM users WHERE username=?', [username]);
  if(exists) return res.status(400).json({ok:false,message:'Username kasir sudah dipakai. Gunakan username lain.'});
  await run('INSERT INTO users (toko_id,nama,username,password,pin,role,status) VALUES (?,?,?,?,?,?,?)', [req.user.toko_id,nama,username,password,pin,'kasir',b.status||'AKTIF']);
  await log(req.user,'TAMBAH KASIR',username);
  res.json({ ok:true, message:'Kasir berhasil ditambahkan', pin });
});
app.put('/api/admin/kasir/:id', auth, ensureRole(['admin']), async (req,res)=>{
  const b=req.body;
  const nama = String(b.nama || '').trim();
  const username = String(b.username || '').trim();
  const password = String(b.password || '').trim();
  if(!nama || !username) return res.status(400).json({ok:false,message:'Nama dan username kasir wajib diisi'});
  const other = await get('SELECT id FROM users WHERE username=? AND id<>?', [username, req.params.id]);
  if(other) return res.status(400).json({ok:false,message:'Username kasir sudah dipakai. Gunakan username lain.'});
  if(password){
    await run("UPDATE users SET nama=?,username=?,password=?,pin=?,status=? WHERE id=? AND toko_id=? AND role='kasir'", [nama,username,password,password.slice(0,6),b.status||'AKTIF',req.params.id,req.user.toko_id]);
  } else {
    await run("UPDATE users SET nama=?,username=?,status=? WHERE id=? AND toko_id=? AND role='kasir'", [nama,username,b.status||'AKTIF',req.params.id,req.user.toko_id]);
  }
  res.json({ok:true,message:'Kasir berhasil diperbarui'});
});

app.post('/api/admin/kasir/:id/reset-password', auth, ensureRole(['admin']), async (req,res)=>{
  const password = String(req.body.password || '').trim();
  if(password.length < 6) return res.status(400).json({ok:false,message:'Password minimal 6 karakter'});
  const info = await run("UPDATE users SET password=?, pin=? WHERE id=? AND toko_id=? AND role='kasir'", [password, password.slice(0,6), req.params.id, req.user.toko_id]);
  if(!info.changes) return res.status(404).json({ok:false,message:'Kasir tidak ditemukan'});
  await log(req.user,'RESET PASSWORD KASIR',String(req.params.id));
  res.json({ok:true});
});

app.get('/api/admin/transactions', auth, ensureRole(['admin','kasir']), async (req,res)=>{
  const mine = req.user.role === 'kasir' ? ' AND kasir_id='+Number(req.user.id) : '';
  // FIX AMAN: tampilkan transaksi terbaru berdasarkan created_at dan limit lebih besar.
  res.json({ ok:true, data: await all(`SELECT tr.*, u.nama kasir FROM transactions tr LEFT JOIN users u ON u.id=tr.kasir_id WHERE tr.toko_id=? ${mine} ORDER BY tr.created_at DESC, tr.id DESC LIMIT 1000`, [req.user.toko_id]) });
});
app.get('/api/admin/debts', auth, ensureRole(['admin']), async (req,res)=> res.json({ ok:true, data: await all('SELECT * FROM debts WHERE toko_id=? ORDER BY id DESC',[req.user.toko_id]) }));

app.get('/api/admin/chart', auth, ensureRole(['admin']), async (req,res)=>{
  const rows=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    const label=d.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short'});
    const r=await get("SELECT COALESCE(SUM(total),0) omzet, COUNT(*) trx FROM transactions WHERE toko_id=? AND date(created_at)=date(?)",[req.user.toko_id,key]);
    rows.push({tanggal:key,label,omzet:r.omzet||0,transaksi:r.trx||0});
  }
  res.json({ok:true,data:rows});
});

app.put('/api/admin/settings', auth, ensureRole(['admin']), async (req,res)=>{
  const b=req.body;
  await run('UPDATE tokos SET nama_toko=?,logo=?,alamat=?,no_hp=?,footer_struk=?,ukuran_struk=?,qris=?,rekening=? WHERE id=?', [b.nama_toko,b.logo||'',b.alamat||'',b.no_hp||'',b.footer_struk||'Terima kasih',b.ukuran_struk||'58',b.qris||'',b.rekening||'',req.user.toko_id]);
  res.json({ok:true});
});

app.post('/api/kasir/hold', auth, ensureRole(['kasir']), async (req,res)=>{
  const kode=code('HOLD');
  await run('INSERT INTO holds (toko_id,kasir_id,kode,customer,items_json) VALUES (?,?,?,?,?)',[req.user.toko_id,req.user.id,kode,req.body.customer||'Umum',JSON.stringify(req.body.items||[])]);
  res.json({ok:true,kode});
});
app.get('/api/kasir/holds', auth, ensureRole(['kasir']), async (req,res)=> res.json({ ok:true, data: await all('SELECT * FROM holds WHERE toko_id=? AND kasir_id=? ORDER BY id DESC',[req.user.toko_id,req.user.id]) }));
app.delete('/api/kasir/holds/:id', auth, ensureRole(['kasir']), async (req,res)=>{await run('DELETE FROM holds WHERE id=? AND toko_id=? AND kasir_id=?',[req.params.id,req.user.toko_id,req.user.id]);res.json({ok:true});});
app.post('/api/kasir/checkout', auth, ensureRole(['kasir']), async (req,res)=>{
  // Jika kasir belum buka kas, sistem buka otomatis Rp0 agar transaksi tidak macet.
  // Kasir tetap disarankan Buka Kas manual supaya laporan tutup kas lebih rapi.
  if(!await currentShift(req.user.toko_id, req.user.id)){
    try{ await run('INSERT INTO shift_sessions(toko_id,kasir_id,kasir_nama,uang_awal,catatan_buka) VALUES(?,?,?,?,?)',[req.user.toko_id,req.user.id,req.user.nama,0,'AUTO BUKA KAS']); }catch(e){}
  }
  const sec=await ensureSec(req.user.toko_id);
  if(sec.mode_toko==='TUTUP') return res.status(403).json({ok:false,message:'Toko sedang mode tutup. Kasir tidak bisa transaksi.'});
  const b=req.body; const items=b.items||[];
  if (!items.length) return res.status(400).json({ok:false,message:'Keranjang kosong'});
  const offlineClientId = String(b.offline_client_id || '').trim();
  if (offlineClientId) {
    const old = await get('SELECT tr.*, u.nama kasir FROM transactions tr LEFT JOIN users u ON u.id=tr.kasir_id WHERE tr.offline_client_id=? AND tr.toko_id=?', [offlineClientId, req.user.toko_id]);
    if (old) {
      const toko=await tokoFor(req.user);
      return res.json({ok:true, duplicate:true, transaction:old, items: await all('SELECT * FROM transaction_items WHERE transaction_id=?',[old.id]), toko});
    }
  }
  let invoice = await uniqueInvoice(req.user.toko_id, b.invoice);
  const subtotal=items.reduce((s,i)=>s+(Number(i.harga)*Number(i.qty)),0);
  const diskon=rupiah(b.diskon), pajak=rupiah(b.pajak), biaya=rupiah(b.biaya);
  const total=subtotal-diskon+pajak+biaya; const bayar=rupiah(b.bayar); const kembali=Math.max(0,bayar-total);
  const status=b.metode==='UTANG'?'UTANG':'LUNAS';
  const memberId=Number(b.member_id||0);
  let poinDidapat=0, poinSisa=0;
  if(memberId>0){
    const mem=await get('SELECT * FROM members WHERE id=? AND toko_id=?',[memberId,req.user.toko_id]);
    if(mem){
      poinDidapat=Math.floor(total/10000);
      poinSisa=Number(mem.poin||0)+poinDidapat;
      await run('UPDATE members SET poin=? WHERE id=? AND toko_id=?',[poinSisa,memberId,req.user.toko_id]);
    }
  }
  const createdAt=(b.client_time && /^\d{4}-\d{2}-\d{2} /.test(String(b.client_time))) ? String(b.client_time).slice(0,19) : nowJakartaSQL();
  let info;
  try {
    info = await run('INSERT INTO transactions (toko_id,kasir_id,invoice,customer,subtotal,diskon,pajak,biaya,total,bayar,kembali,metode,status,member_id,voucher,created_at,offline_client_id,poin_didapat,poin_sisa) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.toko_id,req.user.id,invoice,b.customer||'Umum',subtotal,diskon,pajak,biaya,total,bayar,kembali,b.metode||'TUNAI',status,memberId,b.voucher||'',createdAt,offlineClientId || null,poinDidapat,poinSisa]);
  } catch (e) {
    // FIX AMAN: jika invoice bentrok, jangan crash Railway. Buat invoice baru lalu ulang sekali.
    if (String(e.message || '').includes('transactions_invoice_key') || String(e.message || '').includes('duplicate key')) {
      invoice = await uniqueInvoice(req.user.toko_id, '');
      info = await run('INSERT INTO transactions (toko_id,kasir_id,invoice,customer,subtotal,diskon,pajak,biaya,total,bayar,kembali,metode,status,member_id,voucher,created_at,offline_client_id,poin_didapat,poin_sisa) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [req.user.toko_id,req.user.id,invoice,b.customer||'Umum',subtotal,diskon,pajak,biaya,total,bayar,kembali,b.metode||'TUNAI',status,memberId,b.voucher||'',createdAt,offlineClientId || null,poinDidapat,poinSisa]);
    } else {
      throw e;
    }
  }
  const trxId=info.lastInsertRowid;
  for (const it of items) {
    await run('INSERT INTO transaction_items (transaction_id,product_id,nama,qty,harga,subtotal) VALUES (?,?,?,?,?,?)', [trxId,it.id||0,it.nama,Number(it.qty),Number(it.harga),Number(it.qty)*Number(it.harga)]);
    if (it.id) await run('UPDATE products SET stok=stok-? WHERE id=? AND toko_id=?',[Number(it.qty),it.id,req.user.toko_id]);
  }
  if (status==='UTANG') await run('INSERT INTO debts (toko_id,transaction_id,nama_pelanggan,total,status) VALUES (?,?,?,?,?)',[req.user.toko_id,trxId,b.customer||'Pelanggan',total,'BELUM LUNAS']);
  const trx=await get('SELECT tr.*, u.nama kasir FROM transactions tr LEFT JOIN users u ON u.id=tr.kasir_id WHERE tr.id=?',[trxId]);
  const toko=await tokoFor(req.user);
  await log(req.user,'CHECKOUT',invoice);
  res.json({ok:true, transaction:trx, items: await all('SELECT * FROM transaction_items WHERE transaction_id=?',[trxId]), toko});
});

app.post('/api/change-password', auth, async (req,res)=>{
  const old_password = String(req.body.old_password || '');
  const new_password = String(req.body.new_password || '');
  const repeat_password = String(req.body.repeat_password || '');
  const user = await get('SELECT * FROM users WHERE id=?',[req.user.id]);
  if(!user || user.password !== old_password) return res.status(400).json({ok:false,message:'Password lama salah'});
  if(new_password.length < 6) return res.status(400).json({ok:false,message:'Password baru minimal 6 karakter'});
  if(new_password !== repeat_password) return res.status(400).json({ok:false,message:'Ulangi password tidak sama'});
  await run('UPDATE users SET password=? WHERE id=?',[new_password,req.user.id]);
  await log(req.user,'UBAH PASSWORD','Akun sendiri');
  res.json({ok:true});
});


app.put('/api/me/theme', auth, async (req,res)=>{
  const mode=['eye','light','dark'].includes(req.body.mode_tema)?req.body.mode_tema:'eye';
  const warna=['blue','green','purple','orange','black'].includes(req.body.warna_tema)?req.body.warna_tema:'blue';
  await run('UPDATE users SET mode_tema=?, warna_tema=? WHERE id=?',[mode,warna,req.user.id]);
  res.json({ok:true, mode_tema:mode, warna_tema:warna});
});

app.get('/api/receipt/:id', auth, async (req,res)=>{
  const tr=await get('SELECT tr.*, u.nama kasir FROM transactions tr LEFT JOIN users u ON u.id=tr.kasir_id WHERE tr.id=?',[req.params.id]);
  if(!tr || (req.user.role!=='developer' && tr.toko_id!==req.user.toko_id)) return res.status(404).json({ok:false});
  res.json({ok:true, transaction:tr, items:await all('SELECT * FROM transaction_items WHERE transaction_id=?',[tr.id]), toko:await get('SELECT * FROM tokos WHERE id=?',[tr.toko_id])});
});



// ===== TECNO POS LEVEL TINGGI: Supplier, Restock, Member, Promo, Log, AI, Absensi, Target =====
async function col(table,name,type){}
async function migrateProTables(){}

app.get('/api/admin/suppliers', auth, ensureRole(['admin']), async (req,res)=>res.json({ok:true,data:await all('SELECT * FROM suppliers WHERE toko_id=? ORDER BY id DESC',[req.user.toko_id])}));
app.post('/api/admin/suppliers', auth, ensureRole(['admin']), async (req,res)=>{const b=req.body; await run('INSERT INTO suppliers(toko_id,nama,hp,alamat,catatan) VALUES(?,?,?,?,?)',[req.user.toko_id,b.nama,b.hp||'',b.alamat||'',b.catatan||'']); await log(req.user,'TAMBAH SUPPLIER',b.nama); res.json({ok:true});});
app.put('/api/admin/suppliers/:id', auth, ensureRole(['admin']), async (req,res)=>{const b=req.body; await run('UPDATE suppliers SET nama=?,hp=?,alamat=?,catatan=? WHERE id=? AND toko_id=?',[b.nama,b.hp||'',b.alamat||'',b.catatan||'',req.params.id,req.user.toko_id]); res.json({ok:true});});

app.get('/api/admin/members', auth, ensureRole(['admin','kasir']), async (req,res)=>res.json({ok:true,data:await all('SELECT * FROM members WHERE toko_id=? ORDER BY nama ASC',[req.user.toko_id])}));
app.post('/api/admin/members', auth, ensureRole(['admin']), async (req,res)=>{const b=req.body; await run('INSERT INTO members(toko_id,nama,hp,alamat,poin) VALUES(?,?,?,?,?)',[req.user.toko_id,b.nama,b.hp||'',b.alamat||'',Number(b.poin||0)]); await log(req.user,'TAMBAH MEMBER',b.nama); res.json({ok:true});});
app.put('/api/admin/members/:id', auth, ensureRole(['admin']), async (req,res)=>{const b=req.body; await run('UPDATE members SET nama=?,hp=?,alamat=?,poin=? WHERE id=? AND toko_id=?',[b.nama,b.hp||'',b.alamat||'',Number(b.poin||0),req.params.id,req.user.toko_id]); res.json({ok:true});});

app.get('/api/admin/promos', auth, ensureRole(['admin','kasir']), async (req,res)=>res.json({ok:true,data:await all('SELECT * FROM promos WHERE toko_id=? ORDER BY id DESC',[req.user.toko_id])}));
app.post('/api/admin/promos', auth, ensureRole(['admin']), async (req,res)=>{const b=req.body; await run('INSERT INTO promos(toko_id,kode,nama,tipe,nilai,status) VALUES(?,?,?,?,?,?)',[req.user.toko_id,(b.kode||'').toUpperCase(),b.nama,b.tipe||'NOMINAL',Number(b.nilai||0),b.status||'AKTIF']); await log(req.user,'TAMBAH PROMO',b.kode); res.json({ok:true});});

app.post('/api/admin/restock', auth, ensureRole(['admin']), async (req,res)=>{const b=req.body; const qty=Number(b.qty||0), hb=Number(b.harga_beli||0); await run('INSERT INTO restocks(toko_id,supplier_id,product_id,qty,harga_beli,total,catatan) VALUES(?,?,?,?,?,?,?)',[req.user.toko_id,Number(b.supplier_id||0),Number(b.product_id),qty,hb,qty*hb,b.catatan||'']); await run('UPDATE products SET stok=stok+?, harga_beli=CASE WHEN ?>0 THEN ? ELSE harga_beli END WHERE id=? AND toko_id=?',[qty,hb,hb,b.product_id,req.user.toko_id]); await log(req.user,'RESTOCK',String(b.product_id)); res.json({ok:true});});
app.get('/api/admin/restocks', auth, ensureRole(['admin']), async (req,res)=>res.json({ok:true,data:await all(`SELECT r.*, p.nama produk, s.nama supplier FROM restocks r LEFT JOIN products p ON p.id=r.product_id LEFT JOIN suppliers s ON s.id=r.supplier_id WHERE r.toko_id=? ORDER BY r.id DESC LIMIT 100`,[req.user.toko_id])}));

app.get('/api/admin/low-stock', auth, ensureRole(['admin','kasir']), async (req,res)=>res.json({ok:true,data:await all('SELECT * FROM products WHERE toko_id=? AND stok<=min_stok ORDER BY stok ASC',[req.user.toko_id])}));
app.get('/api/admin/expired', auth, ensureRole(['admin']), async (req,res)=>res.json({ok:true,data:await all(`SELECT * FROM products WHERE toko_id=? AND expired_at<>'' ORDER BY expired_at ASC`,[req.user.toko_id])}));
app.get('/api/admin/logs', auth, ensureRole(['admin']), async (req,res)=>res.json({ok:true,data:await all('SELECT * FROM audit_logs WHERE toko_id=? ORDER BY id DESC LIMIT 100',[req.user.toko_id])}));

app.get('/api/admin/target', auth, ensureRole(['admin']), async (req,res)=>{let t=await get('SELECT * FROM targets WHERE toko_id=?',[req.user.toko_id])||{target_bulanan:0}; const bulan=new Date().toISOString().slice(0,7); const om=(await get("SELECT COALESCE(SUM(total),0) omzet FROM transactions WHERE toko_id=? AND substring(created_at::text,1,7)=?",[req.user.toko_id,bulan])).omzet; res.json({ok:true,data:{target_bulanan:t.target_bulanan, omzet:om, persen:t.target_bulanan?Math.round(om/t.target_bulanan*100):0}})});
app.post('/api/admin/target', auth, ensureRole(['admin']), async (req,res)=>{await run('INSERT INTO targets(toko_id,target_bulanan) VALUES(?,?) ON CONFLICT(toko_id) DO UPDATE SET target_bulanan=excluded.target_bulanan, updated_at=CURRENT_TIMESTAMP',[req.user.toko_id,Number(req.body.target_bulanan||0)]); res.json({ok:true});});

app.post('/api/kasir/attendance/in', auth, ensureRole(['kasir']), async (req,res)=>{const open=await get("SELECT * FROM attendances WHERE toko_id=? AND kasir_id=? AND status='MASUK'",[req.user.toko_id,req.user.id]); if(open) return res.json({ok:true,message:'Sudah absen masuk',data:open}); const info=await run('INSERT INTO attendances(toko_id,kasir_id,kasir_nama) VALUES(?,?,?)',[req.user.toko_id,req.user.id,req.user.nama]); res.json({ok:true,id:info.lastInsertRowid});});
app.post('/api/kasir/attendance/out', auth, ensureRole(['kasir']), async (req,res)=>{await run("UPDATE attendances SET pulang_at=CURRENT_TIMESTAMP,status='PULANG' WHERE toko_id=? AND kasir_id=? AND status='MASUK'",[req.user.toko_id,req.user.id]); res.json({ok:true});});

app.get('/api/ai/insight', auth, ensureRole(['developer','admin','kasir']), async (req,res)=>{let tid=req.user.role==='developer'?Number(req.query.toko_id||0):req.user.toko_id; if(!tid && req.user.role==='developer'){ const toko=(await get('SELECT COUNT(*)::int c FROM tokos')).c; const aktif=(await get("SELECT COUNT(*)::int c FROM tokos WHERE status='AKTIF'")).c; return res.json({ok:true,answer:`Developer: total ${toko} toko, aktif ${aktif} toko. Cek menu Kelola Toko untuk lisensi dan paket.`}); } const best=await get(`SELECT ti.nama, SUM(ti.qty) qty FROM transaction_items ti JOIN transactions tr ON tr.id=ti.transaction_id WHERE tr.toko_id=? GROUP BY ti.nama ORDER BY qty DESC LIMIT 1`,[tid]); const low=await all('SELECT nama,stok FROM products WHERE toko_id=? AND stok<=min_stok ORDER BY stok ASC LIMIT 5',[tid]); const omzet=await get("SELECT COALESCE(SUM(total),0) omzet, COUNT(*) trx FROM transactions WHERE toko_id=? AND date(created_at)=date('now')",[tid]); let ans=`Hari ini ${omzet.trx} transaksi, omzet Rp ${Number(omzet.omzet||0).toLocaleString('id-ID')}. `; if(best) ans+=`Produk terlaris: ${best.nama} (${best.qty}). `; if(low.length) ans+=`Stok menipis: ${low.map(x=>x.nama+' '+x.stok).join(', ')}. `; ans+=`Saran: cek restock, promo, dan laporan sebelum tutup toko.`; res.json({ok:true,answer:ans});});

app.post('/api/upload', auth, async (req,res)=>{
  try{
    const {type='file', filename='upload.png', data=''} = req.body || {};
    if(!data.startsWith('data:image/')) return res.status(400).json({ok:false,message:'File harus gambar JPG/PNG/WEBP'});
    const m=data.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if(!m) return res.status(400).json({ok:false,message:'Format gambar tidak didukung'});
    const ext=m[1].toLowerCase()==='jpeg'?'jpg':m[1].toLowerCase();
    const safeType=String(type).replace(/[^a-z0-9_-]/gi,'') || 'file';
    const dir=path.join(__dirname,'uploads',safeType);
    if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
    const name=`${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    fs.writeFileSync(path.join(dir,name), Buffer.from(m[2],'base64'));
    res.json({ok:true,url:`/uploads/${safeType}/${name}`});
  }catch(e){res.status(500).json({ok:false,message:e.message})}
});



// ===== TECNO POS BILLING & MASA AKTIF PAKET =====
async function migrateBillingTables(){}

const PACKAGE_PRICE={GRATIS:0,BASIC:29000,PRO:79000,ENTERPRISE:0};

app.get('/api/developer/billings', auth, ensureRole(['developer']), async (req,res)=>{
  res.json({ok:true,data:await all(`SELECT b.*, t.nama_toko FROM billings b LEFT JOIN tokos t ON t.id=b.toko_id ORDER BY b.id DESC LIMIT 200`)});
});
app.post('/api/developer/billings/generate', auth, ensureRole(['developer']), async (req,res)=>{
  const b=req.body; const toko=await get('SELECT * FROM tokos WHERE id=?',[Number(b.toko_id)]);
  if(!toko) return res.status(404).json({ok:false,message:'Toko tidak ditemukan'});
  const paket=b.paket||toko.paket||'GRATIS'; const nominal=Number(b.nominal ?? PACKAGE_PRICE[paket] ?? 0);
  const inv=code('BILL'); const jatuh=b.jatuh_tempo||new Date().toISOString().slice(0,10);
  await run('INSERT INTO billings(toko_id,invoice,paket,nominal,status,catatan,jatuh_tempo) VALUES(?,?,?,?,?,?,?)',[toko.id,inv,paket,nominal,'BELUM BAYAR',b.catatan||'',jatuh]);
  await run('UPDATE tokos SET payment_status=?, next_invoice_amount=? WHERE id=?',['BELUM BAYAR',nominal,toko.id]);
  await log(req.user,'BUAT TAGIHAN',`${toko.nama_toko} ${paket} ${nominal}`);
  res.json({ok:true,invoice:inv});
});
app.post('/api/developer/billings/:id/paid', auth, ensureRole(['developer']), async (req,res)=>{
  const bill=await get('SELECT * FROM billings WHERE id=?',[req.params.id]);
  if(!bill) return res.status(404).json({ok:false,message:'Tagihan tidak ditemukan'});
  const months=Number(req.body.months||1); const expired_at=req.body.expired_at||addMonthsISO(months);
  await run("UPDATE billings SET status='LUNAS', paid_at=CURRENT_TIMESTAMP, bukti_url=COALESCE(NULLIF(?,''),bukti_url), catatan=COALESCE(NULLIF(?,''),catatan) WHERE id=?",[req.body.bukti_url||'',req.body.catatan||'',req.params.id]);
  await run("UPDATE tokos SET paket=?, status='AKTIF', payment_status='PAID', expired_at=?, last_paid_at=CURRENT_TIMESTAMP, next_invoice_amount=0 WHERE id=?",[bill.paket,expired_at,bill.toko_id]);
  await log(req.user,'TAGIHAN LUNAS',`${bill.invoice} sampai ${expired_at}`);
  res.json({ok:true,expired_at});
});
app.post('/api/developer/tokos/:id/extend', auth, ensureRole(['developer']), async (req,res)=>{
  const toko=await get('SELECT * FROM tokos WHERE id=?',[req.params.id]); if(!toko) return res.status(404).json({ok:false});
  const paket=req.body.paket||toko.paket||'GRATIS'; const expired_at=req.body.expired_at||addMonthsISO(Number(req.body.months||1));
  await run("UPDATE tokos SET paket=?, status='AKTIF', payment_status='PAID', expired_at=?, last_paid_at=CURRENT_TIMESTAMP WHERE id=?",[paket,expired_at,req.params.id]);
  await log(req.user,'PERPANJANG TOKO',`${toko.nama_toko} ${paket} sampai ${expired_at}`);
  res.json({ok:true,expired_at});
});
app.post('/api/developer/suspend-expired', auth, ensureRole(['developer']), async (req,res)=>{
  const rows=await all("SELECT * FROM tokos WHERE status='AKTIF' AND expired_at<>''"); let n=0;
  for(const t of rows){ if(isExpiredDate(t.expired_at)){ await run("UPDATE tokos SET status='SUSPEND', payment_status='EXPIRED' WHERE id=?",[t.id]); n++; await log(req.user,'AUTO SUSPEND EXPIRED',t.nama_toko); } }
  res.json({ok:true,suspended:n});
});
app.get('/api/admin/billing', auth, ensureRole(['admin']), async (req,res)=>{
  const toko=await tokoFor(req.user); const bills=await all('SELECT * FROM billings WHERE toko_id=? ORDER BY id DESC LIMIT 20',[req.user.toko_id]);
  res.json({ok:true,toko,billing:billingStatus(toko),bills});
});
app.post('/api/admin/billing/:id/upload-proof', auth, ensureRole(['admin']), async (req,res)=>{
  const bill=await get('SELECT * FROM billings WHERE id=? AND toko_id=?',[req.params.id,req.user.toko_id]);
  if(!bill) return res.status(404).json({ok:false,message:'Tagihan tidak ditemukan'});
  await run("UPDATE billings SET bukti_url=?, status='MENUNGGU CEK', catatan=COALESCE(NULLIF(?,''),catatan) WHERE id=?",[req.body.bukti_url||'',req.body.catatan||'',req.params.id]);
  res.json({ok:true});
});
app.get('/api/admin/notifications', auth, ensureRole(['admin','kasir']), async (req,res)=>{
  const toko=await tokoFor(req.user); const b=billingStatus(toko); const low=await all('SELECT nama,stok FROM products WHERE toko_id=? AND stok<=min_stok ORDER BY stok ASC LIMIT 5',[req.user.toko_id]);
  const debts=await get("SELECT COUNT(*) c, COALESCE(SUM(total-dibayar),0) total FROM debts WHERE toko_id=? AND status<>'LUNAS'",[req.user.toko_id]);
  const notes=[]; if(b.reminder) notes.push({type:b.expired?'danger':'warn',text:b.reminder});
  if(low.length) notes.push({type:'warn',text:`${low.length} produk stok menipis`});
  if(debts.c) notes.push({type:'info',text:`${debts.c} hutang belum lunas: Rp ${Number(debts.total||0).toLocaleString('id-ID')}`});
  res.json({ok:true,data:notes});
});
app.get('/api/developer/backups', auth, ensureRole(['developer']), async (req,res)=>res.json({ok:true,data:await all('SELECT * FROM app_backups ORDER BY id DESC LIMIT 50')}));
app.post('/api/developer/backup-full', auth, ensureRole(['developer']), async (req,res)=>{
  const file = await createJsonBackup(req.user.id, 'backup-full');
  res.json({ok:true,file});
});



// ===== TECNO POS OPERASIONAL PRO: Buku Kas, Laba, Tutup Kas, PIN, Void, Import CSV =====
async function migrateOperationalTables(){}

async function ensureSec(toko_id){
  let row=await get('SELECT * FROM security_settings WHERE toko_id=?',[toko_id]);
  if(!row){ await run('INSERT INTO security_settings(toko_id) VALUES(?)',[toko_id]); row=await get('SELECT * FROM security_settings WHERE toko_id=?',[toko_id]); }
  return row;
}
async function salesToday(toko_id, kasir_id=0){
  const where=kasir_id?' AND kasir_id='+Number(kasir_id):'';
  return ((await get("SELECT COALESCE(SUM(total),0) total FROM transactions WHERE toko_id=? AND status<>'VOID' AND DATE(created_at)=CURRENT_DATE"+where,[toko_id]))?.total)||0;
}

app.get('/api/admin/cashbook', auth, ensureRole(['admin']), async (req,res)=>{
  const rows=await all('SELECT c.*, u.nama user_nama FROM cashbooks c LEFT JOIN users u ON u.id=c.user_id WHERE c.toko_id=? ORDER BY c.id DESC LIMIT 200',[req.user.toko_id]);
  const masuk=((await get("SELECT COALESCE(SUM(nominal),0) total FROM cashbooks WHERE toko_id=? AND tipe='MASUK'",[req.user.toko_id]))?.total)||0;
  const keluar=((await get("SELECT COALESCE(SUM(nominal),0) total FROM cashbooks WHERE toko_id=? AND tipe='KELUAR'",[req.user.toko_id]))?.total)||0;
  const penjualan=((await get("SELECT COALESCE(SUM(total),0) total FROM transactions WHERE toko_id=? AND status<>'VOID'",[req.user.toko_id]))?.total)||0;
  res.json({ok:true,data:rows,summary:{kas_masuk:masuk,kas_keluar:keluar,penjualan,saldo:penjualan+masuk-keluar}});
});
app.post('/api/admin/cashbook', auth, ensureRole(['admin']), async (req,res)=>{
  const b=req.body; const tipe=(b.tipe||'KELUAR').toUpperCase();
  await run('INSERT INTO cashbooks(toko_id,tipe,kategori,nominal,catatan,user_id) VALUES(?,?,?,?,?,?)',[req.user.toko_id,tipe,b.kategori||'',Number(b.nominal||0),b.catatan||'',req.user.id]);
  await log(req.user, tipe==='MASUK'?'KAS MASUK':'KAS KELUAR', `${b.kategori||''} Rp ${b.nominal||0}`);
  res.json({ok:true});
});
app.get('/api/admin/profit', auth, ensureRole(['admin']), async (req,res)=>{
  const tid=req.user.toko_id;
  const penjualan=safeNum(((await get("SELECT COALESCE(SUM(total),0) total FROM transactions WHERE toko_id=? AND status<>'VOID'",[tid]))?.total)||0);
  const modal=safeNum(((await get(`SELECT COALESCE(SUM(ti.qty * COALESCE(p.harga_beli,0)),0) total FROM transaction_items ti JOIN transactions tr ON tr.id=ti.transaction_id LEFT JOIN products p ON p.id=ti.product_id WHERE tr.toko_id=? AND tr.status<>'VOID'`,[tid]))?.total)||0);
  const pengeluaran=safeNum(((await get("SELECT COALESCE(SUM(nominal),0) total FROM cashbooks WHERE toko_id=? AND tipe='KELUAR'",[tid]))?.total)||0);
  const kasMasuk=safeNum(((await get("SELECT COALESCE(SUM(nominal),0) total FROM cashbooks WHERE toko_id=? AND tipe='MASUK'",[tid]))?.total)||0);
  const labaKotor=penjualan-modal;
  const labaBersih=labaKotor-pengeluaran+kasMasuk;
  res.json({ok:true,data:{penjualan,modal,pengeluaran,kas_masuk:kasMasuk,laba_kotor:labaKotor,laba_bersih:labaBersih,rumus:'Penjualan - Modal Barang - Pengeluaran + Kas Masuk Tambahan'}});
});
app.get('/api/admin/security', auth, ensureRole(['admin']), async (req,res)=>res.json({ok:true,data:await ensureSec(req.user.toko_id)}));
app.put('/api/admin/security', auth, ensureRole(['admin']), async (req,res)=>{
  const b=req.body; await ensureSec(req.user.toko_id);
  await run('UPDATE security_settings SET pin_refund=?,pin_setting=?,lock_harga=?,mode_toko=?,updated_at=CURRENT_TIMESTAMP WHERE toko_id=?',[b.pin_refund||'1234',b.pin_setting||'1234',Number(b.lock_harga?1:0),b.mode_toko||'BUKA',req.user.toko_id]);
  await log(req.user,'UBAH KEAMANAN',`Mode toko ${b.mode_toko||'BUKA'}`);
  res.json({ok:true});
});
app.post('/api/admin/close-cash', auth, ensureRole(['admin']), async (req,res)=>{
  const b=req.body; const sistem=await salesToday(req.user.toko_id, Number(b.kasir_id||0)); const fisik=Number(b.uang_fisik||0); const awal=Number(b.uang_awal||0); const selisih=fisik-(awal+sistem);
  await run('INSERT INTO cash_closings(toko_id,kasir_id,uang_awal,uang_sistem,uang_fisik,selisih,catatan) VALUES(?,?,?,?,?,?,?)',[req.user.toko_id,Number(b.kasir_id||0),awal,sistem,fisik,selisih,b.catatan||'']);
  await log(req.user,'TUTUP KAS',`Selisih Rp ${selisih}`);
  res.json({ok:true,uang_sistem:sistem,selisih});
});
app.get('/api/admin/close-cash', auth, ensureRole(['admin']), async (req,res)=>res.json({ok:true,data:await all('SELECT c.*, u.nama kasir FROM cash_closings c LEFT JOIN users u ON u.id=c.kasir_id WHERE c.toko_id=? ORDER BY c.id DESC LIMIT 100',[req.user.toko_id])}));
app.post('/api/admin/import-products', auth, ensureRole(['admin']), async (req,res)=>{
  const csv=String(req.body.csv||'').trim();
  if(!csv) return res.status(400).json({ok:false,message:'Data CSV kosong'});
  const lines=csv.split(/\r?\n/).filter(Boolean); let count=0;
  for(const line of lines){
    const p=line.split(',').map(x=>x.trim());
    if(p[0].toLowerCase()==='nama' || p.length<3) continue;
    const [nama,barcode,harga_jual,stok,kategori,satuan,harga_beli]=p;
    await run('INSERT INTO products(toko_id,nama,barcode,harga_jual,stok,kategori,satuan,harga_beli,min_stok) VALUES(?,?,?,?,?,?,?,?,?)',[req.user.toko_id,nama,barcode||'',Number(harga_jual||0),Number(stok||0),kategori||'Umum',satuan||'PCS',Number(harga_beli||0),5]);
    count++;
  }
  await log(req.user,'IMPORT PRODUK',`${count} produk`);
  res.json({ok:true,count});
});
app.post('/api/admin/backup-reminder', auth, ensureRole(['admin']), async (req,res)=>{
  await run('INSERT INTO backup_reminders(toko_id,last_backup_at,remind_days) VALUES(?,?,?) ON CONFLICT(toko_id) DO UPDATE SET last_backup_at=excluded.last_backup_at, remind_days=excluded.remind_days',[req.user.toko_id,new Date().toISOString(),Number(req.body.remind_days||7)]);
  res.json({ok:true});
});
app.get('/api/admin/backup-reminder', auth, ensureRole(['admin']), async (req,res)=>{
  let r=await get('SELECT * FROM backup_reminders WHERE toko_id=?',[req.user.toko_id]);
  if(!r) return res.json({ok:true,reminder:'Backup belum pernah dilakukan. Sebaiknya backup data sekarang.',data:null});
  const days=Math.floor((Date.now()-new Date(r.last_backup_at).getTime())/86400000);
  res.json({ok:true,reminder:days>=r.remind_days?`Sudah ${days} hari belum backup.`:'Backup masih aman.',data:r,days});
});
app.post('/api/kasir/void-request', auth, ensureRole(['kasir']), async (req,res)=>{
  const b=req.body; const tr=await get('SELECT * FROM transactions WHERE id=? AND toko_id=? AND kasir_id=?',[b.transaksi_id,req.user.toko_id,req.user.id]);
  if(!tr) return res.status(404).json({ok:false,message:'Transaksi tidak ditemukan'});
  await run('INSERT INTO void_requests(toko_id,transaksi_id,kasir_id,alasan) VALUES(?,?,?,?)',[req.user.toko_id,b.transaksi_id,req.user.id,b.alasan||'']);
  await log(req.user,'AJUKAN VOID',tr.invoice);
  res.json({ok:true});
});
app.get('/api/admin/void-requests', auth, ensureRole(['admin']), async (req,res)=>res.json({ok:true,data:await all(`SELECT v.*, tr.invoice, tr.total, u.nama kasir FROM void_requests v LEFT JOIN transactions tr ON tr.id=v.transaksi_id LEFT JOIN users u ON u.id=v.kasir_id WHERE v.toko_id=? ORDER BY v.id DESC LIMIT 100`,[req.user.toko_id])}));
app.post('/api/admin/void-requests/:id/approve', auth, ensureRole(['admin']), async (req,res)=>{
  const v=await get('SELECT * FROM void_requests WHERE id=? AND toko_id=?',[req.params.id,req.user.toko_id]); if(!v) return res.status(404).json({ok:false});
  await run("UPDATE void_requests SET status='APPROVED', approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=?",[req.user.id,req.params.id]);
  await run("UPDATE transactions SET status='VOID' WHERE id=? AND toko_id=?",[v.transaksi_id,req.user.toko_id]);
  const items=await all('SELECT * FROM transaction_items WHERE transaction_id=?',[v.transaksi_id]);
  for(const it of items){ if(it.product_id) await run('UPDATE products SET stok=stok+? WHERE id=? AND toko_id=?',[it.qty,it.product_id,req.user.toko_id]); }
  await log(req.user,'APPROVE VOID',String(v.transaksi_id));
  res.json({ok:true});
});
app.post('/api/admin/void-requests/:id/reject', auth, ensureRole(['admin']), async (req,res)=>{await run("UPDATE void_requests SET status='REJECTED', approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=? AND toko_id=?",[req.user.id,req.params.id,req.user.toko_id]);res.json({ok:true});});

// Middleware tambahan agar kasir terkunci kalau toko ditutup dari pengaturan keamanan.
app.use('/api/kasir', async (req,res,next)=>{
  if(req.user && req.user.role==='kasir'){
    const sec=await ensureSec(req.user.toko_id);
    if(sec.mode_toko==='TUTUP') return res.status(403).json({ok:false,message:'Toko sedang mode tutup. Kasir tidak bisa transaksi.'});
  }
  next();
});



// ===== TECNO POS LIVE DASHBOARD + BUKA/TUTUP KAS SHIFT =====
async function migrateShiftTables(){}

async function currentShift(toko_id, kasir_id){
  return await get("SELECT * FROM shift_sessions WHERE toko_id=? AND kasir_id=? AND status='OPEN' ORDER BY id DESC LIMIT 1", [toko_id, kasir_id]);
}
async function salesSince(toko_id, kasir_id, since){
  return await get("SELECT COALESCE(SUM(total),0) total, COUNT(*) trx FROM transactions WHERE toko_id=? AND kasir_id=? AND status<>'VOID' AND datetime(created_at)>=datetime(?)", [toko_id, kasir_id, since]);
}

app.get('/api/kasir/shift/current', auth, ensureRole(['kasir']), async (req,res)=>{
  const sh=await currentShift(req.user.toko_id, req.user.id);
  if(!sh) return res.json({ok:true,open:false});
  const sale=await salesSince(req.user.toko_id, req.user.id, sh.buka_at);
  res.json({ok:true,open:true,shift:{...sh, uang_sistem:Number(sh.uang_awal||0)+Number(sale.total||0), transaksi:Number(sale.trx||0)}});
});
app.post('/api/kasir/shift/open', auth, ensureRole(['kasir']), async (req,res)=>{
  const old=await currentShift(req.user.toko_id, req.user.id);
  if(old) return res.json({ok:true,message:'Shift sudah terbuka',shift:old});
  const uang_awal=Number(req.body.uang_awal||0);
  const info=await run('INSERT INTO shift_sessions(toko_id,kasir_id,kasir_nama,uang_awal,catatan_buka) VALUES(?,?,?,?,?)',[req.user.toko_id,req.user.id,req.user.nama,uang_awal,req.body.catatan||'']);
  await log(req.user,'BUKA KAS SHIFT',`Uang awal ${uang_awal}`);
  res.json({ok:true,id:info.lastInsertRowid});
});
app.post('/api/kasir/shift/close', auth, ensureRole(['kasir']), async (req,res)=>{
  const sh=await currentShift(req.user.toko_id, req.user.id);
  if(!sh) return res.status(400).json({ok:false,message:'Belum buka kas'});
  const sale=await salesSince(req.user.toko_id, req.user.id, sh.buka_at);
  const sistem=Number(sh.uang_awal||0)+Number(sale.total||0);
  const fisik=Number(req.body.uang_fisik||0);
  const selisih=fisik-sistem;
  await run("UPDATE shift_sessions SET uang_sistem=?, uang_fisik=?, selisih=?, status='CLOSED', catatan_tutup=?, tutup_at=CURRENT_TIMESTAMP WHERE id=?", [sistem,fisik,selisih,req.body.catatan||'',sh.id]);
  await log(req.user,'TUTUP KAS SHIFT',`Sistem ${sistem}, fisik ${fisik}, selisih ${selisih}`);
  res.json({ok:true,uang_sistem:sistem,uang_fisik:fisik,selisih});
});
app.get('/api/admin/live-dashboard', auth, ensureRole(['admin']), async (req,res)=>{
  const tid=req.user.toko_id;
  const today=todayJakartaDate();
  const sales=await get("SELECT COALESCE(SUM(total),0) omzet, COUNT(*) trx FROM transactions WHERE toko_id=? AND status<>'VOID' AND date(created_at)=date(?)",[tid,today]);
  const items=await get(`SELECT COALESCE(SUM(ti.qty),0) qty FROM transaction_items ti JOIN transactions tr ON tr.id=ti.transaction_id WHERE tr.toko_id=? AND tr.status<>'VOID' AND date(tr.created_at)=date(?)`,[tid,today]);
  const cash=await get("SELECT COALESCE(SUM(nominal),0) masuk FROM cashbooks WHERE toko_id=? AND tipe='MASUK' AND date(created_at)=date(?)",[tid,today])||{masuk:0};
  const out=await get("SELECT COALESCE(SUM(nominal),0) keluar FROM cashbooks WHERE toko_id=? AND tipe='KELUAR' AND date(created_at)=date(?)",[tid,today])||{keluar:0};
  const debts=await get("SELECT COALESCE(SUM(total-dibayar),0) hutang FROM debts WHERE toko_id=? AND status<>'LUNAS'",[tid])||{hutang:0};
  const activeShift=await all("SELECT kasir_nama, uang_awal, buka_at FROM shift_sessions WHERE toko_id=? AND status='OPEN' ORDER BY buka_at DESC",[tid]);
  res.json({ok:true,data:{omzet:sales.omzet||0,transaksi:sales.trx||0,item_terjual:items.qty||0,kas_masuk:cash.masuk||0,kas_keluar:out.keluar||0,hutang:debts.hutang||0,shift_aktif:activeShift}});
});


app.get('/api/sync/status', async (req,res)=>{
  try{
    await pool.query('SELECT 1');
    res.json({ok:true, online:true, database:'supabase-postgres', time:new Date().toISOString()});
  }catch(e){
    res.status(503).json({ok:false, online:false, message:e.message});
  }
});

initDb().then(async ()=>{
  await migrate();
  await migrateProTables();
  await migrateBillingTables();
  await migrateOperationalTables();
  await migrateShiftTables();
  app.listen(PORT, '0.0.0.0', () => console.log(`TECNO POS ONLINE jalan di http://0.0.0.0:${PORT}`));
}).catch(err=>{
  console.error('Gagal init database:', err);
  process.exit(1);
});



