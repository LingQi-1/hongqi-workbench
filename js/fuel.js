/* 加油记录模块 */

const GRADES = ['92号', '95号', '98号', '爱跑98', '0号柴油'];

async function getCarRecords() {
  const id = await getCurrentCarId();
  const all = await dbGetAll('records');
  return all.filter((r) => r.carId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
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
  ctx.strokeStyle = '#C8102E';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const xx = xAt(i), yy = yAt(p.p);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  });
  ctx.stroke();

  // 数据点
  ctx.fillStyle = '#C8102E';
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

  // 列表
  if (recs.length === 0) {
    html += '<div class="empty">还没有加油记录，点上面按钮添加第一条</div>';
  } else {
    html += '<div class="list">';
    for (const r of recs) {
      html += `<div class="item">
        <div class="main">
          <div class="t1">${escapeHtml(r.grade)} · ${fmtMoney(r.amount)} 元</div>
          <div class="t2">${r.date} · ${(r.liters != null && !isNaN(parseFloat(r.liters))) ? parseFloat(r.liters).toFixed(2) + ' L' : '— L'} · ${(r.pricePerL != null && !isNaN(parseFloat(r.pricePerL))) ? '¥' + parseFloat(r.pricePerL).toFixed(2) + '/L' : '— /L'}${r.odometer ? ' · 里程 ' + escapeHtml(r.odometer) + ' km' : ''}</div>
        </div>
        <span class="item del" data-del="${r.id}">&times;</span>
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

  container.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('删除这条记录？')) return;
      await dbDel('records', b.getAttribute('data-del'));
      await renderFuel(container);
      toast('已删除');
    });
  });

}

function openFuelForm() {
  const wrap = document.createElement('div');
  const gradesOpt = GRADES.map((g) => `<option value="${g}">${g}</option>`).join('');
  wrap.innerHTML = `
    <div class="field">
      <label>加油日期（默认今天，可改任意日期补记）</label>
      <input type="date" id="f_date" value="${todayStr()}" />
      <div class="date-chips">
        <button type="button" class="chip" data-d="0">今天</button>
        <button type="button" class="chip" data-d="-1">昨天</button>
        <button type="button" class="chip" data-d="-7">上周</button>
        <button type="button" class="chip" data-d="-30">上月</button>
      </div>
    </div>
    <div class="row2">
      <div class="field"><label>加多少 L</label><input type="number" id="f_l" inputmode="decimal" placeholder="升数" /></div>
      <div class="field"><label>加多少钱 ¥</label><input type="number" id="f_a" inputmode="decimal" placeholder="金额" /></div>
    </div>
    <div class="field">
      <label>当时油价（元/L，可带出油价页当前价）</label>
      <input type="number" id="f_p" inputmode="decimal" placeholder="单价" />
    </div>
    <div class="field">
      <label>油品标号</label>
      <select id="f_grade">${gradesOpt}</select>
    </div>
    <div class="field">
      <label>里程表读数（可选，填了启用油耗统计）km</label>
      <input type="number" id="f_odo" inputmode="decimal" placeholder="如 12345，可不填" />
    </div>
    <p class="muted" style="font-size:12px;margin:-4px 0 12px">提示：金额必填；升数 / 单价 任意填一项，另一项自动算出（也可都不填，只记金额）。</p>
  `;
  openSheet('添加加油记录', wrap);

  const L = wrap.querySelector('#f_l'), A = wrap.querySelector('#f_a'), P = wrap.querySelector('#f_p');
  let derivedField = null; // 当前由系统自动算出的那一项的 id
  function autoDerive(changed) {
    const lv = L.value.trim(), av = A.value.trim(), pv = P.value.trim();
    const lN = parseFloat(lv), aN = parseFloat(av), pN = parseFloat(pv);
    // 用户正在清空某字段 → 同时清掉旧的系统推导值，彻底解除“锁死”，可自由改任意项
    if (changed) {
      const cleared = changed === L ? lv === '' : changed === A ? av === '' : pv === '';
      if (cleared) {
        if (derivedField && derivedField !== changed.getAttribute('id')) {
          (derivedField === 'f_l' ? L : derivedField === 'f_a' ? A : P).value = '';
        }
        derivedField = null;
        return;
      }
      if (changed.getAttribute('id') === derivedField) derivedField = null; // 用户改了推导项本身
    }
    const empties = [];
    if (lv === '' || isNaN(lN)) empties.push('L');
    if (av === '' || isNaN(aN)) empties.push('A');
    if (pv === '' || isNaN(pN)) empties.push('P');
    if (empties.length !== 1) { derivedField = null; return; } // 不是“恰好两项已填”就不推导
    const e = empties[0];
    let val = null;
    if (e === 'L' && !isNaN(aN) && !isNaN(pN) && pN !== 0) val = aN / pN;       // 升数 = 金额 / 单价
    if (e === 'A' && !isNaN(lN) && !isNaN(pN)) val = lN * pN;                   // 金额 = 升数 × 单价
    if (e === 'P' && !isNaN(lN) && !isNaN(aN) && lN !== 0) val = aN / lN;       // 单价 = 金额 / 升数
    if (val == null || !isFinite(val)) { derivedField = null; return; }
    const target = e === 'L' ? L : e === 'A' ? A : P;
    target.value = (Math.round(val * 100) / 100).toString();
    derivedField = target.getAttribute('id');
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
      wrap.querySelector('#f_date').value = `${y}-${m}-${day}`;
    });
  });

  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = '保存';
  save.onclick = async () => {
    const date = wrap.querySelector('#f_date').value || todayStr();
    const amount = parseFloat(A.value);
    if (!amount || amount <= 0) { toast('请至少填写加油金额'); return; }
    const liters = parseFloat(L.value);
    const pricePerL = parseFloat(P.value);
    const rec = {
      id: uid(),
      carId: await getCurrentCarId(),
      date,
      liters: isNaN(liters) ? null : liters,
      amount,
      pricePerL: isNaN(pricePerL) ? null : pricePerL,
      grade: wrap.querySelector('#f_grade').value,
      odometer: wrap.querySelector('#f_odo').value || null,
      createdAt: Date.now()
    };
    await dbPut('records', rec);
    closeSheet();
    await refreshView();
    toast('已保存');
  };
  wrap.appendChild(save);
}
