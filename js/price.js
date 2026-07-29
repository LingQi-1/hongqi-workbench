/* 油价模块：今日油价 / 历史油价 / 调价日历（复刻参考截图三视图） */

/* 内置参考价（示例数据，可在「今日油价」页手动更新；后续接入实时接口可自动刷新） */
const SEED_PRICES = {
  '广东': { c92: 7.21, c95: 7.81, c98: 9.45, c0: 6.84, d92: 0.12, d95: 0.13, d98: 0.15, d0: 0.12 },
  '北京': { c92: 7.18, c95: 7.64, c98: 9.12, c0: 6.86, d92: 0.10, d95: 0.11, d98: 0.12, d0: 0.10 },
  '上海': { c92: 7.15, c95: 7.60, c98: 9.05, c0: 6.80, d92: 0.09, d95: 0.10, d98: 0.11, d0: 0.09 },
  '浙江': { c92: 7.19, c95: 7.66, c98: 9.20, c0: 6.82, d92: 0.11, d95: 0.12, d98: 0.13, d0: 0.11 },
  '江苏': { c92: 7.17, c95: 7.63, c98: 9.10, c0: 6.79, d92: 0.10, d95: 0.10, d98: 0.12, d0: 0.10 },
  '四川': { c92: 7.24, c95: 7.74, c98: 9.40, c0: 6.88, d92: 0.13, d95: 0.14, d98: 0.15, d0: 0.13 },
  '山东': { c92: 7.12, c95: 7.58, c98: 9.00, c0: 6.78, d92: 0.08, d95: 0.09, d98: 0.10, d0: 0.08 },
  '湖北': { c92: 7.20, c95: 7.70, c98: 9.22, c0: 6.83, d92: 0.11, d95: 0.12, d98: 0.13, d0: 0.11 },
  '湖南': { c92: 7.22, c95: 7.72, c98: 9.30, c0: 6.85, d92: 0.12, d95: 0.13, d98: 0.14, d0: 0.12 },
  '河南': { c92: 7.16, c95: 7.62, c98: 9.08, c0: 6.80, d92: 0.10, d95: 0.11, d98: 0.12, d0: 0.10 },
  '陕西': { c92: 7.10, c95: 7.55, c98: 8.95, c0: 6.75, d92: 0.09, d95: 0.10, d98: 0.11, d0: 0.09 },
  '辽宁': { c92: 7.14, c95: 7.59, c98: 9.02, c0: 6.77, d92: 0.10, d95: 0.11, d98: 0.12, d0: 0.10 }
};

/* 2026 年参考调价日（示例，约每 10 个工作日一次） */
const ADJ_DATES = [
  '2026-01-02', '2026-01-16', '2026-02-06', '2026-02-20', '2026-03-05', '2026-03-19',
  '2026-04-02', '2026-04-17', '2026-04-30', '2026-05-19', '2026-06-03', '2026-06-18',
  '2026-07-02', '2026-07-16', '2026-07-30', '2026-08-13', '2026-08-27', '2026-09-10',
  '2026-09-24', '2026-10-15', '2026-10-29', '2026-11-12', '2026-11-26', '2026-12-10', '2026-12-24'
];

let priceProvince = '广东';
let priceSub = 'today';
let priceMonth = new Date(2026, 6, 1); // 2026-07

async function getPriceOverrides() { return getSetting('priceOverrides', {}); }
async function getMergedPrice(prov) {
  const ov = await getPriceOverrides();
  const base = SEED_PRICES[prov] || SEED_PRICES['广东'];
  const o = ov[prov];
  if (!o) return base;
  return { ...base, ...o };
}

function arrowHtml(d) {
  if (d > 0) return `<span class="up">▲ ${d.toFixed(2)}</span>`;
  if (d < 0) return `<span class="down">▼ ${Math.abs(d).toFixed(2)}</span>`;
  return '<span class="muted">—</span>';
}

/* 历史：取最近 8 个调价日，价格随次数轻微递减（参考） */
function historyFor(prov) {
  const cur = SEED_PRICES[prov] || SEED_PRICES['广东'];
  const recent = ADJ_DATES.slice(-8);
  return recent.map((d, i) => {
    const k = (recent.length - 1 - i);
    return {
      date: d,
      p92: +(cur.c92 - k * 0.03).toFixed(2),
      p95: +(cur.c95 - k * 0.03).toFixed(2),
      p98: +(cur.c98 - k * 0.04).toFixed(2),
      p0: +(cur.c0 - k * 0.03).toFixed(2)
    };
  });
}

async function renderPrice(container) {
  const provinces = Object.keys(SEED_PRICES);
  const provOpts = provinces.map((p) => `<option value="${p}" ${p === priceProvince ? 'selected' : ''}>${p}</option>`).join('');

  let html = `<div class="subtabs">
    <div class="subtab ${priceSub === 'today' ? 'active' : ''}" data-ps="today">今日油价</div>
    <div class="subtab ${priceSub === 'history' ? 'active' : ''}" data-ps="history">历史油价</div>
    <div class="subtab ${priceSub === 'calendar' ? 'active' : ''}" data-ps="calendar">调价日历</div>
  </div>`;

  if (priceSub === 'today') {
    const m = await getMergedPrice(priceProvince);
    html += `<div class="field"><label>选择地区</label><select id="provSel">${provOpts}</select></div>`;
    html += `<div class="card"><div class="card-title">${priceProvince} · 今日油价（元/升）</div><div class="price-grid">
      <div class="price-cell"><div class="g">92号</div><div class="p">${m.c92.toFixed(2)}</div><div class="d">${arrowHtml(m.d92)}</div></div>
      <div class="price-cell"><div class="g">95号</div><div class="p">${m.c95.toFixed(2)}</div><div class="d">${arrowHtml(m.d95)}</div></div>
      <div class="price-cell"><div class="g">98号</div><div class="p">${m.c98.toFixed(2)}</div><div class="d">${arrowHtml(m.d98)}</div></div>
      <div class="price-cell"><div class="g">0号柴油</div><div class="p">${m.c0.toFixed(2)}</div><div class="d">${arrowHtml(m.d0)}</div></div>
    </div></div>`;
    html += `<button class="btn ghost" id="editPriceBtn">手动更新本地区油价</button>`;
    html += `<p class="muted" style="font-size:12px;margin-top:10px">数据为内置参考价，可在上方手动更新；接入实时油价接口后将自动刷新。</p>`;
  } else if (priceSub === 'history') {
    const h = historyFor(priceProvince);
    html += `<div class="field"><label>选择地区</label><select id="provSel">${provOpts}</select></div>`;
    html += `<div class="card"><div class="card-title">${priceProvince} · 近一年调价记录</div>
      <table class="tbl"><thead><tr><th>调价日</th><th>92号</th><th>95号</th><th>98号</th><th>柴油</th></tr></thead><tbody>`;
    for (const r of h) html += `<tr><td>${r.date.slice(5)}</td><td>${r.p92}</td><td>${r.p95}</td><td>${r.p98}</td><td>${r.p0}</td></tr>`;
    html += '</tbody></table></div>';
  } else {
    html += renderCalendar();
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-ps]').forEach((b) => b.addEventListener('click', () => { priceSub = b.getAttribute('data-ps'); renderPrice(container); }));
  const provSel = container.querySelector('#provSel');
  if (provSel) provSel.addEventListener('change', () => { priceProvince = provSel.value; renderPrice(container); });
  const editBtn = container.querySelector('#editPriceBtn');
  if (editBtn) editBtn.addEventListener('click', () => openPriceEditor(container));

  if (priceSub === 'calendar') {
    container.querySelector('#calPrev').addEventListener('click', () => { priceMonth.setMonth(priceMonth.getMonth() - 1); renderPrice(container); });
    container.querySelector('#calNext').addEventListener('click', () => { priceMonth.setMonth(priceMonth.getMonth() + 1); renderPrice(container); });
  }
}

function renderCalendar() {
  const y = priceMonth.getFullYear(), mo = priceMonth.getMonth();
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const adjSet = new Set(ADJ_DATES.filter((d) => d.startsWith(`${y}-${String(mo + 1).padStart(2, '0')}`)));
  const todayStr0 = todayStr();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cal-cell"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = ['cal-cell'];
    if (adjSet.has(ds)) cls.push('adj');
    if (ds === todayStr0) cls.push('today');
    cells += `<div class="${cls.join(' ')}">${d}</div>`;
  }
  const dows = ['日', '一', '二', '三', '四', '五', '六'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
  return `<div class="cal-head">
      <button class="btn sm light" id="calPrev">‹</button>
      <span class="m">${y}年${mo + 1}月</span>
      <button class="btn sm light" id="calNext">›</button>
    </div>
    <div class="card"><div class="cal-grid">${dows}${cells}</div>
    <p class="muted" style="font-size:12px;margin-top:10px"><span style="color:#ef8a1f">●</span> 橙色圆点 = 成品油调价日</p></div>`;
}

async function openPriceEditor(container) {
  const m = await getMergedPrice(priceProvince);
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="card-title">更新 ${priceProvince} 油价（元/升）</div>
    <div class="row2">
      <div class="field"><label>92号</label><input type="number" id="e92" value="${m.c92}" step="0.01"></div>
      <div class="field"><label>95号</label><input type="number" id="e95" value="${m.c95}" step="0.01"></div>
    </div>
    <div class="row2">
      <div class="field"><label>98号</label><input type="number" id="e98" value="${m.c98}" step="0.01"></div>
      <div class="field"><label>0号柴油</label><input type="number" id="e0" value="${m.c0}" step="0.01"></div>
    </div>`;
  openSheet('手动更新油价', wrap);
  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = '保存';
  save.onclick = async () => {
    const ov = await getPriceOverrides();
    ov[priceProvince] = {
      c92: +wrap.querySelector('#e92').value, c95: +wrap.querySelector('#e95').value,
      c98: +wrap.querySelector('#e98').value, c0: +wrap.querySelector('#e0').value,
      d92: 0, d95: 0, d98: 0, d0: 0
    };
    await setSetting('priceOverrides', ov);
    closeSheet();
    renderPrice(container);
    toast('已更新');
  };
  wrap.appendChild(save);
}
