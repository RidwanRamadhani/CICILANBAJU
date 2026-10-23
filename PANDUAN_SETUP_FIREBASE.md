# 🔥 Panduan Setup Firebase Realtime Database (4 Langkah Mudah untuk Pemula)

Dengan menggunakan **Firebase Realtime Database (Google Cloud)**, aplikasi Anda akan menjadi **100% Real-Time**:
* Setiap kali ada cicilan atau pembayaran baru yang dicatat di **HP A**, data tersebut akan **langsung otomatis muncul di HP B dalam hitungan milidetik** tanpa perlu refresh ataupun jeda waktu!
* **100% Gratis Selamanya** menggunakan paket *Spark Plan* dari Google Firebase (Kapasitas 1 GB penyimpanan data & 100 koneksi bersamaan — sangat cukup untuk ratusan ribu transaksi toko).

---

### 📌 Langkah 1: Buat Project Baru di Firebase Console
1. Buka browser dan kunjungi: **[https://console.firebase.google.com/](https://console.firebase.google.com/)**
2. Login menggunakan akun Google Anda (Gmail).
3. Klik tombol **"+ Add project"** (atau *Tambahkan proyek*).
4. Masukkan nama project Anda, contoh: **`toko-cicilan-baju`** (atau nama toko Anda).
5. Klik **Continue** (Lanjutkan).
6. Pada opsi Google Analytics, boleh dimatikan (toggle off) agar lebih cepat, lalu klik **Create project** (Buat proyek).
7. Tunggu beberapa detik hingga selesai, lalu klik **Continue**.

---

### 📌 Langkah 2: Buat Realtime Database & Atur Izin Akses (Rules)
1. Di menu bilah kiri (Sidebar), klik menu **"Build"** (Bangun) > pilih **"Realtime Database"**.
2. Klik tombol **"Create Database"** (Buat Database).
3. Pilih lokasi server (bisa pilih default: **United States** atau **Singapore** jika tersedia), lalu klik **Next**.
4. Pada bagian *Security rules*, pilih opsi: **"Start in test mode"** (Mulai dalam mode uji) agar aplikasi Anda dapat langsung membaca dan menyimpan data.
5. Klik **Enable** (Aktifkan).
6. *(Penting)* Masuk ke tab **"Rules"** di bagian atas database, pastikan aturannya seperti berikut:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   Jika ada tombol **"Publish"** (Publikasikan), klik untuk menyimpan.

---

### 📌 Langkah 3: Ambil Kode `firebaseConfig`
1. Di pojok kiri atas samping tulisan *Project Overview*, klik ikon roda gigi ⚙️ > pilih **"Project settings"** (Setelan proyek).
2. Gulir ke bawah ke bagian **"Your apps"** (Aplikasi Anda).
3. Klik ikon web: **`</>`** (Ikon kurung siku).
4. Masukkan nama julukan aplikasi, contoh: `Web Cicilan Baju`, lalu klik **Register app** (Daftarkan aplikasi).
5. Anda akan melihat blok kode JavaScript yang berisi:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "toko-cicilan-baju.firebaseapp.com",
     databaseURL: "https://toko-cicilan-baju-default-rtdb.firebaseio.com",
     projectId: "toko-cicilan-baju",
     storageBucket: "toko-cicilan-baju.appspot.com",
     messagingSenderId: "123456789...",
     appId: "1:123456789..."
   };
   ```
6. **Salin (Copy) seluruh teks tersebut** (atau mulai dari kurung kurawal `{` sampai `}`).

---

### 📌 Langkah 4: Tempel ke Aplikasi Web & Hubungkan ke HP B
1. Buka aplikasi web Anda di browser.
2. Di pojok kanan atas, klik tombol **"Belum Terhubung Firebase"** (dengan ikon api 🔥).
3. Tempel (Paste) kode yang Anda salin tadi ke dalam kotak yang tersedia.
4. Klik tombol **"Simpan & Konek"**.
5. Indikator di kanan atas akan seketika berubah menjadi hijau menyala:
   👉 **`[🟢 Firebase Live ⚡]`**
6. Jika Anda sudah memiliki data penjualan di laptop/HP utama, klik tombol **"Unggah Data Lokal"** agar data tersebut langsung terisi ke Firebase.

---

### 📲 Cara Menyambungkan HP B (Otomatis & Tanpa Ketik Ulang!)
Untuk menghubungkan HP B, HP istri/admin lain, atau perangkat kedua:
1. Di HP A / Laptop utama, buka menu Firebase (klik ikon api 🔥 di kanan atas).
2. Klik tombol warna oranye: **"Salin Link Siap Pakai untuk HP B"**.
3. Kirim link tersebut lewat WhatsApp ke nomor HP B.
4. Buka link tersebut di browser HP B.
5. **Selesai! 🎉** HP B akan langsung otomatis terhubung ke database yang sama persis secara live real-time.
6. **Coba tes:** Tambah transaksi di HP A, maka dalam hitungan detik data langsung muncul di layar HP B tanpa perlu refresh!
