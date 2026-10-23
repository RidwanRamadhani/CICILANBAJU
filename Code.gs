/**
 * ============================================================================
 * GOOGLE APPS SCRIPT: BACKEND DATABASE GOOGLE DRIVE UNTUK APLIKASI CICILAN BAJU
 * ============================================================================
 * 
 * Script ini berfungsi sebagai API gratis berbasis Google Drive.
 * File data akan otomatis dibuat dengan nama "database_keuangan.json" 
 * di dalam folder "Aplikasi_Cicilan_Baju" pada Google Drive Anda.
 * 
 * Panduan deploy ada di file PANDUAN_SETUP_GOOGLE_DRIVE.md
 */

const FOLDER_NAME = "Aplikasi_Cicilan_Baju";
const FILE_NAME = "database_keuangan.json";

/**
 * Endpoint GET: Digunakan untuk membaca database atau uji koneksi (Ping)
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "read";

    if (action === "ping") {
      return createJsonResponse({
        status: "success",
        message: "Koneksi ke Google Drive Apps Script berhasil!",
        timestamp: new Date().toISOString()
      });
    }

    if (action === "read") {
      const data = loadDatabaseFromDrive();
      return createJsonResponse({
        status: "success",
        data: data,
        timestamp: new Date().toISOString()
      });
    }

    return createJsonResponse({
      status: "error",
      message: "Action tidak dikenali: " + action
    });
  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: "Gagal memproses permintaan GET: " + err.toString()
    });
  }
}

/**
 * Endpoint POST: Digunakan untuk menyimpan dan menyinkronkan seluruh database
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Kunci proses selama maksimal 10 detik agar tidak terjadi tumpang-tindih penulisan file
    lock.waitLock(10000);

    let requestBody = "";
    if (e && e.postData && e.postData.contents) {
      requestBody = e.postData.contents;
    } else {
      return createJsonResponse({
        status: "error",
        message: "Tidak ada data yang dikirimkan (payload kosong)"
      });
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(requestBody);
    } catch (parseError) {
      return createJsonResponse({
        status: "error",
        message: "Format payload bukan JSON valid: " + parseError.toString()
      });
    }

    // Jika dibungkus dalam { action: 'save', data: {...} } atau data mentah langsung
    let dataToSave = parsedPayload;
    if (parsedPayload.action === "save" && parsedPayload.data) {
      dataToSave = parsedPayload.data;
    }

    // Perbarui metadata timestamp
    dataToSave.lastUpdated = new Date().toISOString();

    // Simpan ke Google Drive
    const result = saveDatabaseToDrive(dataToSave);

    return createJsonResponse({
      status: "success",
      message: "Data berhasil disimpan dan disinkronkan ke Google Drive!",
      fileId: result.fileId,
      folderId: result.folderId,
      timestamp: dataToSave.lastUpdated
    });

  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: "Gagal menyimpan data ke Google Drive: " + err.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mengambil atau membuat folder khusus di Google Drive
 */
function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(FOLDER_NAME);
}

/**
 * Membaca file database_keuangan.json dari Google Drive
 */
function loadDatabaseFromDrive() {
  const folder = getOrCreateFolder();
  const files = folder.getFilesByName(FILE_NAME);

  if (!files.hasNext()) {
    // Jika file belum ada, return template database kosong
    return {
      version: "1.0.0",
      storeInfo: {
        name: "Pencatatan Cicilan Baju",
        owner: "Admin Toko",
        phone: "",
        rekening: ""
      },
      transactions: [],
      expenses: [],
      lastUpdated: new Date().toISOString()
    };
  }

  const file = files.next();
  const content = file.getBlob().getDataAsString();
  return JSON.parse(content);
}

/**
 * Menyimpan JSON ke file database_keuangan.json di Google Drive
 */
function saveDatabaseToDrive(dataObj) {
  const folder = getOrCreateFolder();
  const files = folder.getFilesByName(FILE_NAME);
  const jsonString = JSON.stringify(dataObj, null, 2);

  let file;
  if (files.hasNext()) {
    file = files.next();
    file.setContent(jsonString);
  } else {
    file = folder.createFile(FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
  }

  return {
    fileId: file.getId(),
    folderId: folder.getId()
  };
}

/**
 * Helper pembuat HTTP Response JSON yang kompatibel dengan CORS browser
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Fungsi uji coba manual di editor Google Apps Script
 */
function testScript() {
  const testData = {
    test: true,
    message: "Uji coba berhasil disimpan dari Editor Script",
    transactions: [],
    expenses: []
  };
  const res = saveDatabaseToDrive(testData);
  Logger.log("File ID: " + res.fileId);
  const loaded = loadDatabaseFromDrive();
  Logger.log("Data terbaca: " + JSON.stringify(loaded));
}
