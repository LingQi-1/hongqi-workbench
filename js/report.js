/* 年度/月度养车报表 + 截图分享卡片 */

function buildMonthlyStats(recs) {
  const months = {};
  for (const r of recs) {
    const m = r.date.substring(0, 7); // YYYY-MM
    if (!months[m]) months[m] = { amount: 0, liters: 0, count: 0, prices: [] };
    const a = parseFloat(r.amount) || 0;
    const l = parseFloat(r.liters);
    const p = parseFloat(r.pricePerL);
    months[m].amount += a;
    if (!isNaN(l)) months[m].liters += l;
    months[m].count += 1;
    if (!isNaN(p)) months[m].prices.push(p);
  }
  // 计算每月均价
  for (const m in months) {
    const ps = months[m].prices;
    months[m].avgPrice = ps.length > 0 ? ps.reduce((s, v) => s + v, 0) / ps.length : null;
  }
  return months;
}

async function renderReport(container) {
  const recs = await getCarRecords();
  const car = await getCurrentCar();

  let html = '';

  if (recs.length === 0) {
    html += '<div class="empty">还没有加油记录，无法生成报表</div>';
    container.innerHTML = html;
    return;
  }

  const st = fuelStats(recs);
  const months = buildMonthlyStats(recs);
  const sortedMonths = Object.keys(months).sort().reverse();

  // === 总览卡 ===
  html += '<div class="card" style="background:linear-gradient(135deg,#C8102E,#9e0c24);color:#fff;border:none">';
  html += `<div style="font-size:13px;opacity:.85">${car ? escapeHtml(car.name) : '我的红旗'} · 养车报表</div>`;
  html += `<div style="font-size:28px;font-weight:700;margin:6px 0">¥${fmtMoney(st.totalA)}</div>`;
  html += `<div style="font-size:12px;opacity:.75">累计 ${st.count} 次加油 · ${st.totalL.toFixed(1)} L${st.avg != null ? ' · 均 ¥' + st.avg.toFixed(2) + '/L' : ''}</div>`;
  html += '</div>';

  // === 月度明细 ===
  html += '<div class="card"><div class="card-title">月度明细</div>';
  html += '<table class="tbl"><thead><tr><th>月份</th><th>次数</th><th>金额</th><th>升数</th><th>均价</th></tr></thead><tbody>';
  for (const m of sortedMonths) {
    const d = months[m];
    html += `<tr>
      <td>${m}</td>
      <td>${d.count}</td>
      <td style="color:var(--brand);font-weight:600">¥${fmtMoney(d.amount)}</td>
      <td>${d.liters.toFixed(1)}</td>
      <td>${d.avgPrice != null ? '¥' + d.avgPrice.toFixed(2) : '—'}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';

  // === 操作按钮 ===
  html += `<button class="btn" id="genShareBtn" style="margin:8px 0">📸 生成分享图片</button>`;

  // === 分享图容器（Canvas）===
  html += '<div id="shareCardWrap" style="display:none"><div class="card-title" style="margin-top:14px">预览（长按保存）</div><canvas id="shareCard" style="width:100%;border-radius:12px"></canvas></div>';

  container.innerHTML = html;

  // 绑定生成按钮
  container.querySelector('#genShareBtn').addEventListener('click', () => {
    renderShareCard(container, recs, st, car);
  });
}

/* 用纯 Canvas 渲染一张可分享的养车报表卡片 */
function renderShareCard(container, recs, st, car) {
  const wrap = document.querySelector('#shareCardWrap');
  wrap.style.display = 'block';

  const canvas = container.querySelector('#shareCard');
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.min(360, container.clientWidth - 28);
  const cssH = 480;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW, H = cssH;

  // ===== 背景 =====
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#C8102E');
  bgGrad.addColorStop(1, '#8B0A1E');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  // 装饰圆
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.beginPath(); ctx.arc(W * 0.85, H * 0.15, 60, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.1, H * 0.85, 40, 0, Math.PI * 2); ctx.fill();

  // ===== 标题区 =====
  ctx.fillStyle = '#fff';
  ctx.font = '600 15px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🚗 我的红旗 · 养车报表', 24, 44);

  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  const now = new Date();
  ctx.fillText(`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`, 24, 66);

  // 分割线
  ctx.strokeStyle = 'rgba(255,255,255,.2)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(24, 82); ctx.lineTo(W - 24, 82); ctx.stroke();

  // ===== 核心数字 =====
  ctx.fillStyle = '#FFE4A0';
  ctx.font = '700 42px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('¥' + fmtMoney(st.totalA), W / 2, 140);

  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillText('累计加油花费', W / 2, 164);

  // ===== 四宫格数据 =====
  const gridY = 192;
  const cellW = (W - 48) / 2;
  const cellH = 72;
  const gridData = [
    { label: '加油次数', value: st.count + ' 次', color: '#FFD666' },
    { label: '总加油量', value: st.totalL.toFixed(1) + ' L', color: '#A5DEFF' },
    { label: '平均油价', value: st.avg != null ? '¥' + st.avg.toFixed(2) : '—', color: '#B8E986' },
    { label: '每公里成本', value: st.costKm != null ? '¥' + st.costKm.toFixed(2) : '—', color: '#FFB3BA' },
  ];

  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 24 + col * (cellW + 8);
    const y = gridY + row * (cellH + 8);

    ctx.fillStyle = 'rgba(255,255,255,.12)';
    roundRect(ctx, x, y, cellW, cellH, 14);
    ctx.fill();

    ctx.fillStyle = gridData[i].color || '#fff';
    ctx.font = '700 20px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(gridData[i].value, x + cellW / 2, y + 32);

    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText(gridData[i].label, x + cellW / 2, y + 54);
  }

  // ===== 月度趋势迷你条形图 =====
  if (recs.length > 0) {
    const months = buildMonthlyStats(recs);
    const sortedM = Object.keys(months).sort().slice(-6); // 最近6个月
    if (sortedM.length > 0) {
      const barY = gridY + 2 * (cellH + 8) + 16;
      const barH = 80;
      const barMaxW = W - 80;

      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('近月花费趋势', 24, barY);

      const maxAmt = Math.max(...sortedM.map(m => months[m].amount), 1);
      const bw = Math.min(36, (barMaxW - (sortedM.length - 1) * 8) / sortedM.length);

      sortedM.forEach((m, i) => {
        const amt = months[m].amount;
        const bh = Math.max(4, (amt / maxAmt) * (barH - 24));
        const bx = 24 + i * (bw + 8);
        const by = barY + 14 + (barH - 24) - bh;

        // 条形
        const barGrad = ctx.createLinearGradient(bx, by + bh, bx, by);
        barGrad.addColorStop(0, 'rgba(255,215,0,.5)');
        barGrad.addColorStop(1, 'rgba(255,215,0,.9)');
        ctx.fillStyle = barGrad;
        roundRect(ctx, bx, by, bw, bh, 4);
        ctx.fill();

        // 月份标签
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.slice(5), bx + bw / 2, barY + barH - 2);
      });
    }
  }

  // 底部品牌
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('— 我的红旗 工作台 —', W / 2, H - 18);

  // 滚动到分享图位置
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* 圆角矩形辅助函数 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
