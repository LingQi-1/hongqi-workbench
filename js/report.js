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
  html += `<button class="btn" id="genYearBillBtn" style="margin:8px 0 0">📊 生成年度养车账单</button>`;

  // === 分享图容器（Canvas → 可保存图片）===
  html += '<div id="shareCardWrap" style="display:none"><div class="card-title" style="margin-top:14px">预览（点击或长按可保存）</div><div id="shareCardImgWrap" style="width:100%;border-radius:12px;overflow:hidden;background:#C8102E"></div><canvas id="shareCard" style="display:none"></canvas><button class="btn light sm" id="saveShareBtn" style="margin-top:8px;width:auto;display:none">💾 保存到相册</button></div>';

  container.innerHTML = html;

  // 绑定生成按钮
  container.querySelector('#genShareBtn').addEventListener('click', () => {
    renderShareCard(container, recs, st, car);
  });
  container.querySelector('#genYearBillBtn').addEventListener('click', () => {
    openYearBillOverlay();
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
  bgGrad.addColorStop(0, '#B42334');
  bgGrad.addColorStop(1, '#8e1a28');
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

  // ===== 将 Canvas 转为可保存的图片 =====
  const imgWrap = document.querySelector('#shareCardImgWrap');
  const saveBtn = document.querySelector('#saveShareBtn');
  try {
    const dataUrl = canvas.toDataURL('image/png');
    imgWrap.innerHTML = `<img src="${dataUrl}" style="width:100%;display:block;border-radius:12px" alt="养车报表分享图" />`;
    saveBtn.style.display = '';
    saveBtn.onclick = () => {
      const link = document.createElement('a');
      link.download = `我的红旗-养车报表-${new Date().toISOString().slice(0,10)}.png`;
      link.href = dataUrl;
      link.click();
      toast('图片已保存，请在相册查看');
    };
  } catch (e) {
    // 如果 toDataURL 失败（如跨域等），回退显示 canvas
    canvas.style.display = 'block';
    console.warn('分享图转换失败:', e);
  }

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

/* ===== 年度养车账单长图（第二波） ===== */
function favGrade(recs) {
  const m = {};
  for (const r of recs) { if (r.grade) m[r.grade] = (m[r.grade] || 0) + 1; }
  let best = null, bn = 0;
  for (const k in m) { if (m[k] > bn) { bn = m[k]; best = k; } }
  return best || '—';
}

async function openYearBillOverlay() {
  const car = await getCurrentCar();
  const allRecs = await getCarRecords(); // 车型跟随当前爱车档案（不聚合全部）
  const curYear = String(new Date().getFullYear());
  const years = [...new Set(allRecs.map(r => (r.date || '').substring(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort();
  const modes = ['本年', '全部', ...years];
  let activeMode = '本年';

  const ov = document.createElement('div');
  ov.id = 'yearBillOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999;overflow-y:auto;display:flex;justify-content:center;padding:18px 0';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:18px;width:min(92vw,420px);max-height:92vh;overflow-y:auto;padding:16px 14px 18px;position:relative;box-shadow:0 12px 40px rgba(0,0,0,.3)';
  ov.appendChild(panel);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:absolute;top:8px;right:10px;border:none;background:rgba(0,0,0,.06);width:30px;height:30px;border-radius:50%;font-size:15px;cursor:pointer;z-index:2';
  closeBtn.onclick = () => ov.remove();
  panel.appendChild(closeBtn);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:700;text-align:center;margin:2px 0 10px;color:#222';
  title.textContent = '📊 年度养车账单';
  panel.appendChild(title);

  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:12px';
  panel.appendChild(tabBar);

  const imgWrap = document.createElement('div');
  imgWrap.style.cssText = 'width:100%;border-radius:14px;overflow:hidden;background:#B42334';
  panel.appendChild(imgWrap);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;display:block';
  imgWrap.appendChild(canvas);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn light';
  saveBtn.style.cssText = 'margin-top:12px;width:100%';
  saveBtn.textContent = '💾 保存到相册';
  panel.appendChild(saveBtn);

  document.body.appendChild(ov);

  function filterByMode(mode) {
    if (mode === '本年') return allRecs.filter(r => (r.date || '').startsWith(curYear));
    if (mode === '全部') return allRecs;
    return allRecs.filter(r => (r.date || '').startsWith(mode));
  }

  async function draw(mode) {
    const recs = filterByMode(mode);
    const st = fuelStats(recs);
    const dataUrl = await drawYearBill(canvas, recs, st, car, mode, allRecs, curYear);
    saveBtn.onclick = () => {
      const link = document.createElement('a');
      const tag = mode === '本年' ? curYear : mode;
      link.download = `我的红旗-养车账单-${tag}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl; link.click();
      toast('图片已保存，请在相册查看');
    };
  }

  function renderTabs() {
    tabBar.innerHTML = '';
    modes.forEach(m => {
      const b = document.createElement('button');
      b.textContent = m === '本年' ? '本年' : (m === '全部' ? '全部' : m + '年');
      b.style.cssText = `border:none;border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer;${m === activeMode ? 'background:#C8102E;color:#fff' : 'background:#f0f0f0;color:#555'}`;
      b.onclick = () => { activeMode = m; renderTabs(); draw(m); };
      tabBar.appendChild(b);
    });
  }
  renderTabs();
  draw(activeMode);

  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
}

async function drawYearBill(canvas, recs, st, car, mode, allRecs, curYear) {
  const dpr = window.devicePixelRatio || 1;
  const W = 360, H = 860;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const font = (w, s) => `${w} ${s}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#B42334'); bg.addColorStop(1, '#7d1422');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  ctx.beginPath(); ctx.arc(W * 0.85, H * 0.06, 70, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.1, H * 0.96, 50, 0, Math.PI * 2); ctx.fill();

  // 头像
  const avatarY = 76;
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(cx, avatarY, 34, 0, Math.PI * 2); ctx.fill();
  let avatarImg = null;
  if (car.avatar && car.avatar.startsWith('data:')) {
    avatarImg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = car.avatar; });
  }
  if (avatarImg) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, avatarY, 30, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatarImg, cx - 30, avatarY - 30, 60, 60); ctx.restore();
  } else {
    ctx.fillStyle = '#fff'; ctx.font = font('400', 44); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(car.avatar && !car.avatar.startsWith('data:') ? car.avatar : '🚗', cx, avatarY);
  }

  // 车名 + 时段
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = font('600', 17); ctx.fillText(escapeHtml(car.name || '我的红旗'), cx, 130);
  const periodLabel = mode === '本年' ? `${curYear} 年度` : (mode === '全部' ? '全部记录' : `${mode} 年度`);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = font('400', 12); ctx.fillText(periodLabel, cx, 152);
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(28, 168); ctx.lineTo(W - 28, 168); ctx.stroke();

  // 核心花费
  ctx.fillStyle = '#FFE4A0'; ctx.textAlign = 'center'; ctx.font = font('700', 40);
  ctx.fillText('¥' + fmtMoney(st.totalA), cx, 220);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = font('400', 13);
  ctx.fillText('累计加油花费', cx, 246);

  // 四宫格
  const gridY = 276, cellW = (W - 56) / 2, cellH = 74, gap = 8;
  const kmAll = computeCompanionship(car, allRecs).km;
  const kmDisp = kmAll != null ? (kmAll >= 10000 ? (kmAll / 10000).toFixed(2) + ' 万' : kmAll.toFixed(0)) : '—';
  const gridData = [
    { label: '加油次数', value: st.count + ' 次', color: '#FFD666' },
    { label: '总里程', value: kmDisp + (kmAll != null ? ' km' : ''), color: '#A5DEFF' },
    { label: '平均油价', value: st.avg != null ? '¥' + st.avg.toFixed(2) : '—', color: '#B8E986' },
    { label: '最爱油号', value: favGrade(recs), color: '#FFB3BA' },
  ];
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 28 + col * (cellW + gap), y = gridY + row * (cellH + gap);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    roundRect(ctx, x, y, cellW, cellH, 14); ctx.fill();
    ctx.fillStyle = gridData[i].color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font('700', 22); ctx.fillText(gridData[i].value, x + cellW / 2, y + 30);
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = font('400', 12); ctx.textBaseline = 'alphabetic';
    ctx.fillText(gridData[i].label, x + cellW / 2, y + 56);
  }

  // 里程圆环
  const ringCx = cx, ringCy = 540, ringR = 60;
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2); ctx.stroke();
  const prog = kmAll != null ? (kmAll - Math.floor(kmAll / 10000) * 10000) / 10000 : 0;
  ctx.strokeStyle = '#FFD666'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(ringCx, ringCy, ringR, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font('700', 24);
  ctx.fillText(kmAll != null ? (kmAll >= 10000 ? (kmAll / 10000).toFixed(2) + '万' : kmAll.toFixed(0)) : '—', ringCx, ringCy - 6);
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = font('400', 11);
  ctx.fillText('累计总里程(km)', ringCx, ringCy + 16);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = font('400', 13); ctx.textBaseline = 'alphabetic';
  if (kmAll != null) {
    const remain = (Math.floor(kmAll / 10000) + 1) * 10000 - kmAll;
    ctx.fillText(`距 ${(Math.floor(kmAll / 10000) + 1)} 万公里还差 ${remain.toLocaleString()} km`, cx, ringCy + ringR + 26);
  } else {
    ctx.fillText('暂无里程数据', cx, ringCy + ringR + 26);
  }

  // 陪伴天数
  const days = computeCompanionship(car, allRecs).days;
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.textAlign = 'center'; ctx.font = font('400', 13); ctx.textBaseline = 'alphabetic';
  ctx.fillText('我陪了主人走过', cx, 680);
  ctx.fillStyle = '#FFE4A0'; ctx.font = font('700', 30); ctx.textBaseline = 'middle';
  ctx.fillText(days != null ? days + ' 天' : '—', cx, 706);

  // 底部水印
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = font('400', 11); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('—— 我的红旗 工作台 · 数据存本机 ——', cx, H - 22);

  return canvas.toDataURL('image/png');
}
