TECNO POS STABLE MULTI TOKO + MEMBER + THERMAL

LANGKAH CMD:
1. Extract ZIP ini.
2. Buka CMD di folder project.
3. npm install
4. npm install cordova-plugin-bluetooth-serial cordova-plugin-android-permissions
5. npx cap sync android
6. npx cap open android

ANDROID STUDIO:
1. Gradle JDK pilih jbr-17 / Embedded JDK 17.
2. File > Sync Project with Gradle Files.
3. Build > Clean Project.
4. Build > Rebuild Project.
5. Build > Build APK(s).

FIX UTAMA DI VERSI INI:
- Data toko dipisah pakai toko_id di produk/transaksi/member.
- Checkout menolak produk yang bukan milik toko login.
- Produk dihapus admin ikut hilang di kasir karena cache refresh walau data kosong.
- Thermal Bluetooth pakai runtime permission untuk Android 12/13/14/15.
- Scanner barcode tidak lagi menerima QR supaya barcode BPOM/QR pinggir tidak mudah masuk.
- Member punya poin otomatis: Rp10.000 = 1 poin.
- Nama toko struk Bluetooth dibuat bold/tebal.

CATATAN:
- Pastikan config.js berisi URL Railway yang benar.
- Hapus APK lama di HP sebelum install APK baru.
- Pair printer RPP02N/POS58 dulu di Bluetooth HP.
