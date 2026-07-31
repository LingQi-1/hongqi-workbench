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
    if (c.days >= 365) lines.push(`🎂 我陪了主人 ${Math.floor(c.days / 365)} 年零 ${c.days % 365} 天啦`);
    else if (c.days >= 30) lines.push(`💕 我已经陪了主人 ${c.days} 天`);
    else lines.push(`🌱 刚和主人开启旅程，第 ${c.days} 天`);
  }
  if (c.km != null) {
    lines.push(c.km >= 10000 ? `🛣️ 陪主人走过 ${(c.km / 10000).toFixed(1)} 万公里` : `🛣️ 陪主人走过 ${c.km.toFixed(0)} 公里`);
  }
  if (c.st.count >= 10) lines.push(`⛽ 主人给我加了 ${c.st.count} 次油，每次都满满的爱`);
  else if (c.st.count > 0) lines.push(`⛽ 主人已给我加 ${c.st.count} 次油`);
  if (lines.length === 0) lines.push('点「编辑爱车档案」，让主人记录提车日期与里程，开启我们的专属故事 💝');
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
    <div class="field"><label>爱车头像</label>
      <div class="avatar-picker" id="avatarPicker">
        ${CAR_AVATARS.map(a => `<span class="avatar-opt ${((car.avatar || '🚗') === a) ? 'active' : ''}" data-av="${a}">${a}</span>`).join('')}
      </div>
      <label class="upload-btn">📷 上传图片<input type="file" id="p_avatar_file" accept="image/*" hidden></label>
      <input type="hidden" id="p_avatar" value="${escapeHtml(car.avatar || '🚗')}">
    </div>
    <div class="field"><label>提车日期（用于计算「相伴天数」）</label><input type="date" id="p_buy" value="${car.buyDate || ''}" max="${todayStr()}" /></div>
    <div class="field"><label>行驶总里程 km（用于计算「同行公里」，可不填）</label><input type="number" id="p_km" inputmode="decimal" value="${car.totalKm != null ? car.totalKm : ''}" placeholder="如 30000，可不填" /></div>
    <p class="muted" style="font-size:12px;margin:2px 0 12px">提车日期和总里程为<b>手动填写，不依赖加油记录</b>。留空则自动用加油记录推算。</p>
  `;
  openSheet('编辑爱车档案', wrap);

  // 头像选择（emoji / 上传图）
  const avInput = wrap.querySelector('#p_avatar');
  wrap.querySelectorAll('.avatar-opt').forEach(o => {
    o.addEventListener('click', () => {
      avInput.value = o.getAttribute('data-av');
      wrap.querySelectorAll('.avatar-opt').forEach(x => x.classList.toggle('active', x === o));
    });
  });
  const fileInput = wrap.querySelector('#p_avatar_file');
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      avInput.value = reader.result;
      wrap.querySelectorAll('.avatar-opt').forEach(x => x.classList.remove('active'));
      toast('已选择图片');
    };
    reader.readAsDataURL(f);
  });

  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = '保存';
  save.onclick = async () => {
    const name = wrap.querySelector('#p_name').value.trim() || '我的红旗';
    const buyDate = wrap.querySelector('#p_buy').value || null;
    const kmRaw = wrap.querySelector('#p_km').value.trim();
    const totalKm = kmRaw === '' ? null : (parseFloat(kmRaw) || null);
    const avatar = avInput.value || '🚗';
    const updated = { ...car, name, buyDate, totalKm, avatar };
    await dbPut('cars', updated);
    if (await getCurrentCarId() === car.id) { const chip = $('#carChip'); if (chip) chip.textContent = name; }
    closeSheet();
    await refreshView();
    toast('已保存爱车档案');
  };
  wrap.appendChild(save);
}

/* 首页顶部紧凑版陪伴横幅：标准融合 3D 车模（第三波） + 情绪价值
 * 左侧为可旋转 3D 车模（无 WebGL/离线时降级为静态头像），右侧保留车名/状态语/温暖语；点击文字区进入「我的」页
 */
async function renderCompanionshipBanner() {
  const car = await getCurrentCar();
  const recs = await getCarRecords();
  const c = computeCompanionship(car, recs);
  const banner = document.createElement('div');
  banner.className = 'companionship-banner home3d-banner';
  banner.style.cssText = 'background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:#fff;border-radius:16px;padding:14px 16px;margin-bottom:14px;position:relative;overflow:hidden';
  const avatarHtml = (car.avatar && car.avatar.startsWith('data:'))
    ? `<img src="${escapeHtml(car.avatar)}" alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover">`
    : `<span style="font-size:40px;line-height:1">${escapeHtml(car.avatar || '🚗')}</span>`;

  // 左侧 3D 区块（含降级 fallback：静态头像）
  const leftHtml = `
    <div class="home3d-wrap" style="width:46%;height:104px;flex-shrink:0;position:relative;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center">
      <canvas class="home3d-canvas" style="width:100%;height:100%;display:block;touch-action:none"></canvas>
      <div class="home3d-fallback" style="display:none;align-items:center;justify-content:center;width:100%;height:100%">${avatarHtml}</div>
      <div class="home3d-hint" style="position:absolute;left:6px;bottom:5px;font-size:10px;background:rgba(0,0,0,.35);padding:2px 6px;border-radius:8px;pointer-events:none">🖐 拖动旋转</div>
    </div>`;

  let rightHtml;
  if (c.days == null && c.km == null && c.st.count === 0) {
    rightHtml = `<div style="font-size:16px;font-weight:600">${escapeHtml(c.carName)}</div>
      <div style="font-size:13px;opacity:.85;margin-top:5px;line-height:1.45">去完善爱车档案，开启你们的旅程 →</div>`;
  } else {
    const kmDisp = c.km != null ? (c.km >= 10000 ? (c.km / 10000).toFixed(1) + ' 万公里' : c.km.toFixed(0) + ' 公里') : '';
    const dayPart = c.days != null ? `已陪你 <b>${c.days}</b> 天` : '';
    const kmPart = kmDisp ? `走过 <b>${kmDisp}</b>` : '';
    const sep = (dayPart && kmPart) ? ' · ' : '';
    const line0 = buildWarmLines(c)[0] || '';
    rightHtml = `<div style="font-size:16px;font-weight:600">${escapeHtml(c.carName)}</div>
      <div style="font-size:13.5px;margin-top:5px;opacity:.95;line-height:1.4">${dayPart}${sep}${kmPart}</div>
      ${line0 ? `<div style="font-size:12.5px;opacity:.8;margin-top:4px;line-height:1.35">${line0}</div>` : ''}`;
  }

  banner.innerHTML = `<div style="display:flex;align-items:center;gap:12px">${leftHtml}<div style="flex:1;min-width:0">${rightHtml}</div></div>`;

  // 点击文字区进入「我的」页（3D 区域阻止冒泡，避免拖动旋转时误跳转）
  banner.addEventListener('click', () => { location.hash = '#me'; });
  const wrap3d = banner.querySelector('.home3d-wrap');
  if (wrap3d) wrap3d.addEventListener('click', (e) => e.stopPropagation());
  return banner;
}

/* ===== APP 版本号 ===== */
const APP_VERSION = '2.0.9';
const APP_BUILD_DATE = '2026-07-31';

async function renderMe(container) {
  container.innerHTML = '';
  const h2 = document.createElement('h2'); h2.textContent = '我的'; container.appendChild(h2);

  try {
    // ① 车头区（头像 + 昵称 + 第一人称状态语）—— buildCarStatusLine 内部已有 2s 超时保护
    await renderCarHeader(container);
    // ② 爱车陪伴卡片（第一人称，情绪价值）
    await renderCompanionshipCard(container);
    // ③ 里程碑圆环（累计总里程 + 破千撒花）
    await renderMilestoneRing(container);
    // ④ 每日车语
    await renderDailyQuote(container);
    // ⑤ 爱车档案（多车管理）
    await renderCarsSection(container);
    await renderCarComparison(container);   // 多车对比（2+车时显示）
    // ⑥ 主题外观切换
    renderThemeSection(container);
    // ⑦ 关于 / 版本号
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
    renderSyncSection(container);
  } catch (e) {
    console.error('[红旗] 我的页渲染异常:', e);
    // 仅在完全无任何内容时显示错误页，避免覆盖已渲染的部分内容
    if (!container.querySelector('.car-header, .card, .milestone-card, .daily-quote')) {
      container.innerHTML = '<h2>我的</h2><div class="card"><p style="color:var(--muted);padding:12px">页面加载遇到问题，请<a href="#" onclick="location.reload()">刷新重试</a></p><button class="btn" onclick="location.reload()" style="margin-top:8px">🔄 刷新页面</button></div>';
    }
  }
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
}

let routeSeq = 0; // 渲染序列号：保证只有最新的路由结果生效，避免并发渲染互相覆盖/卡死
async function route(tab) {
  if (!TABS[tab]) tab = 'fuel';
  // 切页时释放首页 3D 渲染，避免 WebGL 上下文泄漏
  if (typeof window.__home3dDispose === 'function') { try { window.__home3dDispose(); } catch (e) {} }
  const seq = ++routeSeq;
  currentTab = tab;
  // 静默同步 hash（replaceState 不触发 hashchange，避免和点击路由重复/冲突）
  try { if (location.hash.replace('#', '') !== tab) history.replaceState(null, '', '#' + tab); } catch (e) {}
  $('#topTitle').textContent = TABS[tab].title;
  setActiveTab(tab);
  const view = $('#view');
  view.innerHTML = '';
  await TABS[tab].render(view);
  if (seq !== routeSeq) return; // 已有更新的路由开始，放弃本次结果（不会卡死）
}

async function refreshView() { await route(currentTab); }

function bindUI() {
  document.querySelectorAll('.tab').forEach((b) => {
    // 点击直接路由，彻底不依赖 hashchange（修复：默认进加油页后点"我的"无反应）
    b.addEventListener('click', () => route(b.getAttribute('data-tab')));
  });
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  // 仅响应浏览器前进/后退造成的 hash 变化；加载时不依赖 hash 决定初始页（始终默认加油）
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h && TABS[h] && h !== currentTab) route(h);
  });
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

/* ===== 第一波新功能（v2.0.7）：车头区 / 里程碑圆环 / 每日车语 / 拟人IP ===== */

const CAR_AVATARS = ['🚗','🚕','🚙','🏎️','🚓','🚐','🛻','🔥','⚡','🌟','❤️','🐯','🦁','🐉','🌈','💎'];

/* ① 车头区：头像 + 昵称 + 第一人称状态语 */
async function renderCarHeader(container) {
  const car = await getCurrentCar();
  const recs = await getCarRecords();
  const header = document.createElement('div');
  header.className = 'car-header';
  const av = car.avatar || '🚗';
  const isImg = typeof av === 'string' && av.startsWith('data:');
  const status = await buildCarStatusLine(car, recs);
  header.innerHTML = `
    <div class="car-avatar">${isImg ? `<img src="${escapeHtml(av)}" alt="">` : escapeHtml(av)}</div>
    <div class="car-head-info">
      <div class="car-name">${escapeHtml(car.name || '我的红旗')}</div>
      <div class="car-status">${escapeHtml(status)}</div>
    </div>
    <div class="car-head-edit">✎</div>`;
  header.addEventListener('click', openCarProfileForm);
  container.appendChild(header);
}

/* 第一人称状态语（基于真实数据动态生成）—— 带超时保护，绝不卡住页面 */
async function buildCarStatusLine(car, recs) {
  const DEFAULT_STATUS = '点这里编辑我，给我起个名字吧 💬';
  // 保养到期优先提示（2秒超时）
  let hasDue = false;
  try {
    const reminders = await withTimeout(dbGetAll('reminders'), 2000, '读取保养提醒');
    const odo = await withTimeout(getLatestOdometerSafe(), 1500, '读取里程');
    for (const r of reminders) { if (typeof checkReminderDue === 'function' && checkReminderDue(r, odo)) { hasDue = true; break; } }
  } catch (e) { /* 超时或失败，跳过保养检查 */ }
  if (hasDue) return '我有点饿了，该去做保养咯 🔧';
  // 最近一次加油油号
  const sorted = [...recs].filter(r => r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted[sorted.length - 1];
  const grade = last && last.grade ? last.grade : '';
  if (grade) return `今天主人又带我喝 ${grade} 号油啦，真香~`;
  if (car && car.buyDate) return '今天也要开开心心陪主人出门呀 ✨';
  return DEFAULT_STATUS;
}

/* 安全超时工具（与 maintenance.js 共用逻辑） */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error((label || '操作') + ' 超时')), ms);
    Promise.resolve(promise).then(resolve).catch(reject).finally(() => clearTimeout(t));
  });
}

/* 安全读取最新里程（不依赖 maintenance.js 的实现） */
async function getLatestOdometerSafe() {
  try {
    const recs = await getCarRecords();
    const w = recs.filter(r => r.odometer != null && r.odometer !== '' && !isNaN(parseFloat(r.odometer)))
      .map(r => ({ ...r, odo: parseFloat(r.odometer) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return w.length ? w[w.length - 1].odo : 0;
  } catch (e) { return 0; }
}

/* ③ 里程碑圆环（累计总里程 + 破千撒花） */
async function renderMilestoneRing(container) {
  const car = await getCurrentCar();
  const recs = await getCarRecords();
  const c = computeCompanionship(car, recs);
  const totalKmRaw = (car && car.totalKm != null && !isNaN(parseFloat(car.totalKm)))
    ? parseFloat(car.totalKm) : (c.km != null ? c.km : 0);
  const totalKm = Math.max(0, totalKmRaw);

  const seg = 10000;
  const prev = Math.floor(totalKm / seg) * seg;
  const next = prev + seg;
  const pct = totalKm > 0 ? (totalKm - prev) / (next - prev) : 0;
  const earth = totalKm > 0 ? (totalKm / 40075).toFixed(2) : '0';
  const R = 52, C = 2 * Math.PI * R;
  const dash = (pct * C).toFixed(1);

  const card = document.createElement('div');
  card.className = 'card milestone-card';
  card.innerHTML = `
    <div class="card-title">🏁 里程里程碑</div>
    <div class="milestone-ring">
      <svg viewBox="0 0 120 120" class="ring-svg">
        <circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"></circle>
        <circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--brand)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dash} ${C}" transform="rotate(-90 60 60)"></circle>
      </svg>
      <div class="ring-center">
        <div class="ring-km">${totalKm > 0 ? totalKm.toLocaleString('zh-CN') : '—'}</div>
        <div class="ring-unit">累计公里</div>
      </div>
    </div>
    <div class="milestone-foot">
      <span>距 ${(next - totalKm).toLocaleString('zh-CN')} km 破 ${(next / 10000).toFixed(0)} 万</span>
      <span>🌍 绕地球 ${earth} 圈</span>
    </div>`;
  container.appendChild(card);

  // 破千撒花（每累计满 1000km 触发一次）
  try {
    const last = Number(await getSetting('lastMilestoneKm', 0)) || 0;
    if (totalKm > 0 && Math.floor(totalKm / 1000) > Math.floor(last / 1000)) {
      launchConfetti();
      await setSetting('lastMilestoneKm', Math.floor(totalKm / 1000) * 1000);
      toast('🎉 里程又破千啦！');
    }
  } catch (e) {}
}

/* ④ 每日车语（本地语料，按日期稳定轮换） */
const DAILY_QUOTES = [
  '车是移动的家，善待它，它陪你走更远的路。',
  '保养不偷懒，关键时刻它才不掉链子。',
  '胎压每月查一次，安全又省油。',
  '冷车启动别猛轰油门，温柔点它更耐用。',
  '机油是发动机的血液，按时换才有劲。',
  '雨天行车，轮胎花纹深度别低于 1.6mm。',
  '长途前检查玻璃水和刹车油，省心一半。',
  '怠速热车 30 秒足够，长时间原地热车反而伤车。',
  '加油别等亮灯，油泵靠油冷却，太低易坏。',
  '方向盘跑偏？先做四轮定位再看。',
  '空调滤芯一年换一次，呼吸更健康。',
  '刹车有异响，别拖，八成是片磨没了。',
  '夏天别把打火机放车内，暴晒易炸。',
  '雨雪天保持车距，刹车距离是平时的两倍。',
  '变速箱油别忘换，很多车主都忽略。',
  '洗车别用洗衣粉，伤漆；用专用洗车液。',
  '停车回正方向盘，保护转向系统。',
  '备胎也要定期检查，不然用时才发现没气。',
  '导航更新了，陌生路段少走冤枉路。',
  '车灯不只是照明，更是让别人看见你。',
  '发动机积碳？偶尔拉拉高速有帮助。',
  '雨刮器一年换一对，别等刮不干净。',
  '高速上错过出口别急刹，下个出口绕回来。',
  '儿童乘车用安全座椅，后排更安全。',
  '夜间会车切近光，是修养也是安全。',
  '定期清理发动机舱灰尘，散热更好。',
  '加油标号按厂家建议，不是越贵越好。',
  '电瓶寿命约 3-5 年，亏电前常有征兆。',
  '底盘装甲能防锈，南方潮湿尤其值得。',
  '自驾游前做个全面检查，旅途更安心。',
  '车漆有小划痕，及时补漆笔点一下防生锈。',
  ' Eco 模式省油，但超车时要切回普通。',
  '冬天玻璃水用防冻型，别用自来水。',
  '安全带是最便宜的保命配置，必系。',
  '转向助力油也要换，很多手册都写了。',
  '车越爱惜，二手越值钱。',
  '记录每次加油，心里有本明白账。',
  '陪你通勤的每一公里，都是生活的一部分。',
  '车不在贵，顺手就好；路不在远，平安就好。',
  '好好养车，也是好好生活。'
];

function pickDailyQuote() {
  const now = new Date();
  const key = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
  return DAILY_QUOTES[((key % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length];
}

async function renderDailyQuote(container) {
  const q = pickDailyQuote();
  const el = document.createElement('div');
  el.className = 'card daily-quote';
  el.innerHTML = `<div class="card-title">💡 每日车语 · ${todayStr()}</div>
    <div class="quote-text">${escapeHtml(q)}</div>`;
  container.appendChild(el);
}

/* 轻量撒花（canvas，无外部依赖，PWA 离线可用） */
function launchConfetti() {
  try {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const colors = ['#B42334', '#A0780A', '#EF9FC0', '#9B8FA3', '#16a34a', '#ffb300'];
    const N = 120;
    const ps = [];
    for (let i = 0; i < N; i++) {
      ps.push({
        x: Math.random() * W, y: -20 - Math.random() * H * 0.5,
        r: 4 + Math.random() * 5, c: colors[i % colors.length],
        vy: 2 + Math.random() * 3, vx: -2 + Math.random() * 4,
        rot: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4
      });
    }
    let t = 0;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of ps) {
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        if (p.y < H + 20) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); ctx.restore();
      }
      t++;
      if (alive && t < 200) requestAnimationFrame(frame);
      else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    requestAnimationFrame(frame);
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', init);
