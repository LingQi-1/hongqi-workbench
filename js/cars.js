/* 多车管理：数据隔离（按 carId）；默认车「我的红旗」 */

async function ensureDefaultCar() {
  const cars = await dbGetAll('cars');
  if (cars.length === 0) {
    const def = { id: uid(), name: '我的红旗', plate: '', color: '#C8102E', createdAt: Date.now() };
    await dbPut('cars', def);
    await setSetting('currentCarId', def.id);
    return def;
  }
  let cur = await getSetting('currentCarId', null);
  if (!cur || !cars.find((c) => c.id === cur)) {
    cur = cars[0].id;
    await setSetting('currentCarId', cur);
  }
  return cars.find((c) => c.id === cur);
}

async function getCars() { return dbGetAll('cars'); }
async function getCurrentCarId() { return getSetting('currentCarId', null); }
async function getCurrentCar() {
  const id = await getCurrentCarId();
  const cars = await getCars();
  return cars.find((c) => c.id === id) || cars[0] || null;
}

async function setCurrentCar(id) {
  await setSetting('currentCarId', id);
  const c = (await getCars()).find((x) => x.id === id);
  $('#carChip').textContent = c ? c.name : '我的红旗';
}

async function addCar(name) {
  const car = { id: uid(), name: name || '我的爱车', plate: '', color: '#C8102E', createdAt: Date.now() };
  await dbPut('cars', car);
  await setCurrentCar(car.id);
  return car;
}

async function deleteCar(id) {
  const cars = await getCars();
  if (cars.length <= 1) { toast('至少保留一辆车'); return false; }
  // 删除该车全部加油记录（数据隔离）
  const recs = await dbGetAll('records');
  for (const r of recs) if (r.carId === id) await dbDel('records', r.id);
  await dbDel('cars', id);
  const cur = await getCurrentCarId();
  if (cur === id) {
    const remain = (await getCars()).filter((c) => c.id !== id);
    await setCurrentCar(remain[0].id);
  }
  return true;
}

/* 我的页面 - 车辆管理卡片 */
async function renderCarsSection(container) {
  const cars = await getCars();
  const curId = await getCurrentCarId();
  let html = '<div class="card"><div class="card-title">我的车辆（数据相互隔离）</div>';
  for (const c of cars) {
    const active = c.id === curId;
    html += `<div class="item">
      <div class="main">
        <div class="t1">${escapeHtml(c.name)}</div>
        <div class="t2">${escapeHtml(c.plate || '未填车牌')}</div>
      </div>
      ${active ? '<span class="tag">当前</span>' : `<button class="btn sm ghost" data-switch="${c.id}">切换</button>`}
      ${cars.length > 1 ? `<span class="item del" data-delcar="${c.id}">&times;</span>` : ''}
    </div>`;
  }
  html += `<button class="btn ghost" id="addCarBtn" style="margin-top:8px">+ 添加车辆</button></div>`;
  container.insertAdjacentHTML('beforeend', html);

  container.querySelector('#addCarBtn').addEventListener('click', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="field"><label>车辆名称</label><input id="newCarName" placeholder="如：我的红旗 H9" /></div>`;
    openSheet('添加车辆', wrap);
    wrap.querySelector('#newCarName').focus();
    const save = document.createElement('button');
    save.className = 'btn';
    save.textContent = '保存并切换';
    save.onclick = async () => {
      const name = wrap.querySelector('#newCarName').value.trim();
      if (!name) { toast('请输入名称'); return; }
      await addCar(name);
      closeSheet();
      await refreshView();
      toast('已添加');
    };
    wrap.appendChild(save);
  });

  container.querySelectorAll('[data-switch]').forEach((b) => {
    b.addEventListener('click', async () => {
      await setCurrentCar(b.getAttribute('data-switch'));
      await refreshView();
      toast('已切换车辆');
    });
  });
  container.querySelectorAll('[data-delcar]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('删除该车将同时删除其全部加油记录，确定？')) return;
      if (await deleteCar(b.getAttribute('data-delcar'))) {
        await refreshView();
        toast('已删除');
      }
    });
  });
}
