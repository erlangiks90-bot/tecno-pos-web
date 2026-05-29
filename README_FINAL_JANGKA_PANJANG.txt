TECNO POS - FIX JANGKA PANJANG SERVER-FIRST

Database: Supabase PostgreSQL. Tidak perlu file kasir.db.
Hosting backend: Railway tetap cocok. Android APK hanya sebagai client.

Yang diperbaiki:
1. Saat online, kasir klik BAYAR -> POST ke Railway /api/kasir/checkout -> Supabase INSERT -> baru cetak struk.
2. Saat offline / server timeout, transaksi masuk pending lokal dan jelas BELUM masuk admin.
3. Sync tidak lagi menghapus pending sebelum server balas ok:true.
4. Status transaksi lokal berubah SYNCED kalau invoice sudah ada di server.
5. Service worker dimatikan supaya cache lama tidak nyangkut.
6. Thermal dan scanner tetap dipertahankan.

Urutan upload GitHub/Railway:
1. Extract ZIP ini.
2. Buka CMD di folder project.
3. git status
4. git add .
5. git commit -m "Fix server first checkout anti bug"
6. git push origin main
7. Tunggu Railway deploy SUCCESS.
8. Tes Chrome dulu: login kasir -> transaksi -> cek Supabase transactions/admin riwayat.
9. Jika Chrome sudah benar, lanjut Android:
   npm install
   npx cap sync android
   npx cap open android
10. Android Studio: Sync Gradle -> Clean -> Rebuild -> Build APK(s).
11. Hapus APK lama dari HP, install APK baru.

Tes wajib:
- Online: transaksi harus masuk admin langsung.
- Offline: transaksi muncul PENDING, bukan SYNCED.
- Setelah internet balik: tekan Sync, invoice harus berubah SYNCED dan masuk admin.

Catatan penting:
Jangan upload node_modules, .git, build, dist, atau android/app/build ke GitHub.
