# 我的红旗 · 汽车记录工作台

安卓移动端优先的 PWA：加油记录、油价查询、汽车新闻（含红旗专属频道）。数据存本机，可云同步，永久不失效。

## 功能
- **加油记录**：加油日期（默认今天可改任意日期补记）、加多少 L、加多少钱、当时油价、油品标号、里程表（可选）。金额 / 升数 / 单价 任填其二自动推第三。多车数据隔离、统计看板、JSON 导出。
- **油价三视图**：今日油价（省市 + 92/95/98/柴油 + 涨跌箭头）、历史油价（省份 + 年度调价表）、调价日历（橙色圆点标调价日）。内置参考价，可手动更新。
- **新闻**：综合频道 + **红旗专属**频道。接入 Cloudflare Worker 代理后显示 B站/微博真实红旗动态；未配置时显示示例内容。分类 / 收藏 / 刷新。
- **我的**：多车管理、GitHub Gist 云同步、设置。

## 本地预览
```bash
cd <项目目录>
python -m http.server 8000
# 浏览器打开 http://127.0.0.1:8000
```

## 部署到 GitHub Pages（永久托管）
1. 在 GitHub 新建仓库（如 `wohongqi`）。
2. 推送本目录全部文件：
   ```bash
   git init
   git add .
   git commit -m "我的红旗 PWA"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/wohongqi.git
   git push -u origin main
   ```
3. 仓库 **Settings → Pages → Build and deployment → Source: Deploy from a branch**，选择 `main` / `root`，保存。
4. 等待数分钟，访问 `https://<你的用户名>.github.io/wohongqi/`。
5. 安卓浏览器打开 → 菜单「添加到主屏幕」，像原生 App 一样随时点开（离线也能启动）。

## 云同步（GitHub Gist）
1. GitHub → Settings → Developer settings → Personal access tokens → 生成 Token，勾选 `gist` 权限。
2. 应用内「我的」→ 填 Token 与 Gist ID（首次点「备份到云端」会自动生成 Gist ID 并回填）。
3. 换手机：同账号登录，填 Token + Gist ID → 「从云端恢复」即可。

## 接入真实新闻（Cloudflare Worker 代理）

浏览器 PWA 无法直接抓取 B站/微博/官网（跨域限制），需用一个小代理在服务器端抓取并加 CORS 头。`cloudflare-worker/news-proxy.js` 就是现成的代理，免费、永久在线、不用开电脑。

1. 打开 https://workers.cloudflare.com/ ，用 Cloudflare 账号登录（免费注册即可）。
2. **Create Worker** → 把 `cloudflare-worker/news-proxy.js` 内容**全部粘贴**覆盖默认代码 → **Deploy**。
3. 记下分配的子域，形如 `https://hongqi-news.<你的>.workers.dev`。
4. App 内「我的」→「新闻代理地址」填入该地址并保存。
5. 到「新闻」页点「刷新」，即可看到真实的红旗动态（B站搜索"红旗"结果）与综合汽车资讯。

> 代理返回格式：`{ ok:true, items:[{title, desc, url, pic, date, source}] }`。
> 想换源（如改用微博或官网）改 Worker 里的 `bili()` / `weibo()` 即可。
> 若 `*.workers.dev` 在你的网络下较慢，可在 Cloudflare 给 Worker 绑定一个自定义域名。

## 自定义
- **油价实时接口**：`js/price.js` 已接入 apizero 真实成品油接口（CORS `*` 已验证）；如需替换数据源，改 `fetchPrice()` 即可。
- **新闻源**：修改 `cloudflare-worker/news-proxy.js` 的抓取逻辑，App 端无需改动。
- **主题色**：`css/style.css` 顶部 `--brand: #C8102E`。

## 目录
```
index.html            应用外壳 + 底部 Tab
manifest.webmanifest  PWA 清单
sw.js                 Service Worker（离线缓存）
css/style.css         样式
js/db.js              IndexedDB + 通用工具
js/cars.js            多车管理
js/fuel.js            加油记录
js/price.js           油价三视图
js/news.js            新闻
js/sync.js            GitHub Gist 云同步
cloudflare-worker/
  news-proxy.js        Cloudflare Worker 新闻代理（真实红旗动态）
```
