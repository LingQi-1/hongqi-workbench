/* 应用入口：路由 + 初始化 */

const TABS = {
  fuel: { title: '加油记录', render: renderFuel },
  price: { title: '油价', render: renderPrice },
  report: { title: '养车报表', render: renderReport },
  maintenance: { title: '保养', render: renderMaintenance },
  me: { title: '我的', render: renderMe }
};
let currentTab = 'fuel';

async function renderMe(container) {
  container.innerHTML = '<h2>我的</h2>';
  const about = document.createElement('div');
  about.className = 'card';
  about.innerHTML = `<div class="card-title">关于「我的红旗」</div>
    <div class="t1" style="font-weight:600">汽车记录工作台 · PWA</div>
    <div class="t2 muted" style="font-size:12px;margin-top:4px">加油记录 · 油价查询 · 养车报表 · 多车管理<br>数据存本机，可云同步永不丢失</div>`;
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
      if (reg) reg.update().catch(() => {}); // 主动检查更新，避免卡在旧SW
    }).catch(() => {});
  }
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
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1c1c1e' : (theme === 'gold' ? '#B8860B' : '#C8102E'));
}

const THEMES = [
  { key: 'classic-red', name: '经典红', colors: ['#C8102E', '#f5f5f7'] },
  { key: 'gold', name: '红旗金', colors: ['#B8860B', '#faf7f0'] },
  { key: 'dark', name: '暗黑模式', colors: ['#1c1c1e', '#f2f2f7'] },
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
