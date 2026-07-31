/* 保养提醒：独立 Tab 页面（从 sync.js 抽出） */

const REMINDER_TEMPLATES = [
  { key: 'oil', label: '机油保养', icon: '🛢️', unit: 'km', defaultInterval: 5000 },
  { key: 'tire', label: '轮胎检查', icon: '🛞', unit: 'km', defaultInterval: 20000 },
  { key: 'inspect', label: '年检', icon: '📋', unit: 'date', defaultInterval: 365 },
  { key: 'insurance', label: '保险到期', icon: '🛡️', unit: 'date', defaultInterval: 365 },
];

/* ===== 首次使用：填充默认保养提醒，避免模块空白 ===== */
async function seedRemindersIfNeeded() {
  const seeded = await getSetting('remindersSeeded', false);
  if (seeded) return;
  let list = [];
  try { list = await dbGetAll('reminders'); }
  catch (e) {
    console.warn('[红旗] reminders 仓储读取失败（可能不存在）:', e.message || e);
    list = []; // 仓储不存在时当作空列表，继续走 seed 流程
  }
  if (list.length > 0) { await setSetting('remindersSeeded', true); return; }
  try {
    const seeds = [
      { type: 'oil', label: '机油保养', interval: 5000, unit: 'km' },
      { type: 'tire', label: '轮胎检查', interval: 20000, unit: 'km' },
      { type: 'inspect', label: '车辆年检', interval: 365, unit: 'date' },
      { type: 'insurance', label: '保险到期', interval: 365, unit: 'date' },
    ];
    for (const s of seeds) {
      await dbPut('reminders', {
        id: uid(), type: s.type, label: s.label, interval: s.interval, unit: s.unit,
        lastOdo: null, lastDate: null, createdAt: Date.now()
      });
    }
    await setSetting('remindersSeeded', true);
    console.log('[红旗] 已填充', seeds.length, '条默认保养提醒');
  } catch (e) {
    console.error('[红旗] seedReminders 失败:', e.message || e);
    throw e; // 向上抛出，让调用方知道失败了
  }
}

/* ===== 保养到期检查 & 通知 ===== */
let _lastNotifiedMap = {}; // 防止重复通知

async function checkAndNotifyReminders() {
  const reminders = await dbGetAll('reminders');
  const latestOdo = await getLatestOdometer();
  const now = Date.now();
  const urgentItems = [];

  for (const r of reminders) {
    // 节流：同一提醒5分钟内不重复通知
    if (_lastNotifiedMap[r.id] && now - _lastNotifiedMap[r.id] < 300000) continue;

    const isDue = checkReminderDue(r, latestOdo);
    if (!isDue) {
      // 检查是否即将到期（20%以内）
      const st = formatReminderStatus(r, latestOdo);
      if (!st.urgent) continue;
    }

    const tpl = REMINDER_TEMPLATES.find((t) => t.key === r.type) || {};
    const st = formatReminderStatus(r, latestOdo);
    urgentItems.push({ r, tpl, st });
    _lastNotifiedMap[r.id] = now;
  }

  if (urgentItems.length === 0) return;

  // 1. 页面内弹窗提示
  const msg = urgentItems.map((item) => `⚠️ ${item.tpl.icon} ${item.r.label || item.tpl.label}：${item.st.text}`).join('\n');
  showMaintenanceAlert(msg);

  // 2. 浏览器推送通知（如果已授权）
  if ('Notification' in window && Notification.permission === 'granted') {
    for (const item of urgentItems) {
      try {
        new Notification('🚗 我的红旗 - 保养提醒', {
          body: `${item.r.label || item.tpl.label}：${item.st.text}`,
          icon: 'icon.svg',
          tag: `rmd-${item.r.id}`, // 相同tag会替换而非堆叠
        });
      } catch (e) { /* 忽略通知失败 */ }
    }
  }
}

function showMaintenanceAlert(msg) {
  // 创建一个全局的保养提醒弹窗
  const existing = document.getElementById('maintenanceAlert');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'maintenanceAlert';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,.45); animation:fadeIn .2s ease;
  `;
  overlay.innerHTML = `
    <div style="background:var(--card); border-radius:18px; padding:24px 20px; margin:20px; max-width:340px; width:100%; text-align:center; animation:slideUp .25s ease">
      <div style="font-size:40px;margin-bottom:8px">🔔</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:10px">保养提醒</div>
      <pre style="font-family:inherit;font-size:14px;color:var(--text);white-space:pre-wrap;line-height:1.6;margin:0 0 16px;text-align:left;background:var(--bg);padding:12px;border-radius:10px">${msg}</pre>
      <div style="display:flex;gap:8px">
        <button id="alertLater" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-size:14px">稍后提醒</button>
        <button id="alertGo" style="flex:1;padding:10px;border-radius:10px;border:none;background:var(--brand);color:#fff;font-size:14px;font-weight:600">去查看</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#alertLater').onclick = () => overlay.remove();
  overlay.querySelector('#alertGo').onclick = () => {
    overlay.remove();
    location.hash = '#maintenance';
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* 请求通知权限 */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') toast('推送通知已开启，到期时会收到提醒');
    }).catch(() => {});
  }
}

function checkReminderDue(r, latestOdo) {
  if (r.unit === 'km') {
    if (!latestOdo || !r.lastOdo) return false;
    return (latestOdo - r.lastOdo) >= r.interval;
  } else {
    if (!r.lastDate) return false;
    const days = Math.floor((Date.now() - new Date(r.lastDate).getTime()) / 86400000);
    return days >= r.interval;
  }
}

function formatReminderStatus(r, latestOdo) {
  if (r.unit === 'km') {
    if (!latestOdo || !r.lastOdo) return { text: '未设置', ok: false, urgent: false };
    const remain = r.interval - (latestOdo - r.lastOdo);
    if (remain <= 0) return { text: '⚠️ 已超期 ' + Math.abs(remain).toFixed(0) + ' km', ok: false, urgent: true };
    if (remain < r.interval * 0.2) return { text: '即将到期（剩 ' + remain.toFixed(0) + ' km）', ok: true, urgent: true };
    return { text: '正常（剩 ' + remain.toFixed(0) + ' km）', ok: true, urgent: false };
  } else {
    if (!r.lastDate) return { text: '未设置', ok: false, urgent: false };
    const days = Math.floor((Date.now() - new Date(r.lastDate).getTime()) / 86400000);
    const remain = r.interval - days;
    if (remain <= 0) return { text: '⚠️ 已超期 ' + Math.abs(remain) + ' 天', ok: false, urgent: true };
    if (remain < r.interval * 0.2) return { text: '即将到期（剩 ' + remain + ' 天）', ok: true, urgent: true };
    return { text: '正常（剩 ' + remain + ' 天）', ok: true, urgent: false };
  }
}

async function getLatestOdometer() {
  const id = await getCurrentCarId();
  const recs = await dbGetAll('records');
  const carRecs = recs.filter((r) => r.carId === id && r.odometer != null && r.odometer !== '');
  if (carRecs.length === 0) return null;
  return Math.max(...carRecs.map((r) => parseFloat(r.odometer)));
}

async function renderMaintenance(container) {
  // 先显示加载态
  container.innerHTML = '<h2>保养提醒</h2><div style="text-align:center;padding:40px 0;color:var(--muted);font-size:14px">⏳ 加载中...</div>';

  let reminders = [];
  try { reminders = await dbGetAll('reminders'); }
  catch (e) {
    console.warn('[红旗] reminders 首次读取失败，尝试 seed:', e.message || e);
    // 仓储可能不存在，先 seed（seed 内部会再尝试读，db.js 自愈会重建仓储）
    try { await seedRemindersIfNeeded(); reminders = await dbGetAll('reminders'); }
    catch (e2) {
      console.error('[红旗] reminders 仍然不可用:', e2.message || e2);
      reminders = [];
    }
  }

  // 自愈：列表为空时补填充默认保养项
  if (reminders.length === 0) {
    try {
      await seedRemindersIfNeeded();
      reminders = await dbGetAll('reminders').catch(() => []);
    } catch (e) { /* 最终兜底，显示空态 */ }
  }

  const latestOdo = await getLatestOdometer();

  let html = '<h2>保养提醒</h2>';
  html += '<div class="card"><div class="card-title">🔔 我的保养计划</div>';

  // 状态总览
  let urgentCount = 0;
  for (const r of reminders) {
    if (checkReminderDue(r, latestOdo)) urgentCount++;
  }
  if (urgentCount > 0) {
    html += `<div class="info-line" style="background:#fef3cd;color:#856404;border-color:#ffc107">⚠️ 有 ${urgentCount} 项保养已到期或即将到期，请检查！</div>`;
  } else if (reminders.length > 0) {
    html += `<div class="info-line" style="background:var(--brand-soft);color:var(--brand);border-color:var(--brand)">✅ 保养计划正常，暂无到期项</div>`;
  }

  // 列表
  if (reminders.length === 0) {
    html += '<div class="muted" style="font-size:13px;padding:10px 0">暂未添加保养提醒，点击下方按钮添加。</div>';
  } else {
    for (const r of reminders) {
      const tpl = REMINDER_TEMPLATES.find((t) => t.key === r.type) || {};
      const st = formatReminderStatus(r, latestOdo);
      html += `<div class="item" data-rid="${r.id}" style="cursor:pointer">
        <span style="font-size:22px">${tpl.icon || '📌'}</span>
        <div class="main">
          <div class="t1">${escapeHtml(r.label || tpl.label || r.type)}</div>
          <div class="t2" style="${st.urgent && !st.ok ? 'color:var(--brand);font-weight:600' : (st.urgent ? 'color:#b8860b' : '')}">${st.text}</div>
        </div>
        <span class="del" data-rid="${r.id}">&times;</span>
      </div>`;
    }
  }

  html += `<button class="btn" id="addRmdBtn" style="margin-top:12px">+ 添加保养提醒</button>`;

  // 推送通知开关
  const notifStatus = 'Notification' in window ? (Notification.permission === 'granted' ? '已开启' : Notification.permission === 'denied' ? '已拒绝' : '未开启') : '不支持';
  html += `<div class="card" style="margin-top:12px"><div class="card-title">📱 推送通知</div>
    <div class="setting-row"><span class="label">到期浏览器推送</span><button id="notifBtn" class="btn sm ${Notification.permission === 'granted' ? 'ghost' : ''}" style="width:auto">${notifStatus} · 点此设置</button></div>
    <p class="muted" style="font-size:11px;margin:6px 0 0">开启后，保养到期时即使不在本页面也会收到系统提醒。</p></div>`;

  html += '</div>';
  container.innerHTML = html;

  // 删除
  container.querySelectorAll('[data-rid].del').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('删除此提醒？')) return;
      await dbDel('reminders', b.getAttribute('data-rid'));
      await refreshView();
      toast('已删除');
    });
  });

  // 点击编辑
  container.querySelectorAll('[data-rid].item').forEach((el) => {
    el.addEventListener('click', () => openReminderForm(el.getAttribute('data-rid')));
  });

  // 新增
  container.querySelector('#addRmdBtn').addEventListener('click', () => openReminderForm());

  // 推送通知
  const notifBtn = container.querySelector('#notifBtn');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      if (!('Notification' in window)) { toast('您的浏览器不支持推送通知'); return; }
      if (Notification.permission === 'denied') { toast('请在浏览器设置中允许通知权限'); return; }
      requestNotificationPermission();
    });
  }
}

function openReminderForm(editId) {
  const wrap = document.createElement('div');
  const tplOpts = REMINDER_TEMPLATES.map((t) =>
    `<option value="${t.key}">${t.icon} ${t.label}</option>`
  ).join('');

  wrap.innerHTML = `
    <div class="field"><label>提醒类型</label><select id="r_type">${tplOpts}</select></div>
    <div class="field"><label>备注名（可选）</label><input id="r_label" placeholder="如：全合成机油 5W-30" /></div>
    <div class="field"><label>间隔（公里或天）</label><input type="number" id="r_interval" inputmode="numeric" placeholder="如 5000 或 365" /></div>
    <div class="field"><label>上次保养里程 / 日期（选填）</label>
      <input type="text" id="r_last" placeholder="里程填数字，日期填 YYYY-MM-DD" />
    </div>
    <p class="muted" style="font-size:12px">系统会根据最新加油记录的里程自动判断是否到期。</p>
  `;
  openSheet(editId ? '编辑提醒' : '添加保养提醒', wrap);

  // 回填
  if (editId) {
    dbGet('reminders', editId).then((r) => {
      if (!r) return;
      wrap.querySelector('#r_type').value = r.type || 'oil';
      wrap.querySelector('#r_label').value = r.label || '';
      wrap.querySelector('#r_interval').value = r.interval || '';
      wrap.querySelector('#r_last').value = r.unit === 'km'
        ? (r.lastOdo || '')
        : (r.lastDate || '');
    });
  }

  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = '保存';
  save.onclick = async () => {
    const type = wrap.querySelector('#r_type').value;
    const tpl = REMINDER_TEMPLATES.find((t) => t.key === type) || REMINDER_TEMPLATES[0];
    const label = wrap.querySelector('#r_label').value.trim();
    const interval = parseInt(wrap.querySelector('#r_interval').value, 10);
    const lastVal = wrap.querySelector('#r_last').value.trim();

    if (!interval || interval <= 0) { toast('请填写有效间隔'); return; }

    const rec = {
      id: editId || uid(),
      type,
      label: label || tpl.label,
      interval,
      unit: tpl.unit,
      lastOdo: tpl.unit === 'km' && lastVal ? parseFloat(lastVal) : null,
      lastDate: tpl.unit === 'date' && lastVal ? lastVal : null,
      createdAt: Date.now()
    };

    await dbPut('reminders', rec);
    closeSheet();
    await refreshView();
    toast('已保存');
  };
  wrap.appendChild(save);
}
