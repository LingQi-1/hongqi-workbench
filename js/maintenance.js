/* 保养提醒：独立 Tab 页面（从 sync.js 抽出） */

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

async function renderMaintenance(container) {
  const reminders = await dbGetAll('reminders');
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
