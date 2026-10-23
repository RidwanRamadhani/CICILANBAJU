/**
 * ============================================================================
 * SISTEM KEUANGAN & MANAJEMEN CICILAN PENJUALAN BAJU (CASH & TEMPO)
 * Database Cloud: Google Drive (via Google Apps Script Web App API)
 * Storage Lokal: Browser LocalStorage (Fast & Offline-Ready)
 * ============================================================================
 */

// STORAGE KEY CONSTANT
const STORAGE_KEY = "cicilan_baju_database_v1";

// DEFAULT APPLICATION STATE TEMPLATE
const defaultDatabase = {
  version: "1.0.0",
  lastUpdated: new Date().toISOString(),
  storeInfo: {
    name: "Toko Busana & Butik Berkah",
    owner: "Admin Toko",
    phone: "081234567890",
    rekening: "BCA 1234567890 a.n Butik Berkah / DANA 081234567890"
  },
  settings: {
    gasUrl: "",
    autoSync: true,
    lastSyncTime: null,
    ownerPin: "1234"
  },
  transactions: [],
  expenses: []
};

// RUNTIME STATE
let db = null;
let currentInstallmentFilter = "ALL";
let isSyncing = false;
let autoSyncTimeout = null;
let livePollingInterval = null;
let isOwnerLoggedIn = false;

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
  loadDatabaseFromLocal();
  checkUrlParamsForGasUrl();
  initDefaultDateInputs();
  updateStoreHeaderDisplay();
  updateSyncUIStatus();

  // CEK APAKAH ADA PERMINTAAN CEK NOTA KHUSUS PEMBELI (?cek=TX-xxx)
  const urlParams = new URLSearchParams(window.location.search);
  const cekParam = urlParams.get('cek');
  const phoneParam = urlParams.get('phone');

  if (cekParam || phoneParam) {
    // Mode Pembeli / Cek Tagihan
    isOwnerLoggedIn = false;
    updateRoleUI();
    switchTab('customer-portal');
    setTimeout(() => {
      handleCustomerLookup(cekParam || phoneParam);
    }, 200);
  } else {
    // Cek apakah pemilik toko sebelumnya sudah login di browser ini
    isOwnerLoggedIn = localStorage.getItem("owner_auth_logged") === "true";
    updateRoleUI();
    if (isOwnerLoggedIn) {
      switchTab('dashboard');
    } else {
      switchTab('customer-portal');
    }
  }

  refreshAllViews();

  // REAL-TIME AUTO PULL DARI CLOUD SETELAH HALAMAN DIBUKA
  if (db.settings.gasUrl) {
    await autoFetchFromCloud();
    // Refresh lagi jika mode pembeli aktif dan mencari
    if (cekParam || phoneParam) {
      handleCustomerLookup(cekParam || phoneParam);
    }
  }

  // AKTIFKAN LIVE POLLING OTOMATIS TIAP 12 DETIK
  startLivePolling();
});

// Auto-sync saat tab browser aktif kembali (fokus)
window.addEventListener("focus", () => {
  if (db && db.settings.gasUrl && !isSyncing) {
    autoFetchFromCloud(true);
  }
});

/**
 * Cek apakah ada parameter ?api= di URL (untuk kemudahan buka di HP / Akun lain)
 */
function checkUrlParamsForGasUrl() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const apiParam = urlParams.get('api');
    if (apiParam && apiParam.startsWith('http')) {
      db.settings.gasUrl = apiParam.trim();
      db.settings.autoSync = true;
      saveDatabaseToLocal(false);
      showToast("URL Cloud Google Drive otomatis terpasang dari link!", "info");
    }
  } catch (e) {
    console.warn("Gagal membaca query params:", e);
  }
}

/**
 * Live Background Polling agar data sinkron real-time antar perangkat / tab
 */
function startLivePolling() {
  if (livePollingInterval) clearInterval(livePollingInterval);
  livePollingInterval = setInterval(() => {
    if (db && db.settings.gasUrl && !isSyncing && db.settings.autoSync !== false) {
      autoFetchFromCloud(true);
    }
  }, 12000); // Polling setiap 12 detik
}

/**
 * Memuat database dari LocalStorage browser
 */
function loadDatabaseFromLocal() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      db = JSON.parse(stored);
      // Ensure essential schema properties exist
      if (!db.storeInfo) db.storeInfo = { ...defaultDatabase.storeInfo };
      if (!db.settings) db.settings = { ...defaultDatabase.settings };
      if (!Array.isArray(db.transactions)) db.transactions = [];
      if (!Array.isArray(db.expenses)) db.expenses = [];
    } catch (e) {
      console.error("Gagal mem-parsing LocalStorage, memuat template awal:", e);
      db = JSON.parse(JSON.stringify(defaultDatabase));
      saveDatabaseToLocal();
    }
  } else {
    // If empty first time, initialize and offer sample data
    db = JSON.parse(JSON.stringify(defaultDatabase));
    saveDatabaseToLocal();
  }
}

/**
 * Menyimpan database ke LocalStorage dan memicu Auto-Sync jika aktif
 */
function saveDatabaseToLocal(triggerSync = true) {
  db.lastUpdated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if (triggerSync && db.settings.autoSync && db.settings.gasUrl) {
    debouncedAutoSync();
  }
}

/**
 * Set tanggal default hari ini pada form input
 */
function initDefaultDateInputs() {
  const today = getTodayDateString();
  const txDateInput = document.getElementById("txDate");
  const expDateInput = document.getElementById("expDate");
  const payDateInput = document.getElementById("payDate");

  if (txDateInput && !txDateInput.value) txDateInput.value = today;
  if (expDateInput && !expDateInput.value) expDateInput.value = today;
  if (payDateInput && !payDateInput.value) payDateInput.value = today;

  // Format header date
  const dateDisplay = document.getElementById("currentDateStr");
  if (dateDisplay) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDisplay.textContent = new Date().toLocaleDateString('id-ID', options);
  }
}

function updateStoreHeaderDisplay() {
  const el = document.getElementById("storeNameHeaderDisplay");
  if (el && db.storeInfo && db.storeInfo.name) {
    el.textContent = db.storeInfo.name;
  }
}

// ================= ROLE & SECURITY MANAGEMENT =================
function updateRoleUI() {
  const btnToggle = document.getElementById("btnRoleToggle");
  const toggleIcon = document.getElementById("roleToggleIcon");
  const toggleText = document.getElementById("roleToggleText");
  const desktopNav = document.getElementById("desktopOwnerNav");
  const mobileNav = document.getElementById("mobileOwnerNav");
  const customerBanner = document.getElementById("customerPortalBanner");
  const ownerElements = document.querySelectorAll(".owner-only-element");

  if (isOwnerLoggedIn) {
    if (toggleText) toggleText.textContent = "Pemilik Toko (Kunci)";
    if (toggleIcon) toggleIcon.className = "fa-solid fa-lock-open text-emerald-600";
    if (btnToggle) btnToggle.className = "flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition shadow-sm bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100";
    
    if (desktopNav) {
      desktopNav.classList.remove("hidden");
      desktopNav.classList.add("flex");
    }
    if (mobileNav) mobileNav.classList.remove("hidden");
    if (customerBanner) customerBanner.classList.add("hidden");

    ownerElements.forEach(el => el.classList.remove("hidden"));
  } else {
    if (toggleText) toggleText.textContent = "Masuk Pemilik Toko";
    if (toggleIcon) toggleIcon.className = "fa-solid fa-lock text-amber-600";
    if (btnToggle) btnToggle.className = "flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition shadow-sm bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100";

    if (desktopNav) {
      desktopNav.classList.add("hidden");
      desktopNav.classList.remove("flex");
    }
    if (mobileNav) mobileNav.classList.add("hidden");
    if (customerBanner) customerBanner.classList.remove("hidden");

    ownerElements.forEach(el => el.classList.add("hidden"));
  }
}

function toggleOwnerAuthModal() {
  if (isOwnerLoggedIn) {
    if (confirm("Kunci Mode Pemilik Toko? Aplikasi akan beralih ke Mode Pelanggan (Hanya Lihat).")) {
      isOwnerLoggedIn = false;
      localStorage.removeItem("owner_auth_logged");
      updateRoleUI();
      switchTab("customer-portal");
      showToast("Mode Pemilik Toko dikunci. Sekarang dalam Mode Pelanggan (Aman)", "info");
    }
  } else {
    document.getElementById("inputOwnerPin").value = "";
    openModal("modalOwnerLogin");
    setTimeout(() => {
      document.getElementById("inputOwnerPin").focus();
    }, 150);
  }
}

function handleOwnerLoginSubmit(event) {
  event.preventDefault();
  const inputPin = document.getElementById("inputOwnerPin").value.trim();
  const validPin = (db.settings && db.settings.ownerPin) ? db.settings.ownerPin : "1234";

  if (inputPin === validPin) {
    isOwnerLoggedIn = true;
    localStorage.setItem("owner_auth_logged", "true");
    closeModal("modalOwnerLogin");
    updateRoleUI();
    switchTab("dashboard");
    showToast("PIN Benar! Selamat datang Pemilik Toko. Akses edit penuh aktif.", "success");
  } else {
    showToast("PIN Toko salah! Silakan coba lagi.", "error");
    document.getElementById("inputOwnerPin").value = "";
    document.getElementById("inputOwnerPin").focus();
  }
}

// ================= NAVIGATION & TAB SWITCHING =================
function switchTab(tabName) {
  // Jika bukan pemilik toko dan mencoba buka menu selain customer-portal, minta PIN
  if (!isOwnerLoggedIn && tabName !== 'customer-portal') {
    toggleOwnerAuthModal();
    return;
  }

  const views = ['dashboard', 'new-transaction', 'installments', 'transactions', 'expenses', 'customer-portal'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === tabName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  // Update desktop tabs styling
  const desktopTabs = document.querySelectorAll('.nav-tab');
  desktopTabs.forEach(btn => {
    if (btn.id === `tab-${tabName}`) {
      btn.className = "nav-tab px-4 py-2 text-sm font-semibold rounded-lg text-brand-700 bg-brand-50 flex items-center space-x-2 transition";
    } else {
      btn.className = "nav-tab px-4 py-2 text-sm font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center space-x-2 transition";
    }
  });

  // Update mobile tabs styling
  const mobileTabs = document.querySelectorAll('.mobile-nav-btn');
  mobileTabs.forEach(btn => {
    if (btn.id === `mob-${tabName}`) {
      if (tabName === 'new-transaction') {
        btn.className = "mobile-nav-btn flex flex-col items-center py-1 px-3 text-white bg-brand-700 rounded-xl text-[10px] font-bold shadow-md -mt-2";
      } else {
        btn.className = "mobile-nav-btn flex flex-col items-center py-1 px-2 text-brand-600 text-[10px] font-bold";
      }
    } else {
      if (btn.id === 'mob-new-transaction') {
        btn.className = "mobile-nav-btn flex flex-col items-center py-1 px-3 text-white bg-brand-600 rounded-xl text-[10px] font-bold shadow-md -mt-2";
      } else {
        btn.className = "mobile-nav-btn flex flex-col items-center py-1 px-2 text-slate-500 text-[10px] font-medium";
      }
    }
  });

  // Specific refresh actions
  if (tabName === 'dashboard') {
    renderDashboard();
  } else if (tabName === 'installments') {
    renderInstallmentsTable();
  } else if (tabName === 'transactions') {
    renderTransactionHistory();
  } else if (tabName === 'expenses') {
    renderExpensesView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= CURRENCY & DATE UTILS =================
function formatRupiah(number) {
  const num = Number(number) || 0;
  return "Rp " + num.toLocaleString("id-ID");
}

function parseCurrencyInput(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const cleaned = value.toString().replace(/[^\d]/g, "");
  return parseInt(cleaned, 10) || 0;
}

function formatCurrencyInput(inputElement) {
  const raw = parseCurrencyInput(inputElement.value);
  inputElement.value = raw > 0 ? raw.toLocaleString("id-ID") : "";
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateIndo(dateStr) {
  if (!dateStr) return "-";
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

function addDaysToDate(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonthsToDate(dateString, months) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setMonth(date.getMonth() + months);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDiffDaysFromToday(targetDateStr) {
  const todayStr = getTodayDateString();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [dy, dm, dd] = targetDateStr.split('-').map(Number);
  const today = new Date(ty, tm - 1, td).getTime();
  const target = new Date(dy, dm - 1, dd).getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// ================= TOAST NOTIFICATION =================
function showToast(message, type = 'success') {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `flex items-center space-x-3 px-4 py-3 rounded-2xl shadow-xl text-white text-xs sm:text-sm font-semibold pointer-events-auto transition-all transform duration-300 translate-y-2 opacity-0 ${
    type === 'success' ? 'bg-slate-900 border border-emerald-500/50' :
    type === 'error' ? 'bg-rose-900 border border-rose-500/50' : 'bg-slate-800'
  }`;

  const iconClass = type === 'success' ? 'fa-circle-check text-emerald-400' :
                    type === 'error' ? 'fa-triangle-exclamation text-rose-400' : 'fa-circle-info text-blue-400';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass} text-base"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Auto dismiss
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// ================= CALCULATION & DASHBOARD METRICS (PRD 2.A) =================
function calculateFinancialMetrics() {
  let totalOmzet = 0;
  let totalKasMasuk = 0;
  let totalPiutang = 0;
  let countTotalSales = db.transactions.length;
  let countPaidInstallments = 0;
  let countActiveDebtors = 0;

  db.transactions.forEach(tx => {
    totalOmzet += (Number(tx.totalAmount) || 0);

    if (tx.paymentType === 'CASH') {
      totalKasMasuk += (Number(tx.totalAmount) || 0);
    } else if (tx.paymentType === 'INSTALLMENT' && tx.installmentPlan) {
      const plan = tx.installmentPlan;
      // Kas Masuk = DP + Total Angsuran terbayar
      const dp = Number(plan.downPayment) || 0;
      let installmentPaid = 0;

      if (plan.paymentHistory && plan.paymentHistory.length > 0) {
        plan.paymentHistory.forEach(p => {
          installmentPaid += (Number(p.amount) || 0);
          if (p.type === 'INSTALLMENT') countPaidInstallments++;
        });
        totalKasMasuk += installmentPaid;
      } else {
        totalKasMasuk += (Number(plan.totalPaid) || dp);
      }

      const remaining = Number(plan.remainingDebt) || 0;
      totalPiutang += remaining;

      if (remaining > 0) {
        countActiveDebtors++;
      }
    }
  });

  let totalPengeluaran = 0;
  db.expenses.forEach(exp => {
    totalPengeluaran += (Number(exp.amount) || 0);
  });

  const kasBersih = totalKasMasuk - totalPengeluaran;

  return {
    totalOmzet,
    totalKasMasuk,
    totalPiutang,
    totalPengeluaran,
    kasBersih,
    countTotalSales,
    countPaidInstallments,
    countActiveDebtors
  };
}

/**
 * Mencari semua tagihan yang jatuh tempo hari ini s/d 7 hari ke depan (PRD 2.A)
 */
function getUpcomingDueInstallments() {
  const upcoming = [];

  db.transactions.forEach(tx => {
    if (tx.paymentType === 'INSTALLMENT' && tx.installmentPlan && tx.installmentPlan.remainingDebt > 0) {
      const plan = tx.installmentPlan;
      if (Array.isArray(plan.schedules)) {
        plan.schedules.forEach(schedule => {
          if (!schedule.isPaid && (schedule.amount - (schedule.paidAmount || 0)) > 0) {
            const diffDays = getDiffDaysFromToday(schedule.dueDate);
            // Saring: Jatuh tempo hari ini (0), 7 hari ke depan (1-7), dan menunggak (<0)
            if (diffDays <= 7) {
              upcoming.push({
                txId: tx.id,
                customerName: tx.customerName,
                customerPhone: tx.customerPhone,
                itemsDescription: tx.itemsDescription,
                totalAmount: tx.totalAmount,
                remainingDebt: plan.remainingDebt,
                installmentNo: schedule.installmentNo,
                totalInstallments: plan.totalInstallments,
                dueDate: schedule.dueDate,
                amountDue: schedule.amount - (schedule.paidAmount || 0),
                diffDays: diffDays,
                isOverdue: diffDays < 0,
                isDueToday: diffDays === 0
              });
            }
          }
        });
      }
    }
  });

  // Urutkan dari yang paling mendesak (paling menunggak / jatuh tempo lebih awal)
  upcoming.sort((a, b) => a.diffDays - b.diffDays);
  return upcoming;
}

function refreshAllViews() {
  renderDashboard();
  renderInstallmentsTable();
  renderTransactionHistory();
  renderExpensesView();
}

/**
 * Render Kartu Metrik & Daftar Jatuh Tempo pada Dashboard
 */
function renderDashboard() {
  const metrics = calculateFinancialMetrics();

  document.getElementById("statTotalOmzet").textContent = formatRupiah(metrics.totalOmzet);
  document.getElementById("statCountTotalSales").textContent = `${metrics.countTotalSales} Transaksi`;

  document.getElementById("statTotalKasMasuk").textContent = formatRupiah(metrics.totalKasMasuk);
  document.getElementById("statCountPaidInstallments").textContent = `${metrics.countPaidInstallments} Kali Bayar`;

  document.getElementById("statTotalPiutang").textContent = formatRupiah(metrics.totalPiutang);
  document.getElementById("statCountActiveDebtors").textContent = `${metrics.countActiveDebtors} Pelanggan`;

  document.getElementById("statKasBersih").textContent = formatRupiah(metrics.kasBersih);
  document.getElementById("statTotalPengeluaran").textContent = formatRupiah(metrics.totalPengeluaran);

  const profitStatusEl = document.getElementById("statProfitStatus");
  if (metrics.kasBersih >= 0) {
    profitStatusEl.textContent = "Surplus Kas Positif";
    profitStatusEl.className = "font-semibold text-emerald-600";
  } else {
    profitStatusEl.textContent = "Defisit Arus Kas";
    profitStatusEl.className = "font-semibold text-rose-600";
  }

  // Render Daftar Tagihan Jatuh Tempo (Hari Ini & 7 Hari ke Depan)
  const upcomingList = getUpcomingDueInstallments();
  const dueCountEl = document.getElementById("dueBadgeCountList");
  const badgeDueNav = document.getElementById("badgeDueCount");
  const mobBadgeDue = document.getElementById("mobBadgeDueCount");

  if (dueCountEl) dueCountEl.textContent = upcomingList.length;
  if (badgeDueNav) {
    badgeDueNav.textContent = upcomingList.length;
    badgeDueNav.classList.toggle('hidden', upcomingList.length === 0);
  }
  if (mobBadgeDue) {
    mobBadgeDue.classList.toggle('hidden', upcomingList.length === 0);
  }

  const container = document.getElementById("dueUpcomingList");
  if (!container) return;

  if (upcomingList.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400">
        <i class="fa-regular fa-calendar-check text-3xl mb-2 text-slate-300"></i>
        <p class="text-sm font-medium text-slate-600">Tidak ada tagihan yang jatuh tempo dalam 7 hari ke depan.</p>
        <p class="text-xs text-slate-400 mt-1">Semua pelanggan dalam status pembayaran aman.</p>
      </div>
    `;
  } else {
    container.innerHTML = upcomingList.map(item => {
      let badgeStyle = "bg-amber-100 text-amber-800 border-amber-200";
      let statusText = `${item.diffDays} hari lagi`;

      if (item.isOverdue) {
        badgeStyle = "bg-rose-100 text-rose-800 border-rose-200";
        statusText = `Terlambat ${Math.abs(item.diffDays)} hari!`;
      } else if (item.isDueToday) {
        badgeStyle = "bg-rose-500 text-white border-rose-600 badge-pulse";
        statusText = "JATUH TEMPO HARI INI";
      }

      return `
        <div class="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50 transition">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <span class="font-bold text-slate-900 text-sm">${item.customerName}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle}">
                ${statusText}
              </span>
            </div>
            <div class="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
              <span><i class="fa-solid fa-shirt text-slate-400 mr-1"></i>${item.itemsDescription}</span>
              <span>•</span>
              <span>Angsuran ke-<b>${item.installmentNo}</b> dari ${item.totalInstallments}</span>
              <span>•</span>
              <span>Jatuh Tempo: <b>${formatDateIndo(item.dueDate)}</b></span>
            </div>
          </div>

          <div class="flex items-center justify-between sm:justify-end space-x-3">
            <div class="text-left sm:text-right">
              <span class="text-[10px] text-slate-400 block uppercase">Nominal Tagihan</span>
              <span class="font-extrabold text-sm text-slate-900">${formatRupiah(item.amountDue)}</span>
            </div>

            <div class="flex items-center space-x-1.5">
              <button onclick="sendWhatsAppBilling('${item.txId}', ${item.installmentNo})" title="Kirim Tagihan via WhatsApp" 
                      class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition flex items-center space-x-1">
                <i class="fa-brands fa-whatsapp text-sm"></i>
                <span class="hidden sm:inline">Tagih WA</span>
              </button>
              <button onclick="openPaymentModal('${item.txId}', ${item.installmentNo})" title="Catat Bayar Cicilan" 
                      class="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-sm transition flex items-center space-x-1">
                <i class="fa-solid fa-hand-holding-dollar"></i>
                <span>Bayar</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // Render Recent Transactions & Recent Expenses
  renderDashboardActivityWidgets();
}

function renderDashboardActivityWidgets() {
  const recentTxContainer = document.getElementById("recentTransactionsList");
  if (recentTxContainer) {
    const recentTx = [...db.transactions].reverse().slice(0, 4);
    if (recentTx.length === 0) {
      recentTxContainer.innerHTML = `<p class="py-4 text-center text-xs text-slate-400">Belum ada transaksi penjualan dicatat.</p>`;
    } else {
      recentTxContainer.innerHTML = recentTx.map(tx => `
        <div class="py-2.5 flex items-center justify-between">
          <div>
            <div class="font-semibold text-slate-900 text-xs">${tx.customerName}</div>
            <div class="text-[11px] text-slate-400 truncate max-w-[200px]">${tx.itemsDescription}</div>
          </div>
          <div class="text-right">
            <div class="font-bold text-xs text-slate-900">${formatRupiah(tx.totalAmount)}</div>
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ${tx.paymentType === 'CASH' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}">
              ${tx.paymentType === 'CASH' ? 'CASH' : 'CICILAN'}
            </span>
          </div>
        </div>
      `).join("");
    }
  }

  const recentExpContainer = document.getElementById("recentExpensesList");
  if (recentExpContainer) {
    const recentExp = [...db.expenses].reverse().slice(0, 4);
    if (recentExp.length === 0) {
      recentExpContainer.innerHTML = `<p class="py-4 text-center text-xs text-slate-400">Belum ada pengeluaran dicatat.</p>`;
    } else {
      recentExpContainer.innerHTML = recentExp.map(exp => `
        <div class="py-2.5 flex items-center justify-between">
          <div>
            <div class="font-semibold text-slate-900 text-xs">${exp.category}</div>
            <div class="text-[11px] text-slate-400 truncate max-w-[200px]">${exp.description}</div>
          </div>
          <div class="text-right">
            <div class="font-bold text-xs text-rose-600">-${formatRupiah(exp.amount)}</div>
            <div class="text-[10px] text-slate-400">${formatDateIndo(exp.date)}</div>
          </div>
        </div>
      `).join("");
    }
  }
}

// ================= FORM TRANSAKSI BARU & SIMULASI (PRD 2.B) =================
function togglePaymentTypeUI() {
  const isInstallment = document.querySelector('input[name="paymentType"]:checked').value === 'INSTALLMENT';
  const cfgSection = document.getElementById("installmentConfigSection");
  const labelCash = document.getElementById("labelMethodCash");
  const labelInst = document.getElementById("labelMethodInstallment");

  if (isInstallment) {
    cfgSection.classList.remove("hidden");
    labelInst.classList.add("border-indigo-600", "bg-indigo-50/50");
    labelCash.classList.remove("border-brand-600", "bg-brand-50/50");
    updateInstallmentSimulation();
  } else {
    cfgSection.classList.add("hidden");
    labelCash.classList.add("border-brand-600", "bg-brand-50/50");
    labelInst.classList.remove("border-indigo-600", "bg-indigo-50/50");
  }
}

/**
 * Menghitung dan merender tabel simulasi jadwal cicilan real-time (PRD 2.B)
 */
function updateInstallmentSimulation() {
  const isInstallment = document.querySelector('input[name="paymentType"]:checked')?.value === 'INSTALLMENT';
  if (!isInstallment) return;

  const totalAmount = parseCurrencyInput(document.getElementById("txTotalAmount").value);
  const dp = parseCurrencyInput(document.getElementById("txDownPayment").value);
  const tenorMonths = parseInt(document.getElementById("txTenorMonths").value, 10) || 1;
  const frequency = document.getElementById("txFrequency").value; // 'WEEKLY' or 'MONTHLY'
  const startDateStr = document.getElementById("txDate").value || getTodayDateString();

  const freqExpl = document.getElementById("frequencyExplanation");
  if (freqExpl) {
    freqExpl.textContent = frequency === 'WEEKLY' 
      ? `${tenorMonths} Bulan = ${tenorMonths * 4}x Angsuran mingguan (+7 hari)`
      : `${tenorMonths} Bulan = ${tenorMonths}x Angsuran bulanan (+1 bulan)`;
  }

  const remainingPrincipal = Math.max(0, totalAmount - dp);
  const totalInstallments = frequency === 'WEEKLY' ? (tenorMonths * 4) : tenorMonths;

  document.getElementById("simPrincipal").textContent = formatRupiah(totalAmount);
  document.getElementById("simDP").textContent = formatRupiah(dp);
  document.getElementById("simRemaining").textContent = formatRupiah(remainingPrincipal);

  const tbody = document.getElementById("simScheduleTableBody");
  if (!tbody) return;

  if (remainingPrincipal <= 0 || totalInstallments <= 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-slate-400">Masukkan total harga untuk melihat simulasi</td></tr>`;
    document.getElementById("simSummaryBadge").textContent = `0x Bayar @ Rp 0`;
    return;
  }

  // Hitung pembagian rata angsuran
  const baseInstallment = Math.floor(remainingPrincipal / totalInstallments);
  let remainder = remainingPrincipal - (baseInstallment * totalInstallments);

  const schedules = [];
  for (let i = 1; i <= totalInstallments; i++) {
    // dueDate calculation
    const dueDate = frequency === 'WEEKLY' 
      ? addDaysToDate(startDateStr, i * 7)
      : addMonthsToDate(startDateStr, i);

    let amount = baseInstallment;
    // Bagikan sisa rupiah ke angsuran terakhir agar genap
    if (i === totalInstallments) {
      amount += remainder;
    }

    schedules.push({
      installmentNo: i,
      dueDate: dueDate,
      amount: amount
    });
  }

  document.getElementById("simSummaryBadge").textContent = `${totalInstallments}x Bayar @ ${formatRupiah(baseInstallment)}`;

  tbody.innerHTML = schedules.map(s => `
    <tr class="hover:bg-indigo-50/50">
      <td class="py-1.5 px-3 font-semibold text-slate-700">Ke-${s.installmentNo}</td>
      <td class="py-1.5 px-3 text-slate-600">${formatDateIndo(s.dueDate)}</td>
      <td class="py-1.5 px-3 font-bold text-right text-indigo-900">${formatRupiah(s.amount)}</td>
    </tr>
  `).join("");
}

/**
 * Menyimpan Transaksi Baru (Cash atau Cicilan)
 */
function handleSaveTransaction(event) {
  event.preventDefault();
  if (!isOwnerLoggedIn) {
    showToast("Akses ditolak: Hanya pemilik toko yang dapat mencatat transaksi", "error");
    toggleOwnerAuthModal();
    return;
  }

  const customerName = document.getElementById("txCustomerName").value.trim();
  const customerPhone = document.getElementById("txCustomerPhone").value.trim();
  const itemsDescription = document.getElementById("txItemsDescription").value.trim();
  const date = document.getElementById("txDate").value || getTodayDateString();
  const totalAmount = parseCurrencyInput(document.getElementById("txTotalAmount").value);
  const paymentType = document.querySelector('input[name="paymentType"]:checked').value;

  if (totalAmount <= 0) {
    showToast("Total harga harus lebih dari Rp 0", "error");
    return;
  }

  const txId = "TX-" + Date.now().toString(36).toUpperCase();
  const newTx = {
    id: txId,
    createdAt: new Date().toISOString(),
    date: date,
    customerName: customerName,
    customerPhone: customerPhone,
    itemsDescription: itemsDescription,
    totalAmount: totalAmount,
    paymentType: paymentType
  };

  if (paymentType === 'CASH') {
    newTx.cashPaidAmount = totalAmount;
  } else {
    // Generate Installment Plan
    const dp = parseCurrencyInput(document.getElementById("txDownPayment").value);
    const tenorMonths = parseInt(document.getElementById("txTenorMonths").value, 10) || 1;
    const frequency = document.getElementById("txFrequency").value;
    const remainingPrincipal = Math.max(0, totalAmount - dp);
    const totalInstallments = frequency === 'WEEKLY' ? (tenorMonths * 4) : tenorMonths;
    const baseInstallment = Math.floor(remainingPrincipal / totalInstallments);
    const remainder = remainingPrincipal - (baseInstallment * totalInstallments);

    const schedules = [];
    for (let i = 1; i <= totalInstallments; i++) {
      const dueDate = frequency === 'WEEKLY' 
        ? addDaysToDate(date, i * 7)
        : addMonthsToDate(date, i);

      let amount = baseInstallment;
      if (i === totalInstallments) amount += remainder;

      schedules.push({
        installmentNo: i,
        dueDate: dueDate,
        amount: amount,
        paidAmount: 0,
        paidDate: null,
        isPaid: false,
        notes: ""
      });
    }

    const paymentHistory = [];
    if (dp > 0) {
      paymentHistory.push({
        id: "PAY-" + Date.now().toString(36).toUpperCase() + "-DP",
        date: date,
        type: "DP",
        amount: dp,
        notes: "Uang Muka / DP awal transaksi"
      });
    }

    newTx.installmentPlan = {
      downPayment: dp,
      remainingPrincipal: remainingPrincipal,
      tenorMonths: tenorMonths,
      frequency: frequency,
      totalInstallments: totalInstallments,
      installmentAmount: baseInstallment,
      totalPaid: dp,
      remainingDebt: remainingPrincipal,
      status: remainingPrincipal === 0 ? "PAID_OFF" : "ACTIVE",
      schedules: schedules,
      paymentHistory: paymentHistory
    };
  }

  db.transactions.unshift(newTx);
  saveDatabaseToLocal();
  showToast(`Transaksi ${customerName} berhasil disimpan!`, "success");

  // Reset form
  document.getElementById("formNewTransaction").reset();
  initDefaultDateInputs();
  togglePaymentTypeUI();

  // Buka modal nota / print struk
  showPrintReceiptModal(newTx.id);

  refreshAllViews();
}

// ================= MANAJEMEN CICILAN (PRD Section 2.C) =================
function filterInstallmentStatus(status) {
  currentInstallmentFilter = status;
  const buttons = document.querySelectorAll('.inst-filter-btn');
  buttons.forEach(btn => {
    if (btn.dataset.status === status) {
      btn.className = "inst-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white transition";
    } else {
      btn.className = "inst-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition";
    }
  });
  renderInstallmentsTable();
}

function getInstallmentCustomerStatus(tx) {
  if (!tx.installmentPlan) return "LUNAS";
  const plan = tx.installmentPlan;
  if (plan.remainingDebt <= 0) return "LUNAS";

  let hasOverdue = false;
  let hasDueSoon = false;

  plan.schedules.forEach(s => {
    if (!s.isPaid && (s.amount - (s.paidAmount || 0)) > 0) {
      const diff = getDiffDaysFromToday(s.dueDate);
      if (diff < 0) hasOverdue = true;
      else if (diff <= 7) hasDueSoon = true;
    }
  });

  if (hasOverdue) return "MENUNGGAK";
  if (hasDueSoon) return "JATUH_TEMPO";
  return "LANCAR";
}

function renderInstallmentsTable() {
  const container = document.getElementById("installmentsContainer");
  if (!container) return;

  const searchQuery = (document.getElementById("installmentSearch")?.value || "").toLowerCase().trim();

  // Filter only installment transactions
  const installmentTx = db.transactions.filter(tx => tx.paymentType === 'INSTALLMENT');

  // Count badges
  let countDue = 0;
  let countOverdue = 0;

  installmentTx.forEach(tx => {
    const st = getInstallmentCustomerStatus(tx);
    if (st === 'JATUH_TEMPO') countDue++;
    if (st === 'MENUNGGAK') countOverdue++;
  });

  const dueBadge = document.getElementById("countDueBadge");
  const overdueBadge = document.getElementById("countOverdueBadge");
  if (dueBadge) dueBadge.textContent = countDue;
  if (overdueBadge) overdueBadge.textContent = countOverdue;

  // Filter by search & active status
  const filtered = installmentTx.filter(tx => {
    const status = getInstallmentCustomerStatus(tx);
    const matchStatus = (currentInstallmentFilter === 'ALL') || (status === currentInstallmentFilter);
    const matchSearch = (!searchQuery) ||
      tx.customerName.toLowerCase().includes(searchQuery) ||
      tx.customerPhone.includes(searchQuery) ||
      tx.itemsDescription.toLowerCase().includes(searchQuery);

    return matchStatus && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <i class="fa-solid fa-folder-open text-4xl mb-2 text-slate-300"></i>
        <p class="text-sm font-semibold text-slate-600">Tidak ada data cicilan ditemukan</p>
        <p class="text-xs text-slate-400 mt-1">Coba ganti filter status atau kata kunci pencarian Anda.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(tx => {
    const plan = tx.installmentPlan;
    const status = getInstallmentCustomerStatus(tx);
    const progressPercent = Math.min(100, Math.round(((plan.totalAmount || tx.totalAmount) - plan.remainingDebt) / (tx.totalAmount) * 100));

    let statusBadge = "";
    if (status === 'LUNAS') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">LUNAS</span>`;
    } else if (status === 'MENUNGGAK') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">MENUNGGAK</span>`;
    } else if (status === 'JATUH_TEMPO') {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">JATUH TEMPO</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">LANCAR</span>`;
    }

    // Cari jadwal berikutnya yang belum lunas
    const nextSchedule = plan.schedules.find(s => !s.isPaid);

    return `
      <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between">
        
        <div class="space-y-3">
          <!-- Card Header -->
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-bold text-slate-900 text-base flex items-center gap-1.5">
                <span>${tx.customerName}</span>
              </h3>
              <p class="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <i class="fa-brands fa-whatsapp text-emerald-600"></i>
                <span>${tx.customerPhone}</span>
              </p>
            </div>
            ${statusBadge}
          </div>

          <!-- Items Info -->
          <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs text-slate-600">
            <span class="text-slate-400 block text-[10px] font-bold uppercase">Barang:</span>
            <p class="font-medium text-slate-800 truncate">${tx.itemsDescription}</p>
          </div>

          <!-- Nominal Sisa & Progress -->
          <div class="space-y-1.5">
            <div class="flex justify-between items-baseline text-xs">
              <span class="text-slate-500">Sisa Hutang:</span>
              <span class="text-base font-extrabold text-rose-600">${formatRupiah(plan.remainingDebt)}</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="bg-emerald-500 h-2 rounded-full transition-all duration-500" style="width: ${progressPercent}%"></div>
            </div>
            <div class="flex justify-between text-[11px] text-slate-400">
              <span>Sudah Bayar: ${formatRupiah((tx.totalAmount - plan.remainingDebt))}</span>
              <span>${progressPercent}% Lunas</span>
            </div>
          </div>

          <!-- Info Angsuran Berikutnya -->
          ${nextSchedule ? `
            <div class="text-[11px] bg-indigo-50/70 p-2 rounded-lg text-indigo-900 flex justify-between items-center">
              <span>Next: Ke-${nextSchedule.installmentNo} (${formatDateIndo(nextSchedule.dueDate)})</span>
              <span class="font-bold">${formatRupiah(nextSchedule.amount - (nextSchedule.paidAmount || 0))}</span>
            </div>
          ` : `
            <div class="text-[11px] bg-slate-100 p-2 rounded-lg text-slate-500 text-center">
              Semua jadwal angsuran telah selesai
            </div>
          `}
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          <button onclick="openInstallmentDetailModal('${tx.id}')" class="py-2 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center justify-center space-x-1">
            <i class="fa-solid fa-list-check"></i>
            <span>Detail</span>
          </button>

          <button onclick="sendWhatsAppBilling('${tx.id}')" class="py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition flex items-center justify-center space-x-1">
            <i class="fa-brands fa-whatsapp"></i>
            <span>Tagih</span>
          </button>

          <button onclick="openPaymentModal('${tx.id}')" class="py-2 px-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs shadow-sm transition flex items-center justify-center space-x-1" ${plan.remainingDebt <= 0 ? 'disabled class="opacity-50"' : ''}>
            <i class="fa-solid fa-hand-holding-dollar"></i>
            <span>Bayar</span>
          </button>
        </div>

      </div>
    `;
  }).join("");
}

// ================= MODAL DETAIL & JADWAL ANGSURAN =================
function openInstallmentDetailModal(txId) {
  const tx = db.transactions.find(t => t.id === txId);
  if (!tx || !tx.installmentPlan) return;

  const plan = tx.installmentPlan;
  const status = getInstallmentCustomerStatus(tx);

  document.getElementById("modalCustomerName").textContent = tx.customerName;
  document.getElementById("modalCustomerPhone").textContent = tx.customerPhone;
  document.getElementById("modalItemDesc").textContent = tx.itemsDescription;

  const badgeEl = document.getElementById("modalCustomerStatusBadge");
  badgeEl.textContent = status;
  if (status === 'LUNAS') badgeEl.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700";
  else if (status === 'MENUNGGAK') badgeEl.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white";
  else if (status === 'JATUH_TEMPO') badgeEl.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white";
  else badgeEl.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white";

  document.getElementById("modalTotalAmount").textContent = formatRupiah(tx.totalAmount);
  document.getElementById("modalDP").textContent = formatRupiah(plan.downPayment || 0);
  document.getElementById("modalTotalPaid").textContent = formatRupiah((tx.totalAmount - plan.remainingDebt));
  document.getElementById("modalRemainingDebt").textContent = formatRupiah(plan.remainingDebt);

  // Bind Buttons
  document.getElementById("modalBtnWhatsApp").onclick = () => sendWhatsAppBilling(tx.id);
  const btnPay = document.getElementById("modalBtnManualPay");
  if (plan.remainingDebt <= 0) {
    btnPay.disabled = true;
    btnPay.classList.add("opacity-50", "pointer-events-none");
  } else {
    btnPay.disabled = false;
    btnPay.classList.remove("opacity-50", "pointer-events-none");
    btnPay.onclick = () => {
      closeModal("modalInstallmentDetail");
      openPaymentModal(tx.id);
    };
  }

  // Count progress
  const paidCount = plan.schedules.filter(s => s.isPaid).length;
  document.getElementById("modalProgressText").textContent = `${paidCount} dari ${plan.schedules.length} Jadwal Terbayar`;

  // Render Schedule Table
  const tbody = document.getElementById("modalScheduleTableBody");
  tbody.innerHTML = plan.schedules.map(s => {
    let statusText = `<span class="text-slate-400 font-semibold">Belum Bayar</span>`;
    let rowAction = `
      <button onclick="closeModal('modalInstallmentDetail'); openPaymentModal('${tx.id}', ${s.installmentNo})" class="px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg font-bold text-[10px] transition">
        Bayar Ini
      </button>
    `;

    if (s.isPaid) {
      statusText = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-check mr-0.5"></i> Lunas</span>`;
      rowAction = `<span class="text-[10px] text-slate-400">Selesai</span>`;
    } else {
      const diff = getDiffDaysFromToday(s.dueDate);
      if (diff < 0) {
        statusText = `<span class="text-rose-600 font-bold">Nunggak (${Math.abs(diff)}h)</span>`;
      } else if (diff <= 7) {
        statusText = `<span class="text-amber-600 font-bold">Tempo (${diff}h)</span>`;
      }
    }

    return `
      <tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-bold text-slate-800">Ke-${s.installmentNo}</td>
        <td class="py-2 px-3 text-slate-600">${formatDateIndo(s.dueDate)}</td>
        <td class="py-2 px-3 font-semibold text-right text-slate-800">${formatRupiah(s.amount)}</td>
        <td class="py-2 px-3 font-semibold text-right text-emerald-600">${formatRupiah(s.paidAmount || 0)}</td>
        <td class="py-2 px-3 text-center">${statusText}</td>
        <td class="py-2 px-3 text-center">${rowAction}</td>
      </tr>
    `;
  }).join("");

  // Render Payment History Logs
  const historyContainer = document.getElementById("modalPaymentHistoryLogs");
  if (!plan.paymentHistory || plan.paymentHistory.length === 0) {
    historyContainer.innerHTML = `<div class="p-3 text-center text-slate-400 text-xs">Belum ada riwayat pembayaran yang tercatat.</div>`;
  } else {
    historyContainer.innerHTML = plan.paymentHistory.map(log => `
      <div class="p-2.5 flex items-center justify-between hover:bg-slate-50">
        <div>
          <span class="font-bold text-slate-800 text-xs">${log.type === 'DP' ? 'Uang Muka (DP)' : 'Pembayaran Angsuran'}</span>
          <p class="text-[11px] text-slate-500">${formatDateIndo(log.date)} • ${log.notes || 'Tanpa catatan'}</p>
        </div>
        <span class="font-extrabold text-xs text-brand-700">+${formatRupiah(log.amount)}</span>
      </div>
    `).join("");
  }

  openModal("modalInstallmentDetail");
}

// ================= MODAL & PROSES PEMBAYARAN ANGSURAN (PRD 2.C) =================
function openPaymentModal(txId, installmentNo = null) {
  const tx = db.transactions.find(t => t.id === txId);
  if (!tx || !tx.installmentPlan) return;

  const plan = tx.installmentPlan;
  if (plan.remainingDebt <= 0) {
    showToast("Cicilan ini sudah lunas sepenuhnya!", "info");
    return;
  }

  document.getElementById("payTxId").value = txId;
  document.getElementById("payInstallmentNo").value = installmentNo || "";
  document.getElementById("payModalCustomerName").textContent = `Pelanggan: ${tx.customerName} (${tx.itemsDescription})`;
  document.getElementById("payModalRemainingDebt").textContent = formatRupiah(plan.remainingDebt);
  document.getElementById("payModalStandardAmount").textContent = formatRupiah(plan.installmentAmount);

  const payAmountInput = document.getElementById("payAmount");
  // Default amount: jika target angsuran spesifik dipilih, isi dengan sisa tagihan angsuran tersebut
  if (installmentNo) {
    const targetSchedule = plan.schedules.find(s => s.installmentNo === installmentNo);
    if (targetSchedule) {
      const remainingForSchedule = Math.max(0, targetSchedule.amount - (targetSchedule.paidAmount || 0));
      payAmountInput.value = remainingForSchedule.toLocaleString("id-ID");
    } else {
      payAmountInput.value = plan.installmentAmount.toLocaleString("id-ID");
    }
  } else {
    // Cari jadwal pertama yang belum lunas
    const nextUnpaid = plan.schedules.find(s => !s.isPaid);
    const defAmount = nextUnpaid ? (nextUnpaid.amount - (nextUnpaid.paidAmount || 0)) : plan.installmentAmount;
    payAmountInput.value = defAmount.toLocaleString("id-ID");
  }

  document.getElementById("payDate").value = getTodayDateString();
  document.getElementById("payNotes").value = "";

  openModal("modalPayInstallment");
}

/**
 * Logika Eksekusi Pembayaran Cicilan (Mendukung Tepat, Parsial, atau Rapel)
 */
function handleExecutePayment(event) {
  event.preventDefault();
  if (!isOwnerLoggedIn) {
    showToast("Akses ditolak: Hanya pemilik toko yang dapat mencatat pembayaran", "error");
    toggleOwnerAuthModal();
    return;
  }

  const txId = document.getElementById("payTxId").value;
  const payAmount = parseCurrencyInput(document.getElementById("payAmount").value);
  const payDate = document.getElementById("payDate").value || getTodayDateString();
  const payNotes = document.getElementById("payNotes").value.trim();

  if (payAmount <= 0) {
    showToast("Nominal bayar harus lebih dari Rp 0", "error");
    return;
  }

  const tx = db.transactions.find(t => t.id === txId);
  if (!tx || !tx.installmentPlan) {
    showToast("Transaksi tidak ditemukan", "error");
    return;
  }

  const plan = tx.installmentPlan;
  if (payAmount > plan.remainingDebt) {
    showToast(`Nominal melebihi sisa total hutang (${formatRupiah(plan.remainingDebt)}). Silakan sesuaikan.`, "error");
    return;
  }

  // ALOKASIKAN NOMINAL BAYAR KE JADWAL-JADWAL ANGSURAN SECARA BERUNTUN (CASCADE)
  let amountToAllocate = payAmount;

  for (let i = 0; i < plan.schedules.length; i++) {
    if (amountToAllocate <= 0) break;

    const schedule = plan.schedules[i];
    if (schedule.isPaid) continue;

    const currentPaid = schedule.paidAmount || 0;
    const unpaidInSchedule = schedule.amount - currentPaid;

    if (amountToAllocate >= unpaidInSchedule) {
      // Lunasi jadwal ini dan sisa alokasi lanjut ke jadwal berikutnya
      schedule.paidAmount = schedule.amount;
      schedule.isPaid = true;
      schedule.paidDate = payDate;
      amountToAllocate -= unpaidInSchedule;
    } else {
      // Bayar parsial pada jadwal ini
      schedule.paidAmount = currentPaid + amountToAllocate;
      schedule.paidDate = payDate;
      amountToAllocate = 0;
    }
  }

  // Update total sisa hutang dan total terbayar
  plan.totalPaid = (plan.totalPaid || 0) + payAmount;
  plan.remainingDebt = Math.max(0, plan.remainingDebt - payAmount);

  if (plan.remainingDebt === 0) {
    plan.status = "PAID_OFF";
  }

  // Tambah ke riwayat pembayaran
  if (!Array.isArray(plan.paymentHistory)) plan.paymentHistory = [];
  plan.paymentHistory.push({
    id: "PAY-" + Date.now().toString(36).toUpperCase(),
    date: payDate,
    type: "INSTALLMENT",
    amount: payAmount,
    notes: payNotes || "Pembayaran angsuran"
  });

  saveDatabaseToLocal();
  closeModal("modalPayInstallment");
  showToast(`Berhasil mencatat pembayaran ${formatRupiah(payAmount)} dari ${tx.customerName}!`, "success");

  refreshAllViews();
}

// ================= WHATSAPP BILLING GENERATOR (PRD 2.C) =================
function sendWhatsAppBilling(txId, installmentNo = null) {
  const tx = db.transactions.find(t => t.id === txId);
  if (!tx || !tx.installmentPlan) return;

  const plan = tx.installmentPlan;
  let cleanPhone = tx.customerPhone.replace(/[^\d]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1);
  } else if (!cleanPhone.startsWith('62')) {
    cleanPhone = '62' + cleanPhone;
  }

  // Tentukan info tagihan yang relevan
  let targetSchedule = null;
  if (installmentNo) {
    targetSchedule = plan.schedules.find(s => s.installmentNo === installmentNo);
  }
  if (!targetSchedule) {
    targetSchedule = plan.schedules.find(s => !s.isPaid);
  }

  const instNoStr = targetSchedule ? `ke-${targetSchedule.installmentNo}` : "";
  const dueDateStr = targetSchedule ? formatDateIndo(targetSchedule.dueDate) : "-";
  const amountDueStr = targetSchedule ? formatRupiah(targetSchedule.amount - (targetSchedule.paidAmount || 0)) : formatRupiah(plan.installmentAmount);
  const storeName = db.storeInfo.name || "Toko Butik Kami";
  const rekening = db.storeInfo.rekening || "-";

  // Link portal online khusus pelanggan ini (100% Read Only)
  const baseUrl = window.location.href.split('?')[0];
  const customerPortalLink = `${baseUrl}?api=${encodeURIComponent(db.settings.gasUrl || '')}&cek=${encodeURIComponent(tx.id)}`;

  const messageText = 
`Halo Kak *${tx.customerName}*, salam kenal dari *${storeName}* 😊

Kami ingin menginfokan rincian angsuran cicilan baju Kakak:
📦 *Barang:* ${tx.itemsDescription}
📌 *Angsuran:* ${instNoStr}
📅 *Jatuh Tempo:* ${dueDateStr}
💰 *Nominal Angsuran Ini:* ${amountDueStr}
📊 *Sisa Total Hutang:* ${formatRupiah(plan.remainingDebt)}

Pembayaran dapat ditransfer ke rekening resmi:
${rekening}

🔗 *Cek Rincian Jadwal Cicilan Online:*
${customerPortalLink}

Jika sudah melakukan pembayaran, mohon konfirmasi bukti transfernya ya Kak. Terima kasih banyak atas kerjasamanya! 🙏✨`;

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
  window.open(waUrl, '_blank');
}

// ================= RIWAYAT PENJUALAN & CETAK NOTA =================
function renderTransactionHistory() {
  const tbody = document.getElementById("transactionHistoryTableBody");
  if (!tbody) return;

  const searchQuery = (document.getElementById("searchTransactionHistory")?.value || "").toLowerCase().trim();
  const filterType = document.getElementById("filterTransactionType")?.value || "ALL";
  const sortType = document.getElementById("filterTransactionSort")?.value || "NEWEST";

  let list = [...db.transactions];

  // Filtering
  list = list.filter(tx => {
    const matchType = (filterType === 'ALL') || (tx.paymentType === filterType);
    const matchSearch = (!searchQuery) ||
      tx.customerName.toLowerCase().includes(searchQuery) ||
      tx.itemsDescription.toLowerCase().includes(searchQuery) ||
      tx.id.toLowerCase().includes(searchQuery);

    return matchType && matchSearch;
  });

  // Sorting
  if (sortType === 'NEWEST') {
    list.sort((a, b) => new Date(b.date) - new Date(a.date));
  } else if (sortType === 'OLDEST') {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
  } else if (sortType === 'HIGHEST') {
    list.sort((a, b) => b.totalAmount - a.totalAmount);
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Tidak ada transaksi ditemukan</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(tx => {
    let methodBadge = tx.paymentType === 'CASH' 
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">CASH (Lunas)</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">CICILAN</span>`;

    let cashReceived = tx.paymentType === 'CASH' 
      ? tx.totalAmount 
      : (tx.installmentPlan ? (tx.totalAmount - tx.installmentPlan.remainingDebt) : 0);

    return `
      <tr class="hover:bg-slate-50">
        <td class="py-3 px-4">
          <div class="font-bold text-slate-900">${formatDateIndo(tx.date)}</div>
          <div class="text-[10px] text-slate-400 font-mono">${tx.id}</div>
        </td>
        <td class="py-3 px-4">
          <div class="font-semibold text-slate-800">${tx.customerName}</div>
          <div class="text-[11px] text-slate-400">${tx.customerPhone}</div>
        </td>
        <td class="py-3 px-4 text-slate-600 max-w-xs truncate">${tx.itemsDescription}</td>
        <td class="py-3 px-4">${methodBadge}</td>
        <td class="py-3 px-4 font-bold text-right text-slate-900">${formatRupiah(tx.totalAmount)}</td>
        <td class="py-3 px-4 font-bold text-right text-emerald-700">${formatRupiah(cashReceived)}</td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center space-x-1.5">
            <button onclick="showPrintReceiptModal('${tx.id}')" title="Cetak Nota" class="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition">
              <i class="fa-solid fa-print"></i>
            </button>
            <button onclick="confirmDeleteTransaction('${tx.id}')" title="Hapus Transaksi" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function showPrintReceiptModal(txId) {
  const tx = db.transactions.find(t => t.id === txId);
  if (!tx) return;

  document.getElementById("rcpStoreName").textContent = db.storeInfo.name || "TOKO BAJU BERKAH";
  document.getElementById("rcpStoreInfo").textContent = db.storeInfo.owner ? `Pemilik: ${db.storeInfo.owner}` : "Pusat Busana & Gamis";
  document.getElementById("rcpId").textContent = tx.id;
  document.getElementById("rcpDate").textContent = formatDateIndo(tx.date);
  document.getElementById("rcpCustomer").textContent = `${tx.customerName} (${tx.customerPhone})`;
  document.getElementById("rcpMethod").textContent = tx.paymentType === 'CASH' ? 'CASH / LUNAS' : 'CICILAN (TEMPO)';
  document.getElementById("rcpItems").textContent = tx.itemsDescription;
  document.getElementById("rcpTotal").textContent = formatRupiah(tx.totalAmount);

  const rowDebt = document.getElementById("rcpRowDebt");
  const rcpRemaining = document.getElementById("rcpRemaining");
  const rcpPaid = document.getElementById("rcpPaid");

  if (tx.paymentType === 'CASH') {
    rowDebt.classList.add('hidden');
    rcpPaid.textContent = formatRupiah(tx.totalAmount);
  } else {
    rowDebt.classList.remove('hidden');
    const remaining = tx.installmentPlan ? tx.installmentPlan.remainingDebt : 0;
    const paid = tx.totalAmount - remaining;
    rcpPaid.textContent = formatRupiah(paid);
    rcpRemaining.textContent = formatRupiah(remaining);
  }

  document.getElementById("rcpRekeningInfo").textContent = db.storeInfo.rekening ? `Pembayaran: ${db.storeInfo.rekening}` : "";

  openModal("modalPrintReceipt");
}

function confirmDeleteTransaction(txId) {
  if (!isOwnerLoggedIn) {
    showToast("Akses ditolak: Hanya pemilik toko yang dapat menghapus data", "error");
    toggleOwnerAuthModal();
    return;
  }
  if (confirm("Apakah Anda yakin ingin menghapus transaksi penjualan ini? Data yang terhapus tidak dapat dikembalikan.")) {
    db.transactions = db.transactions.filter(t => t.id !== txId);
    saveDatabaseToLocal();
    showToast("Transaksi berhasil dihapus", "info");
    refreshAllViews();
  }
}

function exportToCSV() {
  if (db.transactions.length === 0) {
    showToast("Belum ada data transaksi untuk diekspor", "info");
    return;
  }

  let csv = "ID,Tanggal,Nama Pelanggan,No WhatsApp,Keterangan Barang,Metode Bayar,Total Transaksi,Kas Diterima,Sisa Piutang\n";
  db.transactions.forEach(tx => {
    const remaining = tx.paymentType === 'INSTALLMENT' && tx.installmentPlan ? tx.installmentPlan.remainingDebt : 0;
    const received = tx.totalAmount - remaining;
    const line = [
      `"${tx.id}"`,
      `"${tx.date}"`,
      `"${tx.customerName}"`,
      `"${tx.customerPhone}"`,
      `"${tx.itemsDescription.replace(/"/g, '""')}"`,
      `"${tx.paymentType}"`,
      tx.totalAmount,
      received,
      remaining
    ].join(",");
    csv += line + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Laporan_Penjualan_Baju_${getTodayDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ================= PENGELUARAN SEDERHANA (PRD Section 2.D) =================
function handleSaveExpense(event) {
  event.preventDefault();
  if (!isOwnerLoggedIn) {
    showToast("Akses ditolak: Hanya pemilik toko yang dapat mencatat pengeluaran", "error");
    toggleOwnerAuthModal();
    return;
  }

  const date = document.getElementById("expDate").value || getTodayDateString();
  const category = document.getElementById("expCategory").value;
  const amount = parseCurrencyInput(document.getElementById("expAmount").value);
  const description = document.getElementById("expDescription").value.trim();

  if (amount <= 0) {
    showToast("Nominal biaya harus lebih dari Rp 0", "error");
    return;
  }

  const expId = "EXP-" + Date.now().toString(36).toUpperCase();
  const newExp = {
    id: expId,
    date: date,
    category: category,
    description: description,
    amount: amount,
    createdAt: new Date().toISOString()
  };

  db.expenses.unshift(newExp);
  saveDatabaseToLocal();
  showToast("Pengeluaran berhasil dicatat!", "success");

  document.getElementById("formExpense").reset();
  initDefaultDateInputs();
  renderExpensesView();
  renderDashboard();
}

function renderExpensesView() {
  const tbody = document.getElementById("expenseTableBody");
  const sumEl = document.getElementById("expenseTotalSum");
  if (!tbody) return;

  let totalSum = 0;
  db.expenses.forEach(e => totalSum += (Number(e.amount) || 0));
  if (sumEl) sumEl.textContent = formatRupiah(totalSum);

  if (db.expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400">Belum ada catatan pengeluaran operasional atau kulakan</td></tr>`;
    return;
  }

  tbody.innerHTML = db.expenses.map(e => `
    <tr class="hover:bg-slate-50">
      <td class="py-2.5 px-3 text-slate-800 font-medium">${formatDateIndo(e.date)}</td>
      <td class="py-2.5 px-3">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${e.category}</span>
      </td>
      <td class="py-2.5 px-3 text-slate-600">${e.description}</td>
      <td class="py-2.5 px-3 font-bold text-right text-rose-600">-${formatRupiah(e.amount)}</td>
      <td class="py-2.5 px-3 text-center">
        <button onclick="confirmDeleteExpense('${e.id}')" title="Hapus Pengeluaran" class="text-slate-400 hover:text-rose-600 p-1">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join("");
}

function confirmDeleteExpense(expId) {
  if (!isOwnerLoggedIn) {
    showToast("Akses ditolak: Hanya pemilik toko yang dapat menghapus data", "error");
    toggleOwnerAuthModal();
    return;
  }
  if (confirm("Hapus catatan pengeluaran ini?")) {
    db.expenses = db.expenses.filter(e => e.id !== expId);
    saveDatabaseToLocal();
    showToast("Pengeluaran dihapus", "info");
    renderExpensesView();
    renderDashboard();
  }
}

// ================= GOOGLE DRIVE & GOOGLE APPS SCRIPT SYNC (PRD Section 3) =================
function openSyncModal() {
  document.getElementById("inputGasUrl").value = db.settings.gasUrl || "";
  document.getElementById("checkAutoSync").checked = db.settings.autoSync !== false;
  document.getElementById("syncTestStatusBox").classList.add("hidden");
  openModal("modalGoogleDriveSync");
}

function saveSyncSettings() {
  const url = document.getElementById("inputGasUrl").value.trim();
  const autoSync = document.getElementById("checkAutoSync").checked;

  db.settings.gasUrl = url;
  db.settings.autoSync = autoSync;
  saveDatabaseToLocal(false);

  updateSyncUIStatus();
  closeModal("modalGoogleDriveSync");
  showToast("Pengaturan sinkronisasi Google Drive berhasil disimpan!", "success");
}

function updateSyncUIStatus() {
  const dot = document.getElementById("syncDot");
  const text = document.getElementById("syncStatusText");
  const btn = document.getElementById("btnSyncStatus");

  if (!db.settings.gasUrl) {
    if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-slate-400";
    if (text) text.textContent = "Belum Terhubung Cloud";
    if (btn) btn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200";
  } else if (isSyncing) {
    if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping";
    if (text) text.textContent = "Menyinkronkan...";
    if (btn) btn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 bg-amber-50 border-amber-200 text-amber-700";
  } else {
    if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
    const lastSync = db.settings.lastSyncTime 
      ? new Date(db.settings.lastSyncTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : "";
    if (text) text.textContent = lastSync ? `Tersinkron (${lastSync})` : "Cloud Aktif";
    if (btn) btn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100";
  }
}

function debouncedAutoSync() {
  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(() => {
    pushToGoogleDrive(true);
  }, 500); // Sinkronisasi kilat 500ms
}

function manualSync() {
  const icon = document.getElementById("syncIcon");
  if (icon) icon.classList.add("fa-spin");
  pushToGoogleDrive(false, () => {
    if (icon) icon.classList.remove("fa-spin");
  });
}

/**
 * Mengambil database secara otomatis di latar belakang (Real-time Auto-Sync tanpa popup konfirmasi)
 */
async function autoFetchFromCloud(isSilent = false) {
  if (!db.settings.gasUrl || isSyncing) return;

  try {
    const separator = db.settings.gasUrl.includes("?") ? "&" : "?";
    const fetchUrl = `${db.settings.gasUrl}${separator}action=read&_t=${Date.now()}`;
    const response = await fetch(fetchUrl);
    const result = await response.json();

    if (result.status === "success" && result.data) {
      const cloudData = result.data;
      const cloudTime = new Date(cloudData.lastUpdated || 0).getTime();
      const localTime = new Date(db.lastUpdated || 0).getTime();

      // Jika ada data di cloud dan lebih baru atau lokal masih kosong transaksi
      const isCloudNewer = cloudTime > localTime;
      const isLocalEmpty = (db.transactions.length === 0 && Array.isArray(cloudData.transactions) && cloudData.transactions.length > 0);

      if (isCloudNewer || isLocalEmpty) {
        const currentGasUrl = db.settings.gasUrl;
        const currentAutoSync = db.settings.autoSync;

        db = cloudData;
        if (!db.settings) db.settings = {};
        db.settings.gasUrl = currentGasUrl;
        db.settings.autoSync = currentAutoSync;
        db.settings.lastSyncTime = new Date().toISOString();

        saveDatabaseToLocal(false);
        refreshAllViews();
        updateStoreHeaderDisplay();
        updateSyncUIStatus();

        if (!isSilent) {
          showToast("Data cloud terbaru berhasil dimuat secara otomatis!", "success");
        }
      }
    }
  } catch (err) {
    console.warn("Gagal auto-fetch dari Google Drive:", err);
  }
}

/**
 * Menyalin link aplikasi lengkap beserta URL Google Apps Script untuk dibuka di HP / Akun Lain
 */
function copyShareableAppLink() {
  if (!db.settings.gasUrl) {
    showToast("Harap setel dan simpan URL Web App terlebih dahulu", "error");
    return;
  }

  const baseUrl = window.location.href.split('?')[0];
  const shareUrl = `${baseUrl}?api=${encodeURIComponent(db.settings.gasUrl)}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast("Link aplikasi berhasil disalin! Buka link ini di HP atau akun lain untuk langsung sinkron.", "success");
    }).catch(() => {
      prompt("Salin link ini untuk dibuka di HP atau browser lain:", shareUrl);
    });
  } else {
    prompt("Salin link ini untuk dibuka di HP atau browser lain:", shareUrl);
  }
}

/**
 * Mengirim data ke Google Drive melalui Google Apps Script Web App (POST)
 */
async function pushToGoogleDrive(isSilent = false, callback = null) {
  if (!db.settings.gasUrl) {
    if (!isSilent) {
      showToast("URL Google Apps Script belum disetel. Silakan buka pengaturan Cloud Sync.", "error");
      openSyncModal();
    }
    if (callback) callback();
    return;
  }

  isSyncing = true;
  updateSyncUIStatus();

  try {
    const payload = {
      action: "save",
      data: db
    };

    // Google Apps Script menangani CORS paling aman jika dikirim sebagai text/plain JSON string
    const response = await fetch(db.settings.gasUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      }
    });

    const result = await response.json();

    if (result.status === "success") {
      db.settings.lastSyncTime = new Date().toISOString();
      saveDatabaseToLocal(false);
      if (!isSilent) showToast("Database berhasil disimpan ke Google Drive!", "success");
    } else {
      console.warn("Respon GAS bukan success:", result);
      if (!isSilent) showToast("Penyimpanan gagal: " + (result.message || "Error tidak diketahui"), "error");
    }
  } catch (err) {
    console.error("Gagal sync ke Google Drive:", err);
    if (!isSilent) showToast("Koneksi ke Google Drive gagal. Pastikan URL benar dan memiliki akses Anyone.", "error");
  } finally {
    isSyncing = false;
    updateSyncUIStatus();
    if (callback) callback();
  }
}

/**
 * Mengambil database dari file database_keuangan.json di Google Drive (GET)
 */
async function pullFromGoogleDrive() {
  if (!db.settings.gasUrl) {
    showToast("URL Google Apps Script belum disetel.", "error");
    return;
  }

  if (!confirm("PERINGATAN: Memuat dari Google Drive akan menimpa data di browser dengan data di Cloud Google Drive Anda. Lanjutkan?")) {
    return;
  }

  isSyncing = true;
  updateSyncUIStatus();

  try {
    const separator = db.settings.gasUrl.includes("?") ? "&" : "?";
    const fetchUrl = `${db.settings.gasUrl}${separator}action=read&_t=${Date.now()}`;
    const response = await fetch(fetchUrl);
    const result = await response.json();

    if (result.status === "success" && result.data) {
      const cloudData = result.data;
      if (cloudData.transactions || cloudData.expenses) {
        db = cloudData;
        db.settings.lastSyncTime = new Date().toISOString();
        saveDatabaseToLocal(false);
        refreshAllViews();
        showToast("Data dari Google Drive berhasil dimuat!", "success");
      } else {
        showToast("Data di Google Drive masih kosong.", "info");
      }
    } else {
      showToast("Gagal membaca Google Drive: " + (result.message || "Data kosong"), "error");
    }
  } catch (err) {
    console.error("Gagal muat dari Google Drive:", err);
    showToast("Koneksi gagal saat membaca Google Drive", "error");
  } finally {
    isSyncing = false;
    updateSyncUIStatus();
  }
}

/**
 * Uji Coba Koneksi ke Google Apps Script (Ping)
 */
async function testGasConnection() {
  const url = document.getElementById("inputGasUrl").value.trim();
  const statusBox = document.getElementById("syncTestStatusBox");
  if (!url) {
    statusBox.className = "p-3 rounded-xl text-xs bg-rose-50 text-rose-700 border border-rose-200";
    statusBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Masukkan URL Web App terlebih dahulu!`;
    statusBox.classList.remove("hidden");
    return;
  }

  statusBox.className = "p-3 rounded-xl text-xs bg-slate-100 text-slate-700 border border-slate-200";
  statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Sedang menguji koneksi ke Google Apps Script...`;
  statusBox.classList.remove("hidden");

  try {
    const separator = url.includes("?") ? "&" : "?";
    const pingUrl = `${url}${separator}action=ping&_t=${Date.now()}`;
    const res = await fetch(pingUrl);
    const data = await res.json();

    if (data.status === "success") {
      statusBox.className = "p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200";
      statusBox.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> <b>Koneksi Sukses!</b> ${data.message}`;
    } else {
      statusBox.className = "p-3 rounded-xl text-xs bg-rose-50 text-rose-700 border border-rose-200";
      statusBox.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-600 mr-1"></i> Gagal: ${data.message || "Respon salah"}`;
    }
  } catch (e) {
    statusBox.className = "p-3 rounded-xl text-xs bg-rose-50 text-rose-700 border border-rose-200";
    statusBox.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-600 mr-1"></i> <b>Koneksi Terhambat!</b> Pastikan hak akses Web App disetel ke <b>"Anyone"</b> (Siapa saja) saat melakukan deployment di Google Apps Script.`;
  }
}

// ================= PENGATURAN UMUM & BACKUP / RESTORE JSON =================
function openSettingsModal() {
  document.getElementById("settingStoreName").value = db.storeInfo.name || "";
  document.getElementById("settingOwnerName").value = db.storeInfo.owner || "";
  document.getElementById("settingRekening").value = db.storeInfo.rekening || "";
  document.getElementById("settingOwnerPin").value = (db.settings && db.settings.ownerPin) ? db.settings.ownerPin : "1234";
  openModal("modalGeneralSettings");
}

function saveGeneralSettings() {
  db.storeInfo.name = document.getElementById("settingStoreName").value.trim() || "Toko Baju Berkah";
  db.storeInfo.owner = document.getElementById("settingOwnerName").value.trim();
  db.storeInfo.rekening = document.getElementById("settingRekening").value.trim();

  const newPin = document.getElementById("settingOwnerPin").value.trim();
  if (newPin) {
    if (!db.settings) db.settings = {};
    db.settings.ownerPin = newPin;
  }

  saveDatabaseToLocal();
  updateStoreHeaderDisplay();
  closeModal("modalGeneralSettings");
  showToast("Pengaturan toko & PIN berhasil diperbarui!", "success");
}

// ================= PORTAL CEK TAGIHAN PELANGGAN (100% READ ONLY) =================
function handleCustomerLookup(query = null) {
  const container = document.getElementById("customerLookupResults");
  if (!container) return;

  const rawQ = query !== null ? query : (document.getElementById("customerSearchQuery")?.value || "");
  const q = String(rawQ).trim().toLowerCase();

  if (document.getElementById("customerSearchQuery")) {
    document.getElementById("customerSearchQuery").value = rawQ;
  }

  if (!q) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <i class="fa-solid fa-phone-volume text-3xl mb-2 text-slate-300"></i>
        <h4 class="font-bold text-slate-700 text-sm">Cari Tagihan Anda</h4>
        <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Silakan masukkan nomor WhatsApp Anda atau No. Nota pada kolom di atas untuk melihat rincian cicilan Anda.
        </p>
      </div>
    `;
    return;
  }

  const cleanPhoneQ = q.replace(/[^\d]/g, '');

  const matched = db.transactions.filter(tx => {
    if (tx.id.toLowerCase() === q) return true;
    if (cleanPhoneQ && tx.customerPhone) {
      const cleanTxPhone = tx.customerPhone.replace(/[^\d]/g, '');
      if (cleanTxPhone.includes(cleanPhoneQ) || cleanPhoneQ.includes(cleanTxPhone)) return true;
    }
    return tx.customerName.toLowerCase().includes(q);
  });

  if (matched.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 space-y-2">
        <i class="fa-regular fa-folder-open text-4xl mb-1 text-slate-300"></i>
        <h4 class="font-bold text-slate-700 text-sm">Tidak Ditemukan Data Tagihan</h4>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">
          Nomor WhatsApp atau Nota "<b>${q}</b>" tidak ditemukan. Pastikan nomor yang dimasukkan sama persis dengan yang Anda berikan saat bertransaksi.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = matched.map(tx => {
    const isCash = tx.paymentType === 'CASH';
    const plan = tx.installmentPlan;
    const remaining = isCash ? 0 : (plan ? plan.remainingDebt : 0);
    const paid = isCash ? tx.totalAmount : (tx.totalAmount - remaining);
    const status = getInstallmentCustomerStatus(tx);

    let statusBadge = "";
    if (status === 'LUNAS') {
      statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">LUNAS</span>`;
    } else if (status === 'MENUNGGAK') {
      statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">MENUNGGAK</span>`;
    } else if (status === 'JATUH_TEMPO') {
      statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">JATUH TEMPO</span>`;
    } else {
      statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">LANCAR</span>`;
    }

    const rekening = db.storeInfo.rekening || "Hubungi admin toko untuk nomor rekening";
    const storePhone = (db.storeInfo.phone || "").replace(/[^\d]/g, '');

    return `
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
        
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Surat Tagihan & Jadwal Angsuran</div>
            <h3 class="text-lg font-bold text-slate-900">${tx.customerName}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Nota: <span class="font-mono text-slate-700">${tx.id}</span> • Tanggal: ${formatDateIndo(tx.date)}</p>
          </div>
          <div>${statusBadge}</div>
        </div>

        <!-- Info Barang -->
        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs">
          <span class="text-slate-400 uppercase text-[10px] font-bold block">Barang Belanjaan:</span>
          <p class="font-semibold text-slate-800 text-sm mt-0.5">${tx.itemsDescription}</p>
        </div>

        <!-- 4 Kotak Ringkasan Nilai -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span class="text-slate-400 text-[10px] block">Total Belanja</span>
            <span class="font-bold text-slate-900 text-sm">${formatRupiah(tx.totalAmount)}</span>
          </div>
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span class="text-slate-400 text-[10px] block">Uang Muka (DP)</span>
            <span class="font-bold text-slate-900 text-sm">${formatRupiah(plan ? (plan.downPayment || 0) : 0)}</span>
          </div>
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span class="text-slate-400 text-[10px] block">Sudah Dibayar</span>
            <span class="font-bold text-emerald-600 text-sm">${formatRupiah(paid)}</span>
          </div>
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span class="text-slate-400 text-[10px] block">Sisa Hutang</span>
            <span class="font-extrabold ${remaining > 0 ? 'text-rose-600' : 'text-emerald-600'} text-sm">${formatRupiah(remaining)}</span>
          </div>
        </div>

        ${!isCash && plan && plan.schedules ? `
          <!-- Tabel Jadwal Angsuran (100% READ ONLY - Pembeli tidak bisa edit) -->
          <div>
            <h4 class="font-bold text-xs uppercase tracking-wider text-slate-800 mb-2">Jadwal & Riwayat Angsuran Terverifikasi:</h4>
            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th class="py-2.5 px-3">Ke</th>
                    <th class="py-2.5 px-3">Jatuh Tempo</th>
                    <th class="py-2.5 px-3 text-right">Tagihan</th>
                    <th class="py-2.5 px-3 text-right">Terbayar</th>
                    <th class="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${plan.schedules.map(s => {
                    let stHtml = `<span class="text-slate-400 font-semibold">Belum Bayar</span>`;
                    if (s.isPaid) {
                      stHtml = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-check mr-0.5"></i> Lunas</span>`;
                    } else {
                      const diff = getDiffDaysFromToday(s.dueDate);
                      if (diff < 0) stHtml = `<span class="text-rose-600 font-bold">Terlambat ${Math.abs(diff)}h</span>`;
                      else if (diff <= 7) stHtml = `<span class="text-amber-600 font-bold">Tempo (${diff}h)</span>`;
                    }

                    return `
                      <tr>
                        <td class="py-2 px-3 font-semibold text-slate-800">Ke-${s.installmentNo}</td>
                        <td class="py-2 px-3 text-slate-600">${formatDateIndo(s.dueDate)}</td>
                        <td class="py-2 px-3 font-bold text-right text-slate-900">${formatRupiah(s.amount)}</td>
                        <td class="py-2 px-3 font-semibold text-right text-emerald-600">${formatRupiah(s.paidAmount || 0)}</td>
                        <td class="py-2 px-3 text-center">${stHtml}</td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Kotak Rekening & Konfirmasi Transfer -->
        <div class="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-900">Rekening Resmi Toko untuk Pembayaran:</span>
              <p class="font-bold text-slate-900 text-sm mt-0.5">${rekening}</p>
            </div>
            <button onclick="copyTextToClipboard('${rekening.replace(/'/g, "\\'")}')" class="self-start sm:self-auto px-3 py-1.5 bg-white border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition shadow-sm">
              <i class="fa-solid fa-copy mr-1"></i> Salin Rekening
            </button>
          </div>

          <div class="pt-2 border-t border-emerald-200 flex flex-col sm:flex-row gap-2">
            <a href="https://wa.me/${storePhone}?text=${encodeURIComponent('Halo Admin ' + (db.storeInfo.name || 'Toko') + ', saya ' + tx.customerName + ' ingin konfirmasi bukti transfer pembayaran cicilan nota ' + tx.id)}" 
               target="_blank"
               class="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center space-x-2">
              <i class="fa-brands fa-whatsapp text-sm"></i>
              <span>Kirim Bukti Transfer ke Penjual via WhatsApp</span>
            </a>
          </div>
        </div>

      </div>
    `;
  }).join("");
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Nomor rekening berhasil disalin!", "success"));
  } else {
    prompt("Salin nomor rekening:", text);
  }
}

function downloadJsonBackup() {
  const jsonStr = JSON.stringify(db, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_cicilan_baju_${getTodayDateString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("File backup JSON berhasil diunduh!", "success");
}

function handleRestoreJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.transactions && parsed.expenses) {
        if (confirm("Restore file ini? Data yang ada di browser akan digantikan dengan data di file ini.")) {
          db = parsed;
          saveDatabaseToLocal();
          refreshAllViews();
          updateStoreHeaderDisplay();
          showToast("Data berhasil dipulihkan dari file backup!", "success");
        }
      } else {
        showToast("Format file JSON tidak sesuai struktur aplikasi", "error");
      }
    } catch (err) {
      showToast("Gagal membaca file JSON: " + err.message, "error");
    }
  };
  reader.readAsText(file);
}

// ================= SAMPLE DATA DEMO =================
function loadSampleDemoData() {
  if (!confirm("Muat data contoh demo toko baju? Data contoh mencakup penjualan Cash, cicilan lancar, jatuh tempo, dan kulakan.")) {
    return;
  }

  const today = getTodayDateString();
  const sampleTransactions = [
    {
      id: "TX-DEMO-01",
      createdAt: new Date().toISOString(),
      date: today,
      customerName: "Ibu Hj. Aminah",
      customerPhone: "081298765432",
      itemsDescription: "1 Pcs Gamis Brokat Pesta Mewah Gold",
      totalAmount: 380000,
      paymentType: "CASH",
      cashPaidAmount: 380000
    },
    {
      id: "TX-DEMO-02",
      createdAt: new Date().toISOString(),
      date: addDaysToDate(today, -14),
      customerName: "Ibu Siti Nurhaliza",
      customerPhone: "081345678901",
      itemsDescription: "3 Pcs Gamis Rayon Viscose & 2 Hijab Bella Square",
      totalAmount: 480000,
      paymentType: "INSTALLMENT",
      installmentPlan: {
        downPayment: 80000,
        remainingPrincipal: 400000,
        tenorMonths: 2,
        frequency: "WEEKLY",
        totalInstallments: 8,
        installmentAmount: 50000,
        totalPaid: 180000,
        remainingDebt: 300000,
        status: "ACTIVE",
        schedules: [
          { installmentNo: 1, dueDate: addDaysToDate(today, -7), amount: 50000, paidAmount: 50000, paidDate: addDaysToDate(today, -7), isPaid: true, notes: "Transfer BCA" },
          { installmentNo: 2, dueDate: today, amount: 50000, paidAmount: 50000, paidDate: today, isPaid: true, notes: "Tunai" },
          { installmentNo: 3, dueDate: addDaysToDate(today, 7), amount: 50000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 4, dueDate: addDaysToDate(today, 14), amount: 50000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 5, dueDate: addDaysToDate(today, 21), amount: 50000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 6, dueDate: addDaysToDate(today, 28), amount: 50000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 7, dueDate: addDaysToDate(today, 35), amount: 50000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 8, dueDate: addDaysToDate(today, 42), amount: 50000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" }
        ],
        paymentHistory: [
          { id: "PAY-DEMO-01", date: addDaysToDate(today, -14), type: "DP", amount: 80000, notes: "DP Pembelian" },
          { id: "PAY-DEMO-02", date: addDaysToDate(today, -7), type: "INSTALLMENT", amount: 50000, notes: "Angsuran ke-1 Lunas" },
          { id: "PAY-DEMO-03", date: today, type: "INSTALLMENT", amount: 50000, notes: "Angsuran ke-2 Lunas" }
        ]
      }
    },
    {
      id: "TX-DEMO-03",
      createdAt: new Date().toISOString(),
      date: addDaysToDate(today, -20),
      customerName: "Ibu Ratna Dewi",
      customerPhone: "085712345678",
      itemsDescription: "2 Pcs Setelan Tunik Celana Kulot Premium",
      totalAmount: 350000,
      paymentType: "INSTALLMENT",
      installmentPlan: {
        downPayment: 50000,
        remainingPrincipal: 300000,
        tenorMonths: 1,
        frequency: "WEEKLY",
        totalInstallments: 4,
        installmentAmount: 75000,
        totalPaid: 50000,
        remainingDebt: 300000,
        status: "ACTIVE",
        schedules: [
          // Ini contoh menunggak agar muncul peringatan di dashboard
          { installmentNo: 1, dueDate: addDaysToDate(today, -6), amount: 75000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 2, dueDate: addDaysToDate(today, 1), amount: 75000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 3, dueDate: addDaysToDate(today, 8), amount: 75000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" },
          { installmentNo: 4, dueDate: addDaysToDate(today, 15), amount: 75000, paidAmount: 0, paidDate: null, isPaid: false, notes: "" }
        ],
        paymentHistory: [
          { id: "PAY-DEMO-04", date: addDaysToDate(today, -20), type: "DP", amount: 50000, notes: "DP Tunai" }
        ]
      }
    }
  ];

  const sampleExpenses = [
    {
      id: "EXP-DEMO-01",
      date: addDaysToDate(today, -5),
      category: "KULAKAN",
      description: "Kulakan 2 kodi Gamis Katun Rayon Pasar Tanah Abang Blok A",
      amount: 1400000,
      createdAt: new Date().toISOString()
    },
    {
      id: "EXP-DEMO-02",
      date: addDaysToDate(today, -2),
      category: "PACKAGING",
      description: "Beli kantong sablon butik 100 pcs & bubble wrap",
      amount: 85000,
      createdAt: new Date().toISOString()
    }
  ];

  db.transactions = sampleTransactions;
  db.expenses = sampleExpenses;
  saveDatabaseToLocal();
  closeModal("modalGeneralSettings");
  refreshAllViews();
  showToast("Data contoh demo berhasil dimuat!", "success");
}

function confirmResetAllData() {
  if (confirm("PERINGATAN KERAS: Semua data transaksi dan pengeluaran akan DIHAPUS TOTAL. Pastikan Anda sudah membuat backup jika perlu!")) {
    db.transactions = [];
    db.expenses = [];
    saveDatabaseToLocal();
    closeModal("modalGeneralSettings");
    refreshAllViews();
    showToast("Semua data berhasil di-reset", "info");
  }
}

// ================= MODAL HELPERS =================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }
}

// Close modal on escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modals = [
      "modalInstallmentDetail", 
      "modalPayInstallment", 
      "modalGoogleDriveSync", 
      "modalGeneralSettings",
      "modalPrintReceipt"
    ];
    modals.forEach(m => closeModal(m));
  }
});
