TECNO POS HYBRID RAILWAY

Versi ini untuk Railway + Supabase dengan mode hybrid PWA:
1. Server tetap Railway.
2. Database online tetap Supabase/PostgreSQL.
3. Halaman aplikasi dicache oleh Service Worker, jadi bisa dibuka kembali jika sudah pernah dibuka.
4. Jika internet putus saat checkout kasir, transaksi disimpan di browser HP/PC sebagai offline queue.
5. Saat internet hidup lagi, transaksi pending otomatis dikirim ke Railway lalu masuk Supabase.
6. Ada status kanan bawah: ONLINE/OFFLINE dan pending sync.

PENTING:
- Offline penuh hanya bisa setelah aplikasi pernah dibuka saat online di perangkat itu.
- Data offline tersimpan di browser/perangkat kasir. Jangan hapus cache/browser sebelum pending sync selesai.
- Admin, login pertama, dan data produk tetap butuh online agar data terbaru dari Supabase.
- Untuk hybrid lokal 100% cepat seperti aplikasi PC sungguhan, versi berikutnya perlu SQLite lokal di PC + sync Supabase.

Railway Variables tetap:
DATABASE_URL=postgresql://...supabase...

Akun awal:
developer / dev123
admin / admin123
kasir / kasir123
