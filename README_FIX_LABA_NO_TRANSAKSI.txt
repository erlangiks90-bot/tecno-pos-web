FIX LABA BERSIH + NO TRANSAKSI

Perbaikan:
1. No struk tidak lagi OFF-xxx.
   Format offline/cepat lokal: TRX-YYYYMMDD-000001.
   Saat sync ke Railway/Supabase nomor transaksi tetap sama.

2. Laba bersih dihitung ulang dengan rumus jelas:
   Laba Bersih = Penjualan - Modal Barang - Pengeluaran + Kas Masuk Tambahan

3. Tampilan laporan menambah Laba Kotor dan keterangan rumus.

4. Parsing nominal diperkuat agar Rp 1.000.000 tidak salah dibaca.
