/* 附近加油站地图（第二大点）
   免费方案：浏览器定位 + OpenStreetMap 瓦片 + Overpass API 搜 amenity=fuel
   无需任何密钥；地图库 Leaflet 按需从 CDN 动态加载。 */

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet 未就绪'));
    js.onerror = () => reject(new Error('地图库加载失败（网络受限）'));
    document.head.appendChild(js);
  });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function fetchNearbyFuel(lat, lon, radius = 3000) {
  const q = `[out:json][timeout:25];node["amenity"="fuel"](around:${radius},${lat},${lon});out 60;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q)
  });
  if (!r.ok) throw new Error('Overpass ' + r.status);
  const j = await r.json();
  return (j.elements || [])
    .map((e) => {
      const t = e.tags || {};
      return {
        lat: e.lat, lon: e.lon,
        name: t.name || t.operator || '加油站',
        brand: t.operator || t.brand || '',
        dist: haversine(lat, lon, e.lat, e.lon)
      };
    })
    .filter((s) => s.name)
    .sort((a, b) => a.dist - b.dist);
}

function drawStations(map, stations, listEl) {
  if (!stations.length) {
    listEl.innerHTML = '<div class="muted" style="font-size:13px;padding:8px 0">附近 3 公里内未找到加油站（数据来自 OpenStreetMap，可能不完整）。</div>';
    return;
  }
  const markers = {};
  stations.forEach((s, i) => {
    markers[i] = L.marker([s.lat, s.lon]).addTo(map).bindPopup(`${escapeHtml(s.name)}<br>${s.dist} m`);
  });
  let html = '';
  stations.slice(0, 30).forEach((s, i) => {
    html += `<div class="item" data-idx="${i}" style="cursor:pointer">
      <span style="font-size:20px">⛽</span>
      <div class="main">
        <div class="t1">${escapeHtml(s.name)}</div>
        <div class="t2">${s.brand ? escapeHtml(s.brand) + ' · ' : ''}${s.dist} m</div>
      </div>
    </div>`;
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll('[data-idx]').forEach((el) => {
    el.addEventListener('click', () => {
      const i = +el.getAttribute('data-idx');
      map.setView([stations[i].lat, stations[i].lon], 16);
      markers[i].openPopup();
    });
  });
}

async function locateAndShow(card) {
  const hint = card.querySelector('#mapHint');
  const box = card.querySelector('#mapBox');
  const listEl = card.querySelector('#stationList');
  if (!navigator.geolocation) { hint.textContent = '当前浏览器不支持定位'; return; }

  hint.style.display = 'flex';
  hint.textContent = '正在定位…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    try {
      const L = await loadLeaflet();
      if (window._nearbyMap) { try { window._nearbyMap.remove(); } catch (e) {} }
      box.innerHTML = '';
      const map = L.map(box).setView([lat, lon], 14);
      window._nearbyMap = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      }).addTo(map);
      L.marker([lat, lon]).addTo(map).bindPopup('我的位置').openPopup();
      hint.style.display = 'none';

      listEl.innerHTML = '<div class="muted" style="font-size:13px;padding:8px 0">正在搜索附近加油站…</div>';
      const stations = await fetchNearbyFuel(lat, lon);
      drawStations(map, stations, listEl);
      // 适配容器尺寸（异步插入后需 invalidateSize）
      setTimeout(() => map.invalidateSize(), 200);
    } catch (e) {
      hint.style.display = 'flex';
      hint.textContent = '地图加载失败：' + e.message + '（可能因网络受限）';
      listEl.innerHTML = '';
    }
  }, (err) => {
    hint.textContent = '定位失败：' + (err && err.message ? err.message : '已拒绝授权') + '。请在浏览器中允许位置权限后重试。';
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function renderNearbyStations(container) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginTop = '12px';
  card.innerHTML = `
    <div class="card-title">📍 附近加油站</div>
    <div id="mapBox" style="height:220px;border-radius:12px;overflow:hidden;background:#e9e9ee;position:relative">
      <div id="mapHint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;text-align:center;padding:16px">点击下方按钮，授权定位后显示周边加油站</div>
    </div>
    <button class="btn" id="locateBtn" style="margin-top:10px;width:100%">📍 定位并查找附近加油站</button>
    <div id="stationList" style="margin-top:10px"></div>
    <p class="muted" style="font-size:12px;margin-top:6px">数据来自 OpenStreetMap（免费、无需密钥）。首次定位需授权位置权限；地图加载依赖网络。</p>
  `;
  container.appendChild(card);
  card.querySelector('#locateBtn').addEventListener('click', () => locateAndShow(card));
}
