/* 加油记录模块 */

const GRADES = ['92号', '95号', '98号', '爱跑98', '0号柴油'];

async function getCarRecords() {
  const id = await getCurrentCarId();
  const all = await dbGetAll('records');
  return all.filter((r) => r.carId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
}

function deriveFuel(L, A, P) {
  // 任填其二，推导第三
  L = parseFloat(L); A = parseFloat(A); P = parseFloat(P);
  if (isNaN(L) && !isNaN(A) && !isNaN(P) && P !== 0) return { field: 'L', val: +(A / P).toFixed(2) };
  if (isNaN(A) && !isNaN(L) && !isNaN(P)) return { field: 'A', val: +(L * P).toFixed(2) };
  if (isNaN(P) && !isNaN(L) && !isNaN(A) && L !== 0) return { field: 'P', val: +(A / L).toFixed(2) };
  return null;
}

function fuelStats(recs) {
  let totalA = 0, totalL = 0;
  const withOdo = recs.filter((r) => r.odometer != null && r.odometer !== '').map((r) => ({ ...r, odo: parseFloat(r.odometer) })).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of recs) { totalA += parseFloat(r.amount) || 0; totalL += parseFloat(r.liters) || 0; }
  const avg = totalL ? totalA / totalL : 0;
  let cons = null, costKm = null;
  if (withOdo.length >= 2) {
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
  html += `<div class="stat"><div class="v">¥${st.avg.toFixed(2)}</div><div class="k">加权平均油价</div></div>`;
  if (st.cons != null) {
    html += `<div class="stat"><div class="v">${st.cons.toFixed(2)}</div><div class="k">百公里油耗 L</div></div>`;
    html += `<div class="stat"><div class="v">¥${st.costKm.toFixed(2)}</div><div class="k">每公里成本</div></div>`;
  } else {
    html += `<div class="stat"><div class="v muted" style="font-size:14px">未填里程</div><div class="k">油耗（填里程表启用）</div></div>`;
  }
  html += '</div>';

  // 油价趋势图
  html += '<div class="card" style="margin-top:12px"><div class="card-title">油价趋势（每次加油单价）</div><canvas id="fuelChart" class="trend-canvas"></canvas><div class="muted" id="fuelChartHint" style="font-size:12px;margin-top:6px"></div></div>';

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
          <div class="t2">${r.date} · ${parseFloat(r.liters).toFixed(2)} L · ¥${parseFloat(r.pricePerL).toFixed(2)}/L${r.odometer ? ' · 里程 ' + escapeHtml(r.odometer) + ' km' : ''}</div>
        </div>
        <span class="item del" data-del="${r.id}">&times;</span>
      </div>`;
    }
    html += '</div>';
  }
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
    <p class="muted" style="font-size:12px;margin:-4px 0 12px">提示：金额 / 升数 / 单价 任意填两项，第三项自动算出。</p>
  `;
  openSheet('添加加油记录', wrap);

  const L = wrap.querySelector('#f_l'), A = wrap.querySelector('#f_a'), P = wrap.querySelector('#f_p');
  function autoDerive() {
    const d = deriveFuel(L.value, A.value, P.value);
    if (!d) return;
    if (d.field === 'L' && !L.value) L.value = d.val;
    if (d.field === 'A' && !A.value) A.value = d.val;
    if (d.field === 'P' && !P.value) P.value = d.val;
  }
  [L, A, P].forEach((i) => i.addEventListener('input', autoDerive));

  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = '保存';
  save.onclick = async () => {
    const date = wrap.querySelector('#f_date').value || todayStr();
    const liters = parseFloat(L.value);
    const amount = parseFloat(A.value);
    const pricePerL = parseFloat(P.value);
    if (!liters || !amount || !pricePerL) { toast('请填写升数、金额、单价（可自动推导）'); return; }
    const rec = {
      id: uid(),
      carId: await getCurrentCarId(),
      date,
      liters,
      amount,
      pricePerL,
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
