TECNO POS FIX

Perbaikan:
- Anti duplicate offline_client_id
- Mengurangi crash Railway saat sync offline
- Riwayat admin lebih aman

Langkah:
1. Extract ZIP
2. Replace file project lama
3. npm install
4. git add .
5. git commit -m "fix sync"
6. git push origin main
7. Railway deploy
8. Build APK ulang:
   npx cap sync android
