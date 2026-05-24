const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public', 'uploads', 'logo'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public', 'uploads', 'produk'), { recursive: true });

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function seed(){
  return {
    tokos:[{id:1,nama:'Handoko Net Store',alamat:'Alamat toko',hp:'08xxxxxxxxxx',logo:'',paket:'GRATIS',status:'AKTIF',expired:'2026-12-31',footer:'Terima kasih',ukuran:'58mm'}],
    users:[
      {id:1,nama:'Developer',username:'developer',password:'dev123',role:'developer',toko_id:null,status:'AKTIF'},
      {id:2,nama:'Admin Toko',username:'admin',password:'admin123',role:'admin',toko_id:1,status:'AKTIF'},
      {id:3,nama:'Kasir',username:'kasir',password:'kasir123',role:'kasir',toko_id:1,status:'AKTIF'}
    ],
    produk:[
      {id:1,toko_id:1,nama:'Aqua 600ml',barcode:'899999900002',kategori:'Minuman',supplier:'',rak:'A1',expired:'',modal:2500,harga:4000,grosir:3500,stok:19,min:5,satuan:'PCS',foto:''},
      {id:2,toko_id:1,nama:'Indomie Goreng',barcode:'899999900001',kategori:'Makanan',supplier:'',rak:'B1',expired:'',modal:2800,harga:3500,grosir:3300,stok:38,min:5,satuan:'PCS',foto:''},
      {id:3,toko_id:1,nama:'Kopi Sachet',barcode:'899999900003',kategori:'Minuman',supplier:'',rak:'A2',expired:'',modal:1200,harga:2000,grosir:1800,stok:60,min:5,satuan:'PCS',foto:''}
    ],
    transaksi:[], hutang:[], members:[], kas:[], logs:[], settings:{theme:'eye',color:'blue'}, counters:{toko:2,user:4,produk:4,transaksi:1,member:1,kas:1,log:1,hutang:1}
  }
}
function readDB(){ if(!fs.existsSync(DB_PATH)) writeDB(seed()); return JSON.parse(fs.readFileSync(DB_PATH,'utf8')); }
function writeDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); }
function next(db,key){ const v=db.counters[key]||1; db.counters[key]=v+1; return v; }
function log(db,user,aksi){ db.logs.unshift({id:next(db,'log'),user:user||'system',aksi,created_at:new Date().toISOString()}); }
function cleanUser(u){ const x={...u}; delete x.password; return x; }
function getToko(db,id){ return db.tokos.find(t=>String(t.id)===String(id)); }
function requireUser(req,res,next){ const username=req.headers['x-user']; const db=readDB(); const u=db.users.find(x=>x.username===username); if(!u) return res.status(401).json({ok:false,message:'Belum login'}); const t=u.toko_id?getToko(db,u.toko_id):null; if(t && t.status!=='AKTIF') return res.status(403).json({ok:false,message:'Toko nonaktif/suspend. Hubungi developer.'}); req.db=db; req.user=u; req.toko=t; next(); }

const storage = multer.diskStorage({ destination:(req,file,cb)=>{ const kind=req.params.kind==='logo'?'logo':'produk'; cb(null,path.join(__dirname,'public','uploads',kind)); }, filename:(req,file,cb)=>{ cb(null, Date.now()+'-'+file.originalname.replace(/[^a-zA-Z0-9.]/g,'_')); }});
const upload = multer({ storage, limits:{ fileSize:5*1024*1024 }});

app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','login.html')));
app.post('/api/login',(req,res)=>{ const {username,password}=req.body; const db=readDB(); const u=db.users.find(x=>x.username===username && x.password===password && x.status==='AKTIF'); if(!u) return res.status(401).json({ok:false,message:'Username/password salah'}); const toko=u.toko_id?getToko(db,u.toko_id):null; if(toko && toko.status!=='AKTIF') return res.status(403).json({ok:false,message:'Toko nonaktif/suspend. Hubungi developer.'}); log(db,u.username,'Login'); writeDB(db); res.json({ok:true,user:cleanUser(u),toko}); });
app.get('/api/me', requireUser, (req,res)=>res.json({user:cleanUser(req.user),toko:req.toko,settings:req.db.settings}));

app.get('/api/dev/summary', requireUser,(req,res)=>{ if(req.user.role!=='developer') return res.status(403).json({ok:false}); const db=req.db; res.json({toko:db.tokos.length,aktif:db.tokos.filter(t=>t.status==='AKTIF').length,suspend:db.tokos.filter(t=>t.status!=='AKTIF').length,user:db.users.length,transaksi:db.transaksi.length}); });
app.get('/api/dev/tokos', requireUser,(req,res)=>{ if(req.user.role!=='developer') return res.status(403).json({ok:false}); res.json(req.db.tokos); });
app.post('/api/dev/tokos', requireUser,(req,res)=>{ if(req.user.role!=='developer') return res.status(403).json({ok:false}); const db=req.db; const p=req.body; if(!p.nama) return res.status(400).json({ok:false,message:'Nama toko wajib diisi'}); if(p.id){ const t=getToko(db,p.id); if(!t) return res.status(404).json({ok:false,message:'Toko tidak ditemukan'}); Object.assign(t,p); log(db,req.user.username,'Edit toko '+t.nama); } else { const id=next(db,'toko'); db.tokos.push({id,nama:p.nama,alamat:p.alamat||'',hp:p.hp||'',logo:'',paket:p.paket||'GRATIS',status:p.status||'AKTIF',expired:p.expired||'',footer:p.footer||'Terima kasih',ukuran:p.ukuran||'58mm'}); log(db,req.user.username,'Tambah toko '+p.nama); } writeDB(db); res.json({ok:true}); });
app.post('/api/dev/tokos/:id/status', requireUser,(req,res)=>{ if(req.user.role!=='developer') return res.status(403).json({ok:false}); const db=req.db; const t=getToko(db,req.params.id); if(!t) return res.status(404).json({ok:false}); t.status=req.body.status||'SUSPEND'; log(db,req.user.username,'Ubah status toko '+t.nama+' ke '+t.status); writeDB(db); res.json({ok:true}); });
app.get('/api/dev/users', requireUser,(req,res)=>{ if(req.user.role!=='developer') return res.status(403).json({ok:false}); const db=req.db; res.json(db.users.map(u=>({...cleanUser(u),toko:u.toko_id?(getToko(db,u.toko_id)?.nama||'-'):'Developer'}))); });
app.post('/api/dev/reset-password', requireUser,(req,res)=>{ if(req.user.role!=='developer') return res.status(403).json({ok:false,message:'Hanya developer'}); const {username,password}=req.body; if(!username||!password) return res.status(400).json({ok:false,message:'Data wajib lengkap'}); const db=req.db; const u=db.users.find(x=>x.username===username); if(!u) return res.status(404).json({ok:false,message:'User tidak ditemukan'}); u.password=password; log(db,req.user.username,'Reset password '+username); writeDB(db); res.json({ok:true,message:'Password berhasil direset'}); });
app.get('/api/dev/logs', requireUser,(req,res)=>{ if(req.user.role!=='developer') return res.status(403).json({ok:false}); res.json(req.db.logs.slice(0,100)); });

app.get('/api/admin/summary', requireUser,(req,res)=>{ if(!['admin','developer'].includes(req.user.role)) return res.status(403).json({ok:false}); const db=req.db; const tid=req.user.toko_id||1; const trx=db.transaksi.filter(t=>t.toko_id===tid); const produk=db.produk.filter(p=>p.toko_id===tid); const omzet=trx.reduce((a,b)=>a+b.total,0); const modal=trx.reduce((a,b)=>a+(b.modal||0),0); const hutang=db.hutang.filter(h=>h.toko_id===tid && h.status!=='LUNAS').reduce((a,b)=>a+b.sisa,0); const stokMenipis=produk.filter(p=>Number(p.stok)<=Number(p.min||5)); const chart=[0,1,2,3,4,5,6].map(i=>{ const d=new Date(); d.setDate(d.getDate()-i); const key=d.toISOString().slice(0,10); return {tgl:key,total:trx.filter(t=>t.created_at.slice(0,10)===key).reduce((a,b)=>a+b.total,0)}; }).reverse(); res.json({omzet,laba:omzet-modal,produk:produk.length,transaksi:trx.length,hutang,stokMenipis,chart}); });
app.get('/api/admin/products', requireUser,(req,res)=>{ const db=req.db; const tid=req.user.toko_id||1; const q=(req.query.q||'').toLowerCase(); res.json(db.produk.filter(p=>p.toko_id===tid && (!q || p.nama.toLowerCase().includes(q)||String(p.barcode).includes(q)))); });
app.post('/api/admin/products', requireUser,(req,res)=>{ if(!['admin','developer'].includes(req.user.role)) return res.status(403).json({ok:false}); const db=req.db; const tid=req.user.toko_id||Number(req.body.toko_id)||1; const p=req.body; if(!p.nama) return res.status(400).json({ok:false,message:'Nama produk wajib diisi'}); if(p.id){ const item=db.produk.find(x=>String(x.id)===String(p.id)&&x.toko_id===tid); if(!item) return res.status(404).json({ok:false}); Object.assign(item,{...p,harga:Number(p.harga||0),modal:Number(p.modal||0),grosir:Number(p.grosir||0),stok:Number(p.stok||0),min:Number(p.min||5)}); log(db,req.user.username,'Edit produk '+p.nama); } else { db.produk.push({id:next(db,'produk'),toko_id:tid,nama:p.nama,barcode:p.barcode||'',kategori:p.kategori||'',supplier:p.supplier||'',rak:p.rak||'',expired:p.expired||'',modal:Number(p.modal||0),harga:Number(p.harga||0),grosir:Number(p.grosir||0),stok:Number(p.stok||0),min:Number(p.min||5),satuan:p.satuan||'PCS',foto:p.foto||''}); log(db,req.user.username,'Tambah produk '+p.nama); } writeDB(db); res.json({ok:true}); });
app.delete('/api/admin/products/:id', requireUser,(req,res)=>{ const db=req.db; const tid=req.user.toko_id||1; db.produk=db.produk.filter(p=>!(String(p.id)===String(req.params.id)&&p.toko_id===tid)); writeDB(db); res.json({ok:true}); });
app.get('/api/admin/kasir', requireUser,(req,res)=>{ const db=req.db; const tid=req.user.toko_id||1; res.json(db.users.filter(u=>u.toko_id===tid && u.role==='kasir').map(cleanUser)); });
app.post('/api/admin/kasir', requireUser,(req,res)=>{ if(req.user.role!=='admin') return res.status(403).json({ok:false}); const db=req.db; const t=getToko(db,req.user.toko_id); const kasirs=db.users.filter(u=>u.toko_id===req.user.toko_id && u.role==='kasir'); const limit=t.paket==='GRATIS'?1:t.paket==='BASIC'?3:t.paket==='PRO'?10:999; if(!req.body.id && kasirs.length>=limit) return res.status(403).json({ok:false,message:`Paket ${t.paket} maksimal ${limit} kasir`}); if(req.body.id){ const u=db.users.find(x=>String(x.id)===String(req.body.id)&&x.toko_id===req.user.toko_id); if(u) Object.assign(u,{nama:req.body.nama||u.nama,status:req.body.status||u.status}); } else { db.users.push({id:next(db,'user'),nama:req.body.nama,username:req.body.username,password:req.body.password||'123456',role:'kasir',toko_id:req.user.toko_id,status:'AKTIF'}); } writeDB(db); res.json({ok:true}); });
app.post('/api/admin/reset-kasir', requireUser,(req,res)=>{ if(req.user.role!=='admin') return res.status(403).json({ok:false}); const db=req.db; const u=db.users.find(x=>x.username===req.body.username && x.role==='kasir' && x.toko_id===req.user.toko_id); if(!u) return res.status(404).json({ok:false,message:'Kasir tidak ditemukan'}); u.password=req.body.password; log(db,req.user.username,'Reset password kasir '+u.username); writeDB(db); res.json({ok:true,message:'Password kasir berhasil direset'}); });
app.post('/api/admin/settings', requireUser,(req,res)=>{ if(req.user.role!=='admin') return res.status(403).json({ok:false}); const db=req.db; const t=getToko(db,req.user.toko_id); Object.assign(t,req.body); writeDB(db); res.json({ok:true}); });

app.get('/api/kasir/products', requireUser,(req,res)=>{ const db=req.db; const tid=req.user.toko_id; const q=(req.query.q||'').toLowerCase(); res.json(db.produk.filter(p=>p.toko_id===tid && p.stok>0 && (!q || p.nama.toLowerCase().includes(q)||String(p.barcode).includes(q)))); });
app.post('/api/kasir/pay', requireUser,(req,res)=>{ if(req.user.role!=='kasir') return res.status(403).json({ok:false}); const db=req.db; const {items,metode,bayar,diskon,member}=req.body; if(!items||!items.length) return res.status(400).json({ok:false,message:'Keranjang kosong'}); let subtotal=0, modal=0; for(const it of items){ const p=db.produk.find(x=>x.id===it.id && x.toko_id===req.user.toko_id); if(!p) return res.status(404).json({ok:false,message:'Produk tidak ditemukan'}); if(p.stok<it.qty) return res.status(400).json({ok:false,message:'Stok kurang: '+p.nama}); subtotal += p.harga*it.qty; modal += (p.modal||0)*it.qty; p.stok -= it.qty; }
 const total=subtotal-Number(diskon||0); const trx={id:next(db,'transaksi'),no:'TRX-'+Date.now(),toko_id:req.user.toko_id,kasir:req.user.nama,items,total,subtotal,diskon:Number(diskon||0),modal,metode:metode||'TUNAI',bayar:Number(bayar||total),kembali:Number(bayar||total)-total,member:member||'',created_at:new Date().toISOString(),print_count:0}; db.transaksi.unshift(trx); if(metode==='UTANG'){ db.hutang.unshift({id:next(db,'hutang'),toko_id:req.user.toko_id,transaksi_id:trx.id,nama:member||'Pelanggan',total,sisa:total,status:'BELUM LUNAS',created_at:trx.created_at}); } log(db,req.user.username,'Transaksi '+trx.no); writeDB(db); res.json({ok:true,transaksi:trx,toko:req.toko}); });
app.get('/api/receipt/:id', requireUser,(req,res)=>{ const db=req.db; const trx=db.transaksi.find(t=>String(t.id)===String(req.params.id)); if(!trx) return res.status(404).json({ok:false}); trx.print_count=(trx.print_count||0)+1; writeDB(db); res.json({ok:true,transaksi:trx,toko:getToko(db,trx.toko_id)}); });

app.post('/api/upload/:kind', requireUser, upload.single('file'),(req,res)=>{ if(!req.file) return res.status(400).json({ok:false}); const url='/uploads/'+(req.params.kind==='logo'?'logo':'produk')+'/'+req.file.filename; res.json({ok:true,url}); });
app.post('/api/theme', requireUser,(req,res)=>{ const db=req.db; db.settings={...db.settings,...req.body}; writeDB(db); res.json({ok:true}); });
app.post('/api/change-password', requireUser,(req,res)=>{ const db=req.db; const {oldPassword,newPassword}=req.body; const u=db.users.find(x=>x.id===req.user.id); if(!u||u.password!==oldPassword) return res.status(400).json({ok:false,message:'Password lama salah'}); u.password=newPassword; writeDB(db); res.json({ok:true,message:'Password berhasil diubah'}); });

app.listen(PORT, '0.0.0.0', ()=> console.log('TECNO POS online on port '+PORT));
