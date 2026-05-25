TECNO POS - APK READY

File ini dibuat dari versi terakhir: UPGRADE HOLD + SHIFT KASIR.
Fitur aplikasi tetap sama, hanya ditambah persiapan Capacitor Android.

PENTING SEBELUM BUILD APK:
1. Buka public/config.js
2. Isi URL Railway kamu:
   window.TECNO_API_BASE = 'https://nama-app.up.railway.app';

Kalau tidak diisi, API akan pakai relative path dan cocok untuk web/Railway, tapi APK lokal perlu URL Railway.

CARA BUILD APK DI PC:
1. Extract ZIP
2. Buka CMD/Terminal di folder project
3. Jalankan:
   npm install
   npx cap add android
   npx cap sync android
   npx cap open android

Di Android Studio:
Build > Build Bundle(s) / APK(s) > Build APK(s)

Fitur yang disiapkan:
- Kamera HP untuk scan barcode
- Offline cache tetap jalan
- Auto sync ke Railway/Supabase saat online
- Hold transaksi + shift kasir tetap ada
- APK bisa dipasang di HP Android

CATATAN PRINT THERMAL:
Untuk cetak thermal Bluetooth native Android, tahap berikutnya perlu plugin ESC/POS Bluetooth.
Versi ini masih aman untuk print via WebView/browser print, dan siap ditambah plugin native.
