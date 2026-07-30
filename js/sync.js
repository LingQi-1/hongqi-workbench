/* 云同步：GitHub Gist 备份/恢复 + 本地导出/导入 + 多车对比 + 保养提醒 */

/* ===== 多车对比看板 ===== */
async function renderCarComparison(container) {
  const cars = await dbGetAll('cars');
  if (cars.length < 2) return; // 不显示

  const allRecords = await dbGetAll('records');
  const comparison = [];

  for (const car of cars) {
    const recs = allRecords.filter((r) => r.carId === car.id);
    const st = fuelStats(recs);
    comparison.push({ car, st, count: recs.length });
  }

  let html = '<div class="card"><div class="card-title">🔄 多车对比</div>';
  html += '<table class="tbl"><thead><tr><th>车辆</th><th>花费</th><th>加油量</th><th>均价</th><th>次数</th></tr></thead><tbody>';
  for (const c of comparison) {
    html += `<tr>
      <td style="font-weight:600">${escapeHtml(c.car.name)}</td>
      <td style="color:var(--brand);font-weight:600">¥${fmtMoney(c.st.totalA)}</td>
      <td>${c.st.totalL.toFixed(1)}L</td>
      <td>${c.st.avg != null ? '¥' + c.st.avg.toFixed(2) : '—'}</td>
      <td>${c.count}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  container.insertAdjacentHTML('beforeend', html);
}

/* ===== 保养提醒 ===== */
const REMINDER_TEMPLATES = [
  { key: 'oil', label: '机油保养', icon: '🛢️', unit: 'km', defaultInterval: 5000 },
  { key: 'tire', label: '轮胎检查', icon: '🛞', unit: 'km', defaultInterval: 20000 },
  { key: 'inspect', label: '年检', icon: '📋', unit: 'date', defaultInterval: 365 },
  { key: 'insurance', label: '保险到期', icon: '🛡️', unit: 'date', defaultInterval: 365 },
];

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

async function renderReminders(container) {
  const reminders = await dbGetAll('reminders');
  const latestOdo = await getLatestOdometer();

  let html = '<div class="card"><div class="card-title">🔔 保养提醒</div>';

  // 状态总览
  let urgentCount = 0;
  for (const r of reminders) {
    if (checkReminderDue(r, latestOdo)) urgentCount++;
  }
  if (urgentCount > 0) {
    html += `<div class="info-line" style="background:#fef3cd;color:#856404;border-color:#ffc107">⚠️ 有 ${urgentCount} 项保养已到期或即将到期，请检查！</div>`;
  }

  // 列表
  if (reminders.length === 0) {
    html += '<div class="muted" style="font-size:13px;padding:10px 0">暂无提醒，点击下方添加</div>';
  } else {
    for (const r of reminders) {
      const tpl = REMINDER_TEMPLATES.find((t) => t.key === r.type) || {};
      const st = formatReminderStatus(r, latestOdo);
      html += `<div class="item" data-rid="${r.id}" style="cursor:pointer">
        <span style="font-size:22px">${tpl.icon || '📌'}</span>
        <div class="main">
          <div class="t1">${escapeHtml(r.label || tpl.label || r.type)} ${st.urgent ? '' : ''}</div>
          <div class="t2" style="${st.urgent && !st.ok ? 'color:var(--brand);font-weight:600' : ''}">${st.text}</div>
        </div>
        <span class="del" data-rid="${r.id}">&times;</span>
      </div>`;
    }
  }

  // 添加按钮
  html += `<button class="btn ghost sm" id="addRmdBtn" style="margin-top:10px">+ 添加提醒</button>`;
  html += '</div>';
  container.insertAdjacentHTML('beforeend', html);

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

async function collectBackup() {
  const cars = await dbGetAll('cars');
  const records = await dbGetAll('records');
  const reminders = await dbGetAll('reminders');
  const priceOverrides = await getSetting('priceOverrides', {});
  const currentCarId = await getSetting('currentCarId', null);
  return { v: 2, ts: Date.now(), cars, records, reminders, priceOverrides, currentCarId };
}

async function applyBackup(obj) {
  if (!obj || !obj.cars) throw new Error('数据格式不正确');
  // 清空现有
  for (const c of await dbGetAll('cars')) await dbDel('cars', c.id);
  for (const r of await dbGetAll('records')) await dbDel('records', r.id);
  for (const r of await dbGetAll('reminders')) await dbDel('reminders', r.id);
  for (const c of obj.cars) await dbPut('cars', c);
  for (const r of obj.records) await dbPut('records', r);
  if (obj.reminders) for (const r of obj.reminders) await dbPut('reminders', r);
  await setSetting('priceOverrides', obj.priceOverrides || {});
  await setSetting('currentCarId', obj.currentCarId || (obj.cars[0] && obj.cars[0].id));
}

const GH = 'https://api.github.com/gists';
function ghHeaders(token) { return { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' }; }

async function gistCreate(token, content) {
  const body = JSON.stringify({ description: '我的红旗 备份', public: false, files: { 'wohongqi.json': { content } } });
  const r = await fetch(GH, { method: 'POST', headers: ghHeaders(token), body });
  if (!r.ok) throw new Error('创建失败 ' + r.status);
  const d = await r.json();
  return d.id;
}
async function gistUpdate(token, gistId, content) {
  const body = JSON.stringify({ files: { 'wohongqi.json': { content } } });
  const r = await fetch(`${GH}/${gistId}`, { method: 'PATCH', headers: ghHeaders(token), body });
  if (!r.ok) throw new Error('更新失败 ' + r.status);
}
async function gistRead(token, gistId) {
  const r = await fetch(`${GH}/${gistId}`, { headers: ghHeaders(token) });
  if (!r.ok) throw new Error('读取失败 ' + r.status);
  const d = await r.json();
  return d.files['wohongqi.json'].content;
}

function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderSyncSection(container) {
  const token = ''; // 不回显明文 token
  let html = `<div class="card">
    <div class="card-title">云同步（GitHub Gist，永久保存、换手机可恢复）</div>
    <div class="field"><label>GitHub Token（仅存本机）</label><input type="password" id="syncToken" placeholder="ghp_xxx 个人访问令牌" /></div>
    <div class="field"><label>Gist ID（首次备份后自动生成）</label><input id="syncGist" placeholder="留空则创建新备份" /></div>
    <button class="btn" id="syncBackup">☁ 备份到云端</button>
    <button class="btn ghost" id="syncRestore" style="margin-top:8px">↧ 从云端恢复</button>
    <div class="setting-row" style="border:none;margin-top:12px">
      <span class="label">本地导出 / 导入</span>
      <span>
        <button class="btn sm light" id="exportBtn">导出</button>
        <button class="btn sm light" id="importBtn">导入</button>
      </span>
    </div>
    <p class="muted" style="font-size:12px">Token 需有 gist 权限；数据保存在你自己的 GitHub 账号，永久不失效。</p>
    <input type="file" id="importFile" accept="application/json" hidden />
  </div>`;
  container.insertAdjacentHTML('beforeend', html);

  // 回填已保存的 gistId
  getSetting('syncGist', '').then((g) => { const el = container.querySelector('#syncGist'); if (g) el.value = g; });

  container.querySelector('#syncBackup').addEventListener('click', async () => {
    const tk = container.querySelector('#syncToken').value.trim();
    if (!tk) { toast('请先填写 GitHub Token'); return; }
    toast('正在备份…');
    try {
      const data = await collectBackup();
      const content = JSON.stringify(data);
      let gist = await getSetting('syncGist', '');
      if (!gist) gist = await gistCreate(tk, content);
      else await gistUpdate(tk, gist, content);
      await setSetting('syncGist', gist);
      await setSetting('syncToken', tk);
      toast('已备份到云端');
    } catch (e) { toast('备份失败：' + e.message); }
  });

  container.querySelector('#syncRestore').addEventListener('click', async () => {
    const tk = container.querySelector('#syncToken').value.trim();
    const gist = container.querySelector('#syncGist').value.trim() || await getSetting('syncGist', '');
    if (!tk || !gist) { toast('需填写 Token 和 Gist ID'); return; }
    toast('正在恢复…');
    try {
      const content = await gistRead(tk, gist);
      await applyBackup(JSON.parse(content));
      await setSetting('syncToken', tk);
      await setSetting('syncGist', gist);
      await refreshView();
      toast('已从云端恢复');
    } catch (e) { toast('恢复失败：' + e.message); }
  });

  container.querySelector('#exportBtn').addEventListener('click', async () => {
    downloadJSON(await collectBackup(), 'wohongqi-backup.json');
    toast('已导出');
  });
  container.querySelector('#importBtn').addEventListener('click', () => container.querySelector('#importFile').click());
  container.querySelector('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      await applyBackup(JSON.parse(text));
      await refreshView();
      toast('已导入');
    } catch (err) { toast('导入失败'); }
  });
}
