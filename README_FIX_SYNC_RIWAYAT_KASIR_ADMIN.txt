FIX SYNC RIWAYAT KASIR KE ADMIN

Perbaikan:
- Transaksi lokal yang statusnya PENDING otomatis dibuat ulang ke queue sync jika queue hilang.
- Sync tidak diam-diam gagal; error terakhir tampil di menu Sync.
- Riwayat lokal bisa cetak ulang dari HP walau belum masuk online.
- Nomor transaksi offline dibuat unik per toko agar tidak bentrok multi toko.
- Server cek duplicate offline_client_id per toko.

Cara pakai:
1. Backup project lama.
2. Extract ZIP ini, replace ke project TECNO_POS_ONLINE_READY.
3. Push ke GitHub/Railway supaya server ikut update.
4. Di project lokal jalankan: npx cap copy android && npx cap sync android
5. Build APK ulang.
6. Buka aplikasi > Kasir > Sync > Sync Sekarang.
