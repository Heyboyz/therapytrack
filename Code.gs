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

function formatDateKey(val) {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  var d = new Date(val);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ── Read all patient data ──
function getAllData() {
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
    for (var i = 0; i < rows.length; i++) {
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
