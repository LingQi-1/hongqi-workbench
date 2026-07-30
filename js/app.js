/* 应用入口：路由 + 初始化 */

const TABS = {
  fuel: { title: '加油记录', render: renderFuel },
  price: { title: '油价', render: renderPrice },
  report: { title: '养车报表', render: renderReport },
  maintenance: { title: '保养', render: renderMaintenance },
  me: { title: '我的', render: renderMe }
};
let currentTab = 'fuel';

/* ===== 爱车陪伴卡片（情绪价值） ===== */
async function renderCompanionshipCard(container) {
  const car = await getCurrentCar();
  const recs = await getCarRecords();
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'background:linear-gradient(135deg, #B42334 0%, #8e1a28 100%);color:#fff;border:none;overflow:hidden;position:relative';

  if (recs.length === 0) {
    card.innerHTML = `
      <div style="position:absolute;top:-20px;right:-10px;font-size:60px;opacity:.15">🚗</div>
      <div style="font-size:15px;font-weight:600">欢迎来到「我的红旗」</div>
      <div style="font-size:12px;opacity:.8;margin-top:4px">添加第一条加油记录，开启你和爱车的记录之旅 🎉</div>`;
  } else {
    const firstDate = recs[recs.length - 1].date; // 最早的一条
    const daysSinceFirst = Math.max(1, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86400000));
    const st = fuelStats(recs);

    // 计算里程
    const withOdo = recs.filter((r) => r.odometer != null && r.odometer !== '' && !isNaN(parseFloat(r.odometer))).map((r) => ({ ...r, odo: parseFloat(r.odometer) })).sort((a, b) => (a.date < b.date ? -1 : 1));
    let totalKm = 0;
    if (withOdo.length >= 2) {
      totalKm = Math.max(0, withOdo[withOdo.length - 1].odo - withOdo[0].odo);
    }

    // 暖心文案生成
    const warmMessages = [];
    if (daysSinceFirst >= 365) warmMessages.push(`🎂 你们已经相伴 ${Math.floor(daysSinceFirst / 365)} 年零 ${(daysSinceFirst % 365)} 天了`);
    else if (daysSinceFirst >= 30) warmMessages.push(`💕 你们已经相伴 ${daysSinceFirst} 天了`);
    else warmMessages.push(`🌱 刚刚开始你们的旅程，第 ${daysSinceFirst} 天`);
    if (totalKm > 0) {
      if (totalKm >= 10000) warmMessages.push(`🛣️ 一同走过 ${(totalKm / 10000).toFixed(1)} 万公里`);
      else warmMessages.push(`🛣️ 一同走过 ${totalKm.toFixed(0)} 公里`);
    }
    if (st.count >= 10) warmMessages.push(`⛽ 为它加油 ${st.count} 次，每次都是满满的爱`);
    else if (st.count > 0) warmMessages.push(`⛽ 已记录 ${st.count} 次加油`);

    // 根据数据量选一个emoji装饰
    const emojis = ['❤️', '🌟', '✨', '🔥', '💪', '🏆'];
    const emoji = emojis[Math.min(recs.length - 1, emojis.length - 1)] || '🚗';

    card.innerHTML = `
      <div style="position:absolute;top:-15px;right:-10px;font-size:55px;opacity:.12">${emoji}</div>
      <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px">
        <span>${car ? escapeHtml(car.name) : '我的红旗'}</span>
        <span style="font-size:11px;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:999px">爱车档案</span>
      </div>
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">${daysSinceFirst}</div>
          <div style="font-size:11px;opacity:.75">相伴天数</div>
        </div>
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">${totalKm >= 10000 ? (totalKm/10000).toFixed(1)+'万' : (totalKm > 0 ? totalKm.toFixed(0) : '—')}</div>
          <div style="font-size:11px;opacity:.75">同行公里</div>
        </div>
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">${st.count}</div>
          <div style="font-size:11px;opacity:.75">加油次数</div>
        </div>
        <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700">¥${fmtMoney(st.totalA)}</div>
          <div style="font-size:11px;opacity:.75">累计花费</div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:12.5px;opacity:.9;line-height:1.7">${warmMessages.join('<br>')}</div>`;
  }

  container.appendChild(card);
}

/* ===== APP 版本号 ===== */
const APP_VERSION = '2.0.0';
const APP_BUILD_DATE = '2026-07-30';

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
  const start = location.hash.replace('#', '') || 'fuel';
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
    const colors = { dark: '#0f0f10', gold: '#A0780A', warm: '#f5efe7' };
    meta.setAttribute('content', colors[theme] || '#B42334');
  }
}

const THEMES = [
  { key: 'classic-red', name: '经典红', colors: ['#B42334', '#f0f0f2'] },
  { key: 'gold', name: '红旗金', colors: ['#A0780A', '#f7f3e8'] },
  { key: 'dark', name: '暗黑护眼', colors: ['#1a1a1d', '#0f0f10'] },
  { key: 'warm', name: '暖色护眼', colors: ['#9e7a55', '#f5efe7'] },
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
