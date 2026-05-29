TECNO POS - FINAL FIX TRANSAKSI APK

Yang diperbaiki:
1. Online: transaksi wajib disimpan ke server dulu dan diverifikasi, baru cetak struk.
2. Offline / sinyal hilang: transaksi masuk pending queue dan tampil PENDING.
3. Sync Sekarang: tidak menghapus queue kalau server belum benar-benar punya invoice.
4. Pending palsu diperbaiki: localSales dan queue disatukan kembali otomatis.
5. Service worker/cache dimatikan supaya browser/APK tidak memakai file lama.
6. Thermal dan scanner tetap dipertahankan.

Langkah upload GitHub:
git status
git add .
git commit -m "Final fix transaksi APK anti pending palsu"
git push origin main

Setelah Railway SUCCESS:
npm install
npx cap sync android
npx cap open android

Android Studio:
File > Sync Project with Gradle Files
Build > Clean Project
Build > Rebuild Project
Build > Build APK(s)

PENTING:
- Hapus APK lama di HP sebelum install APK baru.
- Login ulang kasir.
- Tes Online: transaksi harus muncul di Admin/Riwayat.
- Tes Offline: status harus PENDING.
- Setelah internet balik: tekan Sync Sekarang, status harus SYNCED.
