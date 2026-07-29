/* 新闻模块：免费 RSS 综合频道 + 红旗专属频道（种子兜底，永远不空白） */

const NEWS_SEED = [
  { id: 'g1', channel: 'general', title: '2026 新能源车购置补贴政策延续，燃油车市场承压', source: '汽车之家', link: '', pubDate: '2026-07-28', category: '政策' },
  { id: 'g2', channel: 'general', title: '上半年国内乘用车销量同比微增，自主品牌份额创新高', source: '懂车帝', link: '', pubDate: '2026-07-27', category: '行业' },
  { id: 'g3', channel: 'general', title: '多地加油站升级 98 号油品，车主加注体验改善', source: '易车', link: '', pubDate: '2026-07-26', category: '行业' },
  { id: 'g4', channel: 'general', title: '发改委最新成品油调价：汽油每吨上调约 150 元', source: '新华社', link: '', pubDate: '2026-07-16', category: '政策' },
  { id: 'h1', channel: 'hongqi', title: '红旗 H9 改款官图发布，全新前脸更显庄重', source: '红旗官方', link: '', pubDate: '2026-07-28', category: '新车' },
  { id: 'h2', channel: 'hongqi', title: '红旗新能源 EHS7 开启交付，续航突破 700km', source: '红旗官方', link: '', pubDate: '2026-07-25', category: '新车' },
  { id: 'h3', channel: 'hongqi', title: '红旗车主俱乐部夏季自驾活动报名启动', source: '红旗官方', link: '', pubDate: '2026-07-22', category: '车主' }
];

const RSS_FEEDS = { general: 'https://www.autohome.com.cn/rss/news.xml' };

let newsChannel = 'general';

async function getFavs() { return getSetting('favNews', []); }

function newsList(channel) {
  return NEWS_SEED.filter((n) => n.channel === channel)
    .sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
}

async function renderNews(container) {
  const favs = await getFavs();
  let html = `<div class="news-tabs">
    <div class="news-tab ${newsChannel === 'general' ? 'active' : ''}" data-nc="general">综合</div>
    <div class="news-tab ${newsChannel === 'hongqi' ? 'active' : ''}" data-nc="hongqi">红旗专属</div>
  </div>`;
  html += `<button class="btn ghost sm" id="newsRefresh" style="margin-bottom:12px">↻ 刷新</button>`;

  const list = newsList(newsChannel);
  if (list.length === 0) {
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
  if (newsChannel === 'hongqi') html += '<p class="muted" style="font-size:12px">红旗动态为示例内容，可在 js/news.js 中替换为红旗官方 RSS。</p>';

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
  if (newsChannel === 'hongqi') { toast('红旗为官方示例，已刷新'); renderNews(container); return; }
  toast('正在获取最新资讯…');
  try {
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_FEEDS.general)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('bad');
    const data = await resp.json();
    const items = (data.items || []).slice(0, 8);
    for (const it of items) {
      const id = 'r' + Date.now() + Math.random().toString(36).slice(2, 6);
      NEWS_SEED.unshift({
        id, channel: 'general',
        title: it.title || '无标题',
        source: (data.feed && data.feed.title) || 'RSS',
        link: it.link || '',
        pubDate: (it.pubDate || '').slice(0, 10),
        category: '资讯'
      });
    }
    toast('已更新最新资讯');
  } catch (e) {
    toast('在线获取失败，显示示例内容');
  }
  renderNews(container);
}
