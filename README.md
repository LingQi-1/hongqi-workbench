# 我的红旗 · 汽车记录工作台

安卓移动端优先的 PWA：加油记录、油价查询。数据存本机，可云同步，永久不失效。

## 功能
- **加油记录**：加油日期（默认今天可改任意日期补记）、加多少 L、加多少钱、当时油价、油品标号、里程表（可选）。金额必填；升数 / 单价 任意填一项，另一项自动算出（也可都不填，只记金额）。多车数据隔离、统计看板、油价趋势图。
- **油价三视图**：今日油价（省市 + 92/95/98/柴油 + 涨跌箭头）、历史油价（省份 + 年度调价表）、调价日历（橙色圆点标调价日）。内置参考价，可手动更新。
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

## 自定义
- **油价实时接口**：`js/price.js` 已接入 apizero 真实成品油接口（CORS `*` 已验证）；如需替换数据源，改 `fetchPrice()` 即可。
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
js/sync.js            GitHub Gist 云同步
```
