/* 首页 3D 爱车模型（第三波 · 标准融合）
 * - 动态加载 Three.js（importmap 在 index.html 声明），离线/CDN 不可达时优雅降级为静态头像
 * - 优先加载 models/car.glb（用户提供车图 → 图生3D 生成后放入）；不存在则用程序化通用红旗车模占位
 * - 可被拖动旋转 / 自动旋转；切页时通过 window.__home3dDispose 释放，避免 WebGL 内存泄漏
 */
window.initHome3D = async function (canvas, opts = {}) {
  const fallback = opts.fallback || null;
  const showFallback = () => {
    if (canvas) canvas.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';
  };
  // 释放上一实例
  if (typeof window.__home3dDispose === 'function') {
    try { window.__home3dDispose(); } catch (e) {}
  }

  let THREE, OrbitControls, GLTFLoader;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
  } catch (e) {
    console.warn('[红旗] Three.js 加载失败（可能离线），降级为静态头像', e);
    showFallback();
    return;
  }
  // DRACOLoader 为可选：仅当真实车模带 Draco 压缩时才需要；加载失败不影响非 Draco 模型
  let DRACOLoader = null;
  try {
    ({ DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js'));
  } catch (e) { /* 非 Draco 模型无需解码器，忽略 */ }

  const wrap = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // 透明，透出 banner 红渐变背景

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(3.8, 2.1, 4.6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = opts.autoRotate !== false;
  controls.autoRotateSpeed = 1.4;
  controls.enablePan = false;
  controls.enableZoom = false;            // 小卡内不允许缩放，避免误触页面缩放
  controls.minDistance = 3.2;
  controls.maxDistance = 8;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.54;
  controls.target.set(0, 0.55, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(4, 7, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd0d0, 0.5);
  rim.position.set(-5, 3, -4); scene.add(rim);

  const carHolder = new THREE.Group();
  scene.add(carHolder);

  function buildProceduralCar() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xC8102E, metalness: 0.6, roughness: 0.35 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x223044, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.55 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.85 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xcfd3da, metalness: 0.9, roughness: 0.25 });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 1.7), bodyMat); lower.position.y = 0.5; g.add(lower);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 1.55), bodyMat); hood.position.y = 0.78; g.add(hood);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 1.45), bodyMat); cabin.position.set(-0.1, 1.18, 0); g.add(cabin);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.45, 1.47), glassMat); win.position.set(-0.1, 1.2, 0); g.add(win);
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24), hg = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 16);
    for (const [x, z] of [[1.2, 0.85], [1.2, -0.85], [-1.2, 0.85], [-1.2, -0.85]]) {
      const w = new THREE.Mesh(wg, tireMat); w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w);
      const h = new THREE.Mesh(hg, hubMat); h.rotation.x = Math.PI / 2; h.position.set(x, 0.42, z); g.add(h);
    }
    const hm = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.6 });
    const tm = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff2233, emissiveIntensity: 0.5 });
    for (const z of [0.55, -0.55]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.3), hm); a.position.set(1.82, 0.7, z); g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.32), tm); b.position.set(-1.82, 0.7, z); g.add(b);
    }
    return g;
  }

  carHolder.add(buildProceduralCar());

  function resize() {
    const w = wrap ? wrap.clientWidth : canvas.clientWidth;
    const h = wrap ? wrap.clientHeight : canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  let ro = null;
  if (window.ResizeObserver && wrap) { ro = new ResizeObserver(resize); ro.observe(wrap); }
  window.addEventListener('resize', resize);

  let rafId = 0;
  function loop() {
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  // 异步尝试加载真实车模（用户供图 → 图生3D 生成 models/car.glb 后自动启用），不影响首屏
  (async () => {
    try {
      const loader = new GLTFLoader();
      // 仅当存在 DRACOLoader 且模型带 Draco 压缩时才配置（当前真实车模为非 Draco，无需解码器）
      if (DRACOLoader) {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        loader.setDRACOLoader(dracoLoader);
      }
      // 追加 ?v=2 绕过手机端 HTTP/CDN/SW 各级缓存，确保加载最新真实车模
      const gltf = await loader.loadAsync('models/car.glb?v=2', () => {});
      while (carHolder.children.length) carHolder.remove(carHolder.children[0]);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 3.2 / maxDim;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += (size.y * scale) / 2;
      carHolder.add(model);
    } catch (e) {
      // 无真实模型或加载失败：保留程序化通用车模（正常路径）
    }
  })();

  window.__home3dDispose = () => {
    cancelAnimationFrame(rafId);
    if (ro) { ro.disconnect(); ro = null; }
    window.removeEventListener('resize', resize);
    renderer.dispose();
    window.__home3dDispose = null;
  };
};
