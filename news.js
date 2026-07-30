/* 新闻模块：综合频道 + 红旗专属频道
   真实源：经你自建的 Cloudflare Worker 代理抓取 B站/微博（在「我的」页填写代理地址）
   代理会抓取真实内容并加 CORS 头返回 JSON：{ ok:true, items:[{title,desc,url,pic,date,source}] }
   任何失败都回退到内置示例，保证永不空白、不报错。 */

const NEWS_SEED = [
  { id: 'g1', channel: 'general', title: '2026 新能源车购置补贴政策延续，燃油车市场承压', source: '示例·汽车之家', link: '', pubDate: '2026-07-28', category: '政策' },
  { id: 'g2', channel: 'general', title: '上半年国内乘用车销量同比微增，自主品牌份额创新高', source: '示例·懂车帝', link: '', pubDate: '2026-07-27', category: '行业' },
  { id: 'g3', channel: 'general', title: '多地加油站升级 98 号油品，车主加注体验改善', source: '示例·易车', link: '', pubDate: '2026-07-26', category: '行业' },
  { id: 'g4', channel: 'general', title: '发改委最新成品油调价：汽油每吨上调约 150 元', source: '示例·新华社', link: '', pubDate: '2026-07-16', category: '政策' },
  { id: 'h1', channel: 'hongqi', title: '红旗 H9 改款官图发布，全新前脸更显庄重', source: '示例·红旗官方', link: '', pubDate: '2026-07-28', category: '新车' },
  { id: 'h2', channel: 'hongqi', title: '红旗新能源 EHS7 开启交付，续航突破 700km', source: '示例·红旗官方', link: '', pubDate: '2026-07-25', category: '新车' },
  { id: 'h3', channel: 'hongqi', title: '红旗车主俱乐部夏季自驾活动报名启动', source: '示例·红旗官方', link: '', pubDate: '2026-07-22', category: '车主' }
];

const LIVE_KEY = 'liveNews'; // { general:[...], hongqi:[...] }
let newsChannel = 'general';

async function getFavs() { return getSetting('favNews', []); }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); }
async function getLiveNews() { return getSetting(LIVE_KEY, {}); }
function catOf(t) {
  if (/政策|发改委|购置税|补贴|法规/.test(t)) return '政策';
  if (/上市|发布|官图|预售|新车|交付/.test(t)) return '新车';
  if (/召回|维权|投诉/.test(t)) return '质量';
  return '行业';
}
function clean(s) { return (s || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim(); }
function proxyBase() { return (getSetting('newsProxy', '') || '').replace(/\/+$/, ''); }

function mapItem(it) {
  const title = clean(it.title) || '无标题';
  return {
    id: 'w-' + hashStr(it.url || title || Math.random()),
    title,
    link: it.url || it.link || '',
    pubDate: (it.date || '').slice(0, 10) || fmtDate(new Date()),
    source: it.source || '网络',
    category: catOf(title),
    pic: it.pic || '',
    desc: clean(it.desc)
  };
}

/* 经 Cloudflare Worker 代理获取真实内容（B站搜索"红旗" / "新能源汽车"） */
async function fetchViaProxy(ch) {
  const base = proxyBase();
  if (!base) return null;
  const q = ch === 'hongqi' ? '红旗汽车' : '新能源汽车';
  try {
    const r = await fetch(`${base}/news?src=bili&q=${encodeURIComponent(q)}`, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !d.ok || !Array.isArray(d.items) || !d.items.length) return null;
    return d.items.map(mapItem);
  } catch (e) { return null; }
}

async function renderNews(container) {
  const favs = await getFavs();
  const live = await getLiveNews();
  const cached = (live[newsChannel] && live[newsChannel].length) ? live[newsChannel] : null;
  const list = cached || NEWS_SEED.filter((n) => n.channel === newsChannel)
    .sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
  const fromLive = !!cached;
  const hasProxy = !!proxyBase();

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
      const thumb = n.pic ? `<img class="nthumb" src="${escapeHtml(n.pic)}" loading="lazy" onerror="this.style.display='none'">` : '';
      html += `<div class="news-item">
        ${thumb}
        <div class="nbody">
          <div class="nt" data-link="${escapeHtml(n.link || '')}">${escapeHtml(n.title)}</div>
          <div class="nm">
            <span><span class="tag">${escapeHtml(n.category)}</span>${escapeHtml(n.source)} · ${escapeHtml(n.pubDate)}</span>
            <span class="star" data-fav="${n.id}">${fav ? '★' : '☆'}</span>
          </div>
        </div>
      </div>`;
    }
  }

  if (fromLive) html += `<p class="muted" style="font-size:12px">✅ 已获取真实内容${newsChannel === 'hongqi' ? '（红旗动态）' : '（汽车资讯）'}。</p>`;
  else if (hasProxy) html += `<p class="muted" style="font-size:12px">本次未取到实时内容，显示示例；点「刷新」可重试。</p>`;
  else html += `<p class="muted" style="font-size:12px">当前为示例内容。在「我的」页填写新闻代理地址即可获取真实红旗动态。</p>`;

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
  const base = proxyBase();
  if (!base) { toast('请先在「我的」页填写新闻代理地址'); renderNews(container); return; }
  toast(isHq ? '正在获取红旗动态…' : '正在获取最新资讯…');
  try {
    const items = await fetchViaProxy(newsChannel);
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
