TECNO POS - TRUE HYBRID + HAPUS BARANG + MEMBER/UMUM

Upgrade:
1. Admin Produk: tambah tombol Hapus barang.
2. Kasir: transaksi offline tetap masuk Riwayat Lokal.
3. Login offline: akun yang pernah login online bisa login saat internet mati.
4. Member/Umum: jika Umum, struk tidak menampilkan Member/Poin.
5. Jika pilih Member, struk menampilkan Member, Poin +, Total Poin.
6. Poin member: Rp10.000 = 1 poin.
7. Multi toko tetap dipisah via store_id/toko_id.
8. Print thermal native app.js tetap dipertahankan.

Langkah:
- Upload ZIP ini ke Railway untuk update server.
- Untuk APK, ganti file project lalu jalankan:
  npx cap copy android
  npx cap sync android
  Build APK ulang di Android Studio.

Catatan offline login:
- Harus login online 1x dulu dengan akun itu.
- Setelah itu baru bisa login offline pakai akun tersimpan.
