# Rencana Implementasi Pembaruan UI, Animasi Music Player, & Fitur FLAC Opsional

## 1. Music Player & Animasi Mode Lirik Persis Video Referensi
- **Penghapusan Pencarian Klik Cover & Petunjuk Minimalis AI**:
  - Menghapus fitur klik cover album untuk membuka kolom pencarian manual.
  - Saat belum ada musik yang diputar, menampilkan teks petunjuk minimalis **`Tekan Alt + Q untuk meminta AI memutar lagu`** di area informasi lagu tanpa membuka popup tambahan.
- **Animasi & Tata Letak Mode Lirik 2 Kolom**:
  - Menyesuaikan transisi ekspansi Dynamic Island saat tombol lirik (`💬`) ditekan menjadi tampilan 2 kolom (`520px x 160px`) dengan pendaran gradien ambient halus yang mengikuti warna dominan cover album di sisi bawah/kanan.
  - **Kolom Kiri**: Menampilkan cover album, judul lagu & nama artis, bar durasi (`00:04 ──── -03:52`), serta deretan tombol kontrol `💬 ⏮ ⏸ ⏭` di bagian bawah.
  - **Kolom Kanan**: Dipisahkan oleh garis vertikal tipis (`1px`), menampilkan status `Loading lyrics...` di tengah saat lirik sedang diambil, lalu berganti ke animasi lirik yang bergulir mulus.
  - **Tetap Terbuka Selama Mode Lirik Aktif**: Sesuai pilihan kamu, selama mode lirik (`💬`) sedang aktif, Dynamic Island akan tetap terbuka lebar dalam tampilan 2 kolom meskipun kursor keluar dari area island.
- **Menghilangkan Glow Lirik yang Berlebihan**:
  - Menghapus efek `drop-shadow` neon pada lirik aktif yang sebelumnya menyebar dan terlihat terpotong di batas baris.
  - Lirik aktif kini menggunakan teks putih bersih yang tajam (`#ffffff`, `font-bold`) dan baris lirik tidak aktif menggunakan warna putih redup (`text-white/35`) persis seperti pada video referensi.

## 2. Menghapus Animasi Border Bergerak Saat AI Berpikir
- Menghapus elemen dan keyframe `.isle-siri-border` (garis tepi berputar) ketika AI sedang berpikir atau merespons.
- Mempertahankan hanya animasi gradien latar belakang yang halus (`.isle-siri-glow`) agar tampilan tetap bersih dan elegan.

## 3. Ukuran Dynamic Island Seragam & Perbaikan UI Calendar / Notification
- **Ukuran Konsisten di Semua Halaman Standar**:
  - Mengunci ukuran Dynamic Island saat terbuka pada semua menu standar (`Music`, `Notifications`, `Pomodoro`, `ToDo`, `Shelf`, `Calendar`) ke ukuran tetap **`440px x 160px`**.
  - Dengan ukuran yang seragam, posisi tombol panah navigasi kiri (`<`) dan kanan (`>`) tidak akan bergeser sama sekali ketika berpindah antar menu.
- **Perbaikan Tampilan Calendar & Notifications Tanpa Terpotong**:
  - **Calendar**: Merombak grid tanggal dan panel jadwal di sebelah kanan menjadi tata letak kompak berjarak rapat (`compact grid`) yang pas di dalam tinggi `160px` tanpa ada baris tanggal atau tombol yang terpotong.
  - **Notifications**: Menyesuaikan tinggi kartu notifikasi dan area scroll agar seluruh pesan terlihat utuh dan tetap minimalis di dalam ruang Dynamic Island yang seragam.

## 4. Fitur Opsional FLAC (Lossless Audio)
- **Pengaturan di Menu Settings & Indikator Kecil di Player**:
  - Menambahkan tombol switch **FLAC Lossless Audio** di dalam menu **Settings (ikon gear)**.
  - Menampilkan badge indikator kecil **`FLAC`** di area Music Player saat fitur Lossless diaktifkan.
- **Logika Pemutaran**:
  - Ketika opsi FLAC dimatikan (default), pemutar langsung menggunakan sumber YouTube Music Full Audio.
  - Ketika opsi FLAC diaktifkan oleh pengguna, backend akan mengambil stream audio berkualitas tinggi (FLAC Lossless via Monochrome) terlebih dahulu, dengan fallback ke YouTube Music Full Audio apabila lagu tersebut tidak tersedia dalam format FLAC.
