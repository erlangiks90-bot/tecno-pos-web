# TECNO POS FINAL MAX BILLING

Login awal:
- Developer: developer / dev123
- Admin toko: admin / admin123
- Kasir: kasir / kasir123

Upgrade versi ini:
- Developer bisa aktif/nonaktif/suspend toko.
- Masa aktif paket per toko: expired_at.
- Auto suspend jika masa aktif habis saat admin/kasir login.
- Tagihan toko: buat tagihan, status bayar, tandai lunas, perpanjang masa aktif.
- Reminder expired di admin: H-7 sampai expired.
- Admin melihat status paket, tagihan, dan riwayat tagihan di Tentang.
- Notifikasi admin: masa aktif, stok menipis, hutang belum lunas.
- Backup full database dan riwayat backup.
- Kasir transaksi tetap berjalan: cari produk, keranjang, bayar, cetak struk.

Cara jalan:
```bash
npm install
npm start
```

Buka:
http://localhost:3000

Catatan:
- Kalau deploy di Replit/Railway, jalankan `npm start`.
- Data tersimpan di database/tecno_pos.db.

## Upgrade OPERASIONAL MAX
Tambahan versi ini:
- Buku Kas: kas masuk, kas keluar, saldo kas.
- Laba Bersih Real: penjualan - modal - pengeluaran + kas masuk tambahan.
- Tutup Kas Harian: uang awal, uang sistem, uang fisik, selisih.
- Mode Toko Buka/Tutup: jika tutup, kasir tidak bisa checkout.
- PIN keamanan untuk refund/setting.
- Void transaksi: kasir ajukan, admin approve/reject, stok balik otomatis saat approve.
- Import Produk CSV: format `nama,barcode,harga_jual,stok,kategori,satuan,harga_beli`.
- Cetak Label Harga.
- Scan Barcode Kamera HP (menggunakan fitur browser jika tersedia; fallback input manual).
- Pengingat backup data.

Login bawaan:
- Developer: developer / dev123
- Admin: admin / admin123
- Kasir: kasir / kasir123


## Upgrade OPERASIONAL REAL POS
- Admin sudah memiliki tombol Logout dengan konfirmasi keluar akun.
- Kasir wajib Buka Kas sebelum transaksi.
- Tutup Kas kasir menghitung uang sistem, uang fisik, dan selisih.
- Dashboard Admin Live menampilkan omzet, transaksi, item terjual, kas masuk/keluar, hutang, dan shift aktif.
- Keranjang kasir auto-save di browser, jadi tidak hilang saat reload.
- Shortcut kasir: F1 cari produk, F2 bayar, F3 simpan keranjang, F4 riwayat, Esc tutup modal/kosongkan pencarian.
