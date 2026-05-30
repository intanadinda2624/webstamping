# Paket revisi dashboard stamping box

Isi paket:
- `index.html`, `dashboard.html`, `history.html`, `_redirects`, `netlify.toml`
- folder `css/` dan `js/` untuk upload ke Netlify
- `ESP32_Stamping_Box_Master_ON_CycleTime.ino` untuk upload ke board ESP32-S3 lewat Arduino IDE

Perubahan utama:
1. Tema dashboard dibuat cerah dengan frame biru.
2. Speed Analysis diganti menjadi Cycle Time Analysis.
3. Tombol HOME POSITION diganti menjadi MASTER ON.
4. Histori produksi dipisah per tanggal di Firebase: `stamping_box/history/DD-MM-YYYY`.
5. Halaman histori hanya menampilkan data harian sesuai tanggal aktif.
6. Filter jam diperbaiki agar tidak hilang saat polling Firebase refresh.
7. Reset otomatis saat tanggal berganti ditambahkan di source ESP32.

Catatan penting:
- Untuk Netlify, upload semua file/folder web di paket ini.
- Untuk perubahan histori harian dan MASTER ON terbaca sempurna dari sisi mesin, upload juga file `.ino` ke ESP32-S3.
