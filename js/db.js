/* IndexedDB wrapper + shared helpers for 我的红旗 PWA */

const DB_NAME = 'wohongqi';
const DB_VER = 2;
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cars')) db.createObjectStore('cars', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: 'id' });
        s.createIndex('carId', 'carId', { unique: false });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('reminders')) db.createObjectStore('reminders', { keyPath: 'id' });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function _store(name, mode) {
  return _db.transaction(name, mode).objectStore(name);
}

function dbPut(store, val) {
  return new Promise((resolve, reject) => {
    const r = _store(store, 'readwrite').put(val);
    r.onsuccess = () => resolve(val);
    r.onerror = () => reject(r.error);
  });
}

function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const r = _store(store, 'readonly').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const r = _store(store, 'readonly').getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

function dbDel(store, key) {
  return new Promise((resolve, reject) => {
    const r = _store(store, 'readwrite').delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/* settings helpers */
async function getSetting(key, def) {
  const r = await dbGet('settings', key);
  return r ? r.value : def;
}
async function setSetting(key, value) {
  return dbPut('settings', { key, value });
}

/* ---------- shared UI helpers ---------- */
function $(sel) { return document.querySelector(sel); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() { return fmtDate(new Date()); }

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let _toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

function openSheet(title, bodyNode) {
  $('#sheetTitle').textContent = title;
  const body = $('#sheetBody');
  body.innerHTML = '';
  if (typeof bodyNode === 'string') body.innerHTML = bodyNode;
  else body.appendChild(bodyNode);
  $('#sheet').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; }

function openUrl(url) {
  if (url) window.open(url, '_blank');
}
