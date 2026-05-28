FIX RAILWAY CRASH DUPLICATE SYNC

Perbaikan utama:
- transactions_offline_client_id_key tidak bikin Railway crash
- transaksi offline yang terkirim ulang dianggap duplicate sukses
- invoice duplicate otomatis dibuat ulang
- admin riwayat limit 1000 dan urut created_at

Cara pakai:
1. Extract ZIP
2. Replace server.js di project lama
3. git add server.js README_FIX_RAILWAY_CRASH_DUPLICATE.txt
4. git commit -m "fix railway crash duplicate sync"
5. git push origin main
6. Tunggu Railway Running
7. Buka APK lalu Sync Sekarang
