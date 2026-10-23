# 📄 PRD (Product Requirements Document) & Skema Data
## Aplikasi Pencatatan Keuangan & Manajemen Cicilan Penjualan Baju

---

### 1. Ringkasan Eksekutif & Tujuan Produk
Aplikasi ini dirancang khusus untuk pemilik usaha penjualan baju / fashion muslim / butik yang melayani sistem pembayaran **Tunai (Cash)** maupun **Cicilan (Kredit/Tempo)**. Aplikasi berfokus pada pencatatan keuangan internal, penagihan terjadwal via WhatsApp, serta rekonsiliasi arus kas riil vs piutang berjalan.

Sistem menggunakan konsep **Hybrid Storage**:
1. **LocalStorage (Client-side)** untuk kecepatan kilat tanpa jeda loading, dapat beroperasi secara offline.
2. **Google Drive Cloud Sync** melalui **Google Apps Script (Web App API)** sebagai database cloud gratis milik pengguna sendiri tanpa perlu sewa server/hosting bulanan.
3. **Manual JSON Backup/Restore** untuk keamanan ekstra data pengguna.

---

### 2. Persona Pengguna & Alur Kerja Utama
* **Pemilik Toko / Admin Penjualan:**
  - Mencatat pembeli baru (nama, WA, barang yang dibeli, harga, sistem bayar).
  - Jika cicilan: menentukan DP, durasi tenor (1–12 bulan), dan frekuensi angsuran (mingguan/bulanan).
  - Setiap pagi membuka **Dashboard** untuk melihat tagihan jatuh tempo hari ini dan 7 hari ke depan.
  - Mengirim pengingat tagihan ke pembeli hanya dengan 1 klik via WhatsApp (`wa.me`).
  - Mencatat angsuran yang masuk (baik nominal tepat, kurang/sebagian, maupun rapel).
  - Mencatat biaya pengeluaran operasional/kulakan untuk mengetahui kas bersih riil.

---

### 3. Matriks Fitur & Logika Bisnis

| Fitur | Deskripsi | Aturan Perhitungan / Logika |
| :--- | :--- | :--- |
| **Metrik Omzet Penjualan** | Total nilai barang yang terjual | `Σ (Harga Transaksi Cash + Harga Transaksi Cicilan)` |
| **Metrik Kas Masuk Riil** | Uang tunai riil yang sudah diterima di tangan | `Σ (Transaksi Cash + DP Cicilan + Semua Angsuran Terbayar)` |
| **Metrik Sisa Piutang** | Uang yang masih menjadi hak penjual di tangan pembeli | `Σ (Sisa Hutang Cicilan Aktif)` |
| **Metrik Kas Bersih** | Posisi kas riil setelah dikurangi beban operasional | `Total Kas Masuk Riil - Total Pengeluaran` |
| **Simulasi Cicilan** | Jadwal pembayaran otomatis | **Mingguan**: Tenor bulan × 4 minggu (Jatuh tempo tiap +7 hari).<br>**Bulanan**: Tenor bulan × 1 bulan (Jatuh tempo tiap +1 bulan). |
| **Fleksibilitas Bayar** | Pencatatan pembayaran cicilan | Mendukung pelunasan tepat jadwal, bayar sebagian (parsial), atau bayar lebih/rapel. Sisa pokok otomatis berkurang secara prorata ke tagihan berikutnya. |
| **Status Cicilan** | Klasifikasi kondisi pembayaran pelanggan | - **Lancar**: Tidak ada tagihan lewat jatuh tempo.<br>- **Jatuh Tempo**: Ada tagihan jatuh tempo hari ini s/d 7 hari ke depan.<br>- **Menunggak**: Ada tagihan yang tanggal jatuh temponya sudah terlewat & belum lunas.<br>- **Lunas**: Sisa hutang = Rp 0. |

---

### 4. Skema Struktur Data JSON (`database_keuangan.json`)

Struktur data didesain konsisten, terstruktur, dan mudah diekspor maupun diimpor.

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-10-20T11:30:00.000Z",
  "storeInfo": {
    "name": "Butik & Cicilan Baju Berkah",
    "owner": "Admin Toko",
    "phone": "081234567890",
    "rekening": "BCA 123456789 a.n Pemilik Toko / Mandiri 987654321"
  },
  "settings": {
    "gasUrl": "",
    "autoSync": true,
    "lastSyncTime": null
  },
  "transactions": [
    {
      "id": "TX-20261020-001",
      "createdAt": "2026-10-20T10:00:00.000Z",
      "date": "2026-10-20",
      "customerName": "Ibu Siti Aisyah",
      "customerPhone": "081234567891",
      "itemsDescription": "2 Pcs Gamis Katun Rayon Premium, 1 Pcs Hijab Pashmina",
      "totalAmount": 450000,
      "paymentType": "INSTALLMENT", // "CASH" atau "INSTALLMENT"
      
      // Khusus transaksi Cash:
      "cashPaidAmount": 0,
      
      // Khusus transaksi Cicilan:
      "installmentPlan": {
        "downPayment": 150000,
        "remainingPrincipal": 300000,
        "tenorMonths": 2,
        "frequency": "WEEKLY", // "WEEKLY" (Mingguan) atau "MONTHLY" (Bulanan)
        "totalInstallments": 8,
        "installmentAmount": 37500,
        "totalPaid": 150000,
        "remainingDebt": 150000,
        "status": "ACTIVE", // "ACTIVE", "PAID_OFF"
        "schedules": [
          {
            "installmentNo": 1,
            "dueDate": "2026-10-27",
            "amount": 37500,
            "paidAmount": 37500,
            "paidDate": "2026-10-27",
            "isPaid": true,
            "notes": "Transfer BCA"
          },
          {
            "installmentNo": 2,
            "dueDate": "2026-11-03",
            "amount": 37500,
            "paidAmount": 0,
            "paidDate": null,
            "isPaid": false,
            "notes": ""
          }
        ],
        "paymentHistory": [
          {
            "id": "PAY-001",
            "date": "2026-10-20",
            "type": "DP",
            "amount": 150000,
            "notes": "Uang Muka saat transaksi"
          },
          {
            "id": "PAY-002",
            "date": "2026-10-27",
            "type": "INSTALLMENT",
            "amount": 37500,
            "notes": "Angsuran ke-1 lunas"
          }
        ]
      }
    }
  ],
  "expenses": [
    {
      "id": "EXP-20261020-001",
      "date": "2026-10-20",
      "category": "KULAKAN", // "KULAKAN", "ONGKIR", "PACKAGING", "OPERASIONAL", "LAINNYA"
      "description": "Kulakan Gamis Rayon Tanah Abang 1 kodi",
      "amount": 2500000,
      "createdAt": "2026-10-20T08:30:00.000Z"
    }
  ]
}
```

---

### 5. Alur Integrasi Google Drive via Apps Script
```
[ Browser / Web App ]
       │
       ├─ (1) Simpan Instan ke LocalStorage (Offline first)
       │
       └─ (2) POST JSON payload ──> [ Google Apps Script Web App ]
                                            │
                                            ▼
                                  [ Google Drive Pengguna ]
                                  (File: database_keuangan.json)
```

- **Autentikasi & Keamanan**: Google Apps Script di-deploy dengan hak akses *"Execute as me"* dan *"Who has access: Anyone"*. URL Web App hanya diketahui oleh pemilik toko dan disimpan secara privat di browser mereka.
- **Fail-safe**: Jika koneksi internet terputus, data tetap aman di LocalStorage dan siap disinkronkan saat online kembali.
