# Photobooth v3 - Web Master + Kiosk Electron (React + Vite + Node.js)

Mengikuti blueprint: **dua pilar** yaitu *Web Master* (cloud) dan *Kiosk Edge Client* (Windows/Mac, Electron), UI dashboard disamakan dengan halaman **Beranda** Photolab.

```
photobooth/
  package.json     skrip pembantu (install:all, build, start)
  server/          WEB MASTER: Node.js + Express + WebSocket (RDM), REST admin & kiosk, halaman QR, schema.sql
  dashboard/       React + Vite: Beranda (kesehatan kiosk, grafik), Kiosk + kontrol jarak jauh, dst.
  kiosk/           KIOSK: Electron (main + preload) + React + Vite (renderer)
    electron/        main.cjs, preload.cjs, failsave.cjs, ffmpeg.cjs, hardware.cjs, rdm.cjs, paths.cjs
    src/             UI kiosk (panel operator + sesi pelanggan)
    resources/bin/windows/   taruh ffmpeg.exe di sini
```

## 0. Yang baru di v3 (mengikuti rekaman kiosk asli)

**Layar pelanggan** (`kiosk/src/customer/`), landscape fullscreen dengan background per event:

1. *(opsional)* layar tunggu: video event berulang, sentuh untuk lanjut
2. **PILIH frame**: pratinjau frame dengan slot bernomor (panah kiri/kanan bila frame > 1)
3. Bayar / voucher (Normal Mode). Event Mode: lewati
4. Kamera + panel strip di kanan: **SENTUH UNTUK MEMULAI!** -> **PERSIAPLAH** -> 3-2-1 -> jepret -> **RETAKE PHOTO / NEXT PHOTO** untuk tiap foto (strip terisi bertahap)
5. Layar tinjau: sentuh foto lalu sentuh slot untuk menukar, **RESET**, **PRINT**, tab **LIVE / FOTO / GIF**
6. Layar QR: **MULAI LAGI** dan **EXTRA PRINT**. Tidak ada sentuhan 2 menit -> kembali ke awal

**Tombol admin di pojok kanan atas (⚙)** membuka panel operator persis seperti sebelumnya (Test Print, Last Print, Reprint Gallery, Failure File, Local File, Camera Test, App Setting, Printer Setting, Reload Kiosk, Minimize, Close). Boleh dikunci dengan **PIN operator** (App Setting). Tombol pertama panel menutup panel dan memulai sesi baru.

**Dashboard**
- Public Gallery (event): kolom **Tema kiosk** = gambar background, video layar tunggu, logo, warna aksen, teks mulai, teks bawah. Diunduh kiosk saat Reload Kiosk (jalan offline).
- Frame Photo/GIF: tombol **Slot** = editor slot. **Deteksi otomatis dari PNG** membaca area transparan; satu nomor foto bisa dipakai beberapa slot (strip 2 kolom: 6 slot dari 3 foto). Bisa juga edit X/Y/lebar/tinggi manual.

**Lain-lain**: retake dan foto yang tidak dipilih ikut tersimpan sebagai foto original; **Live Photo** (2,5 detik sebelum tiap jepretan, MP4) ikut diunggah dan tampil di halaman QR pelanggan.

## 1. Peta blueprint -> kode

| Blueprint | Di mana | Status |
|---|---|---|
| Renderer (React) dilarang akses `fs`/hardware; `contextIsolation: true`, `nodeIntegration: false`, preload + `contextBridge` | `kiosk/electron/preload.cjs` -> `window.photolabAPI` | Ada |
| Main Process pengendali tunggal | `kiosk/electron/main.cjs` | Ada (belum diuji di Electron asli) |
| Folder `temp/`, `print/` (reprint-cache), `failsave/` | `electron/paths.cjs`, `main.cjs` | Ada, retensi 500 sesi / 7 hari, scavenger temp 30 menit |
| Failsave: manifest atomik + SHA-256, daemon auto-sync, hapus setelah ack | `electron/failsave.cjs` + `POST /api/v1/sync/failsave-ingest` | Ada, **sudah diuji** (offline, file korup, ack) |
| Komposit via `ffmpeg.exe` (`spawn`), GIF | `electron/ffmpeg.cjs` | Ada, **sudah diuji** dengan ffmpeg |
| RDM WebSocket (test_print, last_print, reload, minimize, camera_test, update_config, force_sync) | `electron/rdm.cjs`, `server/server.js` (`/ws/kiosk`), dashboard menu Kiosk > Kontrol | Ada, **round-trip sudah diuji** |
| Telemetri heartbeat 15 detik + error alert | `main.cjs` `heartbeat()`, `GET /api/v1/admin/overview` | Ada |
| Opsi kamera: merek, orientasi, mirror preview/hasil, putar 180 | Kiosk > App Setting | Ada |
| Printer: status Spooler, sisa kertas | `hardware.cjs` `printerStatus`, penghitung kertas lokal | Sebagian (lihat bagian 8) |
| PostgreSQL, Redis, S3, NestJS, mTLS/JWT | `server/schema.sql` saja | **Belum**: server memakai Express + JSON + folder lokal |

## 2. Install dan jalankan (development)

Kebutuhan: **Node.js 18+**. Untuk kiosk di Windows: ffmpeg.exe (bagian 5).

```bash
npm run install:all          # server + dashboard + kiosk (kiosk mengunduh Electron, agak besar)
npm run build                # build dashboard/dist dan kiosk/dist
npm start                    # Web Master di http://localhost:3000
```

Dashboard `http://localhost:3000/` - login awal `admin` / `admin123` (**ganti**: `ADMIN_USER=... ADMIN_PASS=... npm start`).

Mode dev dengan hot reload (3 terminal):

```bash
cd server    && npm start         # API :3000
cd dashboard && npm run dev       # http://localhost:5173
cd kiosk     && npm run dev       # Vite :5174 + jendela Electron (tidak fullscreen saat dev)
```

Kiosk hanya jalan di dalam Electron (kamera, printer, ffmpeg, failsave ada di Main Process). Membukanya di browser hanya menampilkan pesan.

## 3. Setup pertama di dashboard

1. **Branch Manager**: tambah cabang (opsional), lalu **Kiosk**: pilih cabang. Kiosk 1 sudah ada dengan kode `KIOSK-0001`.
2. **Frame Photo**: Tambah, simpan, **Upload PNG** (area foto transparan), lalu **Slot > Deteksi otomatis dari PNG** > Simpan Slot.
3. **Public Gallery**: event + tanggal + **Aktif sampai** (foto dihapus otomatis setelahnya) + **Tema kiosk** (background, video layar tunggu, logo, teks).
4. **Soft File UI**, **Voucher**, **Payment Key** (harga per sesi).
5. **Overview/Beranda**: kartu Kesehatan Kiosk (online/offline, versi, printer, kamera, antrean failsave), grafik Pendapatan (Hari/Minggu/Bulan), Sesi, Hari Puncak, Cetakan, Voucher, Daftar Booth, Top Booth.
6. **Kiosk > Kontrol**: kirim Test Print, Last Print, Camera Test, Reload, Force Sync, Minimize ke kiosk yang online.

## 4. Setup kiosk (Windows 10/11)

1. Pasang printer DNP RX1HS dan jadikan default (atau pilih di *Printer Setting*), kertas 4x6.
2. Jalankan aplikasi kiosk (`npm start` di folder kiosk, atau installer dari bagian 6).
3. **App Setting**: Server URL (mis. `http://192.168.1.10:3000`), kode aktivasi `KIOSK-0001`, mode, driver kamera. Simpan: aplikasi otomatis *Reload Kiosk*.
4. **Camera Test** dan **Test Print**, lalu **Start Session**.

### Driver kamera
- **Webcam / HDMI capture card**: bekerja bawaan (getUserMedia).
- **DSLR via digiCamControl** (Windows): pasang digiCamControl, isi path `CameraControlCmd.exe` di App Setting. Kiosk memanggil `CameraControlCmd.exe /filename <file> /capture`.
- **DSLR via gphoto2** (Mac/Linux): pasang gphoto2 (`gphoto2 --capture-image-and-download`).
- Preview layar saat memakai DSLR: pakai HDMI capture card/webcam sebagai preview, jepretan resolusi penuh dari DSLR. Live view langsung dari Canon belum ada.

Perintah digiCamControl dan gphoto2 ditulis berdasarkan dokumentasi CLI masing-masing dan **belum diuji dengan kamera**. Cek di mesin kiosk; sesuaikan di `kiosk/electron/hardware.cjs` bila perlu.

### Kunci kiosk
Electron sudah fullscreen/kiosk dan memblokir F11/F12/Ctrl+R/W/P. Alt+Tab, Win, Ctrl+Alt+Del **tidak bisa** diblokir aplikasi; aktifkan **Windows Assigned Access / Shell Launcher** agar kiosk menjadi satu-satunya aplikasi, dan atur auto-login + auto-start.

## 5. ffmpeg

Taruh `ffmpeg.exe` (build "essentials", mis. dari gyan.dev) di `kiosk/resources/bin/windows/`. Saat build installer folder ini dikemas otomatis. Saat dev bisa memakai ffmpeg di PATH atau variabel `FFMPEG_PATH`.

## 6. Build installer Windows

```bash
cd kiosk
npm run dist            # vite build + electron-builder (NSIS), hasil di folder dist-electron atau release
```
Jalankan di Windows. Konfigurasi ada di blok `build` pada `kiosk/package.json`. Untuk Mac ubah target `electron-builder` (`--mac`) dan sediakan binary ffmpeg Mac di `resources/bin/ffmpeg`.

## 7. Alur data sesi (offline-first)

1. Pelanggan melewati alur layar di bagian 0. Foto mentah (termasuk retake) disimpan di `temp/session_<kode>/`.
2. Setelah **PRINT**: Main Process membuat komposit (ffmpeg: foto ke slot sesuai nomor foto, PNG frame di atas), GIF, dan Live Photo MP4.
3. **Ditulis dulu ke `failsave/<kode>/`** (manifest atomik + SHA-256), baru dicetak.
4. Daemon (30 detik) mengunggah via `failsave-ingest` bila Normal Mode dan online. Folder dihapus **hanya setelah server membalas `acknowledged`**. Jaringan putus: antrean aman dan tampil di **Failure File**.
5. QR mengarah ke `/s/<kode>` (foto, GIF, Live Photo); aktif setelah unggahan selesai. Foto kedaluwarsa otomatis sesuai *Aktif sampai* event (atau 30 hari).

Catatan: urutan "failsave dulu, unggah kemudian" sengaja lebih ketat dari blueprint supaya listrik padam tidak menghilangkan sesi.

## 8. Batasan yang jujur

| Hal | Status |
|---|---|
| Electron runtime (`main.cjs`, `preload.cjs`, cetak senyap, protokol `photolab-file://`) | Sintaks dicek dan modul pendukung diuji, **tapi belum dijalankan di Electron asli**. Uji dulu `npm run dev` sebelum produksi |
| Canon EDSDK langsung (live view, ISO/shutter/aperture, watchdog USB) | **Belum**. Memakai digiCamControl/gphoto2 sebagai perantara. EDSDK butuh addon native C++ |
| Status printer DNP | Hanya status Spooler Windows (offline, kertas habis, jam, cover). **Sisa kertas = penghitung lokal** (tombol "Kertas diisi ulang" mereset), bukan sensor |
| PostgreSQL / Redis / S3 / NestJS | Belum. `server/schema.sql` adalah skema blueprint untuk migrasi; telemetri disimpan di memori proses (pengganti Redis) |
| Autentikasi mesin | Token per kiosk (bukan mTLS/JWT). Gunakan HTTPS di produksi |
| QRIS asli | **Simulasi** (langsung PAID). Sambungkan gateway di `POST /api/v1/kiosk/transactions` |
| Frame GIF bertema | Kiosk membuat GIF animasi dari foto mentah; overlay frame GIF belum |
| Tampilan layar pelanggan v3 | Struktur dan alur sudah diuji lewat render komponen, tapi **tampilan visual (CSS/ukuran) belum kulihat di layar sungguhan**. Ekspektasikan penyesuaian ukuran, jarak, dan font setelah dicoba di monitor kiosk |
| Live Photo | Dibuat dari buffer preview webcam/capture card (10 fps). Bila kamera hanya DSLR tanpa preview webcam, Live Photo kosong |
| Video layar tunggu | Diputar lewat protokol `photolab-file://` dengan `stream: true`; belum diuji di Electron asli, bila macet ganti ke gambar background |
| Email, WhatsApp, auto-update (`electron-updater`), watermark kustom | Belum |
| EXTRA PRINT | Cetak ulang gratis. Belum ada pembayaran tambahan |
| Menu Photolab: What's New, Shared Voucher, Labtree, Framr | Tidak dibuat (bukan kebutuhan client) |
| APK Android | **Dihapus** dari paket ini: blueprint dan jawaban client memakai Windows/Mac (Electron) |
| Foto offline lintas restart | Aman (failsave di disk). Frame harus sudah di-sync (Reload Kiosk) sebelum berangkat ke venue |

## 9. Struktur API singkat

- Admin (Bearer): `POST /api/v1/admin/login`, `GET /state`, `GET /overview` (kesehatan kiosk + alert), `PUT /master`, `POST /frames/:id/asset`, `POST /kiosks/:id/command`
- Kiosk (`x-kiosk-token` atau Bearer): `POST /api/v1/kiosk/activate`, `GET /healthcheck`, `GET /sync`, `POST /vouchers/validate`, `POST /transactions`, `POST /heartbeat`, `POST /api/v1/sync/failsave-ingest` (multipart)
- WebSocket: `ws://server/ws/kiosk?token=...` (heartbeat, alert, progress sync; perintah RDM dari server)
- Publik: `/s/<kode>` (unduh foto/GIF), `/e/<slug>` (galeri event)

## 10. Masalah umum

- **Kiosk "Offline" di dashboard**: Server URL/token salah, atau WebSocket diblokir proxy (teruskan header `Upgrade`).
- **Cetak tidak keluar**: set printer default atau pilih printer di Printer Setting; cek log `[kiosk] print`.
- **`ffmpeg tidak ditemukan`**: taruh `ffmpeg.exe` (bagian 5) atau set `FFMPEG_PATH`.
- **Kamera webcam tidak muncul**: izinkan kamera; Electron sudah mengizinkan permission `media`.
- **Login dashboard diminta ulang**: server di-restart (token admin ada di memori).
- **Tema event tidak muncul di kiosk**: pastikan event aktif (tanggal dan kiosk benar) lalu *Reload Kiosk*; tema hanya ikut event yang sedang berlaku.
- **Lupa PIN operator**: hapus `config.json` di folder data aplikasi (`%AppData%/Photobooth Kiosk`) lalu atur ulang.
