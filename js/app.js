/* 应用入口：路由 + 初始化 */

const TABS = {
  fuel: { title: '加油记录', render: renderFuel },
  price: { title: '油价', render: renderPrice },
  report: { title: '养车报表', render: renderReport },
  maintenance: { title: '保养', render: renderMaintenance },
  me: { title: '我的', render: renderMe }
};
let currentTab = 'fuel';

/* ===== 爱车陪伴（情绪价值） ===== */
/* 计算陪伴数据：优先用「爱车档案」手动填写的 提车日期/总里程，加油记录作兜底 */
function computeCompanionship(car, recs) {
  const buyDate = car && car.buyDate ? car.buyDate : null;
  const totalKmRaw = car && car.totalKm != null ? parseFloat(car.totalKm) : null;

  // 相伴天数
  let days = null, daysFrom = '';
  if (buyDate) {
    days = Math.max(0, Math.floor((Date.now() - new Date(buyDate).getTime()) / 86400000));
    daysFrom = '提车';
  } else if (recs.length > 0) {
    const firstDate = recs[recs.length - 1].date;
    days = Math.max(1, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86400000));
    daysFrom = '首条加油记录';
  }

  // 同行公里
  let km = null, kmFrom = '';
  if (totalKmRaw != null && !isNaN(totalKmRaw)) {
    km = totalKmRaw; kmFrom = '手动填写';
  } else {
    const w = recs.filter((r) => r.odometer != null && r.odometer !== '' && !isNaN(parseFloat(r.odometer)))
      .map((r) => ({ ...r, odo: parseFloat(r.odometer) })).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (w.length >= 2) { km = Math.max(0, w[w.length - 1].odo - w[0].odo); kmFrom = '加油记录推算'; }
  }

  return { days, daysFrom, km, kmFrom, st: fuelStats(recs), carName: car ? car.name : '我的红旗' };
}

function buildWarmLines(c) {
  const lines = [];
  if (c.days != null) {
    if (c.days >= 365) lines.push(`🎂 你们已经相伴 ${Math.floor(c.days / 365)} 年零 ${c.days % 365} 天了`);
    else if (c.days >= 30) lines.push(`💕 你们已经相伴 ${c.days} 天了`);
    else lines.push(`🌱 刚刚开启旅程，第 ${c.days} 天`);
  }
  if (c.km != null) {
    lines.push(c.km >= 10000 ? `🛣️ 一同走过 ${(c.km / 10000).toFixed(1)} 万公里` : `🛣️ 一同走过 ${c.km.toFixed(0)} 公里`);
  }
  if (c.st.count >= 10) lines.push(`⛽ 为它加油 ${c.st.count} 次，每次都是满满的爱`);
  else if (c.st.count > 0) lines.push(`⛽ 已记录 ${c.st.count} 次加油`);
  if (lines.length === 0) lines.push('点「编辑爱车档案」，记录提车日期与里程，开启你们的专属故事 💝');
  return lines;
}

async function renderCompanionshipCard(container) {
  const car = await getCurrentCar();
  const recs = await getCarRecords();
  const c = computeCompanionship(car, recs);
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'background:linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%);color:#fff;border:none;overflow:hidden;position:relative';

  const emojis = ['❤️', '🌟', '✨', '🔥', '💪', '🏆'];
  const emoji = emojis[Math.min((c.st.count || 1) - 1, emojis.length - 1)] || '🚗';
  const warm = buildWarmLines(c);

  if (c.days == null && c.km == null && c.st.count === 0) {
    card.innerHTML = `
      <div style="position:absolute;top:-20px;right:-10px;font-size:60px;opacity:.15">🚗</div>
      <div style="font-size:15px;font-weight:600">欢迎来到「我的红旗」</div>
      <div style="font-size:12px;opacity:.85;margin-top:4px">点下方「编辑爱车档案」，记录提车日期与里程，开启你和爱车的记录之旅 🎉</div>
      <button id="editProfileBtn" class="btn" style="margin-top:12px;background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.35)">✏️ 编辑爱车档案</button>`;
  } else {
    const kmDisp = c.km != null ? (c.km >= 10000 ? (c.km / 10000).toFixed(1) + '万' : c.km.toFixed(0)) : '—';
    const dayDisp = c.days != null ? c.days : '—';
    card.innerHTML = `
      <div style="position:absolute;top:-15px;right:-10px;font-size:55px;opacity:.12">${emoji}</div>
      <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px">
        <span>${escapeHtml(c.carName)}</span>
        <span style="font-size:11px;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:999px">爱车档案</span>
      </div>
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">${dayDisp}</div>
          <div style="font-size:11px;opacity:.75">相伴天数${c.daysFrom ? '（' + c.daysFrom + '）' : ''}</div>
        </div>
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">${kmDisp}</div>
          <div style="font-size:11px;opacity:.75">同行公里${c.kmFrom ? '（' + c.kmFrom + '）' : ''}</div>
        </div>
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">${c.st.count}</div>
          <div style="font-size:11px;opacity:.75">加油次数</div>
        </div>
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">¥${fmtMoney(c.st.totalA)}</div>
          <div style="font-size:11px;opacity:.75">累计花费</div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:12.5px;opacity:.9;line-height:1.7">${warm.join('<br>')}</div>
      <button id="editProfileBtn" class="btn" style="margin-top:12px;background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.35)">✏️ 编辑爱车档案</button>`;
  }

  container.appendChild(card);
  const eb = card.querySelector('#editProfileBtn');
  if (eb) eb.addEventListener('click', openCarProfileForm);
}

/* 编辑爱车档案（昵称 / 提车日期 / 行驶总里程），存回 car 对象，不依赖加油记录 */
async function openCarProfileForm() {
  const car = await getCurrentCar();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="field"><label>爱车昵称</label><input id="p_name" value="${escapeHtml(car.name || '')}" placeholder="如：我的红旗 H9" /></div>
    <div class="field"><label>提车日期（用于计算「相伴天数」）</label><input type="date" id="p_buy" value="${car.buyDate || ''}" max="${todayStr()}" /></div>
    <div class="field"><label>行驶总里程 km（用于计算「同行公里」，可不填）</label><input type="number" id="p_km" inputmode="decimal" value="${car.totalKm != null ? car.totalKm : ''}" placeholder="如 30000，可不填" /></div>
    <p class="muted" style="font-size:12px;margin:2px 0 12px">提车日期和总里程为<b>手动填写，不依赖加油记录</b>。留空则自动用加油记录推算。</p>
  `;
  openSheet('编辑爱车档案', wrap);
  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = '保存';
  save.onclick = async () => {
    const name = wrap.querySelector('#p_name').value.trim() || '我的红旗';
    const buyDate = wrap.querySelector('#p_buy').value || null;
    const kmRaw = wrap.querySelector('#p_km').value.trim();
    const totalKm = kmRaw === '' ? null : (parseFloat(kmRaw) || null);
    const updated = { ...car, name, buyDate, totalKm };
    await dbPut('cars', updated);
    if (await getCurrentCarId() === car.id) { const chip = $('#carChip'); if (chip) chip.textContent = name; }
    closeSheet();
    await refreshView();
    toast('已保存爱车档案');
  };
  wrap.appendChild(save);
}

/* 首页顶部紧凑版陪伴横幅：让情绪价值更常出现（用户诉求：放其他地方） */
async function renderCompanionshipBanner() {
  const car = await getCurrentCar();
  const recs = await getCarRecords();
  const c = computeCompanionship(car, recs);
  const banner = document.createElement('div');
  banner.className = 'companionship-banner';
  banner.style.cssText = 'background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:#fff;border-radius:14px;padding:13px 16px;margin-bottom:12px;position:relative;overflow:hidden;cursor:pointer';
  if (c.days == null && c.km == null && c.st.count === 0) {
    banner.innerHTML = `<div style="font-size:14px;font-weight:600">🚗 ${escapeHtml(c.carName)}</div><div style="font-size:12px;opacity:.85;margin-top:4px">点此编辑爱车档案，记录你们的旅程 →</div>`;
  } else {
    const kmDisp = c.km != null ? (c.km >= 10000 ? (c.km / 10000).toFixed(1) + ' 万公里' : c.km.toFixed(0) + ' 公里') : '';
    const dayPart = c.days != null ? `已陪你 <b>${c.days}</b> 天` : '';
    const kmPart = kmDisp ? `走过 <b>${kmDisp}</b>` : '';
    const sep = (dayPart && kmPart) ? ' · ' : '';
    banner.innerHTML = `<div style="font-size:14px;font-weight:600">🚗 ${escapeHtml(c.carName)}</div>
      <div style="font-size:13px;margin-top:6px;opacity:.95">${dayPart}${sep}${kmPart}</div>
      <div style="font-size:11px;opacity:.8;margin-top:4px">${buildWarmLines(c)[0] || ''} · 点此编辑</div>`;
  }
  banner.addEventListener('click', () => { location.hash = '#me'; });
  return banner;
}

/* ===== APP 版本号 ===== */
const APP_VERSION = '2.0.5';
const APP_BUILD_DATE = '2026-07-31';

async function renderMe(container) {
  container.innerHTML = '<h2>我的</h2>';

  // ===== 爱车陪伴卡片（情绪价值） =====
  await renderCompanionshipCard(container);

  const about = document.createElement('div');
  about.className = 'card';
  about.innerHTML = `<div class="card-title">关于「我的红旗」</div>
    <div class="t1" style="font-weight:600">汽车记录工作台 · PWA · v${APP_VERSION}</div>
    <div class="t2 muted" style="font-size:12px;margin-top:4px">加油记录 · 油价查询 · 养车报表 · 多车管理<br>数据存本机，可云同步永不丢失</div>
    <div style="margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span class="tag">v${APP_VERSION}</span>
      <span class="tag" style="--brand-soft:#e8f5e9;--brand:#2e7d32">${APP_BUILD_DATE} 构建</span>
      <span class="tag" style="--brand-soft:#fff3e0;--brand:#e65100">PWA 离线可用</span>
    </div>`;
  container.appendChild(about);
  await renderCarsSection(container);
  await renderCarComparison(container);   // 多车对比（2+车时显示）
  renderThemeSection(container);          // 主题外观切换
  renderSyncSection(container);
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
}

async function route(tab) {
  if (!TABS[tab]) tab = 'fuel';
  currentTab = tab;
  $('#topTitle').textContent = TABS[tab].title;
  setActiveTab(tab);
  const view = $('#view');
  view.innerHTML = '';
  await TABS[tab].render(view);
}

async function refreshView() { await route(currentTab); }

function bindUI() {
  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => { location.hash = b.getAttribute('data-tab'); });
  });
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  window.addEventListener('hashchange', () => route(location.hash.replace('#', '')));
}

async function init() {
  await openDB();
  const theme = await getSetting('theme', 'classic-red');
  applyTheme(theme);
  await ensureDefaultCar();
  try { await seedRemindersIfNeeded(); } catch (e) { /* 忽略 seed 失败，renderMaintenance 会自愈 */ }
  const car = await getCurrentCar();
  $('#carChip').textContent = car ? car.name : '我的红旗';
  bindUI();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (reg) reg.update().catch(() => {});
    }).catch(() => {});
  }
  // 检查保养提醒（延迟2秒等页面渲染完）
  setTimeout(() => checkAndNotifyReminders().catch(() => {}), 2000);
  // 每5分钟检查一次（页面打开期间）
  setInterval(() => checkAndNotifyReminders().catch(() => {}), 300000);
  // 每次打开默认进入「加油记录」，避免 PWA 恢复上次停留的 Tab（如 #me）
  const start = 'fuel';
  await route(start);
}

window.refreshView = refreshView;

/* ===== 主题换肤 ===== */
function applyTheme(theme) {
  const root = document.documentElement;
  if (!theme || theme === 'classic-red') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors = { dark: '#0f0f10', gold: '#A0780A', warm: '#f5efe7', macaron: '#EF9FC0', morandi: '#9B8FA3' };
    meta.setAttribute('content', colors[theme] || '#B42334');
  }
}

const THEMES = [
  { key: 'classic-red', name: '经典红', colors: ['#B42334', '#f0f0f2'] },
  { key: 'gold', name: '红旗金', colors: ['#A0780A', '#f7f3e8'] },
  { key: 'dark', name: '暗黑护眼', colors: ['#1a1a1d', '#0f0f10'] },
  { key: 'warm', name: '暖色护眼', colors: ['#9e7a55', '#f5efe7'] },
  { key: 'macaron', name: '马卡龙糖果', colors: ['#EF9FC0', '#F8F5FB'] },
  { key: 'morandi', name: '莫兰迪', colors: ['#9B8FA3', '#EDEAE6'] },
];

function renderThemeSection(container) {
  const cur = document.documentElement.getAttribute('data-theme') || 'classic-red';
  let html = '<div class="card"><div class="card-title">🎨 主题外观</div><div class="theme-grid">';
  for (const t of THEMES) {
    html += `<div class="theme-opt ${t.key === cur ? 'active' : ''}" data-theme="${t.key}">
      <div class="theme-swatch" style="background:linear-gradient(135deg, ${t.colors[0]} 0 50%, ${t.colors[1]} 50% 100%)"></div>
      <div class="theme-name">${t.name}</div>
    </div>`;
  }
  html += '</div><p class="muted" style="font-size:12px;margin:10px 0 0">切换即时生效，自动记住你的选择。</p></div>';
  container.insertAdjacentHTML('beforeend', html);

  container.querySelectorAll('.theme-opt').forEach((el) => {
    el.addEventListener('click', async () => {
      const key = el.getAttribute('data-theme');
      await setSetting('theme', key);
      applyTheme(key);
      container.querySelectorAll('.theme-opt').forEach((o) => o.classList.toggle('active', o.getAttribute('data-theme') === key));
      toast('已切换主题');
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
