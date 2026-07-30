/* 应用入口：路由 + 初始化 */

const TABS = {
  fuel: { title: '加油记录', render: renderFuel },
  price: { title: '油价', render: renderPrice },
  me: { title: '我的', render: renderMe }
};
let currentTab = 'fuel';

async function renderMe(container) {
  container.innerHTML = '<h2>我的</h2>';
  const about = document.createElement('div');
  about.className = 'card';
  about.innerHTML = `<div class="card-title">关于「我的红旗」</div>
    <div class="t1" style="font-weight:600">汽车记录工作台 · PWA</div>
    <div class="t2 muted" style="font-size:12px;margin-top:4px">加油记录 · 油价查询 · 多车管理<br>数据存本机，可云同步永不丢失</div>`;
  container.appendChild(about);
  await renderCarsSection(container);
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
document.addEventListener('DOMContentLoaded', init);
