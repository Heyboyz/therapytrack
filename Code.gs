// ============================================================
// TherapyTrack — Google Apps Script Backend
// Cara pasang:
//   1. Buka Google Sheets kamu
//   2. Extensions → Apps Script
//   3. Hapus kode default, paste semua kode ini
//   4. Klik Deploy → New Deployment
//      - Type: Web App
//      - Execute as: Me
//      - Who has access: Anyone
//   5. Copy URL yang diberikan → paste ke aplikasi TherapyTrack
// ============================================================

var DATA_SHEET      = 'Data Pasien';
var THERAPIST_SHEET = 'Daftar Terapis';

// ── Entry point (semua request pakai GET agar bebas CORS) ──
function doGet(e) {
  try {
    var action = e.parameter.action || '';
    var result;

    if      (action === 'getAllData')      result = getAllData();
    else if (action === 'getTherapists')  result = getTherapists();
    else if (action === 'saveEntry')      result = saveEntry(e.parameter);
    else if (action === 'saveTherapists') result = saveTherapists(e.parameter.list);
    else if (action === 'ping')           result = { ok: true, ts: new Date().toISOString() };
    else                                  result = { error: 'Unknown action: ' + action };

    return ok(result);
  } catch (err) {
    return ok({ error: err.message });
  }
}

// ── Helpers ──
function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(name, headers) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var hdr = sheet.getRange(1, 1, 1, headers.length);
    hdr.setValues([headers]);
    hdr.setFontWeight('bold');
    hdr.setBackground('#1a237e');
    hdr.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// FORMAT DATE KEY: Mengonversi tanggal ke format YYYY-MM-DD,
// namun mempertahankan key khusus (seperti cuti_d-..., kas-..., kas_tarif, dll.) agar tidak rusak.
function formatDateKey(val) {
  if (!val) return '';
  
  // Jika sudah merupakan objek Date, format ke YYYY-MM-DD menggunakan timezone script agar tidak bergeser hari
  if (val instanceof Date) {
    try {
      return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } catch(e) {
      return val.getFullYear() + '-' +
        String(val.getMonth() + 1).padStart(2, '0') + '-' +
        String(val.getDate()).padStart(2, '0');
    }
  }
  
  var str = String(val).trim();
  
  // Jika sudah berformat YYYY-MM-DD, langsung kembalikan
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  // Jika ini adalah key khusus (cuti atau kas), langsung kembalikan as-is
  if (/^(cuti|kas)/i.test(str)) {
    return str;
  }
  
  // Coba parse ke Date jika memungkinkan
  var d = new Date(str);
  if (!isNaN(d.getTime())) {
    try {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } catch(e) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }
  }
  
  return str;
}

// DEDUPLIKASI: Membersihkan data duplikat pada sheet secara otomatis
// dengan mempertahankan baris paling baru (paling bawah).
function cleanDuplicates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DATA_SHEET);
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last < 2) return;
  
  var range = sheet.getRange(2, 1, last - 1, 4);
  var values = range.getValues();
  var seen = {};
  var rowsToDelete = [];
  
  // Scan dari bawah ke atas agar indeks baris saat didelete tidak bergeser
  for (var i = values.length - 1; i >= 0; i--) {
    var date = values[i][0];
    var therapist = values[i][1];
    if (!date || !therapist) continue;
    
    var key = formatDateKey(date) + '|||' + therapist;
    if (seen[key]) {
      rowsToDelete.push(i + 2); // Baris di sheet adalah index i + 2
    } else {
      seen[key] = true;
    }
  }
  
  if (rowsToDelete.length > 0) {
    rowsToDelete.forEach(function(rowNum) {
      sheet.deleteRow(rowNum);
    });
  }
}

// ── Read all patient data ──
function getAllData() {
  // Pembersihan duplikat otomatis dimatikan untuk mempercepat waktu muat (loading)
  // try { cleanDuplicates(); } catch (e) {}

  var sheet = getOrCreateSheet(DATA_SHEET,
    ['Tanggal', 'Terapis', 'Jumlah Pasien', 'Diperbarui']);
  var last = sheet.getLastRow();
  if (last < 2) return {};

  var rows   = sheet.getRange(2, 1, last - 1, 3).getValues();
  var result = {};
  rows.forEach(function(r) {
    var date = r[0], name = r[1], count = r[2];
    if (!date || !name) return;
    var key = formatDateKey(date);
    if (!result[key]) result[key] = {};
    result[key][name] = Number(count) || 0;
  });
  return result;
}

// ── Read therapist list ──
function getTherapists() {
  var sheet = getOrCreateSheet(THERAPIST_SHEET, ['Nama Terapis']);
  var last  = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 1).getValues()
    .map(function(r) { return r[0]; })
    .filter(Boolean);
}

// ── Save / update one entry ──
function saveEntry(params) {
  var date      = params.date;
  var therapist = params.therapist;
  var count     = Number(params.count) || 0;

  var sheet = getOrCreateSheet(DATA_SHEET,
    ['Tanggal', 'Terapis', 'Jumlah Pasien', 'Diperbarui']);
  var last = sheet.getLastRow();
  var now  = new Date();

  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, 2).getValues();
    // OPTIMASI: Cari dari bawah ke atas karena data terbaru pasti ada di bawah
    for (var i = rows.length - 1; i >= 0; i--) {
      if (formatDateKey(rows[i][0]) === date && rows[i][1] === therapist) {
        sheet.getRange(i + 2, 3, 1, 2).setValues([[count, now]]);
        return 'updated';
      }
    }
  }
  sheet.appendRow([date, therapist, count, now]);
  return 'inserted';
}

// ── Save full therapist list ──
function saveTherapists(listJson) {
  var list  = JSON.parse(listJson || '[]');
  var sheet = getOrCreateSheet(THERAPIST_SHEET, ['Nama Terapis']);
  var last  = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, 1).clearContent();
  if (list.length > 0)
    sheet.getRange(2, 1, list.length, 1).setValues(list.map(function(t) { return [t]; }));
  return 'saved';
}
