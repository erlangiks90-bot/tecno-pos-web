# TECNO POS - Fix Struk Palsu / Transaksi Lokal Tidak Masuk Supabase

Perbaikan utama:

1. Saat ONLINE, tombol BAYAR wajib POST ke `/api/kasir/checkout` dulu.
2. Struk hanya dicetak dari response server/Supabase yang valid.
3. Jika online tapi request gagal, struk tidak dicetak supaya tidak ada transaksi palsu.
4. Jika benar-benar OFFLINE, transaksi masuk pending sync dan diberi tanda OFFLINE.
5. Service worker dimatikan agar file lama tidak nyangkut di Chrome/WebView/APK.

## Upload ke GitHub
```bash
git add .
git commit -m "Fix struk palsu transaksi server first"
git push origin main
```

Tunggu Railway SUCCESS, lalu tes Chrome dulu.

## Build APK
```bash
npx cap sync android
npx cap open android
```

Di Android Studio: Clean Project, Rebuild Project, Build APK(s).

## Tes wajib
1. Login kasir online.
2. Bayar 1 transaksi.
3. Pastikan invoice muncul di Supabase tabel `transactions`.
4. Baru cek riwayat admin.
