TECNO POS HYBRID PRO - POS SUNGGUHAN

Upgrade ini menambahkan pola POS nyata:
1. Remember Device: login pertama bisa diingat, buka lagi langsung masuk.
2. Lock Kasir: tombol Kunci, buka cukup PIN 4-6 digit.
3. Ganti Kasir: pindah kasir pakai PIN tanpa logout perangkat.
4. Shift Kasir: buka kas, tutup kas, uang awal, uang sistem, uang fisik, selisih.
5. Offline checkout queue: jika internet putus saat bayar, transaksi disimpan di browser dan auto sync saat online.
6. Railway tetap dipakai sebagai server aplikasi.
7. Supabase/PostgreSQL tetap dipakai sebagai database online/backup.

Default akun:
Developer: developer / dev123
Admin: admin / admin123
Kasir: kasir / kasir123

Default PIN awal mengikuti password akun, lalu bisa diubah lewat tombol Ubah PIN.

Upload ke GitHub lalu deploy ulang Railway. Pastikan DATABASE_URL Supabase tetap ada di Railway Variables.
