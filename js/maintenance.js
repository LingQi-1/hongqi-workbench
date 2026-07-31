/* 保养提醒：独立 Tab 页面（从 sync.js 抽出） */

const REMINDER_TEMPLATES = [
  { key: 'oil', label: '机油保养', icon: '🛢️', unit: 'km', defaultInterval: 5000 },
  { key: 'tire', label: '轮胎检查', icon: '🛞', unit: 'km', defaultInterval: 20000 },
  { key: 'inspect', label: '年检', icon: '📋', unit: 'date', defaultInterval: 365 },
  { key: 'insurance', label: '保险到期', icon: '🛡️', unit: 'date', defaultInterval: 365 },
];

/* ===== 通用安全超时：任何 promise 超过 ms 未决则 reject，防止永久挂起 ===== */
function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error((label || '操作') + ' 超时(' + ms + 'ms)')), ms))
  ]);
}

/* ===== 首次使用：填充默认保养提醒 ===== */
async function seedRemindersIfNeeded() {
  const seeded = await getSetting('remindersSeeded', false);
  if (seeded) return;
  let list = [];
  try { list = await dbGetAll('reminders'); }
  catch (e) {
    console.warn('[红旗] reminders 仓储读取失败:', e.message || e);
    list = [];
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
    throw e;
  }
}

/* ===== 保养到期检查 & 通知 ===== */
let _lastNotifiedMap = {};

async function checkAndNotifyReminders() {
  let reminders = [];
  try { reminders = await withTimeout(dbGetAll('reminders'), 3000, '通知-读保养'); }
  catch (e) { console.warn('[红旗] 通知检查跳过(读保养失败):', e.message); return; }

  let latestOdo = null;
  try { latestOdo = await withTimeout(getLatestOdometer(), 3000, '通知-读里程'); }
  catch (e) { /* 里程读不到不影响通知 */ }

  const now = Date.now();
  const urgentItems = [];

  for (const r of reminders) {
    if (_lastNotifiedMap[r.id] && now - _lastNotifiedMap[r.id] < 300000) continue;
    const isDue = checkReminderDue(r, latestOdo);
    if (!isDue) {
      const st = formatReminderStatus(r, latestOdo);
      if (!st.urgent) continue;
    }
    const tpl = REMINDER_TEMPLATES.find((t) => t.key === r.type) || {};
    const st = formatReminderStatus(r, latestOdo);
    urgentItems.push({ r, tpl, st });
    _lastNotifiedMap[r.id] = now;
  }

  if (urgentItems.length === 0) return;

  const msg = urgentItems.map((item) => `⚠️ ${item.tpl.icon} ${item.r.label || item.tpl.label}：${item.st.text}`).join('\n');
  showMaintenanceAlert(msg);

  if ('Notification' in window && Notification.permission === 'granted') {
    for (const item of urgentItems) {
      try {
        new Notification('🚗 我的红旗 - 保养提醒', {
          body: `${item.r.label || item.tpl.label}：${item.st.text}`,
          icon: 'icon.svg',
          tag: `rmd-${item.r.id}`,
        });
      } catch (e) {}
    }
  }
}

function showMaintenanceAlert(msg) {
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
  overlay.querySelector('#alertGo').onclick = () => { overlay.remove(); location.hash = '#maintenance'; };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

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

/* ================================================================
 *  保养页渲染 — 核心设计原则：
 *  1. "加载中"状态使用独立 ID 元素，通过 replaceLoading() 在所有代码路径中必定被替换
 *  2. 每个数据库操作都有独立超时（2~4秒），单个挂起不拖垮整页
 *  3. DB 完全不可用时，用硬编码模板数据渲染（只读模式），保证界面可见
 *  4. 异常路径全部有兜底 UI（错误提示+重试+重置按钮）
 * ================================================================ */

/** 构建保养页完整 HTML（纯同步函数，100% 不会抛错或挂起） */
function buildMaintenanceHTML(reminders, latestOdo, isDbDead) {
  let h = '<div class="card"><div class="card-title">🔔 我的保养计划</div>';

  // DB 不可用的警告横幅
  if (isDbDead) {
    h += `<div class="info-line" style="background:#fff3cd;color:#856404;border-color:#ffc107">
      ⚠️ 本地存储暂时不可能（可能浏览器隐私模式或存储配额已满）。下方显示默认模板，<b>编辑功能暂不可用</b>。可尝试「重置本地数据」恢复。
    </div>`;
  } else {
    // 状态总览
    let urgentCount = 0;
    for (const r of reminders) {
      if (checkReminderDue(r, latestOdo)) urgentCount++;
    }
    if (urgentCount > 0) {
      h += `<div class="info-line" style="background:#fef3cd;color:#856404;border-color:#ffc107">⚠️ 有 ${urgentCount} 项保养已到期或即将到期，请检查！</div>`;
    } else if (reminders.length > 0) {
      h += `<div class="info-line" style="background:var(--brand-soft);color:var(--brand);border-color:var(--brand)">✅ 保养计划正常，暂无到期项</div>`;
    }
  }

  // 列表
  if (reminders.length === 0) {
    h += '<div class="muted" style="font-size:13px;padding:10px 0">暂未添加保养提醒，点击下方按钮添加。</div>';
  } else {
    for (const r of reminders) {
      const tpl = REMINDER_TEMPLATES.find((t) => t.key === r.type) || {};
      const st = formatReminderStatus(r, latestOdo);
      const fbClass = r._isFallback ? ' style="opacity:.7"' : '';
      const delBtn = r._isFallback ? '' : `<span class="del" data-rid="${r.id}">&times;</span>`;
      h += `<div class="item" data-rid="${r.id}" style="cursor:pointer${r._isFallback ? ';pointer-events:none' : ''}">
        <span style="font-size:22px">${tpl.icon || '📌'}</span>
        <div class="main">
          <div class="t1">${escapeHtml(r.label || tpl.label || r.type)}</div>
          <div class="t2" style="${st.urgent && !st.ok ? 'color:var(--brand);font-weight:600' : (st.urgent ? 'color:#b8860b' : '')}">${st.text}</div>
        </div>
        ${delBtn}
      </div>`;
    }
  }

  // 添加按钮（DB 死亡时禁用）
  if (isDbDead) {
    h += `<button class="btn" disabled style="margin-top:12px;opacity:.5">+ 添加保养提醒（存储不可用）</button>`;
  } else {
    h += `<button class="btn" id="addRmdBtn" style="margin-top:12px">+ 添加保养提醒</button>`;
  }

  // 推送通知开关（微信 webview 没有 Notification 对象，必须全链路守卫）
  const hasNotif = typeof Notification !== 'undefined';
  const notifPerm = hasNotif ? (Notification.permission || 'default') : 'unsupported';
  const notifStatus = notifPerm === 'granted' ? '已开启' : notifPerm === 'denied' ? '已拒绝' : (hasNotif ? '未开启' : '不支持');
  const notifBtnClass = notifPerm === 'granted' ? 'ghost' : '';
  h += `<div class="card" style="margin-top:12px"><div class="card-title">📱 推送通知</div>
    <div class="setting-row"><span class="label">到期浏览器推送</span><button id="notifBtn" class="btn sm ${notifBtnClass}" style="width:auto">${notifStatus} · 点此设置</button></div>
    <p class="muted" style="font-size:11px;margin:6px 0 0">${hasNotif ? '开启后，保养到期时即使不在本页面也会收到系统提醒。' : '当前浏览器不支持推送通知（微信内置浏览器无此功能）。</p>'}</div>`;

  // 重置按钮（始终显示在最后，方便用户紧急恢复）
  h += `<div class="card" style="margin-top:12px;border:1px dashed var(--line)">
    <div class="card-title" style="font-size:13px">🔧 故障排除</div>
    <p class="muted" style="font-size:12px;margin:0 0 8px">如果保养数据反复加载失败，可点击下方按钮重置本地存储（仅清除保养相关数据，加油记录不受影响）。</p>
    <button class="btn ghost" id="resetMaintBtn" style="font-size:13px">重置保养数据</button>
  </div>`;

  h += '</div>';
  return h;
}

/** 构建错误态 HTML */
function buildErrorHTML(err) {
  const msg = err && (err.message || err) ? String(err.message).slice(0, 120) : '未知错误';
  return `<div class="muted" style="text-align:center;padding:30px 12px;line-height:1.8">
    <div style="font-size:28px;margin-bottom:8px">😵</div>
    保养数据加载失败<br><code style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px">${escapeHtml(msg)}</code><br>
    <button class="btn" id="maintRetry" style="margin-top:12px">🔄 重新加载</button>
    <button class="btn ghost" id="resetMaintBtn2" style="margin-top:8px;font-size:13px">🔧 重置保养数据</button>
  </div>`;
}

/** 绑定保养页交互事件 */
function bindMaintenanceEvents(container, isDbDead) {
  if (isDbDead) {
    // DB 死亡模式下只有重置按钮可用
    const rb = container.querySelector('#resetMaintBtn');
    if (rb) rb.addEventListener('click', () => resetMaintenanceData(container));
    return;
  }

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
  const addBtn = container.querySelector('#addRmdBtn');
  if (addBtn) addBtn.addEventListener('click', () => openReminderForm());

  // 推送通知
  const notifBtn = container.querySelector('#notifBtn');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      if (!('Notification' in window)) { toast('您的浏览器不支持推送通知'); return; }
      if (Notification.permission === 'denied') { toast('请在浏览器设置中允许通知权限'); return; }
      requestNotificationPermission();
    });
  }

  // 重置按钮
  const rb = container.querySelector('#resetMaintBtn');
  if (rb) rb.addEventListener('click', () => resetMaintenanceData(container));
}

/** 重置保养数据（删除 reminders 仓储中的数据 + 清除 seed 标记，下次进入自动重新初始化） */
async function resetMaintenanceData(container) {
  if (!confirm('确定要重置保养数据吗？\n\n这将清除所有自定义保养提醒并恢复为默认列表。\n加油记录和车辆信息不受影响。')) return;
  try {
    // 删除所有 reminder 记录
    const all = await dbGetAll('reminders');
    for (const r of all) await dbDel('reminders', r.id);
    // 清除 seed 标记
    await setSetting('remindersSeeded', false);
    console.log('[红旗] 保养数据已重置');
    toast('保养数据已重置');
    await refreshView();
  } catch (e) {
    console.error('[红旗] 重置失败:', e);
    toast('重置失败: ' + (e.message || e));
  }
}

/**
 * 主渲染函数 — 保证不卡死的核心设计：
 *
 * ① 先写一个带已知 ID 的"加载中"DOM 元素
 * ② 所有后续代码（try 成功 / catch 异常 / DB 死亡）都调用 replaceLoading() 替换它
 * ③ replaceLoading 用 insertAdjacentHTML + remove，即使多次调用也安全（第二次找不到元素就替换整个 innerHTML）
 */
async function renderMaintenance(container) {
  const LID = '___maintLoading___';

  // ① 写入加载态（必定执行）
  container.innerHTML = '<h2>保养提醒</h2><div id="' + LID + '" style="text-align:center;padding:40px 0;color:var(--muted);font-size:14px">⏳ 加载中...</div>';

  /**
   * ② 保证替换加载态的函数
   * - 找到 #LID 元素 → 在它前面插入新 HTML → 删除加载元素
   * - 找不到（已被替换过）→ 直接覆盖整个容器内容
   */
  function replaceLoading(htmlFragment) {
    const el = document.getElementById(LID);
    if (el) {
      el.insertAdjacentHTML('beforebegin', htmlFragment);
      el.remove();
    } else {
      container.innerHTML = '<h2>保养提醒</h2>' + htmlFragment;
    }
  }

  // ③ 整体 try/catch：任何未预期的错误都走错误态
  try {
    // ── Step 0: DB 健康检查（2秒超时）──
    let dbAlive = false;
    try {
      await withTimeout(dbGetAll('settings'), 2000, 'DB健康检查');
      dbAlive = true;
    } catch (e) {
      console.warn('[红旗] 数据库不可用（健康检查超时/失败）:', e.message || e);
      dbAlive = false;
    }

    let reminders = [];
    let latestOdo = null;

    if (dbAlive) {
      // ── Step 1: 读取 reminders（3秒超时）──
      try {
        reminders = await withTimeout(dbGetAll('reminders'), 3000, '读取保养数据');
      } catch (e) {
        console.warn('[红旗] reminders 首次读取失败，尝试初始化:', e.message || e);
        try {
          await withTimeout(seedRemindersIfNeeded(), 3000, '初始化保养');
          reminders = await withTimeout(dbGetAll('reminders'), 2000, '重读保养').catch(() => []);
        } catch (e2) {
          console.error('[红旗] reminders 仍不可用:', e2.message || e2);
          reminders = [];
        }
      }

      // ── Step 2: 列表为空 → 补充默认项 ──
      if (reminders.length === 0) {
        try {
          await withTimeout(seedRemindersIfNeeded(), 3000, '补充默认');
          reminders = await withTimeout(dbGetAll('reminders'), 2000, '重读').catch(() => []);
        } catch (e) { /* 保持空 */ }
      }

      // ── Step 3: 读取最新里程（非关键，失败=null）──
      try {
        latestOdo = await withTimeout(getLatestOdometer(), 3000, '读取里程');
      } catch (e) {
        console.warn('[红旗] 读里程失败，状态按"未设置"处理:', e.message || e);
        latestOdo = null;
      }
    } else {
      // ── DB 完全不可用：硬编码 4 条默认模板作为只读展示 ──
      console.warn('[红旗] DB不可用，使用硬编码默认数据渲染保养页');
      reminders = REMINDER_TEMPLATES.map(function (t) {
        return {
          id: '__fb_' + t.key, type: t.key, label: t.label,
          interval: t.defaultInterval, unit: t.unit,
          lastOdo: null, lastDate: null, _isFallback: true
        };
      });
    }

    // ── Step 4: 构建 HTML（纯同步，100% 不抛错）并替换加载态 ──
    const html = buildMaintenanceHTML(reminders, latestOdo, !dbAlive);
    replaceLoading(html);

    // ── Step 5: 绑定事件 ──
    bindMaintenanceEvents(container, !dbAlive);

  } catch (err) {
    // ④ 任何未预期异常 → 错误态（含重试 + 重置按钮）
    console.error('[红旗] 保养页渲染异常（最终兜底）:', err && (err.message || err));
    replaceLoading(buildErrorHTML(err));

    // 错误态下的按钮绑定
    const retryBtn = container.querySelector('#maintRetry');
    if (retryBtn) retryBtn.addEventListener('click', function () { renderMaintenance(container); });
    const resetBtn2 = container.querySelector('#resetMaintBtn2');
    if (resetBtn2) resetBtn2.addEventListener('click', function () { resetMaintenanceData(container); });
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
