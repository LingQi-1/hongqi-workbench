/* 新闻模块：综合频道 + 红旗专属频道
   真实源（尽力获取，依赖手机网络能否访问代理）：
     · 综合：中国新闻网汽车 RSS（经 rss2json 代理）→ 新浪新闻接口兜底
     · 红旗：新浪新闻接口按关键词过滤（红旗/H7/HS7/天工/金葵花…）→ 中国新闻网过滤兜底
   任何失败都回退到内置种子，保证永不空白、不报错。 */

const NEWS_SEED = [
  { id: 'g1', channel: 'general', title: '2026 新能源车购置补贴政策延续，燃油车市场承压', source: '汽车之家', link: '', pubDate: '2026-07-28', category: '政策' },
  { id: 'g2', channel: 'general', title: '上半年国内乘用车销量同比微增，自主品牌份额创新高', source: '懂车帝', link: '', pubDate: '2026-07-27', category: '行业' },
  { id: 'g3', channel: 'general', title: '多地加油站升级 98 号油品，车主加注体验改善', source: '易车', link: '', pubDate: '2026-07-26', category: '行业' },
  { id: 'g4', channel: 'general', title: '发改委最新成品油调价：汽油每吨上调约 150 元', source: '新华社', link: '', pubDate: '2026-07-16', category: '政策' },
  { id: 'h1', channel: 'hongqi', title: '红旗 H9 改款官图发布，全新前脸更显庄重', source: '红旗官方', link: '', pubDate: '2026-07-28', category: '新车' },
  { id: 'h2', channel: 'hongqi', title: '红旗新能源 EHS7 开启交付，续航突破 700km', source: '红旗官方', link: '', pubDate: '2026-07-25', category: '新车' },
  { id: 'h3', channel: 'hongqi', title: '红旗车主俱乐部夏季自驾活动报名启动', source: '红旗官方', link: '', pubDate: '2026-07-22', category: '车主' }
];

const HQ_KW = ['红旗', 'H7', 'H5', 'HS7', 'HS5', 'HS3', 'H9', 'EHS7', 'EH7', '天工', '金葵花', '一汽红旗', 'HQ'];
const LIVE_KEY = 'liveNews'; // { general:[...], hongqi:[...] }

let newsChannel = 'general';

async function getFavs() { return getSetting('favNews', []); }

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); }
async function getLiveNews() { return getSetting(LIVE_KEY, {}); }
function isHongqi(t) { return HQ_KW.some((k) => t.includes(k)); }
function catOf(t) {
  if (/政策|发改委|购置税|补贴|法规/.test(t)) return '政策';
  if (/上市|发布|官图|预售|新车|交付/.test(t)) return '新车';
  if (/召回|维权|投诉/.test(t)) return '质量';
  return '行业';
}

const RSS2JSON = (feed) => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feed);
const ALLORIGINS = (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u);

async function fetchRssJson(feed) {
  const r = await fetch(RSS2JSON(feed));
  const d = await r.json();
  if (d.status !== 'ok') throw new Error('rss2json ' + d.status);
  return (d.items || []).slice(0, 12).map((it) => ({
    id: 'r-' + hashStr(it.link || it.title || Math.random()),
    title: it.title || '无标题',
    link: it.link || '',
    pubDate: (it.pubDate || '').slice(0, 10),
    source: (d.feed && d.feed.title) || 'RSS',
    category: catOf(it.title || '')
  }));
}
async function fetchSinaRoll(lid) {
  const api = `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&num=15&order=1`;
  const r = await fetch(ALLORIGINS(api));
  const d = await r.json();
  const items = (d.result && d.result.data) || [];
  return items.map((it) => ({
    id: 's-' + hashStr(it.url || it.title || Math.random()),
    title: it.title || '无标题',
    link: it.url || it.link || '',
    pubDate: fmtDate(new Date((it.ctime || Date.now() / 1000) * 1000)),
    source: '新浪',
    category: catOf(it.title || '')
  }));
}

/* 综合：中国新闻网汽车 RSS → 新浪兜底 */
async function fetchGeneral() {
  try { return await fetchRssJson('https://www.chinanews.com.cn/rss/auto.shtml'); } catch (e) { /* next */ }
  try { return await fetchSinaRoll(2511); } catch (e) { /* next */ }
  return null;
}
/* 红旗：新浪按关键词过滤 → 中国新闻网过滤兜底 */
async function fetchHongqi() {
  try {
    const all = await fetchSinaRoll(2511);
    const f = all.filter((i) => isHongqi(i.title));
    if (f.length >= 3) return f;
  } catch (e) { /* next */ }
  try {
    const all = await fetchRssJson('https://www.chinanews.com.cn/rss/auto.shtml');
    const f = all.filter((i) => isHongqi(i.title));
    if (f.length) return f;
  } catch (e) { /* next */ }
  return null;
}

async function renderNews(container) {
  const favs = await getFavs();
  const live = await getLiveNews();
  const cached = (live[newsChannel] && live[newsChannel].length) ? live[newsChannel] : null;
  const list = cached || NEWS_SEED.filter((n) => n.channel === newsChannel)
    .sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
  const fromLive = !!cached;

  let html = `<div class="news-tabs">
    <div class="news-tab ${newsChannel === 'general' ? 'active' : ''}" data-nc="general">综合</div>
    <div class="news-tab ${newsChannel === 'hongqi' ? 'active' : ''}" data-nc="hongqi">红旗专属</div>
  </div>`;
  html += `<button class="btn ghost sm" id="newsRefresh" style="margin-bottom:12px">↻ 刷新</button>`;

  if (!list.length) {
    html += '<div class="empty">暂无新闻</div>';
  } else {
    for (const n of list) {
      const fav = favs.includes(n.id);
      html += `<div class="news-item">
        <div class="nt" data-link="${escapeHtml(n.link || '')}">${escapeHtml(n.title)}</div>
        <div class="nm">
          <span><span class="tag">${escapeHtml(n.category)}</span>${escapeHtml(n.source)} · ${escapeHtml(n.pubDate)}</span>
          <span class="star" data-fav="${n.id}">${fav ? '★' : '☆'}</span>
        </div>
      </div>`;
    }
  }
  if (newsChannel === 'hongqi' && !fromLive) html += '<p class="muted" style="font-size:12px">当前为示例内容；联网刷新将尝试获取真实红旗动态。</p>';
  if (newsChannel === 'general' && !fromLive) html += '<p class="muted" style="font-size:12px">当前为示例内容；联网刷新将尝试获取真实汽车资讯。</p>';

  container.innerHTML = html;
  container.querySelectorAll('[data-nc]').forEach((b) => b.addEventListener('click', () => { newsChannel = b.getAttribute('data-nc'); renderNews(container); }));
  container.querySelector('#newsRefresh').addEventListener('click', () => refreshNews(container));
  container.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => { const u = b.getAttribute('data-link'); if (u) openUrl(u); }));
  container.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = b.getAttribute('data-fav');
    const f = await getFavs();
    const i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.push(id);
    await setSetting('favNews', f);
    renderNews(container);
  }));
}

async function refreshNews(container) {
  const isHq = newsChannel === 'hongqi';
  toast(isHq ? '正在获取红旗动态…' : '正在获取最新资讯…');
  try {
    const items = isHq ? await fetchHongqi() : await fetchGeneral();
    if (items && items.length) {
      const live = await getLiveNews();
      live[newsChannel] = items.slice(0, 12);
      await setSetting(LIVE_KEY, live);
      toast('已更新最新资讯');
    } else {
      toast('未获取到新内容，显示示例');
    }
  } catch (e) {
    toast('在线获取失败，显示示例内容');
  }
  renderNews(container);
}
