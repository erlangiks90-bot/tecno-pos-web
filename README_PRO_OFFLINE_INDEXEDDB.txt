TECNO POS PRO - Offline IndexedDB + Server First

Sistem baru:
1. Online: BAYAR -> POST /api/kasir/checkout -> Supabase berhasil -> cetak struk.
2. Offline: transaksi disimpan ke IndexedDB, struk tertulis OFFLINE - BELUM MASUK SERVER.
3. Saat internet kembali: Sync otomatis upload transaksi pending.
4. Service worker dimatikan agar kasir.html/app.js tidak nyangkut cache lama.

Urutan upload:
1. Extract ZIP ini.
2. git add .
3. git commit -m "TECNO POS Pro offline indexeddb server first"
4. git push origin main
5. Tunggu Railway SUCCESS.
6. Tes Chrome: transaksi harus muncul di Supabase.
7. Baru build APK:
   npm install
   npx cap sync android
   npx cap open android

Cek Railway HTTP Logs setelah klik BAYAR harus muncul: POST /api/kasir/checkout.
