# WinIsle Desktop — Rencana Perbaikan 'Cannot GET /' & Pemantapan Overlay Windows

Rencana perbaikan arsitektural untuk menuntaskan error `Cannot GET /` pada jendela overlay Dynamic Island di Windows, memastikan pemuatan antarmuka 100% andal, terisolasi dari konflik port sistem, dan bebas dari pembatasan arsip virtual ASAR.

> [!IMPORTANT]
> **Keputusan yang Telah Dikonfirmasi Pengguna:**
> - **Port Backend Desktop**: Menggunakan port khusus tinggi `45781` (bukan port umum `3000`) dengan deteksi ketersediaan otomatis (*auto-fallback* ke port bebas berikutnya jika sedang terpakai).
> - **Strategi Pemuatan Antarmuka (UI)**: Menambahkan `asarUnpack` untuk folder `dist` pada konfigurasi `electron-builder`, serta menerapkan mekanisme *dual-mode loading* di mana Electron dapat memuat file HTML secara langsung (`mainWindow.loadFile`) dengan rute API lokal tetap terhubung ke server backend lokal yang aman.

---

## 1. Analisis Akar Masalah (Root Cause)

Berdasarkan analisis log dan tangkapan layar `Cannot GET /`:

1. **Konflik Port 3000 & Validasi Health-Check Palsu**:
   - Port `3000` adalah port yang sangat umum digunakan oleh berbagai aplikasi pengembang (Next.js, Create React App, Express) atau proses lama `WinIsle` yang masih berjalan di latar belakang.
   - Fungsi `isServerAlive()` sebelumnya hanya mengecek koneksi HTTP tanpa memvalidasi status `200 OK` dan identitas aplikasi. Akibatnya, jika ada proses lain di port 3000 yang merespons 404, Electron menganggap server siap dan memuat `http://127.0.0.1:3000/`, menampilkan halaman error 404 putih bawaan Express (`Cannot GET /`).

2. **Keterbatasan Streaming Express di Dalam Arsip `app.asar`**:
   - Ketika dikemas menjadi `WinIsleSetup.exe`, `electron-builder` memasukkan seluruh aset ke dalam satu file arsip `resources/app.asar`.
   - Modul `send` bawaan `express.static` dan `res.sendFile` sering mengalami kegagalan *file descriptor stream* saat membaca file di dalam `.asar` virtual pada sistem operasi Windows, menyebabkan Express melompat ke final 404 handler.

---

## 2. Solusi & Rencana Implementasi

```
┌─────────────────────────────────────────────────────────────┐
│                      WinIsle Desktop                        │
│                                                             │
│   ┌────────────────────────┐      ┌─────────────────────┐   │
│   │ Electron Overlay Window│◄────►│ Local Backend Server│   │
│   │ (Transparent, Frameless│      │ (dist-server.cjs)   │   │
│   │ Always-On-Top, Center) │      │ Dedicated Port:     │   │
│   └───────────┬────────────┘      │ 45781 (Auto-shift)  │   │
│               │                   └──────────┬──────────┘   │
│               ▼                              ▼              │
│    Primary: Native file://         Health Handshake         │
│    (Unpacked dist/index.html)      /api/winisle-health      │
│    Fallback: http://127.0.0.1      MIME/Buffer Direct Serve │
└─────────────────────────────────────────────────────────────┘
```

### Langkah 1: Isolasi Port & Health-Check Terverifikasi (`electron/main.cjs` & `server.ts`)
- Ubah port bawaan desktop dari `3000` menjadi port khusus `45781`.
- Tambahkan rute handshake khusus `/api/winisle-health` yang mengembalikan signature `{ app: 'winisle-desktop', version: '1.0.0', status: 'ready' }`.
- Perbarui fungsi verifikasi server di Electron agar hanya menganggap server aktif jika respons berstatus `200` dan mengembalikan signature valid.
- Jika port `45781` sedang terpakai oleh aplikasi lain, server otomatis mencoba port alternatif (`45782`, `45783`, dst.) dan meneruskannya ke jendela Electron.

### Langkah 2: Konfigurasi `electron-builder` & Relatif Base Path (`package.json` & `vite.config.ts`)
- Di `vite.config.ts`, tambahkan konfigurasi `base: './'` agar semua bundel aset JavaScript, CSS, dan media menggunakan path relatif yang kompatibel baik dengan server HTTP (`http://127.0.0.1:...`) maupun pemuatan file lokal langsung (`file:///.../dist/index.html`).
- Di `package.json` pada blok `"build"`, tambahkan opsi:
  - `"asarUnpack": ["dist/**/*", "dist-server/**/*"]` agar folder `dist` dan server diletakkan sebagai file fisik di disk Windows, sehingga tidak terikat kompresi virtual ASAR.

### Langkah 3: Mekanisme Pemuatan Handal & Pembersih Latar Belakang (`electron/main.cjs`)
- Implementasikan pemuatan berjenjang (*dual loading*):
  1. Coba muat `mainWindow.loadFile(unpackedIndexPath)`. Ini menjamin antarmuka langsung tampil tanpa jeda koneksi soket, transparan, dan tidak akan pernah terkena error HTTP 404 `Cannot GET /`.
  2. Suntikkan konfigurasi port API aktif (`window.__WINISLE_SERVER_PORT__ = activePort`) ke web context renderer agar seluruh fitur (Pencarian musik YouTube/LRCLIB, Gemini Live Audio WebSocket, Kontrol Hardware Windows Master Volume/Baterai) tetap terhubung ke backend lokal.
- Tambahkan perintah pembersihan proses lama (*kill stale WinIsle instances*) saat aplikasi dijalankan, sehingga tidak ada proses zombie yang tertinggal di task manager.

### Langkah 4: Buffer-Safe Static File Handler di `server.ts`
- Pada `server.ts`, ganti pemanggilan `res.sendFile` rentan dengan handler berkas berbasis `fs.readFileSync` langsung yang mendukung MIME types lengkap (`text/html`, `application/javascript`, `text/css`, dll.) sebagai jaring pengaman kedua jika renderer mengakses aset melalui HTTP.

---

## 3. Langkah Pengujian & Verifikasi

1. **Pengujian Dev & Web**:
   - Jalankan `compile_applet` untuk memastikan `vite build` dengan `base: './'` berhasil tanpa error modul.
   - Jalankan `lint_applet` untuk memverifikasi validitas TypeScript dan ketiadaan regresi kode.
2. **Pengujian Bundel Server**:
   - Jalankan `npm run build:server` untuk memverifikasi kompilasi `dist-server/server.cjs` dan ikon tray.
3. **Pengujian Startup Mandiri**:
   - Uji respons endpoint `/api/winisle-health` dan verifikasi bahwa jendela Electron memuat Dynamic Island secara instan dan bersih dengan background transparan.
