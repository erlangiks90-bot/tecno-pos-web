TECNO POS Supabase Stabil Fix

Perbaikan:
- Tidak mengubah fitur utama/stabil.
- Fix error login: ReferenceError log is not defined.
- Tetap memakai Supabase/PostgreSQL via DATABASE_URL Railway.
- Audit log tetap disimpan ke tabel audit_logs, tapi tidak membuat server crash jika gagal.

Akun default setelah database Supabase kosong dibuat:
- developer / dev123
- admin / admin123
- kasir / kasir123

Railway Variables:
DATABASE_URL=postgresql://postgres.PROJECTREF:PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres

Upload:
1. Ekstrak ZIP
2. Copy semua isi ke folder repo
3. git add .
4. git commit -m "Supabase stabil fix login"
5. git push origin main
