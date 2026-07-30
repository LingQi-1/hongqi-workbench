/* 云同步：GitHub Gist 备份/恢复 + 本地导出/导入 */

async function collectBackup() {
  const cars = await dbGetAll('cars');
  const records = await dbGetAll('records');
  const priceOverrides = await getSetting('priceOverrides', {});
  const favNews = await getSetting('favNews', []);
  const currentCarId = await getSetting('currentCarId', null);
  return { v: 1, ts: Date.now(), cars, records, priceOverrides, favNews, currentCarId };
}

async function applyBackup(obj) {
  if (!obj || !obj.cars) throw new Error('数据格式不正确');
  // 清空现有
  for (const c of await dbGetAll('cars')) await dbDel('cars', c.id);
  for (const r of await dbGetAll('records')) await dbDel('records', r.id);
  for (const c of obj.cars) await dbPut('cars', c);
  for (const r of obj.records) await dbPut('records', r);
  await setSetting('priceOverrides', obj.priceOverrides || {});
  await setSetting('favNews', obj.favNews || []);
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
  html += `<div class="card">
    <div class="card-title">新闻数据源（真实红旗动态）</div>
    <div class="field"><label>新闻代理地址（Cloudflare Worker）</label><input id="newsProxy" placeholder="https://xxx.workers.dev" /></div>
    <p class="muted" style="font-size:12px">留空则显示示例内容。部署方法见 README：「接入真实新闻（Cloudflare Worker）」一节。</p>
  </div>`;
  container.insertAdjacentHTML('beforeend', html);

  // 回填已保存的 gistId
  getSetting('syncGist', '').then((g) => { const el = container.querySelector('#syncGist'); if (g) el.value = g; });
  // 回填并保存新闻代理地址
  getSetting('newsProxy', '').then((g) => { const el = container.querySelector('#newsProxy'); if (g) el.value = g; });
  const npEl = container.querySelector('#newsProxy');
  if (npEl) npEl.addEventListener('change', async (e) => { await setSetting('newsProxy', e.target.value.trim()); toast('已保存新闻代理地址'); });

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
