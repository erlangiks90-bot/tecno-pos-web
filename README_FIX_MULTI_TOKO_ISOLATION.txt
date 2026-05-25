FIX MULTI TOKO / STORE ISOLATION

Perbaikan ini memisahkan cache offline per toko_id/store_id.
Masalah sebelumnya: cache produk lokal di APK/browser memakai key umum, sehingga produk toko A bisa muncul saat login kasir toko B.

Yang diperbaiki:
- Product cache dipisah per toko
- Offline checkout queue dipisah per toko
- Local sales/pending sync dipisah per toko
- Nomor transaksi lokal dipisah per toko
- Cache produk diberi toko_id agar tidak nyampur

Catatan penting setelah deploy:
1. Upload ZIP ini ke Railway agar backend/frontend versi sama.
2. Build APK ulang dari ZIP ini.
3. Di HP, uninstall APK lama dulu lalu install APK baru.
4. Login toko B, buka Produk sekali saat online agar cache toko B terisi.

Jika masih ada data toko A tampil di toko B, hapus data aplikasi di HP:
Setelan > Aplikasi > TECNO POS > Penyimpanan > Hapus Data.
