/* 加油记录模块 */

const GRADES = ['92号', '95号', '98号', '爱跑98', '0号柴油'];

/* ===== 自定义日期三列滚轮（解决微信 webview 原生 date 控件月日无法滚轮的问题） ===== */
function buildDateWheel(initial) {
  // initial: 'YYYY-MM-DD' 或 null(今天)
  const def = initial && /^\d{4}-\d{2}-\d{2}$/.test(initial)
    ? new Date(initial + 'T00:00:00')
    : new Date();
  const now = new Date();
  const curY = now.getFullYear();
  const years = [];
  for (let y = curY; y >= curY - 30; y--) years.push(y); // 最近30年，足够补记
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  let days = Array.from({ length: 31 }, (_, i) => i + 1);

  const wrap = document.createElement('div');
  wrap.className = 'date-wheel';
  wrap.innerHTML = `
    <div class="dw-col" data-unit="y"><div class="dw-list"></div></div>
    <div class="dw-col" data-unit="m"><div class="dw-list"></div></div>
    <div class="dw-col" data-unit="d"><div class="dw-list"></div></div>
  `;
  const colY = wrap.querySelector('[data-unit="y"] .dw-list');
  const colM = wrap.querySelector('[data-unit="m"] .dw-list');
  const colD = wrap.querySelector('[data-unit="d"] .dw-list');

  let selY = def.getFullYear();
  let selM = def.getMonth() + 1;
  let selD = def.getDate();

  function fillCol(col, arr, sel) {
    col.innerHTML = arr.map((v) => `<div class="dw-item" data-v="${v}">${v}</div>`).join('');
    const active = col.querySelector(`[data-v="${sel}"]`);
    if (active) {
      active.classList.add('cur');
      requestAnimationFrame(() => col.scrollTop = active.offsetTop);
    }
  }
  function refreshDays() {
    const dim = new Date(selY, selM, 0).getDate(); // 当月天数
    days = Array.from({ length: dim }, (_, i) => i + 1);
    if (selD > dim) selD = dim;
    fillCol(colD, days, selD);
  }

  fillCol(colY, years, selY);
  fillCol(colM, months, selM);
  refreshDays();

  // 各列滚动停止后，取中间对齐项
  [['y', colY, () => selY], ['m', colM, () => selM], ['d', colD, () => selD]].forEach(([unit, col, getSel]) => {
    let t = null;
    col.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const items = [...col.querySelectorAll('.dw-item')];
        const center = col.scrollTop + col.clientHeight / 2;
        let best = items[0], bestDist = Infinity;
        for (const it of items) {
          const c = it.offsetTop + it.offsetHeight / 2;
          const dist = Math.abs(c - center);
          if (dist < bestDist) { bestDist = dist; best = it; }
        }
        const v = parseInt(best.getAttribute('data-v'), 10);
        if (unit === 'y') selY = v;
        if (unit === 'm') selM = v;
        if (unit === 'd') selD = v;
        col.scrollTo({ top: best.offsetTop, behavior: 'smooth' });
        // 高亮中间项
        col.querySelectorAll('.dw-item').forEach((it) => it.classList.toggle('cur', it === best));
        // 月份变化时重算天数并修正日
        if (unit === 'm' || unit === 'y') refreshDays();
      }, 120);
    });
  });

  // 点击某项也能选中
  wrap.querySelectorAll('.dw-item').forEach((it) => {
    it.addEventListener('click', () => {
      const col = it.parentElement;
      col.scrollTo({ top: it.offsetTop, behavior: 'smooth' });
    });
  });

  return {
    el: wrap,
    getDate() {
      const mm = String(selM).padStart(2, '0');
      const dd = String(selD).padStart(2, '0');
      return `${selY}-${mm}-${dd}`;
    },
    setDate(str) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return;
      const d = new Date(str + 'T00:00:00');
      selY = d.getFullYear(); selM = d.getMonth() + 1; selD = d.getDate();
      if (!years.includes(selY)) years.unshift(selY);
      fillCol(colY, years, selY);
      fillCol(colM, months, selM);
      refreshDays();
    }
  };
}

async function getCarRecords() {
  const id = await getCurrentCarId();
  const all = await dbGetAll('records');
  let recs = all.filter((r) => r.carId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  // 自动修正明显异常的油价数据（如之前bug导致的¥100/L等）
  let fixed = false;
  for (const r of recs) {
    const a = parseFloat(r.amount), l = parseFloat(r.liters), p = parseFloat(r.pricePerL);
    if (!isNaN(a) && a > 0 && !isNaN(l) && l > 0) {
      const correctP = a / l;
      // 如果存储的单价偏差超过±30%或明显异常(>50或<3)，自动修正
      if (isNaN(p) || Math.abs(p - correctP) / correctP > 0.3 || p > 50 || p < 3) {
        r.pricePerL = Math.round(correctP * 100) / 100;
        fixed = true;
        // 同步回数据库
        dbPut('records', { ...r }).catch(() => {});
      }
    }
  }
  if (fixed) console.log('[红旗] 已自动修正异常油价数据');
  return recs;
}

function fuelStats(recs) {
  let totalA = 0, totalL = 0;
  const withOdo = recs.filter((r) => r.odometer != null && r.odometer !== '' && !isNaN(parseFloat(r.odometer))).map((r) => ({ ...r, odo: parseFloat(r.odometer) })).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of recs) { totalA += parseFloat(r.amount) || 0; const l = parseFloat(r.liters); if (!isNaN(l)) totalL += l; }
  const avg = totalL > 0 ? totalA / totalL : null;
  let cons = null, costKm = null;
  if (withOdo.length >= 2 && totalL > 0) {
    const km = withOdo[withOdo.length - 1].odo - withOdo[0].odo;
    if (km > 0) { cons = (totalL / km) * 100; costKm = totalA / km; }
  }
  return { totalA, totalL, avg, cons, costKm, count: recs.length };
}

/* 纯 Canvas 画油价趋势折线图（不依赖任何外部库） */
function drawFuelTrend(canvas, recs) {
  const pts = recs
    .filter((r) => r.pricePerL != null && !isNaN(parseFloat(r.pricePerL)))
    .map((r) => ({ date: r.date, p: parseFloat(r.pricePerL) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const hint = document.getElementById('fuelChartHint');
  if (pts.length < 2) {
    canvas.style.display = 'none';
    if (hint) hint.textContent = '记录满 2 条后，这里显示每次加油的油价趋势。';
    return;
  }
  if (hint) hint.textContent = '';
  canvas.style.display = 'block';

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = 180;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 40, padR = 12, padT = 14, padB = 24;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  let min = Math.min(...pts.map((p) => p.p));
  let max = Math.max(...pts.map((p) => p.p));
  if (min === max) { min -= 0.5; max += 0.5; }
  const range = max - min;
  const xAt = (i) => padL + (pts.length === 1 ? plotW / 2 : (plotW * i) / (pts.length - 1));
  const yAt = (v) => padT + plotH - ((v - min) / range) * plotH;

  // 网格 + Y 轴价格标签
  ctx.strokeStyle = '#e5e5ea';
  ctx.fillStyle = '#86868b';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const rows = 4;
  for (let i = 0; i <= rows; i++) {
    const v = min + (range * i) / rows;
    const yy = yAt(v);
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(cssW - padR, yy);
    ctx.stroke();
    ctx.fillText(v.toFixed(2), padL - 6, yy);
  }

  // X 轴日期标签（首 / 中 / 尾）
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelIdx = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
  labelIdx.forEach((i) => {
    ctx.fillText(pts[i].date.slice(5), xAt(i), cssH - padB + 6);
  });

  // 折线
  ctx.strokeStyle = '#B42334';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const xx = xAt(i), yy = yAt(p.p);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  });
  ctx.stroke();

  // 数据点
  ctx.fillStyle = '#B42334';
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xAt(i), yAt(p.p), 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function renderFuel(container) {
  const recs = await getCarRecords();
  const st = fuelStats(recs);

  let html = '';
  // 统计看板
  html += '<div class="stats">';
  html += `<div class="stat"><div class="v brand">¥${fmtMoney(st.totalA)}</div><div class="k">累计花费（${st.count}次）</div></div>`;
  html += `<div class="stat"><div class="v">${st.totalL.toFixed(1)} L</div><div class="k">累计加油量</div></div>`;
  html += `<div class="stat"><div class="v">${st.avg != null ? '¥' + st.avg.toFixed(2) : '—'}</div><div class="k">加权平均油价</div></div>`;
  if (st.cons != null) {
    html += `<div class="stat"><div class="v">${st.cons.toFixed(2)}</div><div class="k">百公里油耗 L</div></div>`;
    html += `<div class="stat"><div class="v">¥${st.costKm.toFixed(2)}</div><div class="k">每公里成本</div></div>`;
  } else {
    html += `<div class="stat"><div class="v muted" style="font-size:14px">未填里程</div><div class="k">油耗（填里程表启用）</div></div>`;
  }
  html += '</div>';

  html += '<button class="btn" id="addFuelBtn" style="margin:14px 0">+ 添加加油记录</button>';

  // 列表（大卡片样式）
  if (recs.length === 0) {
    html += '<div class="empty">还没有加油记录，点上面按钮添加第一条</div>';
  } else {
    html += '<div class="fuel-list">';
    for (const r of recs) {
      const d = r.date ? new Date(r.date + 'T00:00:00') : null;
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const dateStr = d ? `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${weekDays[d.getDay()]}` : r.date || '未知';
      const odoStr = r.odometer ? `里程 ${Number(r.odometer).toLocaleString()} km` : '';
      const lit = r.liters != null && !isNaN(parseFloat(r.liters)) ? parseFloat(r.liters).toFixed(1) + ' L' : '';
      const ppl = r.pricePerL != null && !isNaN(parseFloat(r.pricePerL)) ? '¥' + parseFloat(r.pricePerL).toFixed(2) + '/L' : '';
      const subInfo = [odoStr, lit, ppl].filter(Boolean).join(' · ');
      html += `<div class="fuel-card" data-id="${r.id}">
        <div class="fuel-card-left">
          <div class="fuel-card-date">${dateStr}</div>
          <div class="fuel-card-sub">${subInfo || '—'}</div>
        </div>
        <div class="fuel-card-right">
          <div class="fuel-card-amt">¥${fmtMoney(r.amount)}</div>
        </div>
        <span class="fuel-card-edit">✎ 点击编辑</span>
        <span class="fuel-card-del" data-del="${r.id}">🗑</span>
      </div>`;
    }
    html += '</div>';
  }
  // 油价趋势图（放在加油记录列表下方）
  html += '<div class="card" style="margin-top:12px"><div class="card-title">油价趋势（每次加油单价）</div><canvas id="fuelChart" class="trend-canvas"></canvas><div class="muted" id="fuelChartHint" style="font-size:12px;margin-top:6px"></div></div>';

  container.innerHTML = html;

  // 趋势图
  const chartCanvas = container.querySelector('#fuelChart');
  if (chartCanvas) drawFuelTrend(chartCanvas, recs);

  container.querySelector('#addFuelBtn').addEventListener('click', openFuelForm);

  // 首页顶部：爱车陪伴横幅（情绪价值，独立于加油记录）
  const banner = await renderCompanionshipBanner();
  if (banner) container.insertBefore(banner, container.firstChild);

  container.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('删除这条记录？')) return;
      await dbDel('records', b.getAttribute('data-del'));
      await renderFuel(container);
      toast('已删除');
    });
  });

  // 卡片整体点击 → 编辑（删除按钮已 stopPropagation，不受影响）
  container.querySelectorAll('.fuel-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      const rec = recs.find((r) => r.id === id);
      if (rec) openFuelForm(rec);
    });
  });

}

function openFuelForm(existing) {
  const isEdit = !!(existing && existing.id);
  const wrap = document.createElement('div');
  const gradesOpt = GRADES.map((g) => `<option value="${g}" ${existing && existing.grade === g ? 'selected' : ''}>${g}</option>`).join('');
  const initDate = existing ? existing.date : todayStr();
  wrap.innerHTML = `
    <div class="field">
      <label>加油日期（滚轮选择，可任意补记往日）</label>
      <div id="dwHost"></div>
      <div class="date-chips">
        <button type="button" class="chip" data-d="0">今天</button>
        <button type="button" class="chip" data-d="-1">昨天</button>
        <button type="button" class="chip" data-d="-7">上周</button>
        <button type="button" class="chip" data-d="-30">上月</button>
      </div>
    </div>
    <div class="row2">
      <div class="field"><label>加多少 L</label><input type="number" id="f_l" inputmode="decimal" placeholder="升数" value="${existing && existing.liters != null ? existing.liters : ''}" /></div>
      <div class="field"><label>加多少钱 ¥</label><input type="number" id="f_a" inputmode="decimal" placeholder="金额" value="${existing && existing.amount != null ? existing.amount : ''}" /></div>
    </div>
    <div class="field">
      <label>当时油价（元/L，可带出油价页当前价）</label>
      <input type="number" id="f_p" inputmode="decimal" placeholder="单价" value="${existing && existing.pricePerL != null ? existing.pricePerL : ''}" />
    </div>
    <div class="field">
      <label>油品标号</label>
      <select id="f_grade">${gradesOpt}</select>
    </div>
    <div class="field">
      <label>里程表读数（可选，填了启用油耗统计）km</label>
      <input type="number" id="f_odo" inputmode="decimal" placeholder="如 12345，可不填" value="${existing && existing.odometer ? existing.odometer : ''}" />
    </div>
    <p class="muted" style="font-size:12px;margin:-4px 0 12px">提示：金额必填；升数 / 单价 任意填一项，另一项自动算出（也可都不填，只记金额）。</p>
  `;
  openSheet(isEdit ? '编辑加油记录' : '添加加油记录', wrap);

  // 用自定义三列滚轮替换原生 date 控件
  const wheel = buildDateWheel(initDate);
  wrap.querySelector('#dwHost').appendChild(wheel.el);

  const L = wrap.querySelector('#f_l'), A = wrap.querySelector('#f_a'), P = wrap.querySelector('#f_p');
  let lastEdited = null; // 用户最后手动编辑的字段（'f_l'/'f_a'/'f_p'）
  function autoDerive(changed) {
    const lv = L.value.trim(), av = A.value.trim(), pv = P.value.trim();
    const lN = parseFloat(lv), aN = parseFloat(av), pN = parseFloat(pv);

    // 记录用户最后编辑的字段（排除系统自动赋值）
    if (changed) {
      const changedId = changed.getAttribute('id');
      // 如果用户清空了某字段，也记录为最后编辑
      const val = changed === L ? lv : changed === A ? av : pv;
      if (val !== '') lastEdited = changedId;
      else lastEdited = changedId; // 清空也算编辑，允许后续重新推导
    }

    // 统计有效填写数
    const hasL = lv !== '' && !isNaN(lN);
    const hasA = av !== '' && !isNaN(aN);
    const hasP = pv !== '' && !isNaN(pN);
    const filledCount = (hasL ? 1 : 0) + (hasA ? 1 : 0) + (hasP ? 1 : 0);

    // 0 或 2 个空 → 不推导（信息不足或用户还在填）
    if (filledCount < 2) return;

    // 确定推导目标：用户正在编辑的字段不覆盖；优先推导非"最后手动编辑"的字段
    const changingId = changed ? changed.getAttribute('id') : null;
    let target = null;
    let val = null;

    if (!hasP && hasL && hasA && lN !== 0) { target = P; val = aN / lN; }       // 单价 = 金额/升数
    else if (!hasA && hasL && hasP) { target = A; val = lN * pN; }               // 金额 = 升数×单价
    else if (!hasL && hasA && hasP && pN !== 0) { target = L; val = aN / pN; }   // 升数 = 金额/单价
    else if (filledCount === 3) {
      // 三字段全满时：重算"非当前编辑且非最后手动编辑"的字段，保证数据一致
      // 例如用户在改金额(L=23.21,A=200→201,P=8.62)，应更新 P=201/23.21=8.66
      const candidates = [];
      if (changingId !== 'f_p' && lastEdited !== 'f_p') candidates.push({ el: P, id: 'f_p', fn: () => aN / lN });
      if (changingId !== 'f_a' && lastEdited !== 'f_a') candidates.push({ el: A, id: 'f_a', fn: () => lN * pN });
      if (changingId !== 'f_l' && lastEdited !== 'f_l') candidates.push({ el: L, id: 'f_l', fn: () => pN > 0 ? aN / pN : NaN });
      if (candidates.length > 0) {
        const c = candidates[0]; // 取第一个候选（优先保单价，因为最常被推导）
        val = c.fn();
        target = c.el;
      }
    }

    if (!target || val == null || !isFinite(val)) return;
    target.value = (Math.round(val * 100) / 100).toString();
  }
  [L, A, P].forEach((i) => i.addEventListener('input', () => autoDerive(i)));
  // 日期快捷选择
  wrap.querySelectorAll('.date-chips .chip').forEach((c) => {
    c.addEventListener('click', () => {
      const off = parseInt(c.getAttribute('data-d'), 10);
      const d = new Date();
      d.setDate(d.getDate() + off);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      wheel.setDate(`${y}-${m}-${day}`);
    });
  });

  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = isEdit ? '保存修改' : '保存';
  save.onclick = async () => {
    const date = wheel.getDate() || todayStr();
    const amount = parseFloat(A.value);
    if (!amount || amount <= 0) { toast('请至少填写加油金额'); return; }
    const liters = parseFloat(L.value);
    const pricePerL = parseFloat(P.value);
    const rec = {
      id: isEdit ? existing.id : uid(),
      carId: isEdit ? existing.carId : await getCurrentCarId(),
      date,
      liters: isNaN(liters) ? null : liters,
      amount,
      pricePerL: isNaN(pricePerL) ? null : pricePerL,
      grade: wrap.querySelector('#f_grade').value,
      odometer: wrap.querySelector('#f_odo').value || null,
      createdAt: isEdit ? existing.createdAt : Date.now()
    };
    await dbPut('records', rec);
    closeSheet();
    await refreshView();
    toast(isEdit ? '已修改' : '已保存');
  };
  wrap.appendChild(save);
}
