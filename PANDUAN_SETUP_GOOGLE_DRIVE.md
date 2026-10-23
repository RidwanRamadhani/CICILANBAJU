# 🚀 Panduan Setup Google Drive API (5 Langkah Mudah untuk Pemula)

Dengan panduan ini, Anda akan memiliki database cloud sendiri di Google Drive pribadi Anda, **100% Gratis selamanya**, aman, dan tanpa biaya sewa server.

---

### 📌 Langkah 1: Buka Google Apps Script
1. Buka browser dan kunjungi: **[https://script.google.com/home/start](https://script.google.com/home/start)**
2. Pastikan Anda sudah login ke akun Google (Gmail) Anda.
3. Klik tombol biru **"+ Project Baru"** (atau *"+ New Project"* di pojok kiri atas).
4. Beri nama project (klik pada tulisan *"Untitled project"* di atas), ubah menjadi: **`Database Cicilan Baju`**.

---

### 📌 Langkah 2: Salin Kode `Code.gs`
1. Di editor Google Apps Script, hapus semua kode bawaan yang ada di file `Code.gs`.
2. Buka file **`Code.gs`** dari folder aplikasi ini, salin (**Copy**) seluruh isinya.
3. Tempel (**Paste**) ke editor Google Apps Script.
4. Tekan tombol ikon **Simpan (Disket)** atau `Ctrl + S`.

---

### 📌 Langkah 3: Deploy sebagai Web App
1. Klik tombol biru **"Deploy"** (Terapkan) di pojok kanan atas, lalu pilih **"New deployment"** (Penerapan baru).
2. Di sebelah tulisan *"Select type"* (Pilih jenis), klik ikon roda gigi ⚙️, lalu pilih **"Web app"**.
3. Isi kolom pengaturan seperti berikut (Sangat Penting!):
   - **Description**: `Versi 1 API Cicilan Baju`
   - **Execute as** (Jalankan sebagai): **`Me (emailanda@gmail.com)`**
   - **Who has access** (Siapa yang memiliki akses): **`Anyone`** *(Pilih "Siapa saja", agar aplikasi web Anda bisa mengirim data ke script tanpa terblokir login)*.
4. Klik tombol **"Deploy"**.

---

### 📌 Langkah 4: Berikan Izin Akses (Authorize Access)
1. Layar pop-up otorisasi akan muncul: klik tombol **"Authorize access"** (Otorisasi akses).
2. Pilih akun Google Anda.
3. Jika muncul peringatan *"Google hasn’t verified this app"* (Google belum memverifikasi aplikasi ini) — **ini wajar karena script dibuat oleh Anda sendiri**:
   - Klik tulisan **"Advanced"** (Lanjutan) di kiri bawah.
   - Klik **"Go to Database Cicilan Baju (unsafe)"** / *"Buka Database Cicilan Baju (tidak aman)"*.
4. Klik tombol **"Allow"** (Izinkan).

---

### 📌 Langkah 5: Salin URL Web App & Tempel ke Aplikasi Web
1. Setelah berhasil, akan muncul kotak berisi **Web app URL** (Contoh: `https://script.google.com/macros/s/AKfycbx.../exec`).
2. Klik tombol **"Copy"** pada Web App URL tersebut.
3. Buka Aplikasi Web Pencatatan Cicilan Baju di browser Anda.
4. Klik tombol menu **"⚙️ Pengaturan Cloud Sync"** di pojok kanan atas aplikasi.
5. Tempel URL tersebut ke kolom **"Google Apps Script Web App URL"**, lalu klik **"Simpan & Uji Koneksi"**.
6. Selesai! 🎉 Data Anda sekarang otomatis tersimpan aman di Google Drive Anda di folder `Aplikasi_Cicilan_Baju/database_keuangan.json`.

---

### 💡 Catatan Penting & Troubleshooting:
- **Jika melakukan perubahan pada `Code.gs` di kemudian hari:**
  Anda harus melakukan: **Deploy** > **Manage deployments** > Klik ikon pensil (Edit) > ubah **Version** ke **"New version"** > klik **Deploy**.
- **Data Tersimpan Lokal:**
  Meskipun internet sedang mati atau URL belum disetel, aplikasi Anda tetap berfungsi 100% normal menggunakan memori lokal browser (LocalStorage). Begitu koneksi aktif kembali, Anda cukup klik *"Simpan ke Google Drive"*.
- **Cadangan Manual:**
  Anda juga bisa mengunduh file `.json` kapan saja melalui tombol **"Backup File (.json)"** di menu Pengaturan.
