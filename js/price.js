/* 油价模块：今日油价 / 历史油价 / 调价日历
   今日油价为真实数据，来源 apizero 成品油接口（免费、CORS 可跨域，已验证）。
   调价日历按发改委"每 10 个工作日"规则，由接口给出的"下次调价日"推算（真实日期）。
   历史油价为本地累积快照：每次成功获取即记录一条，随时间越来越真实。 */

const PROVINCES = ['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆'];

/* 2026 中国法定节假日（推算调价工作日时剔除；调休上班日未单列，影响极小） */
const HOLIDAYS_2026 = new Set([
  '2026-01-01','2026-01-02','2026-01-03',
  '2026-02-15','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-21','2026-02-22',
  '2026-04-04','2026-04-05','2026-04-06',
  '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05',
  '2026-06-19','2026-06-20','2026-06-21',
  '2026-09-25','2026-09-26','2026-09-27',
  '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07'
]);

const OIL_API = 'https://v1.apizero.cn/api/oil-price';
const CACHE_KEY = 'oilCache';   // { 省份: { data, fetchedAt } }
const SNAP_KEY  = 'oilSnap';    // { 省份: [ {date,c92,c95,c98,c0} ] }

let priceProvince = '广东';
let priceSub = 'today';
let priceMonth = new Date(2026, 6, 1); // 2026-07
let _anchor = null; // 下次调价日(Date)，用于推算调价日历

async function getOilCache() { return getSetting(CACHE_KEY, {}); }
async function getSnapshots() { return getSetting(SNAP_KEY, {}); }
async function getPriceOverrides() { return getSetting('priceOverrides', {}); }

async function fetchOil(province) {
  const r = await fetch(OIL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'province=' + encodeURIComponent(province)
  });
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  if (j.code !== 0) throw new Error(j.msg || 'api error');
  const d = j.data;
  const map = {};
  for (const p of (d.prices || [])) map[p.type] = p.price;
  return {
    province: d.province || province,
    updateDate: d.update_date || '',
    c92: map.gasoline_92, c95: map.gasoline_95, c98: map.gasoline_98, c0: map.diesel_0,
    nextAdjust: d.next_adjustment || '',
    forecast: d.forecast || ''
  };
}

/* 加载某省油价：优先缓存，force 时强制刷新；成功则记录快照 */
async function loadOil(province, force) {
  const cache = await getOilCache();
  const c = cache[province];
  if (!force && c && c.data && c.data.c92 != null) return c.data;
  const data = await fetchOil(province);
  cache[province] = { data, fetchedAt: Date.now() };
  await setSetting(CACHE_KEY, cache);
  // 记录快照（按 updateDate 去重）
  const snaps = await getSnapshots();
  const arr = snaps[province] || [];
  if (!arr.find((s) => s.date === data.updateDate)) {
    arr.push({ date: data.updateDate, c92: data.c92, c95: data.c95, c98: data.c98, c0: data.c0 });
    arr.sort((a, b) => (a.date < b.date ? 1 : -1));
    snaps[province] = arr;
    await setSetting(SNAP_KEY, snaps);
  }
  // 记下锚点（下次调价日）供日历使用
  const a = parseNextAdjust(data.nextAdjust, new Date().getFullYear());
  if (a) _anchor = a;
  return data;
}

function parseNextAdjust(text, year) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return new Date(year, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

/* 手动覆盖：在真实数据之上允许用户修正当日本地油价 */
async function getMergedPrice(province, live) {
  const ov = await getPriceOverrides();
  const o = ov[province];
  if (!o) return live;
  const m = { ...live };
  ['c92', 'c95', 'c98', 'c0'].forEach((k) => { if (o[k] != null) m[k] = o[k]; });
  return m;
}

/* 与上次快照比较，得出涨跌 */
async function deltaFor(province, data) {
  const snaps = await getSnapshots();
  const prev = (snaps[province] || [])
    .filter((s) => s.date < data.updateDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!prev) return null;
  return {
    d92: +(data.c92 - prev.c92).toFixed(2),
    d95: +(data.c95 - prev.c95).toFixed(2),
    d98: +(data.c98 - prev.c98).toFixed(2),
    d0: +(data.c0 - prev.c0).toFixed(2)
  };
}

function arrowHtml(d) {
  if (d == null) return '<span class="muted">—</span>';
  if (d > 0) return `<span class="up">▲ ${d.toFixed(2)}</span>`;
  if (d < 0) return `<span class="down">▼ ${Math.abs(d).toFixed(2)}</span>`;
  return '<span class="muted">—</span>';
}

/* ---------- 调价日历：10 个工作日规则 ---------- */
function isWorkday(d) {
  const w = d.getDay();
  if (w === 0 || w === 6) return false;
  if (HOLIDAYS_2026.has(fmtDate(d))) return false;
  return true;
}
function addWorkdays(start, n) {
  const d = new Date(start);
  const step = n >= 0 ? 1 : -1;
  let cnt = 0, guard = 0;
  while (cnt !== n && guard < 3660) { // 安全上限：约 10 年，防极端环境死循环
    d.setDate(d.getDate() + step);
    if (isWorkday(d)) cnt++;
    guard++;
  }
  return d;
}
function buildSchedule(anchor, year) {
  if (!anchor) return [];
  const list = new Set();
  let d = new Date(anchor), fc = 0;
  while (d.getFullYear() <= year && fc < 200) { list.add(fmtDate(d)); d = addWorkdays(d, 10); fc++; }
  d = new Date(anchor);
  let prev = addWorkdays(d, -10), bc = 0;
  while (prev.getFullYear() >= year - 1 && bc < 200) { list.add(fmtDate(prev)); d = prev; prev = addWorkdays(d, -10); bc++; }
  return [...list].sort();
}

/* ---------------- 渲染 ---------------- */
async function renderPrice(container) {
  const provOpts = PROVINCES.map((p) => `<option value="${p}" ${p === priceProvince ? 'selected' : ''}>${p}</option>`).join('');
  let html = `<div class="subtabs">
    <div class="subtab ${priceSub === 'today' ? 'active' : ''}" data-ps="today">今日油价</div>
    <div class="subtab ${priceSub === 'history' ? 'active' : ''}" data-ps="history">历史油价</div>
    <div class="subtab ${priceSub === 'calendar' ? 'active' : ''}" data-ps="calendar">调价日历</div>
  </div>`;
  html += `<div class="field"><label>选择地区</label><select id="provSel">${provOpts}</select></div>`;

  if (priceSub === 'today') {
    container.innerHTML = html + '<div class="card"><div class="muted" style="padding:20px;text-align:center">正在获取最新油价…</div></div>';
    bindPriceControls(container);
    try {
      const live = await loadOil(priceProvince, false);
      const m = await getMergedPrice(priceProvince, live);
      const delta = await deltaFor(priceProvince, live);
      const body = `<div class="card">
        <div class="card-title">${live.province} · 今日油价（元/升）</div>
        <div class="price-grid">
          <div class="price-cell"><div class="g">92号</div><div class="p">${fmt2(m.c92)}</div><div class="d">${arrowHtml(delta && delta.d92)}</div></div>
          <div class="price-cell"><div class="g">95号</div><div class="p">${fmt2(m.c95)}</div><div class="d">${arrowHtml(delta && delta.d95)}</div></div>
          <div class="price-cell"><div class="g">98号</div><div class="p">${fmt2(m.c98)}</div><div class="d">${arrowHtml(delta && delta.d98)}</div></div>
          <div class="price-cell"><div class="g">0号柴油</div><div class="p">${fmt2(m.c0)}</div><div class="d">${arrowHtml(delta && delta.d0)}</div></div>
        </div>
        ${live.nextAdjust ? `<div class="info-line">🔔 ${escapeHtml(live.nextAdjust)}</div>` : ''}
        ${live.forecast ? `<div class="info-line">📈 ${escapeHtml(live.forecast)}</div>` : ''}
        <div class="muted" style="font-size:12px;margin-top:6px">数据更新：${escapeHtml(live.updateDate || '—')} ｜ 来源：发改委调价（apizero）</div>
      </div>
      <button class="btn ghost" id="editPriceBtn">手动校准本地区油价</button>
      <button class="btn ghost" id="refreshPriceBtn">↻ 刷新实时油价</button>`;
      container.innerHTML = html + body;
      bindPriceControls(container);
      container.querySelector('#editPriceBtn').addEventListener('click', () => openPriceEditor(container, live));
      container.querySelector('#refreshPriceBtn').addEventListener('click', async () => {
        toast('刷新中…');
        try { await loadOil(priceProvince, true); await renderPrice(container); toast('已更新'); }
        catch (e) { toast('刷新失败，使用缓存'); }
      });
    } catch (e) {
      container.innerHTML = html + `<div class="card"><div class="muted" style="padding:16px">⚠️ 实时油价获取失败（网络或接口受限），请检查网络后点下方刷新。</div></div>
        <button class="btn ghost" id="retryBtn">↻ 重试获取油价</button>`;
      bindPriceControls(container);
      const rb = container.querySelector('#retryBtn');
      if (rb) rb.addEventListener('click', () => renderPrice(container));
    }
  } else if (priceSub === 'history') {
    const snaps = (await getSnapshots())[priceProvince] || [];
    let rows = snaps.slice(0, 14);
    if (!rows.length) {
      // 无快照时显示一次当前获取
      try {
        const live = await loadOil(priceProvince, false);
        rows = [{ date: live.updateDate, c92: live.c92, c95: live.c95, c98: live.c98, c0: live.c0 }];
      } catch (e) { rows = []; }
    }
    let tbl = '<table class="tbl"><thead><tr><th>调价日</th><th>92号</th><th>95号</th><th>98号</th><th>柴油</th></tr></thead><tbody>';
    if (rows.length) for (const r of rows) tbl += `<tr><td>${r.date ? r.date.slice(5) : '—'}</td><td>${fmt2(r.c92)}</td><td>${fmt2(r.c95)}</td><td>${fmt2(r.c98)}</td><td>${fmt2(r.c0)}</td></tr>`;
    else tbl += '<tr><td colspan="5" class="muted">暂无记录</td></tr>';
    tbl += '</tbody></table>';
    container.innerHTML = html + `<div class="card"><div class="card-title">${priceProvince} · 历史油价记录</div>${tbl}
      <p class="muted" style="font-size:12px;margin-top:8px">记录随每次查看自动累积；手动可校准。数据为本地日志，非官方历史库。</p></div>`;
    bindPriceControls(container);
  } else {
    container.innerHTML = html + renderCalendar();
    bindPriceControls(container);
    container.querySelector('#calPrev').addEventListener('click', () => { priceMonth.setMonth(priceMonth.getMonth() - 1); renderPrice(container); });
    container.querySelector('#calNext').addEventListener('click', () => { priceMonth.setMonth(priceMonth.getMonth() + 1); renderPrice(container); });
  }
}

function bindPriceControls(container) {
  container.querySelectorAll('[data-ps]').forEach((b) => b.addEventListener('click', () => { priceSub = b.getAttribute('data-ps'); renderPrice(container); }));
  const provSel = container.querySelector('#provSel');
  if (provSel) provSel.addEventListener('change', () => { priceProvince = provSel.value; renderPrice(container); });
}

function renderCalendar() {
  const y = priceMonth.getFullYear(), mo = priceMonth.getMonth();
  if (!_anchor) _anchor = parseNextAdjust('下次油价7月31日24时调整', y) || new Date(y, 6, 31);
  const sched = buildSchedule(_anchor, y);
  const set = new Set(sched.filter((d) => d.startsWith(`${y}-${String(mo + 1).padStart(2, '0')}`)));
  const anchorStr = fmtDate(_anchor);
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const today0 = todayStr();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cal-cell"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = ['cal-cell'];
    if (set.has(ds)) cls.push('adj');
    if (ds === today0) cls.push('today');
    if (ds === anchorStr) cls.push('next');
    cells += `<div class="${cls.join(' ')}" title="${set.has(ds) ? '成品油调价日' : ''}">${d}</div>`;
  }
  const dows = ['日', '一', '二', '三', '四', '五', '六'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
  return `<div class="cal-head">
      <button class="btn sm light" id="calPrev">‹</button>
      <span class="m">${y}年${mo + 1}月</span>
      <button class="btn sm light" id="calNext">›</button>
    </div>
    <div class="card"><div class="cal-grid">${dows}${cells}</div>
    <p class="muted" style="font-size:12px;margin-top:10px"><span style="color:#ef8a1f">●</span> 橙色圆点 = 成品油调价日　<span style="color:#C8102E">●</span> 红圈 = 下次调价日</p></div>`;
}

function fmt2(v) { return v == null ? '—' : Number(v).toFixed(2); }

async function openPriceEditor(container, live) {
  const m = await getMergedPrice(priceProvince, live || {});
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="card-title">校准 ${priceProvince} 油价（元/升）</div>
    <div class="row2">
      <div class="field"><label>92号</label><input type="number" id="e92" value="${m.c92 != null ? m.c92 : ''}" step="0.01"></div>
      <div class="field"><label>95号</label><input type="number" id="e95" value="${m.c95 != null ? m.c95 : ''}" step="0.01"></div>
    </div>
    <div class="row2">
      <div class="field"><label>98号</label><input type="number" id="e98" value="${m.c98 != null ? m.c98 : ''}" step="0.01"></div>
      <div class="field"><label>0号柴油</label><input type="number" id="e0" value="${m.c0 != null ? m.c0 : ''}" step="0.01"></div>
    </div>`;
  openSheet('校准油价', wrap);
  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = '保存';
  save.onclick = async () => {
    const ov = await getPriceOverrides();
    ov[priceProvince] = {
      c92: +(wrap.querySelector('#e92').value || 0),
      c95: +(wrap.querySelector('#e95').value || 0),
      c98: +(wrap.querySelector('#e98').value || 0),
      c0: +(wrap.querySelector('#e0').value || 0)
    };
    await setSetting('priceOverrides', ov);
    closeSheet();
    renderPrice(container);
    toast('已校准');
  };
  wrap.appendChild(save);
}
