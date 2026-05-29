AUDIT FIX TRANSAKSI TECNO POS

Masalah utama ditemukan:
1. public/kasir.html masih membuat transaksi lokal saat fetch checkout gagal. Akibatnya struk/riwayat lokal muncul, tetapi Supabase tidak bertambah.
2. public/app.js otomatis menjadikan semua error checkout sebagai offline queue, termasuk error server. Ini membuat status bisa terlihat sukses/pending palsu.
3. public/app.js masih register service worker /sw.js, dan sw.js cache file HTML/JS. Ini bisa membuat Chrome/WebView memakai file lama.
4. server.js melakukan insert transaction sebelum validasi produk selesai. Ini bisa membuat transaksi setengah jadi kalau produk sudah dihapus/stok tidak valid.

Perbaikan:
- ONLINE: transaksi harus masuk /api/kasir/checkout dan ok:true dulu, baru cetak.
- ONLINE tapi server/error: tampil error, tidak dicetak sebagai sukses.
- OFFLINE asli: baru masuk pending sync lokal.
- Service worker/cache dimatikan.
- Backend checkout validasi produk dulu sebelum insert transaksi.

Urutan pakai:
1. Upload/push semua file ini ke GitHub.
2. Tunggu Railway SUCCESS.
3. Tes Chrome: bayar 1 barang, cek Supabase table transactions.
4. Jika Chrome OK, jalankan npx cap sync android lalu build APK baru.
5. Hapus data/cache APK lama sebelum install APK baru.
