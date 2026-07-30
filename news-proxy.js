/**
 * 我的红旗 · 新闻代理（Cloudflare Worker）
 * ------------------------------------------------------------
 * 作用：在服务器端抓取 B站 / 微博 的红旗相关真实内容，
 *       加上 CORS 头后返回 JSON，供 PWA 前端直接调用（绕过浏览器跨域限制）。
 *
 * 部署（免费，3 分钟）：
 *   1. 打开 https://workers.cloudflare.com/ 并用 Cloudflare 账号登录（没有就注册，免费）
 *   2. 点「Create Worker」→ 把本文件内容全部粘贴进编辑器（覆盖默认代码）
 *   3. 点「Deploy」→ 记下分配的子域，形如 https://hongqi-news.xxx.workers.dev
 *   4. 把这个地址填进 App「我的」页的「新闻代理地址」
 *
 * 前端调用：
 *   GET https://<你的子域>.workers.dev/news?src=bili&q=红旗
 * 返回：
 *   { "ok": true, "items": [ { "title","desc","url","pic","date","source" } ] }
 */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=600'
    }
  });
}

function clean(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function bili(q) {
  const url = 'https://api.bilibili.com/x/web-interface/search/all/v2?keyword=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/' } });
  const d = await r.json();
  const items = [];
  for (const g of (d.data && d.data.result) || []) {
    for (const it of (g.data || []).slice(0, 4)) {
      const title = clean(it.title || it.name);
      if (!title) continue;
      items.push({
        title,
        desc: clean(it.description),
        url: it.arcurl || it.url || ('https://www.bilibili.com/video/' + (it.bvid || '')),
        pic: it.pic || '',
        date: it.pubdate ? new Date(it.pubdate * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        source: '哔哩哔哩'
      });
    }
  }
  return items;
}

async function weibo(q) {
  const url = 'https://m.weibo.cn/api/container/getIndex?containerid=' + encodeURIComponent('100103type=1&q=' + q);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const d = await r.json();
  const items = [];
  for (const c of (d.data && d.data.cards) || []) {
    const mb = c.mblog;
    if (!mb) continue;
    const text = clean(mb.text);
    if (!text) continue;
    items.push({
      title: text.slice(0, 80),
      desc: '',
      url: 'https://m.weibo.cn/detail/' + (mb.bid || mb.id),
      pic: (mb.pic && mb.pic.url) || '',
      date: mb.created_at ? new Date(mb.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      source: '微博'
    });
  }
  return items;
}

export default {
  async fetch(request) {
    const u = new URL(request.url);
    const q = u.searchParams.get('q') || '红旗';
    const src = (u.searchParams.get('src') || 'bili').toLowerCase();
    try {
      let items = src === 'weibo' ? await weibo(q) : await bili(q);
      if (!items.length && src !== 'bili') items = await bili(q); // 失败兜底到 B站
      return cors({ ok: true, items: items.slice(0, 12) });
    } catch (e) {
      return cors({ ok: false, error: String(e), items: [] });
    }
  }
};
