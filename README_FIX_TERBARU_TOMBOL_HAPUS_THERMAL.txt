TECNO POS FIX TERBARU

Isi update:
1. Tombol Hapus Barang di Admin > Produk dikembalikan.
2. Hapus produk memakai endpoint DELETE /api/admin/products/:id.
3. Setelah hapus, cache produk kasir dibersihkan supaya produk hilang di kasir.
4. Thermal Bluetooth tetap memakai runtime permission Android 12+.
5. Multi toko/member/produk mengikuti store_id/toko_id dari versi stabil.

Urutan pakai:
1. Extract ZIP ini.
2. Upload/update ke GitHub repo lama.
3. Deploy Railway.
4. Tes Chrome dulu: login admin, tambah produk, hapus produk, transaksi.
5. Kalau Chrome aman, jalankan:
   npm install
   npx cap sync android
   npx cap open android
6. Android Studio: pilih JDK 17, Sync Gradle, Clean, Rebuild, Build APK.
