/* 3D broadcast view for Arcade Racing.
   Same race clock and lane math as the 2D track. Three.js draws the stadium. */
(function () {
  'use strict';

  const CAMS = [
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'rail', label: 'Rail' },
    { id: 'chase', label: 'Chase' },
    { id: 'finish', label: 'Finish' },
    { id: 'stands', label: 'Grandstand' },
    { id: 'drone', label: 'Drone' },
    { id: 'jockey', label: 'Jockey' },
    { id: 'orbit', label: 'Orbit' }
  ];

  const LOOK = {
    1: { coat: 0xa85b2a, mane: 0x3a2416, silk: 0xd01212 },
    2: { coat: 0xf4f1ea, mane: 0x5a3a24, silk: 0x1d4ed8 },
    3: { coat: 0xf3e6cf, mane: 0x8d8680, silk: 0xe0b000 },
    4: { coat: 0x6d5148, mane: 0x241c18, silk: 0x7c3aed },
    5: { coat: 0xc47a3a, mane: 0x4a2c16, silk: 0xf97316 },
    6: { coat: 0xb7d4d6, mane: 0x3e6268, silk: 0x0f9f78 },
    7: { coat: 0xe7e4ee, mane: 0x6a6874, silk: 0xec4899 },
    8: { coat: 0x243028, mane: 0x101814, silk: 0xf4f7fb }
  };

  const PAL = {
    grass: {
      skyTop: '#6eb6ef', skyBot: '#d9eefe', fog: '#c5e0f4', fogNear: 55, fogFar: 190,
      sun: '#fff6d8', sunDisk: 1, sunPos: [26, 40, 14], hemiSky: '#e7f4ff', hemiGround: '#3d6b32',
      sunI: 1.28, fill: '#d5e4f5', fillI: 0.4, exposure: 1.06,
      trackA: '#3c7632', trackB: '#4c8a3e', infield: '#3d8c3a', apron: '#243028', ground: '#1a331c',
      dust: '#cbb892', tree: '#2f7a34', railE: '#000000', railEI: 0, spotI: 0, cyber: false
    },
    dirt: {
      skyTop: '#ff7a3c', skyBot: '#ffd8ae', fog: '#f0c4a0', fogNear: 46, fogFar: 170,
      sun: '#ffb15e', sunDisk: 1.2, sunPos: [46, 14, 6], hemiSky: '#ffd0aa', hemiGround: '#6a4030',
      sunI: 1.35, fill: '#ffd8c0', fillI: 0.45, exposure: 1.12,
      trackA: '#8a5730', trackB: '#a56b3e', infield: '#6d8a3c', apron: '#3a2c24', ground: '#3a2a20',
      dust: '#c9a27a', tree: '#3e6a32', railE: '#000000', railEI: 0, spotI: 0.2, cyber: false
    },
    night: {
      skyTop: '#02040c', skyBot: '#102038', fog: '#070b14', fogNear: 30, fogFar: 140,
      sun: '#e4ecff', sunDisk: 0.22, sunPos: [-18, 34, -14], hemiSky: '#243656', hemiGround: '#0a1018',
      sunI: 0.2, fill: '#7a96c8', fillI: 0.2, exposure: 0.8,
      trackA: '#1a4626', trackB: '#235832', infield: '#14361c', apron: '#121820', ground: '#080c12',
      dust: '#a8b0ba', tree: '#102616', railE: '#d5e2f4', railEI: 0.35, spotI: 6.2, cyber: false
    },
    cyber: {
      skyTop: '#00030a', skyBot: '#00141c', fog: '#00060e', fogNear: 26, fogFar: 130,
      sun: '#17f0ff', sunDisk: 0.04, sunPos: [8, 28, 10], hemiSky: '#063848', hemiGround: '#140018',
      sunI: 0.32, fill: '#ff3df6', fillI: 0.28, exposure: 0.94,
      trackA: '#031018', trackB: '#06222c', infield: '#03140e', apron: '#070812', ground: '#02040a',
      dust: '#7ef6ff', tree: '#042018', railE: '#17f0ff', railEI: 0.85, spotI: 3.4, cyber: true
    }
  };

  function stub() {
    const btn = document.getElementById('btnToggleView');
    if (btn) {
      btn.onclick = () => {
        const hint = document.getElementById('camHudHint');
        if (hint) hint.textContent = '3D view could not start';
      };
    }
    return { onField() {}, onCourse() {}, onTrack() {}, resize() {} };
  }

  function ink(hex) {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1a1a1a' : '#ffffff';
  }

  function cssHex(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1)));
    return t * t * (3 - 2 * t);
  }

  window.RaceView3D = {
    attach(api) {
      if (!window.THREE) return stub();
      const THREE = window.THREE;
      const game = api.game;

      const WORLD = 0.15;
      const STRAIGHT_STRETCH = 2.5;
      const outer = document.querySelector('.track-outer');
      const canvas = document.getElementById('view3dCanvas');
      const btn = document.getElementById('btnToggleView');
      const sel = document.getElementById('cameraSelect');
      const bar = document.getElementById('camBar');
      const hudName = document.getElementById('camHudName');
      const hudHint = document.getElementById('camHudHint');

      let renderer, scene, camera, skyMat, hemi, sun, fill, sunTarget;
      let worldGroup = null;
      let fieldGroup = null;
      let raf = 0;
      let active = false;
      let worldDirty = true;
      let fieldDirty = true;
      let lastTs = 0;
      let snapCam = true;
      let camId = 'orbit';
      const ZOOM_MIN = 0.55;
      const ZOOM_MAX = 2.15;
      const zoomByCam = {
        broadcast: 1, rail: 1, chase: 1, finish: 1, stands: 1, drone: 1, jockey: 1, orbit: ZOOM_MIN
      };
      let zoom = ZOOM_MIN;
      let gateOpen = 0;
      let droneAng = 0.4;
      let horses = [];
      let gateDoors = [];
      let flagPivots = [];
      let dustPool = [];
      let loopStarted = false;
      const camPos = new THREE.Vector3(0, 18, 40);
      const camLook = new THREE.Vector3(0, 1, 0);
      const desiredPos = new THREE.Vector3();
      const desiredLook = new THREE.Vector3();
      const orbit = { theta: -Math.PI / 2, phi: 1.02, radius: 54 };
      let orbitEase = false;
      let orbitAtFinish = false;
      const refs = { spots: [], bulbs: [] };
      const GEO = {};
      const MAT = {};
      const texCache = {};
      const medalCache = {};
      const _fwd = new THREE.Vector3();
      const _out = new THREE.Vector3();
      const _pack = new THREE.Vector3();

      game.state.viewMode = game.state.viewMode || '3d';
      game.state.camera = game.state.camera || 'orbit';

      function svgToWorld(x, y) {
        const stretch = game.state.trackMode === 'straight' ? STRAIGHT_STRETCH : 1;
        return new THREE.Vector3((x - 500) * WORLD * stretch, 0, (y - 300) * WORLD);
      }

      function worldPose(t, laneIndex) {
        const p = api.pointForMode(t, laneIndex);
        const ahead = api.pointForMode(t + 0.004, laneIndex);
        const a = svgToWorld(p.x, p.y);
        const b = svgToWorld(ahead.x, ahead.y);
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        if (dx * dx + dz * dz < 1e-8) {
          const back = api.pointForMode(t - 0.004, laneIndex);
          const c = svgToWorld(back.x, back.y);
          dx = a.x - c.x;
          dz = a.z - c.z;
        }
        return { x: a.x, z: a.z, yaw: Math.atan2(dx, dz) };
      }

      function outward(pos) {
        if (game.state.trackMode === 'straight') return _out.set(0, 0, 1);
        _out.set(pos.x, 0, pos.z);
        if (_out.lengthSq() < 0.25) _out.set(0, 0, -1);
        return _out.normalize();
      }

      function sampleOval(level, segs) {
        const geom = api.getVisualLane(level);
        const pts = [];
        for (let i = 0; i < segs; i++) {
          const p = api.stadiumPointAt(i / segs, geom);
          pts.push(svgToWorld(p.x, p.y));
        }
        return pts;
      }

      function acrossTrack(t, segs) {
        const pts = [];
        const count = segs + 1;
        for (let i = 0; i < count; i++) {
          const level = 0.08 + (2.52 - 0.08) * (i / segs);
          const geom = api.getVisualLane(level);
          const tt = ((t % 1) + 1) % 1;
          const p = api.stadiumPointAt(tt, geom);
          pts.push(svgToWorld(p.x, p.y));
        }
        return pts;
      }

      function wallGeo(pts, y0, y1, uvScale) {
        const n = pts.length;
        const pos = new Float32Array(n * 6);
        const uv = new Float32Array(n * 4);
        const lens = new Float32Array(n);
        let total = 0;
        for (let i = 0; i < n; i++) {
          if (i) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
          lens[i] = total;
        }
        total += Math.hypot(pts[0].x - pts[n - 1].x, pts[0].z - pts[n - 1].z) || 1;
        for (let i = 0; i < n; i++) {
          const u = (lens[i] / total) * uvScale;
          pos[i * 6] = pts[i].x; pos[i * 6 + 1] = y0; pos[i * 6 + 2] = pts[i].z;
          pos[i * 6 + 3] = pts[i].x; pos[i * 6 + 4] = y1; pos[i * 6 + 5] = pts[i].z;
          uv[i * 4] = u; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
        }
        const idx = [];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const a = i * 2, b = a + 1, c = j * 2, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      }

      function deckGeo(inner, outer, y0, y1, uvScale) {
        const n = inner.length;
        const pos = new Float32Array(n * 6);
        const uv = new Float32Array(n * 4);
        const lens = new Float32Array(n);
        let total = 0;
        for (let i = 0; i < n; i++) {
          if (i) total += Math.hypot(inner[i].x - inner[i - 1].x, inner[i].z - inner[i - 1].z);
          lens[i] = total;
        }
        total += Math.hypot(inner[0].x - inner[n - 1].x, inner[0].z - inner[n - 1].z) || 1;
        for (let i = 0; i < n; i++) {
          const u = (lens[i] / total) * (uvScale || 10);
          pos[i * 6] = inner[i].x; pos[i * 6 + 1] = y0; pos[i * 6 + 2] = inner[i].z;
          pos[i * 6 + 3] = outer[i].x; pos[i * 6 + 4] = y1; pos[i * 6 + 5] = outer[i].z;
          uv[i * 4] = u; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
        }
        const idx = [];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const a = i * 2, b = a + 1, c = j * 2, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      }

      function openDeck(a, b, y) {
        const n = a.length;
        const pos = new Float32Array(n * 6);
        const uv = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? 0 : i / (n - 1);
          pos[i * 6] = a[i].x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = a[i].z;
          pos[i * 6 + 3] = b[i].x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = b[i].z;
          uv[i * 4] = u; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
        }
        const idx = [];
        for (let i = 0; i < n - 1; i++) {
          const a0 = i * 2, b0 = a0 + 1, c0 = (i + 1) * 2, d0 = c0 + 1;
          idx.push(a0, c0, b0, b0, c0, d0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      }

      function fanGeo(pts, y) {
        const n = pts.length;
        const pos = new Float32Array((n + 1) * 3);
        pos[0] = 0; pos[1] = y; pos[2] = 0;
        for (let i = 0; i < n; i++) {
          pos[(i + 1) * 3] = pts[i].x;
          pos[(i + 1) * 3 + 1] = y;
          pos[(i + 1) * 3 + 2] = pts[i].z;
        }
        const idx = [];
        for (let i = 0; i < n; i++) idx.push(0, i + 1, ((i + 1) % n) + 1);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      }

      function disposeNode(root) {
        const mats = new Set();
        root.traverse(n => {
          if (n.geometry && !n.userData.keepGeo) n.geometry.dispose();
          if (n.material) [].concat(n.material).forEach(m => mats.add(m));
        });
        mats.forEach(m => {
          if (m.userData && m.userData.keep) return;
          if (m.userData && m.userData.ownMap && m.map) m.map.dispose();
          m.dispose();
        });
      }

      function ensureGeo() {
        if (GEO.ready) return;
        GEO.sphere = new THREE.SphereGeometry(1, 16, 12);
        GEO.thigh = new THREE.CylinderGeometry(0.075, 0.095, 0.46, 7);
        GEO.cannon = new THREE.CylinderGeometry(0.046, 0.058, 0.42, 6);
        GEO.hoof = new THREE.BoxGeometry(0.13, 0.08, 0.16);
        GEO.ear = new THREE.ConeGeometry(0.05, 0.18, 5);
        GEO.tail = new THREE.CylinderGeometry(0.02, 0.075, 0.82, 5);
        GEO.plane = new THREE.PlaneGeometry(1, 1);
        GEO.stallWall = new THREE.BoxGeometry(0.055, 1.4, 2.15);
        GEO.ready = true;

        MAT.hoof = new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 0.45, metalness: 0.15 });
        MAT.eye = new THREE.MeshStandardMaterial({ color: 0x140c0a, roughness: 0.35 });
        MAT.skin = new THREE.MeshStandardMaterial({ color: 0xd7a88a, roughness: 0.6 });
        MAT.tack = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.55 });
        MAT.gate = new THREE.MeshStandardMaterial({ color: 0xd5dde8, metalness: 0.62, roughness: 0.32 });
        MAT.blob = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
        MAT.white = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.42, metalness: 0.08 });
        [MAT.hoof, MAT.eye, MAT.skin, MAT.tack, MAT.gate, MAT.blob, MAT.white].forEach(m => { m.userData.keep = true; });
      }

      function srgbTex(tex) {
        if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }

      function surfaceTex(kind) {
        if (texCache[kind]) return texCache[kind];
        const skin = PAL[kind] || PAL.grass;
        const c = document.createElement('canvas');
        c.width = 256; c.height = 64;
        const g = c.getContext('2d');
        const img = g.createImageData(256, 64);
        const ca = new THREE.Color(skin.trackA);
        const cb = new THREE.Color(skin.trackB);
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 256; x++) {
            const stripe = Math.floor(x / 16) % 2;
            const base = stripe ? cb : ca;
            let r = base.r, gg = base.g, b = base.b;
            const n = (Math.random() - 0.5) * (kind === 'cyber' ? 0.04 : 0.07);
            r = Math.min(1, Math.max(0, r + n));
            gg = Math.min(1, Math.max(0, gg + n));
            b = Math.min(1, Math.max(0, b + n));
            if (kind === 'cyber' && (x % 32 === 0 || y % 16 === 0)) {
              r = x % 32 === 0 ? 0.05 : 0.9;
              gg = 0.95; b = 1;
            }
            const i = (y * 256 + x) * 4;
            img.data[i] = r * 255; img.data[i + 1] = gg * 255; img.data[i + 2] = b * 255; img.data[i + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        const tex = srgbTex(new THREE.CanvasTexture(c));
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        texCache[kind] = tex;
        return tex;
      }

      function paintNumber(num, bg) {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        g.fillStyle = cssHex(bg);
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.lineWidth = 10;
        g.strokeRect(7, 7, 114, 114);
        g.fillStyle = ink(bg);
        g.font = '800 78px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(num), 64, 72);
        return srgbTex(new THREE.CanvasTexture(c));
      }

      function medalTex(place) {
        if (medalCache[place]) return medalCache[place];
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        g.font = '48px serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉', 32, 36);
        medalCache[place] = srgbTex(new THREE.CanvasTexture(c));
        return medalCache[place];
      }

      function checkerTex() {
        if (texCache.checker) return texCache.checker;
        const c = document.createElement('canvas');
        c.width = 128; c.height = 32;
        const g = c.getContext('2d');
        const n = 10;
        for (let i = 0; i < n; i++) {
          g.fillStyle = i % 2 ? '#111' : '#f5f5f5';
          g.fillRect(i * (128 / n), 0, 128 / n, 16);
          g.fillStyle = i % 2 ? '#f5f5f5' : '#111';
          g.fillRect(i * (128 / n), 16, 128 / n, 16);
        }
        texCache.checker = srgbTex(new THREE.CanvasTexture(c));
        return texCache.checker;
      }

      function dustTex() {
        if (texCache.dust) return texCache.dust;
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
        grd.addColorStop(0, 'rgba(255,255,255,0.85)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        texCache.dust = srgbTex(new THREE.CanvasTexture(c));
        return texCache.dust;
      }

      function toteCanvas(side) {
        const back = side === 'back';
        const canvasKey = back ? 'toteBackCanvas' : 'toteCanvas';
        const texKey = back ? 'toteBackTex' : 'toteTex';
        if (refs[canvasKey]) return refs[canvasKey];
        const c = document.createElement('canvas');
        c.width = 1400;
        c.height = 384;
        refs[canvasKey] = c;
        refs[texKey] = srgbTex(new THREE.CanvasTexture(c));
        return c;
      }

      function oddsFraction(dec) {
        if (typeof dec !== 'number' || !isFinite(dec) || dec <= 1) return '—';
        let x = dec - 1;
        let num = 0;
        let den = 1;
        let prevNum = 1;
        let prevDen = 0;
        for (let i = 0; i < 16; i++) {
          const a = Math.floor(x);
          const nextNum = a * num + prevNum;
          const nextDen = a * den + prevDen;
          if (nextDen > 40) break;
          prevNum = num;
          prevDen = den;
          num = nextNum;
          den = nextDen;
          const frac = x - a;
          if (frac < 1e-4) break;
          x = 1 / frac;
        }
        if (!den) return '—';
        return num + '/' + den;
      }

      function paintSky(skin) {
        const geo = refs.skyGeo;
        if (!geo || !skin) return;
        const pos = geo.attributes.position;
        const top = new THREE.Color(skin.skyTop);
        const bot = new THREE.Color(skin.skyBot);
        const sun = new THREE.Color(skin.sun);
        const dir = new THREE.Vector3(skin.sunPos[0], skin.sunPos[1], skin.sunPos[2]).normalize();
        const col = new THREE.Color();
        const arr = new Float32Array(pos.count * 3);
        const n = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          n.fromBufferAttribute(pos, i).normalize();
          const h = Math.min(1, Math.max(0, n.y * 0.5 + 0.5));
          const t = h * h * (3 - 2 * h);
          col.copy(bot).lerp(top, t);
          const d = Math.max(0, n.dot(dir));
          if (skin.sunDisk) col.add(sun.clone().multiplyScalar(Math.pow(d, 28) * 0.55 * skin.sunDisk));
          arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }

      function paintTote() {
        const c = toteCanvas();
        const g = c.getContext('2d');
        const skin = PAL[game.state.course] || PAL.grass;
        const W = c.width;
        const H = c.height;
        g.fillStyle = '#071422';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = skin.cyber ? '#17f0ff' : '#f2d48a';
        g.lineWidth = 14;
        g.strokeRect(10, 10, W - 20, H - 20);
        const cup = (game.cups && game.cups[game.state.cupIndex]) ? game.cups[game.state.cupIndex].name : '';
        const heat = game.state.heat === 'trialA' ? 'TRIAL A' : game.state.heat === 'trialB' ? 'TRIAL B' : 'FINAL';
        const course = (game.courses.find(x => x.id === game.state.course) || {}).name || '';
        const phase = game.state.phase === 'RACING' ? 'RACING' : game.state.phase === 'RESULTS' ? 'RESULTS' : 'AT THE GATE';
        g.fillStyle = skin.cyber ? '#17f0ff' : '#f6e7b2';
        g.font = '800 42px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillText('ARCADE RACING', 36, 68);
        g.fillStyle = '#ffd166';
        g.font = '700 24px system-ui, sans-serif';
        g.textAlign = 'right';
        g.fillText(phase, W - 36, 64);
        g.textAlign = 'left';
        g.fillStyle = '#b7dcff';
        g.font = '600 22px system-ui, sans-serif';
        g.fillText(heat + '  ·  ' + course.toUpperCase() + (cup ? '  ·  ' + cup : ''), 36, 104);

        const race = api.getRace();
        let rows = [];
        if (race && race.horses && (game.state.phase === 'RACING' || game.state.phase === 'RESULTS')) {
          rows = race.horses.slice().sort((a, b) => {
            if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
            if (a.finished) return -1;
            if (b.finished) return 1;
            return (b.x || 0) - (a.x || 0);
          });
        } else {
          const ids = (game.state.entered && game.state.entered.length)
            ? game.state.entered
            : game.horses.map(h => h.id);
          rows = ids.map(id => ({ id }));
        }
        g.font = '700 26px system-ui, sans-serif';
        const colW = (W - 80) / 2;
        rows.slice(0, 8).forEach((row, i) => {
          const meta = game.horses.find(x => x.id === row.id);
          const name = meta ? meta.name : ('H' + row.id);
          const col = i < 4 ? 0 : 1;
          const line = i % 4;
          const x = 40 + col * colW;
          const y = 168 + line * 48;
          g.fillStyle = i === 0 ? '#ffd166' : '#e8f4ff';
          g.fillText((i + 1) + '   H' + row.id + '  ' + name, x, y);
        });
        if (refs.toteTex) refs.toteTex.needsUpdate = true;
      }

      function paintToteBack() {
        const c = toteCanvas('back');
        const g = c.getContext('2d');
        const W = c.width;
        const H = c.height;
        g.fillStyle = '#102418';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = '#e2b34a';
        g.lineWidth = 14;
        g.strokeRect(10, 10, W - 20, H - 20);
        const heat = game.state.heat === 'trialA' ? 'TRIAL A' : game.state.heat === 'trialB' ? 'TRIAL B' : 'FINAL';
        const course = (game.courses.find(x => x.id === game.state.course) || {}).name || '';
        const race = api.getRace();
        const laps = (race && race.laps) || game.state.laps || 1;
        let lapText = laps === 1 ? '1 LAP' : laps + ' LAPS';
        if (game.state.phase === 'RACING' && race && race.horses) {
          let along = 0;
          race.horses.forEach(h => {
            along = Math.max(along, (h.x || 0) - (game.state.trackTOffset || 0));
          });
          const lapNow = Math.min(laps, Math.floor(Math.max(0, along)) + 1);
          lapText = 'LAP ' + lapNow + ' / ' + laps;
        }
        g.fillStyle = '#f3d48a';
        g.font = '800 40px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillText('ODDS & BANKS', 36, 68);
        g.fillStyle = '#ffe7a8';
        g.font = '700 24px system-ui, sans-serif';
        g.textAlign = 'right';
        g.fillText(lapText, W - 36, 64);
        g.textAlign = 'left';
        g.fillStyle = '#b7e0c4';
        g.font = '600 22px system-ui, sans-serif';
        g.fillText(heat + '  ·  ' + course.toUpperCase(), 36, 104);

        const ids = (game.state.entered && game.state.entered.length)
          ? game.state.entered
          : game.horses.map(h => h.id);
        g.font = '700 26px system-ui, sans-serif';
        const colW = (W - 80) / 2;
        ids.slice(0, 8).forEach((id, i) => {
          const meta = game.horses.find(x => x.id === id);
          const name = meta ? meta.name : ('H' + id);
          const odds = game.state.odds ? game.state.odds[id] : null;
          const col = i < 4 ? 0 : 1;
          const line = i % 4;
          const x = 40 + col * colW;
          const y = 168 + line * 44;
          g.fillStyle = '#e8f6ee';
          g.fillText('H' + id + '  ' + name, x, y);
          g.fillStyle = '#ffd166';
          g.textAlign = 'right';
          g.fillText(oddsFraction(odds), x + colW - 28, y);
          g.textAlign = 'left';
        });

        const players = (game.players || []).slice(0, game.state.activePlayerCount || 3);
        g.fillStyle = '#0b1a12';
        g.fillRect(28, 332, W - 56, 36);
        g.font = '700 20px system-ui, sans-serif';
        players.forEach((p, i) => {
          const bank = Math.max(0, Math.round((p.bankroll || 0)));
          g.fillStyle = '#d7ffe6';
          g.fillText((p.name || ('Player ' + p.id)) + '  ' + bank, 48 + i * 320, 358);
        });
        if (refs.toteBackTex) refs.toteBackTex.needsUpdate = true;
      }

      function addToteScreen(parent, x, y, z, yaw, w, h) {
        paintTote();
        paintToteBack();
        const frontMat = new THREE.MeshBasicMaterial({ map: refs.toteTex });
        const backMat = new THREE.MeshBasicMaterial({ map: refs.toteBackTex });
        const nx = Math.sin(yaw);
        const nz = Math.cos(yaw);
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
        front.rotation.y = yaw;
        front.position.set(x + nx * 0.14, y, z + nz * 0.14);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backMat);
        back.rotation.y = yaw + Math.PI;
        back.position.set(x - nx * 0.14, y, z - nz * 0.14);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.55, h + 0.48, 0.12),
          new THREE.MeshStandardMaterial({ color: 0x101820, metalness: 0.4, roughness: 0.4 })
        );
        frame.position.set(x, y, z);
        frame.rotation.y = yaw;
        parent.add(frame);
        parent.add(front);
        parent.add(back);
      }

      function paintAdCanvas(c, label, bg, accent, border) {
        const w = c.width;
        const h = c.height;
        const g = c.getContext('2d');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = border || accent;
        g.lineWidth = Math.max(10, Math.round(Math.min(w, h) * 0.04));
        const inset = g.lineWidth;
        g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
        g.fillStyle = accent;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        let size = Math.round(h * 0.42);
        g.font = '800 ' + size + 'px system-ui, sans-serif';
        const limit = w * 0.84;
        while (size > 24 && g.measureText(label).width > limit) {
          size -= 2;
          g.font = '800 ' + size + 'px system-ui, sans-serif';
        }
        g.fillText(label, w / 2, h / 2);
      }

      function adBoardTex(label, bg, accent, w, h, border) {
        const c = document.createElement('canvas');
        c.width = w || 512;
        c.height = h || 512;
        paintAdCanvas(c, label, bg, accent, border);
        return srgbTex(new THREE.CanvasTexture(c));
      }

      function tvnColours(hue) {
        const h = ((hue % 360) + 360) % 360;
        return {
          bg: 'hsl(' + h.toFixed(1) + ' 48% 12%)',
          accent: 'hsl(' + ((h + 32) % 360).toFixed(1) + ' 92% 66%)'
        };
      }

      function updateTvnBoards(time, dt) {
        const boards = refs.tvnBoards;
        if (!boards || !boards.length) return;
        boards.forEach(board => {
          if (time >= board.next) {
            board.target = Math.random() * 360;
            board.next = time + 1.5 + Math.random() * 2.4;
          }
          let dh = board.target - board.hue;
          if (dh > 180) dh -= 360;
          if (dh < -180) dh += 360;
          board.hue = (board.hue + dh * Math.min(1, dt * 1.15) + 360) % 360;
          const colours = tvnColours(board.hue);
          paintAdCanvas(board.canvas, board.label, colours.bg, colours.accent);
          board.tex.needsUpdate = true;
        });
      }

      function addJumbotron(parent, x, y, z, yaw) {
        const length = 24;
        const height = 6.6;
        const depth = height;
        const root = new THREE.Group();
        root.position.set(x, y, z);
        root.rotation.y = yaw;
        const shell = new THREE.Mesh(
          new THREE.BoxGeometry(length, height, depth),
          new THREE.MeshStandardMaterial({ color: 0x141820, metalness: 0.45, roughness: 0.38 })
        );
        shell.castShadow = true;
        shell.receiveShadow = true;
        root.add(shell);
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xc6a15a, metalness: 0.55, roughness: 0.32 });
        const topLip = new THREE.Mesh(
          new THREE.BoxGeometry(length + 0.28, 0.18, depth + 0.28),
          new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.12, roughness: 0.78 })
        );
        topLip.position.y = height / 2 + 0.02;
        root.add(topLip);
        const bottomLip = new THREE.Mesh(
          new THREE.BoxGeometry(length + 0.28, 0.18, depth + 0.28),
          trimMat
        );
        bottomLip.position.y = -height / 2 - 0.02;
        root.add(bottomLip);

        paintTote();
        paintToteBack();
        const screenW = 22.2;
        const screenH = 5.7;
        const front = new THREE.Mesh(
          new THREE.PlaneGeometry(screenW, screenH),
          new THREE.MeshBasicMaterial({ map: refs.toteTex })
        );
        front.position.z = depth / 2 + 0.04;
        root.add(front);
        const back = new THREE.Mesh(
          new THREE.PlaneGeometry(screenW, screenH),
          new THREE.MeshBasicMaterial({ map: refs.toteBackTex })
        );
        back.rotation.y = Math.PI;
        back.position.z = -depth / 2 - 0.04;
        root.add(back);

        const end = height * 0.78;
        refs.tvnBoards = [];
        function addTvnEnd(sign) {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 512;
          const tex = srgbTex(new THREE.CanvasTexture(canvas));
          const board = {
            canvas,
            tex,
            label: 'tvn.lol',
            hue: Math.random() * 360,
            target: Math.random() * 360,
            next: 0
          };
          const colours = tvnColours(board.hue);
          paintAdCanvas(canvas, board.label, colours.bg, colours.accent);
          refs.tvnBoards.push(board);
          const face = new THREE.Mesh(
            new THREE.PlaneGeometry(end, end),
            new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
          );
          face.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
          face.position.x = sign * (length / 2 + 0.08);
          face.userData.kind = 'ad';
          face.userData.href = 'https://tvn.lol';
          root.add(face);
        }
        addTvnEnd(1);
        addTvnEnd(-1);

        const roof = new THREE.Mesh(
          new THREE.PlaneGeometry(22.6, 5.65),
          new THREE.MeshBasicMaterial({
            map: adBoardTex('luckyradio.lol', '#140812', '#ffd166', 1024, 256, '#000000'),
            side: THREE.DoubleSide
          })
        );
        roof.rotation.x = -Math.PI / 2;
        roof.position.y = height / 2 + 0.16;
        roof.userData.kind = 'ad';
        roof.userData.href = 'https://luckyradio.lol';
        root.add(roof);

        parent.add(root);
        refs.jumboRoot = root;
      }

      function addMesh(geo, material, parent) {
        const m = new THREE.Mesh(geo, material);
        m.userData.keepGeo = true;
        if (parent) parent.add(m);
        return m;
      }

      function ball(parent, material, x, y, z, sx, sy, sz) {
        const m = addMesh(GEO.sphere, material, parent);
        m.position.set(x, y, z);
        m.scale.set(sx, sy, sz);
        m.castShadow = true;
        return m;
      }

      function makeLeg(parent, x, y, z, phase, coat) {
        const hip = new THREE.Group();
        hip.position.set(x, y, z);
        const thigh = addMesh(GEO.thigh, coat, hip);
        thigh.position.y = -0.23;
        thigh.castShadow = true;
        const knee = new THREE.Group();
        knee.position.y = -0.46;
        const cannon = addMesh(GEO.cannon, coat, knee);
        cannon.position.y = -0.21;
        cannon.castShadow = true;
        const hoof = addMesh(GEO.hoof, MAT.hoof, knee);
        hoof.position.y = -0.45;
        hoof.castShadow = true;
        hip.add(knee);
        parent.add(hip);
        return { hip, knee, phase };
      }

      function fieldEntries() {
        const layer = document.getElementById('horsesLayer');
        if (!layer) return [];
        const race = api.getRace();
        const useSim = (game.state.phase === 'RACING' || game.state.phase === 'RESULTS') && race && race.horses;
        return [...layer.querySelectorAll('.horse')].map(el => {
          const id = Number(el.dataset.horseId);
          let lane = Number(el.dataset.laneOffset) || 0;
          const meta = game.horses.find(h => h.id === id);
          let t = game.state.trackTOffset || 0;
          let speed = 0;
          let finished = false;
          let place = 0;
          if (useSim) {
            const hs = race.horses.find(h => h.id === id);
            if (hs) {
              t = hs.x;
              if (Number.isFinite(hs.laneIndex)) lane = hs.laneIndex;
              finished = !!hs.finished || game.state.phase === 'RESULTS';
              speed = (game.state.phase === 'RACING' && !hs.finished && !race.paused) ? (hs.vx || 0) : 0;
            }
            if (race.order) {
              const idx = race.order.indexOf(id);
              if (idx >= 0) place = idx + 1;
            }
          }
          return { id, lane, t, speed, finished, place, meta };
        });
      }

      function buildHorse(entry) {
        ensureGeo();
        const look = LOOK[entry.id] || LOOK[1];
        const coat = new THREE.MeshStandardMaterial({ color: look.coat, roughness: 0.7, metalness: 0.02 });
        const mane = new THREE.MeshStandardMaterial({ color: look.mane, roughness: 0.82 });
        const silk = new THREE.MeshStandardMaterial({ color: look.silk, roughness: 0.36, metalness: 0.06 });
        const root = new THREE.Group();
        const anim = new THREE.Group();
        root.add(anim);

        ball(anim, coat, 0, 1.08, 0.02, 0.24, 0.26, 0.58);
        ball(anim, coat, 0, 1.14, -0.5, 0.28, 0.25, 0.3);
        ball(anim, coat, 0, 1.02, 0.5, 0.21, 0.23, 0.26);
        if (entry.id === 2) {
          const patch = new THREE.MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.74, metalness: 0.02 });
          ball(anim, patch, -0.16, 1.2, 0.16, 0.11, 0.08, 0.16);
          ball(anim, patch, 0.15, 1.04, -0.06, 0.12, 0.09, 0.18);
          ball(anim, patch, -0.08, 1.24, -0.42, 0.13, 0.09, 0.15);
          ball(anim, patch, 0.12, 1.1, 0.38, 0.09, 0.07, 0.13);
        }

        const neck = new THREE.Group();
        neck.position.set(0, 1.12, 0.5);
        neck.rotation.x = 0.42;
        anim.add(neck);
        ball(neck, coat, 0, 0.16, 0.16, 0.11, 0.22, 0.13);
        ball(neck, mane, 0, 0.28, 0.02, 0.07, 0.16, 0.08);
        const head = new THREE.Group();
        head.position.set(0, 0.4, 0.26);
        neck.add(head);
        ball(head, coat, 0, 0.02, 0.08, 0.12, 0.14, 0.24);
        ball(head, coat, 0, -0.02, 0.28, 0.08, 0.08, 0.14);
        if (entry.id === 3 || entry.id === 6 || entry.id === 7) {
          ball(head, MAT.white, 0, 0.02, 0.3, 0.025, 0.05, 0.12);
        }
        const earL = addMesh(GEO.ear, coat, head);
        earL.position.set(-0.06, 0.16, 0);
        earL.rotation.z = 0.35;
        earL.castShadow = true;
        const earR = addMesh(GEO.ear, coat, head);
        earR.position.set(0.06, 0.16, 0);
        earR.rotation.z = -0.35;
        earR.castShadow = true;
        ball(head, MAT.eye, -0.1, 0.04, 0.12, 0.032, 0.032, 0.032);
        ball(head, MAT.eye, 0.1, 0.04, 0.12, 0.032, 0.032, 0.032);
        if (entry.id === 7) {
          const hornMat = new THREE.MeshStandardMaterial({
            color: 0xfff8ef, roughness: 0.22, metalness: 0.5,
            emissive: 0xffd0ea, emissiveIntensity: 0.22
          });
          const horn = addMesh(new THREE.ConeGeometry(0.045, 0.48, 10), hornMat, head);
          horn.position.set(0, 0.2, 0.05);
          horn.rotation.x = 0.72;
          horn.castShadow = true;
        }

        for (let i = 0; i < 4; i++) {
          const tuft = addMesh(GEO.ear, mane, neck);
          tuft.position.set(0, 0.16 - i * 0.05, -0.02 - i * 0.05);
          tuft.rotation.x = 1.05;
          tuft.scale.set(0.55, 0.85, 0.55);
        }

        const tailP = new THREE.Group();
        tailP.position.set(0, 1.28, -0.64);
        anim.add(tailP);
        const tail = addMesh(GEO.tail, mane, tailP);
        tail.position.y = -0.28;
        tail.castShadow = true;

        const legs = [
          makeLeg(anim, -0.13, 0.98, 0.34, 0.55, coat),
          makeLeg(anim, 0.13, 0.98, 0.34, 0.72, coat),
          makeLeg(anim, -0.15, 1.0, -0.38, 0.02, coat),
          makeLeg(anim, 0.15, 1.0, -0.38, 0.16, coat)
        ];

        const jock = new THREE.Group();
        jock.position.set(0, 1.4, -0.02);
        jock.rotation.x = 0.52;
        anim.add(jock);
        ball(jock, silk, 0, 0.2, 0.02, 0.16, 0.2, 0.12);
        const riderHead = entry.id === 8
          ? new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55, metalness: 0.04 })
          : silk;
        ball(jock, riderHead, 0, 0.44, 0.1, 0.11, 0.1, 0.12);
        ball(jock, entry.id === 8 ? riderHead : MAT.skin, 0, 0.4, 0.16, 0.055, 0.065, 0.055);
        const armL = addMesh(GEO.cannon, silk, jock);
        armL.position.set(-0.14, 0.26, 0.16);
        armL.rotation.x = 1.15;
        armL.scale.set(0.65, 0.5, 0.65);
        const armR = addMesh(GEO.cannon, silk, jock);
        armR.position.set(0.14, 0.26, 0.16);
        armR.rotation.x = 1.15;
        armR.scale.set(0.65, 0.5, 0.65);
        ball(anim, MAT.tack, 0, 1.28, -0.04, 0.22, 0.06, 0.28);

        const numMat = new THREE.MeshStandardMaterial({
          map: paintNumber(entry.id, look.silk),
          roughness: 0.55,
          side: THREE.DoubleSide
        });
        numMat.userData.ownMap = true;
        function cloth(x, y, z, rx, ry, sx, sy) {
          const m = addMesh(GEO.plane, numMat, anim);
          m.position.set(x, y, z);
          m.rotation.set(rx, ry, 0);
          m.scale.set(sx, sy, 1);
          m.castShadow = false;
          return m;
        }
        cloth(0.3, 1.16, 0, 0, Math.PI / 2, 0.36, 0.32);
        cloth(-0.3, 1.16, 0, 0, -Math.PI / 2, 0.36, 0.32);
        cloth(0, 1.46, -0.02, -Math.PI / 2, 0, 0.34, 0.38);
        cloth(0, 1.12, 0.78, 0, 0, 0.24, 0.24);

        const blob = addMesh(GEO.plane, MAT.blob, root);
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = 0.025;
        blob.scale.set(1.2, 0.62, 1);
        blob.castShadow = false;
        blob.renderOrder = 1;

        const medal = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
        medal.position.set(0, 2.4, 0);
        medal.scale.set(0.62, 0.62, 1);
        medal.visible = false;
        root.add(medal);

        const sc = entry.meta ? api.horseScale(entry.meta) : 1;
        root.scale.setScalar(0.98 * sc);
        root.userData = {
          id: entry.id, phase: entry.lane * 0.17, anim, neck, head, tail: tailP,
          jock, legs, medal, silk, dustAt: 0
        };
        return root;
      }

      function limb(phase, amp) {
        const x = ((phase % 1) + 1) % 1;
        let hip, knee;
        if (x < 0.4) {
          const u = x / 0.4;
          const e = u * u * (3 - 2 * u);
          hip = lerp(0.9, -0.75, e);
          knee = Math.sin(u * Math.PI) * 1.2;
        } else {
          const u = (x - 0.4) / 0.6;
          hip = lerp(-0.75, 0.9, u);
          knee = 0.2;
        }
        const k = 0.15 + 0.85 * amp;
        return { hip: hip * k, knee: knee * (0.35 + 0.65 * amp) };
      }

      function buildGate(entry) {
        ensureGeo();
        const t0 = game.state.trackTOffset || 0;
        const pose = worldPose(t0, entry.lane);
        const g = new THREE.Group();
        g.position.set(pose.x, 0, pose.z);
        g.rotation.y = pose.yaw;
        const wallL = addMesh(GEO.stallWall, MAT.gate, g);
        wallL.position.set(-0.42, 0.72, 0.18);
        wallL.castShadow = true;
        const wallR = addMesh(GEO.stallWall, MAT.gate, g);
        wallR.position.set(0.42, 0.72, 0.18);
        wallR.castShadow = true;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), MAT.gate);
        beam.position.set(0, 1.46, 0.2);
        beam.castShadow = true;
        g.add(beam);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.06), MAT.gate);
        back.position.set(0, 0.85, -0.86);
        g.add(back);

        function door(side) {
          const hinge = new THREE.Group();
          hinge.position.set(side * 0.4, 0, 1.22);
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.22, 0.04), MAT.gate);
          panel.position.set(-side * 0.19, 0.72, 0);
          panel.castShadow = true;
          hinge.add(panel);
          hinge.userData.side = side;
          g.add(hinge);
          gateDoors.push(hinge);
        }
        door(-1);
        door(1);

        const plateMat = new THREE.MeshStandardMaterial({
          map: paintNumber(entry.id, (LOOK[entry.id] || LOOK[1]).silk),
          roughness: 0.5,
          side: THREE.DoubleSide
        });
        plateMat.userData.ownMap = true;
        const plate = new THREE.Mesh(GEO.plane, plateMat);
        plate.userData.keepGeo = true;
        plate.position.set(0, 1.64, 0.26);
        plate.scale.set(0.32, 0.32, 1);
        g.add(plate);
        fieldGroup.add(g);
      }

      function addPosts(parent, pts, mat) {
        const n = Math.max(1, Math.floor(pts.length / 5));
        const geo = new THREE.CylinderGeometry(0.045, 0.055, 0.92, 6);
        const inst = new THREE.InstancedMesh(geo, mat, n);
        inst.userData.keepGeo = false;
        const dummy = new THREE.Object3D();
        let k = 0;
        for (let i = 0; i < pts.length && k < n; i += 5) {
          dummy.position.set(pts[i].x, 0.46, pts[i].z);
          dummy.scale.set(1, 1, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          inst.setMatrixAt(k++, dummy.matrix);
        }
        inst.count = k;
        inst.castShadow = false;
        inst.frustumCulled = false;
        parent.add(inst);
      }

      function stickPersonGeo() {
        if (GEO.stick) return GEO.stick;
        const box = new THREE.BoxGeometry(1, 1, 1);
        const srcPos = box.attributes.position;
        const srcNor = box.attributes.normal;
        const srcIdx = box.index;
        const positions = [];
        const normals = [];
        const indices = [];
        const v = new THREE.Vector3();
        // Feet sit at y = 0. Blocks: legs, torso, arms, head.
        const parts = [
          { x: -0.045, y: 0.11, z: 0, w: 0.05, h: 0.22, d: 0.05 },
          { x: 0.045, y: 0.11, z: 0, w: 0.05, h: 0.22, d: 0.05 },
          { x: 0, y: 0.32, z: 0, w: 0.16, h: 0.26, d: 0.08 },
          { x: -0.13, y: 0.34, z: 0, w: 0.045, h: 0.2, d: 0.045 },
          { x: 0.13, y: 0.34, z: 0, w: 0.045, h: 0.2, d: 0.045 },
          { x: 0, y: 0.52, z: 0, w: 0.11, h: 0.11, d: 0.1 }
        ];
        let offset = 0;
        parts.forEach(p => {
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, p.y, p.z),
            new THREE.Quaternion(),
            new THREE.Vector3(p.w, p.h, p.d)
          );
          const nmat = new THREE.Matrix3().getNormalMatrix(m);
          for (let i = 0; i < srcPos.count; i++) {
            v.fromBufferAttribute(srcPos, i).applyMatrix4(m);
            positions.push(v.x, v.y, v.z);
            v.fromBufferAttribute(srcNor, i).applyMatrix3(nmat).normalize();
            normals.push(v.x, v.y, v.z);
          }
          for (let i = 0; i < srcIdx.count; i++) indices.push(srcIdx.getX(i) + offset);
          offset += srcPos.count;
        });
        box.dispose();
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        g.setIndex(indices);
        GEO.stick = g;
        return g;
      }

      function crowdHash(n) {
        let t = Math.imul(n + 1, 374761393);
        t = Math.imul(t ^ (t >>> 13), 1274126177);
        return (t ^ (t >>> 16)) >>> 0;
      }

      function addStandCrowd(parent, inner, outer, seatY, salt) {
        const n = Math.min(inner.length, outer.length);
        if (n < 2) return;
        const shirts = [0xc0392b, 0x2471a3, 0xf4d03f, 0x1e8449, 0xf7f9f9, 0x7d3c98, 0xe67e22, 0x148f77, 0x5d6d7e, 0xd35400, 0xf5b7b1, 0x1a5276];
        const spots = [];
        let i = 0;
        while (i < n - 1) {
          const g = crowdHash(i * 29 + salt * 7) % 100;
          let size = 1;
          if (g < 34) size = 2;
          else if (g < 58) size = 3;
          else if (g < 74) size = 4;
          const anchor = Math.min(n - 1, i);
          const family = size > 1 && crowdHash(anchor * 5 + salt) % 100 < 55;
          const familyColor = shirts[crowdHash(anchor * 7 + salt) % shirts.length];
          for (let k = 0; k < size; k++) {
            const along = (k - (size - 1) / 2) * (0.28 + (crowdHash(anchor + k) % 20) / 100);
            const idx = Math.min(n - 1, Math.max(0, anchor + Math.round(along)));
            const j = Math.min(n - 1, Math.max(0, idx + (along >= 0 ? 1 : -1)));
            const mix = Math.min(1, Math.abs(along - Math.round(along)));
            const ax = inner[idx].x + (inner[j].x - inner[idx].x) * mix;
            const az = inner[idx].z + (inner[j].z - inner[idx].z) * mix;
            const bx = outer[idx].x + (outer[j].x - outer[idx].x) * mix;
            const bz = outer[idx].z + (outer[j].z - outer[idx].z) * mix;
            const u = size === 1
              ? 0.15 + (crowdHash(idx + salt) % 70) / 100
              : 0.18 + ((k + (crowdHash(idx + k + salt) % 3)) % size) * (0.62 / size);
            const x = ax + (bx - ax) * Math.min(0.94, u);
            const z = az + (bz - az) * Math.min(0.94, u);
            const yawJ = ((crowdHash(idx + k * 9 + salt) % 100) / 100 - 0.5) * 0.7;
            spots.push({
              x, z,
              yaw: Math.atan2(-x, -z) + yawJ,
              scale: 0.7 + (crowdHash(idx + k * 11 + salt) % 55) / 100,
              color: family ? familyColor : shirts[crowdHash(idx + k + salt * 7) % shirts.length]
            });
          }
          i += size + 2 + (crowdHash(i * 19 + salt) % 6);
        }
        if (!spots.length) return;
        const geo = stickPersonGeo();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
        const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
        mesh.userData.keepGeo = true;
        const dummy = new THREE.Object3D();
        const col = new THREE.Color();
        spots.forEach((p, i) => {
          dummy.position.set(p.x, seatY + 0.02, p.z);
          dummy.rotation.set(0, p.yaw, 0);
          dummy.scale.setScalar(p.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, col.setHex(p.color));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        parent.add(mesh);
      }

      function addFlag(parent, y, color) {
        let node = parent;
        const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.7 });
        for (let i = 0; i < 5; i++) {
          const pivot = new THREE.Group();
          pivot.position.set(i === 0 ? 0.08 : 0.22, i === 0 ? y : 0, 0);
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.36), mat);
          cloth.position.x = 0.12;
          cloth.castShadow = true;
          pivot.add(cloth);
          node.add(pivot);
          pivot.userData.i = i;
          flagPivots.push(pivot);
          node = pivot;
        }
      }

      function addLamp(parent, x, y, z) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, y, 6), MAT.white);
        pole.position.set(x, y / 2, z);
        parent.add(pole);
        const bulbMat = new THREE.MeshStandardMaterial({
          color: 0xffe6a8, emissive: 0xffe1a0, emissiveIntensity: 0.8, roughness: 0.4
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bulbMat);
        bulb.position.set(x, y + 0.05, z);
        parent.add(bulb);
        refs.bulbs.push(bulbMat);
        const spot = new THREE.SpotLight(0xfff1cc, 0, 90, Math.PI / 5, 0.45, 1);
        spot.position.set(x, y, z);
        spot.target.position.set(0, 0, 0);
        parent.add(spot);
        parent.add(spot.target);
        refs.spots.push(spot);
        return bulb;
      }

      function straightEnds() {
        const x0 = (80 - 500) * WORLD * STRAIGHT_STRETCH;
        const x1 = (920 - 500) * WORLD * STRAIGHT_STRETCH;
        const z0 = (205 - 300) * WORLD;
        const z1 = (395 - 300) * WORLD;
        return { x0, x1, z0, z1 };
      }

      function buildOvalWorld() {
        const SEGS = 96;
        const outerRail = sampleOval(0, SEGS);
        const innerRail = sampleOval(2.6, SEGS);
        const skin = PAL[game.state.course] || PAL.grass;

        const groundMat = new THREE.MeshStandardMaterial({ color: skin.ground, roughness: 1 });
        const ground = new THREE.Mesh(new THREE.CircleGeometry(170, 40), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        worldGroup.add(ground);
        refs.groundMat = groundMat;

        const infieldPts = sampleOval(2.85, SEGS);
        const infieldMat = new THREE.MeshStandardMaterial({ color: skin.infield, roughness: 0.92, side: THREE.DoubleSide });
        const infield = new THREE.Mesh(fanGeo(infieldPts, 0.015), infieldMat);
        infield.receiveShadow = true;
        worldGroup.add(infield);
        refs.infieldMat = infieldMat;

        const trackMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, map: surfaceTex(game.state.course), roughness: 0.92, metalness: 0,
          side: THREE.DoubleSide
        });
        const track = new THREE.Mesh(deckGeo(outerRail, innerRail, 0.03, 0.03, 14), trackMat);
        track.receiveShadow = true;
        worldGroup.add(track);
        refs.trackMat = trackMat;

        const lineMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, transparent: true, opacity: 0.28, roughness: 1,
          depthWrite: false, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        });
        for (let lv = 0.55; lv <= 2.2; lv += 0.42) {
          const a = sampleOval(lv, SEGS);
          const b = sampleOval(lv + 0.045, SEGS);
          const line = new THREE.Mesh(deckGeo(a, b, 0.045, 0.045, 8), lineMat);
          line.receiveShadow = false;
          worldGroup.add(line);
        }
        refs.lineMat = lineMat;

        const railMat = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.35, metalness: 0.12, side: THREE.DoubleSide });
        const railIn = new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: 0.4, metalness: 0.08, side: THREE.DoubleSide });
        worldGroup.add(new THREE.Mesh(wallGeo(outerRail, 0.05, 0.86, 8), railMat));
        worldGroup.add(new THREE.Mesh(wallGeo(innerRail, 0.05, 0.78, 8), railMat));
        worldGroup.add(new THREE.Mesh(wallGeo(innerRail, 0.78, 0.96, 8), railIn));
        addPosts(worldGroup, outerRail, railMat);
        addPosts(worldGroup, innerRail, railMat);
        refs.railMat = railMat;
        refs.railIn = railIn;

        const apron = sampleOval(-0.15, SEGS);
        const apronMat = new THREE.MeshStandardMaterial({ color: skin.apron, roughness: 0.95, side: THREE.DoubleSide });
        worldGroup.add(new THREE.Mesh(deckGeo(apron, outerRail, 0.01, 0.01, 6), apronMat));
        refs.apronMat = apronMat;

        const seatMats = [];
        for (let tier = 0; tier < 7; tier++) {
          const y = 0.45 + tier * 0.58;
          const inner = sampleOval(-0.45 - tier * 0.3, 80);
          const outer = sampleOval(-0.45 - (tier + 1) * 0.3, 80);
          const seatMat = new THREE.MeshStandardMaterial({
            color: tier % 2 ? 0x1d4e89 : 0x8d2942,
            roughness: 0.78,
            side: THREE.DoubleSide
          });
          const tread = new THREE.Mesh(deckGeo(inner, outer, y, y + 0.05, 4), seatMat);
          tread.receiveShadow = true;
          worldGroup.add(tread);
          const fasciaMat = new THREE.MeshStandardMaterial({ color: 0x121820, roughness: 0.9, side: THREE.DoubleSide });
          worldGroup.add(new THREE.Mesh(wallGeo(inner, tier === 0 ? 0.05 : y - 0.58, y, 3), fasciaMat));
          addStandCrowd(worldGroup, inner, outer, y, tier + 1);
          seatMats.push(seatMat);
        }
        refs.seatMats = seatMats;
        const roofPts = sampleOval(-2.55, 80);
        const roofOuter = sampleOval(-2.85, 80);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3548, metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide });
        worldGroup.add(new THREE.Mesh(deckGeo(roofPts, roofOuter, 4.7, 5.15, 2), roofMat));
        refs.roofMat = roofMat;

        const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x1f6b32, roughness: 0.9, side: THREE.DoubleSide });
        worldGroup.add(new THREE.Mesh(wallGeo(sampleOval(2.72, 72), 0.02, 0.36, 3), hedgeMat));
        refs.hedgeMat = hedgeMat;

        const shrubGeo = new THREE.SphereGeometry(0.42, 7, 6);
        const shrubMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 0.85 });
        const shrubSpots = [];
        const shrubCols = 16;
        const shrubRows = 9;
        for (let iz = 0; iz < shrubRows; iz++) {
          for (let ix = 0; ix < shrubCols; ix++) {
            const i = iz * shrubCols + ix;
            const h = crowdHash(i * 23 + 11);
            if (h % 100 < 42) continue;
            const x = -24.5 + (ix + 0.5) * (49 / shrubCols) + ((crowdHash(i * 3 + 1) % 100) / 100 - 0.5) * 1.5;
            const z = -11.2 + (iz + 0.5) * (22.4 / shrubRows) + ((crowdHash(i * 5 + 3) % 100) / 100 - 0.5) * 1.15;
            if (!insideInfield(x, z, 2.92)) continue;
            if (infieldBlocked(x, z)) continue;
            if (shrubSpots.some(p => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 2.4)) continue;
            const s = new THREE.Mesh(shrubGeo, shrubMat);
            s.position.set(x, 0.28, z);
            s.scale.setScalar(0.6 + (h % 50) / 80);
            worldGroup.add(s);
            shrubSpots.push({ x, z });
          }
        }
        refs.shrubMat = shrubMat;

        addJumbotron(worldGroup, 0, 5.45, 0, Math.PI);

        const tFin = game.state.trackTOffset || 0.125;
        const finMat = new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.5, side: THREE.DoubleSide });
        const fin = new THREE.Mesh(openDeck(acrossTrack(tFin - 0.0035, 18), acrossTrack(tFin + 0.0035, 18), 0.055), finMat);
        worldGroup.add(fin);

        const mid = worldPose(tFin, (api.currentLaneCount() - 1) / 2);
        const out = new THREE.Vector3(mid.x, 0, mid.z);
        if (out.lengthSq() < 0.01) out.set(0, 0, -1);
        out.normalize();
        const pole = new THREE.Group();
        pole.position.set(mid.x + out.x * 7.2, 0, mid.z + out.z * 7.2);
        const poleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8), MAT.white);
        poleMesh.position.y = 2.2;
        pole.add(poleMesh);
        const finishBulbMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff3b3b, emissiveIntensity: 1.4 });
        const finishBulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), finishBulbMat);
        finishBulb.position.y = 4.45;
        pole.add(finishBulb);
        refs.finishBulb = finishBulbMat;
        addFlag(pole, 3.7, 0xf4f7fb);
        addFlag(pole, 3.15, 0xc0392b);
        worldGroup.add(pole);

        const postT = [0.25, 0.5, 0.75, 0];
        refs.postBulbs = [];
        postT.forEach(t => {
          const geom = api.getVisualLane(-0.35);
          const p = api.stadiumPointAt(t, geom);
          const w = svgToWorld(p.x, p.y);
          const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe6a3, emissive: 0xffe1a0, emissiveIntensity: 0.9 });
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x8ea0b4, metalness: 0.3, roughness: 0.45 }));
          mast.position.set(w.x, 1.6, w.z);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bulbMat);
          lamp.position.set(w.x, 3.3, w.z);
          worldGroup.add(mast);
          worldGroup.add(lamp);
          refs.postBulbs.push(bulbMat);
          addLamp(worldGroup, w.x, 7.5, w.z);
        });

        addInfieldRoulette(worldGroup);
        addCoursePylons();
      }

      const ROULETTE_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
      const ROULETTE_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

      function rouletteFaceTex() {
        if (refs.rouletteTex) return refs.rouletteTex;
        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 1024;
        const g = c.getContext('2d');
        const slice = Math.PI * 2 / 37;
        g.clearRect(0, 0, 1024, 1024);
        for (let i = 0; i < 37; i++) {
          const a0 = -Math.PI / 2 + i * slice;
          const a1 = a0 + slice;
          const n = ROULETTE_ORDER[i];
          g.beginPath();
          g.moveTo(512, 512);
          g.arc(512, 512, 470, a0, a1);
          g.closePath();
          g.fillStyle = n === 0 ? '#0b7a3a' : (ROULETTE_RED.has(n) ? '#c0392b' : '#161616');
          g.fill();
          g.strokeStyle = '#e6d3a1';
          g.lineWidth = 3;
          g.stroke();
          const mid = (a0 + a1) / 2;
          g.save();
          g.translate(512 + Math.cos(mid) * 360, 512 + Math.sin(mid) * 360);
          g.rotate(mid + Math.PI / 2);
          g.fillStyle = '#fff';
          g.font = '700 36px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(n), 0, 0);
          g.restore();
        }
        g.beginPath();
        g.arc(512, 512, 140, 0, Math.PI * 2);
        g.fillStyle = '#10281c';
        g.fill();
        g.lineWidth = 14;
        g.strokeStyle = '#e8c56b';
        g.stroke();
        refs.rouletteTex = srgbTex(new THREE.CanvasTexture(c));
        return refs.rouletteTex;
      }

      function rouletteTableTex() {
        if (refs.rouletteTableTex) return refs.rouletteTableTex;
        const W = 2304;
        const H = 1024;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#0c6a34';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = '#e8c56b';
        g.lineWidth = 18;
        g.strokeRect(16, 16, W - 32, H - 32);

        const cell = (x, y, w, h, fill, label, font) => {
          g.fillStyle = fill;
          g.fillRect(x, y, w, h);
          g.strokeStyle = '#f4e4bc';
          g.lineWidth = 5;
          g.strokeRect(x + 3, y + 3, w - 6, h - 6);
          if (!label) return;
          g.fillStyle = '#fff6e8';
          g.font = font || '700 48px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(label, x + w / 2, y + h / 2 + 2);
        };

        const gridX = 760;
        const gridY = 70;
        const colW = 108;
        const rowH = 188;
        const zeroW = 118;
        cell(gridX - zeroW, gridY, zeroW, rowH * 3, '#0b7a3a', '0', '800 64px system-ui, sans-serif');
        for (let col = 0; col < 12; col++) {
          for (let row = 0; row < 3; row++) {
            const n = col * 3 + (3 - row);
            const fill = ROULETTE_RED.has(n) ? '#c0392b' : '#1c1c1c';
            cell(gridX + col * colW, gridY + row * rowH, colW, rowH, fill, String(n));
          }
        }
        for (let row = 0; row < 3; row++) {
          cell(gridX + 12 * colW, gridY + row * rowH, 96, rowH, '#0a5a2c', '2:1', '700 32px system-ui, sans-serif');
        }
        const dozY = gridY + rowH * 3 + 14;
        const dozW = (12 * colW) / 3;
        ['1st 12', '2nd 12', '3rd 12'].forEach((label, i) => {
          cell(gridX + i * dozW, dozY, dozW, 100, '#0a5a2c', label, '700 36px system-ui, sans-serif');
        });
        const outY = dozY + 114;
        const outs = [
          ['1–18', '#0a5a2c'],
          ['EVEN', '#0a5a2c'],
          ['RED', '#c0392b'],
          ['BLACK', '#1c1c1c'],
          ['ODD', '#0a5a2c'],
          ['19–36', '#0a5a2c']
        ];
        const outW = (12 * colW) / 6;
        outs.forEach((pair, i) => {
          cell(gridX + i * outW, outY, outW, 96, pair[0] === 'RED' || pair[0] === 'BLACK' ? pair[1] : '#0a5a2c', pair[0], '700 32px system-ui, sans-serif');
        });
        g.fillStyle = 'rgba(255, 236, 180, 0.9)';
        g.font = '800 42px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('ROULETTE', 380, H / 2);

        refs.rouletteTableTex = srgbTex(new THREE.CanvasTexture(c));
        return refs.rouletteTableTex;
      }

      function addInfieldRoulette(parent) {
        const S = 3.05;
        const wheelX = -5.15;
        const root = new THREE.Group();
        root.position.set(-19.05, 0.02, 0);
        root.userData.roulette = true;
        root.userData.kind = 'roulette';

        const wood = new THREE.Mesh(
          new THREE.BoxGeometry(18.7, 0.28, 8.55),
          new THREE.MeshStandardMaterial({ color: 0x6b3e1e, roughness: 0.55, metalness: 0.15 })
        );
        wood.position.y = 0.1;
        wood.receiveShadow = true;
        wood.castShadow = true;
        root.add(wood);

        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(18.05, 7.95),
          new THREE.MeshStandardMaterial({ map: rouletteTableTex(), roughness: 0.82, metalness: 0.02 })
        );
        cloth.rotation.x = -Math.PI / 2;
        cloth.position.y = 0.25;
        cloth.receiveShadow = true;
        root.add(cloth);

        const wheel = new THREE.Group();
        wheel.position.set(wheelX, 0, 0);
        root.add(wheel);
        const bowlH = 0.16 * S;
        const bowlY = 0.25 + bowlH / 2;
        const bowlTop = bowlY + bowlH / 2;
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(1.08 * S, 1.12 * S, bowlH, 48, 1, true),
          new THREE.MeshStandardMaterial({ color: 0x5c3d18, roughness: 0.48, metalness: 0.2, side: THREE.DoubleSide })
        );
        bowl.position.y = bowlY;
        wheel.add(bowl);
        const faceMap = rouletteFaceTex();
        faceMap.needsUpdate = true;
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(2.04 * S, 2.04 * S),
          new THREE.MeshBasicMaterial({ map: faceMap, transparent: true, side: THREE.DoubleSide, depthWrite: true })
        );
        face.rotation.x = -Math.PI / 2;
        face.position.y = bowlTop + 0.04;
        face.renderOrder = 3;
        wheel.add(face);
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(1.05 * S, 0.055 * S, 12, 64),
          new THREE.MeshStandardMaterial({ color: 0xe8c56b, metalness: 0.7, roughness: 0.25 })
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = bowlTop + 0.04;
        wheel.add(rim);
        const pointer = new THREE.Mesh(
          new THREE.ConeGeometry(0.09 * S, 0.28 * S, 12),
          new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.45, roughness: 0.3 })
        );
        pointer.position.set(wheelX, bowlTop + 0.32, -0.78 * S);
        pointer.rotation.x = Math.PI;
        root.add(pointer);
        const ballPivot = new THREE.Group();
        ballPivot.position.set(wheelX, 0, 0);
        root.add(ballPivot);
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 * S, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.22, metalness: 0.15 })
        );
        ball.position.set(0.82 * S, bowlTop + 0.06, 0);
        ball.castShadow = true;
        ballPivot.add(ball);

        parent.add(root);
        refs.rouletteRoot = root;
        refs.rouletteWheel = wheel;
        refs.rouletteBall = ballPivot;
        addInfieldPitch(parent);
        addInfieldChess(parent);
      }

      function insideInfield(x, z, level) {
        const geom = api.getVisualLane(level);
        const sx = x / WORLD + 500;
        const sy = z / WORLD + 300;
        const dx = sx - geom.cx;
        const dy = sy - geom.cy;
        const half = geom.straight / 2;
        if (Math.abs(dx) <= half) return Math.abs(dy) <= geom.r;
        const bendX = Math.sign(dx) * half;
        return Math.hypot(dx - bendX, dy) <= geom.r;
      }

      function infieldBlocked(x, z) {
        if (x > -29.1 && x < -9.2 && Math.abs(z) < 5.1) return true;
        if (x > -5.4 && x < 5.4 && Math.abs(z) < 5.4) return true;
        if (x > 9.1 && x < 25.8 && Math.abs(z) < 5.6) return true;
        return false;
      }

      function pitchTex() {
        if (refs.pitchTex) return refs.pitchTex;
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 320;
        const g = c.getContext('2d');
        for (let i = 0; i < 10; i++) {
          g.fillStyle = i % 2 ? '#1f8a3c' : '#187432';
          g.fillRect(i * 51.2, 0, 51.2, 320);
        }
        g.strokeStyle = '#f4f7fb';
        g.lineWidth = 5;
        g.strokeRect(16, 16, 480, 288);
        g.beginPath();
        g.moveTo(256, 16);
        g.lineTo(256, 304);
        g.stroke();
        g.beginPath();
        g.arc(256, 160, 42, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#f4f7fb';
        g.beginPath();
        g.arc(256, 160, 4, 0, Math.PI * 2);
        g.fill();
        g.strokeRect(16, 78, 78, 164);
        g.strokeRect(418, 78, 78, 164);
        g.strokeRect(16, 118, 36, 84);
        g.strokeRect(460, 118, 36, 84);
        refs.pitchTex = srgbTex(new THREE.CanvasTexture(c));
        return refs.pitchTex;
      }

      function addGoal(parent, xSign) {
        const white = new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.35, metalness: 0.15 });
        const postH = 1.05;
        const halfW = 1.35;
        const x = xSign * 7.7;
        [-1, 1].forEach(side => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, postH, 8), white);
          post.position.set(x, postH / 2, side * halfW);
          post.castShadow = true;
          parent.add(post);
        });
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, halfW * 2, 8), white);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(x, postH, 0);
        parent.add(bar);
      }

      function addInfieldPitch(parent) {
        const root = new THREE.Group();
        root.position.set(17.4, 0.03, 0);
        root.userData.kind = 'football';
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(15.4, 0.1, 9.2),
          new THREE.MeshStandardMaterial({ color: 0x1c7a34, roughness: 0.9 })
        );
        base.position.y = 0.05;
        base.receiveShadow = true;
        root.add(base);
        const lines = new THREE.Mesh(
          new THREE.PlaneGeometry(15.4, 9.2),
          new THREE.MeshStandardMaterial({ map: pitchTex(), roughness: 0.86 })
        );
        lines.rotation.x = -Math.PI / 2;
        lines.position.y = 0.11;
        lines.receiveShadow = true;
        root.add(lines);
        addGoal(root, -1);
        addGoal(root, 1);
        parent.add(root);
        refs.pitchRoot = root;
      }

      function chessTex() {
        if (refs.chessTex) return refs.chessTex;
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 512;
        const g = c.getContext('2d');
        const cells = 8;
        const cell = c.width / cells;
        for (let y = 0; y < cells; y++) {
          for (let x = 0; x < cells; x++) {
            g.fillStyle = (x + y) % 2 ? '#2c241c' : '#f3ead8';
            g.fillRect(x * cell, y * cell, cell, cell);
          }
        }
        refs.chessTex = srgbTex(new THREE.CanvasTexture(c));
        return refs.chessTex;
      }

      function addInfieldChess(parent) {
        const root = new THREE.Group();
        root.position.set(0, 0, 0);
        root.userData.kind = 'chess';
        const rim = new THREE.Mesh(
          new THREE.BoxGeometry(9.7, 0.32, 9.7),
          new THREE.MeshStandardMaterial({ color: 0x6b3e1e, roughness: 0.5, metalness: 0.12 })
        );
        rim.position.y = 0.22;
        rim.castShadow = true;
        rim.receiveShadow = true;
        root.add(rim);
        const top = new THREE.Mesh(
          new THREE.PlaneGeometry(9.2, 9.2),
          new THREE.MeshStandardMaterial({ map: chessTex(), roughness: 0.7 })
        );
        top.rotation.x = -Math.PI / 2;
        top.position.y = 0.39;
        top.receiveShadow = true;
        root.add(top);
        parent.add(root);
        refs.chessRoot = root;
      }

      function updateRoulette(dt) {
        const wheel = refs.rouletteWheel;
        if (!wheel) return;
        const pose = api.roulettePose ? api.roulettePose() : null;
        if (pose && pose.spinning) {
          wheel.rotation.y = pose.angle;
          if (refs.rouletteBall) refs.rouletteBall.rotation.y = -pose.angle;
        } else {
          refs.rouletteIdle = (refs.rouletteIdle || 0) + dt * 0.35;
          const ang = refs.rouletteIdle + ((pose && pose.angle) || 0);
          wheel.rotation.y = ang;
          if (refs.rouletteBall) refs.rouletteBall.rotation.y = -ang * 0.65;
        }
      }

      function addCoursePylons() {
        const pylons = new THREE.Group();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const m = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.12, 6, 6),
            new THREE.MeshStandardMaterial({
              color: i % 2 ? 0xff3df6 : 0x17f0ff,
              emissive: i % 2 ? 0xff3df6 : 0x17f0ff,
              emissiveIntensity: 0.9,
              roughness: 0.3
            })
          );
          m.position.set(Math.cos(a) * 58, 3, Math.sin(a) * 34);
          pylons.add(m);
        }
        pylons.visible = false;
        worldGroup.add(pylons);
        refs.pylons = pylons;
      }

      function buildStraightWorld() {
        const { x0, x1, z0, z1 } = straightEnds();
        const skin = PAL[game.state.course] || PAL.grass;
        const groundMat = new THREE.MeshStandardMaterial({ color: skin.ground, roughness: 1 });
        const span = (x1 - x0) + 100;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, 120), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        worldGroup.add(ground);
        refs.groundMat = groundMat;

        const trackMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, map: surfaceTex(game.state.course), roughness: 0.9, side: THREE.DoubleSide
        });
        const track = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) + 4, 0.08, (z1 - z0) + 0.4), trackMat);
        track.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
        track.receiveShadow = true;
        worldGroup.add(track);
        refs.trackMat = trackMat;

        const railMat = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.35, metalness: 0.1 });
        refs.railMat = railMat;
        refs.railIn = railMat;
        [z0, z1].forEach(z => {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.12, 0.1), railMat);
          rail.position.set((x0 + x1) / 2, 0.7, z);
          worldGroup.add(rail);
        });
        const lanes = api.currentLaneCount();
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
        refs.lineMat = lineMat;
        for (let i = 1; i < lanes; i++) {
          const z = z0 + (z1 - z0) * (i / lanes);
          const line = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, 0.06), lineMat);
          line.position.set((x0 + x1) / 2, 0.08, z);
          worldGroup.add(line);
        }
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.04, z1 - z0),
          new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.45 })
        );
        fin.position.set(x1, 0.09, (z0 + z1) / 2);
        worldGroup.add(fin);

        const seatColors = [0x8d2942, 0x1d4e89];
        refs.seatMats = [];
        [ -1, 1 ].forEach(side => {
          const edge = side < 0 ? z0 : z1;
          for (let tier = 0; tier < 6; tier++) {
            const y = 0.4 + tier * 0.62;
            const z = edge + side * (1.6 + tier * 2.15);
            const mat = new THREE.MeshStandardMaterial({ color: seatColors[tier % 2], roughness: 0.78 });
            const seat = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 6, 0.5, 2.3), mat);
            seat.position.set((x0 + x1) / 2, y, z);
            seat.receiveShadow = true;
            worldGroup.add(seat);
            refs.seatMats.push(mat);
            const count = 72;
            const near = [];
            const far = [];
            for (let i = 0; i < count; i++) {
              const x = x0 - 1 + (x1 - x0 + 2) * (i / (count - 1));
              near.push(new THREE.Vector3(x, 0, z));
              far.push(new THREE.Vector3(x, 0, z + side * 1.5));
            }
            addStandCrowd(worldGroup, near, far, y, tier + 20 + (side < 0 ? 0 : 8));
          }
          const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3548, metalness: 0.25, roughness: 0.5 });
          const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 8, 0.22, 3.2), roofMat);
          roof.position.set((x0 + x1) / 2, 4.5, edge + side * 12.5);
          worldGroup.add(roof);
          refs.roofMat = roofMat;
        });

        const apronMat = new THREE.MeshStandardMaterial({ color: skin.apron, roughness: 1 });
        refs.apronMat = apronMat;

        for (let i = 0; i < 12; i++) {
          const x = x0 + (x1 - x0) * (i / 11);
          addLamp(worldGroup, x, 8.2, z0 - 3.2);
          addLamp(worldGroup, x, 8.2, z1 + 3.2);
        }

        const pole = new THREE.Group();
        pole.position.set(x1 + 1.2, 0, z0 - 1.5);
        const poleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 8), MAT.white);
        poleMesh.position.y = 2.1;
        pole.add(poleMesh);
        const finishBulbMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff3b3b, emissiveIntensity: 1.4 });
        const finishBulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), finishBulbMat);
        finishBulb.position.y = 4.3;
        pole.add(finishBulb);
        refs.finishBulb = finishBulbMat;
        refs.postBulbs = [];
        addFlag(pole, 3.55, 0xf4f7fb);
        addFlag(pole, 3.0, 0xc0392b);
        worldGroup.add(pole);

        const midX = (x0 + x1) / 2;
        addToteScreen(worldGroup, midX, 6.3, z0 - 2.4, 0, 10, 2.6);

        addCoursePylons();
      }

      function rebuildWorld() {
        if (!scene) return;
        if (worldGroup) {
          scene.remove(worldGroup);
          disposeNode(worldGroup);
        }
        flagPivots = [];
        refs.spots = [];
        refs.bulbs = [];
        worldGroup = new THREE.Group();
        scene.add(worldGroup);
        ensureGeo();
        if (game.state.trackMode === 'straight') buildStraightWorld();
        else buildOvalWorld();
        worldDirty = false;
        applySkin();
      }

      function rebuildField() {
        if (!fieldGroup) return;
        horses = [];
        gateDoors = [];
        for (let i = fieldGroup.children.length - 1; i >= 0; i--) {
          const c = fieldGroup.children[i];
          fieldGroup.remove(c);
          disposeNode(c);
        }
        const entries = fieldEntries();
        entries.forEach(entry => {
          const horse = buildHorse(entry);
          fieldGroup.add(horse);
          horses.push(horse);
          buildGate(entry);
          const tMark = (game.state.trackTOffset || 0) + (game.state.trackMode === 'straight' ? 0.04 : 0.015);
          const pose = worldPose(tMark, entry.lane);
          const markMat = new THREE.MeshStandardMaterial({
            map: paintNumber(entry.id, (LOOK[entry.id] || LOOK[1]).silk),
            transparent: true,
            opacity: 0.92,
            roughness: 0.8,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
          });
          markMat.userData.ownMap = true;
          const mark = new THREE.Mesh(GEO.plane, markMat);
          mark.userData.keepGeo = true;
          mark.rotation.order = 'YXZ';
          mark.rotation.y = pose.yaw;
          mark.rotation.x = -Math.PI / 2;
          mark.position.set(pose.x, 0.06, pose.z);
          mark.scale.set(0.72, 0.72, 1);
          fieldGroup.add(mark);
        });
        const racing = game.state.phase === 'RACING' || game.state.phase === 'RESULTS';
        gateOpen = racing ? 1 : 0;
        fieldDirty = false;
        paintTote();
      }

      function applySkin() {
        const skin = PAL[game.state.course] || PAL.grass;
        paintSky(skin);
        if (scene && scene.fog) {
          scene.fog.color.set(skin.fog);
          scene.fog.near = skin.fogNear;
          scene.fog.far = skin.fogFar;
        }
        if (hemi) {
          hemi.color.set(skin.hemiSky);
          hemi.groundColor.set(skin.hemiGround);
          hemi.intensity = skin.cyber ? 0.45 : 0.72;
        }
        if (sun) {
          sun.color.set(skin.sun);
          sun.intensity = skin.sunI;
          refs.sunPos = skin.sunPos;
        }
        if (fill) {
          fill.color.set(skin.fill);
          fill.intensity = skin.fillI;
        }
        if (renderer) renderer.toneMappingExposure = skin.exposure;
        if (refs.trackMat) {
          refs.trackMat.map = surfaceTex(game.state.course);
          refs.trackMat.color.set(0xffffff);
          refs.trackMat.emissive = refs.trackMat.emissive || new THREE.Color();
          refs.trackMat.emissive.set(skin.cyber ? '#063844' : '#000000');
          refs.trackMat.emissiveIntensity = skin.cyber ? 0.55 : 0;
          refs.trackMat.emissiveMap = skin.cyber ? refs.trackMat.map : null;
          refs.trackMat.needsUpdate = true;
        }
        if (refs.infieldMat) refs.infieldMat.color.set(skin.infield);
        if (refs.groundMat) refs.groundMat.color.set(skin.ground);
        if (refs.apronMat) refs.apronMat.color.set(skin.apron);
        if (refs.hedgeMat) refs.hedgeMat.color.set(skin.cyber ? '#0a3a32' : '#1f6b32');
        if (refs.shrubMat) refs.shrubMat.color.set(skin.cyber ? '#0d4a40' : skin.tree);
        if (refs.crownMat) refs.crownMat.color.set(skin.tree);
        if (refs.railMat) {
          refs.railMat.emissive.set(skin.railE);
          refs.railMat.emissiveIntensity = skin.railEI;
        }
        if (refs.railIn && refs.railIn !== refs.railMat) {
          refs.railIn.color.set(skin.cyber ? 0xff3df6 : 0xf4c542);
          refs.railIn.emissive.set(skin.cyber ? 0xff3df6 : 0x000000);
          refs.railIn.emissiveIntensity = skin.cyber ? 0.8 : 0;
        }
        if (refs.trees) refs.trees.visible = !skin.cyber;
        if (refs.pylons) refs.pylons.visible = !!skin.cyber;
        refs.spots.forEach((s, i) => {
          s.intensity = skin.spotI;
          s.color.set(skin.cyber ? (i % 2 ? 0xff3df6 : 0x17f0ff) : 0xfff1cc);
        });
        refs.bulbs.forEach(m => {
          m.emissiveIntensity = skin.spotI > 1 ? 2.4 : 0.55;
        });
        if (scene && scene.fog && game.state.trackMode === 'straight') {
          scene.fog.near = Math.max(skin.fogNear, 80);
          scene.fog.far = Math.max(skin.fogFar, 520);
        }
        if (refs.seatMats) {
          refs.seatMats.forEach((m, i) => {
            const day = i % 2 ? 0x1d4e89 : 0x8d2942;
            const night = i % 2 ? 0x10243f : 0x4a1828;
            m.color.set(skin.spotI > 1 ? night : day);
          });
        }
        dustPool.forEach(p => p.sprite.material.color.set(skin.dust));
        paintTote();
      }

      function syncLamps() {
        const el = document.getElementById('courseFinishLight');
        const fill = (el && el.getAttribute('fill')) || '#ff3b3b';
        if (refs.finishBulb) {
          refs.finishBulb.color.set(fill);
          refs.finishBulb.emissive.set(fill);
        }
        const posts = document.querySelectorAll('.course-post-light');
        (refs.postBulbs || []).forEach((m, i) => {
          const node = posts[i];
          const c = (node && node.getAttribute('fill')) || '#ffe6a3';
          m.color.set(c);
          m.emissive.set(c);
        });
      }

      function boot() {
        if (renderer) return true;
        if (!canvas) return false;
        try {
          renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        } catch (err) {
          console.error(err);
          return false;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;

        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0xc5e0f4, 55, 190);
        camera = new THREE.PerspectiveCamera(50, 1, 0.06, 420);

        const skyGeo = new THREE.SphereGeometry(240, 28, 16);
        skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        sky.frustumCulled = false;
        scene.add(sky);
        refs.skyGeo = skyGeo;

        hemi = new THREE.HemisphereLight(0xe7f4ff, 0x3d6b32, 0.72);
        scene.add(hemi);
        sunTarget = new THREE.Object3D();
        scene.add(sunTarget);
        sun = new THREE.DirectionalLight(0xfff6d8, 1.25);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.bias = -0.00045;
        sun.shadow.normalBias = 0.04;
        sun.target = sunTarget;
        scene.add(sun);
        fill = new THREE.DirectionalLight(0xd5e4f5, 0.4);
        fill.position.set(-24, 18, -12);
        scene.add(fill);

        fieldGroup = new THREE.Group();
        scene.add(fieldGroup);

        const map = dustTex();
        for (let i = 0; i < 72; i++) {
          const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 });
          const sprite = new THREE.Sprite(mat);
          sprite.visible = false;
          sprite.scale.setScalar(0.4);
          scene.add(sprite);
          dustPool.push({ sprite, life: 0, max: 1, vel: new THREE.Vector3() });
        }

        if (outer && window.ResizeObserver) new ResizeObserver(() => resize()).observe(outer);
        applySkin();
        return true;
      }

      function resize() {
        if (!renderer || !outer) return;
        const w = outer.clientWidth;
        const h = outer.clientHeight;
        if (w < 2 || h < 2) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      function spawnDust(pos, yaw) {
        const p = dustPool.find(d => d.life <= 0) || dustPool[0];
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        p.life = 0.38 + Math.random() * 0.22;
        p.max = p.life;
        p.sprite.visible = true;
        p.sprite.position.set(
          pos.x - fx * 0.9 + (Math.random() - 0.5) * 0.45,
          0.12 + Math.random() * 0.2,
          pos.z - fz * 0.9 + (Math.random() - 0.5) * 0.4
        );
        p.vel.set(-fx * (0.4 + Math.random()), 0.35 + Math.random() * 0.8, -fz * (0.4 + Math.random()));
      }

      function updateDust(dt) {
        dustPool.forEach(p => {
          if (p.life <= 0) return;
          p.life -= dt;
          if (p.life <= 0) {
            p.sprite.visible = false;
            return;
          }
          p.sprite.position.addScaledVector(p.vel, dt);
          p.vel.y -= dt * 1.4;
          const k = Math.max(0, p.life / p.max);
          p.sprite.material.opacity = k * 0.55;
          p.sprite.scale.setScalar(0.28 + (1 - k) * 0.85);
        });
      }

      function updateHorses(dt, time) {
        const byId = new Map(fieldEntries().map(e => [e.id, e]));
        horses.forEach(h => {
          const st = byId.get(h.userData.id);
          if (!st) return;
          const pose = worldPose(st.t, st.lane);
          h.position.set(pose.x, 0, pose.z);
          h.rotation.y = pose.yaw;
          const ud = h.userData;
          const moving = game.state.phase === 'RACING' && !st.finished && st.speed > 0.004;
          const amp = moving ? 1 : 0.14;
          ud.phase += dt * (moving ? 2.2 + Math.min(0.05, st.speed) * 24 : 0.4);
          ud.legs.forEach(leg => {
            const a = limb(ud.phase + leg.phase, amp);
            leg.hip.rotation.x = a.hip;
            leg.knee.rotation.x = a.knee;
          });
          const bob = Math.sin(ud.phase * Math.PI * 2);
          ud.anim.position.y = Math.max(0, bob) * 0.06 * amp;
          ud.anim.rotation.x = bob * 0.055 * amp;
          ud.neck.rotation.x = 0.42 + bob * -0.12 * amp + (st.place === 1 && st.finished ? -0.22 : 0);
          ud.head.rotation.x = Math.sin(time * 1.8 + ud.id) * 0.05;
          ud.tail.rotation.x = -0.85 - amp * 0.35 + Math.sin(time * 7 + ud.id) * 0.1;
          ud.tail.rotation.y = Math.sin(time * 2.3 + ud.id) * 0.22;
          ud.jock.position.y = 1.4 + bob * 0.045 * amp;
          if (st.place >= 1 && st.place <= 3 && st.finished) {
            ud.medal.visible = true;
            if (ud.medal.userData.place !== st.place) {
              ud.medal.material.map = medalTex(st.place);
              ud.medal.material.needsUpdate = true;
              ud.medal.userData.place = st.place;
            }
          } else {
            ud.medal.visible = false;
          }
          if (moving && time - ud.dustAt > 0.045) {
            ud.dustAt = time;
            spawnDust(h.position, pose.yaw);
          }
        });
      }

      function updateGates(dt) {
        const want = (game.state.phase === 'RACING' || game.state.phase === 'RESULTS') ? 1 : 0;
        gateOpen += (want - gateOpen) * (1 - Math.exp(-8 * dt));
        gateDoors.forEach(d => {
          d.rotation.y = -d.userData.side * gateOpen * 1.7;
        });
      }

      function updateFlags(time) {
        flagPivots.forEach(p => {
          p.rotation.y = Math.sin(time * 3.2 + p.userData.i * 0.65) * (0.18 + p.userData.i * 0.05);
        });
      }

      function packCenter() {
        _pack.set(0, 0, 0);
        if (!horses.length) return _pack.set(0, 1, 0);
        horses.forEach(h => _pack.add(h.position));
        _pack.multiplyScalar(1 / horses.length);
        _pack.y = 1.15;
        return _pack;
      }

      function focusHorse() {
        const entries = fieldEntries();
        if (!entries.length || !horses.length) return null;
        let pick = entries[Math.floor(entries.length / 2)];
        if (game.state.phase === 'RACING' || game.state.phase === 'RESULTS') {
          const lead = api.currentRaceLeader && api.currentRaceLeader();
          if (lead) {
            const found = entries.find(e => e.id === lead.id);
            if (found) pick = found;
          }
        }
        const mesh = horses.find(h => h.userData.id === pick.id) || horses[0];
        return { mesh, yaw: mesh.rotation.y, pos: mesh.position, t: pick.t };
      }

      function worldAtLevel(t, level) {
        if (game.state.trackMode === 'straight') {
          const ends = straightEnds();
          const pose = worldPose(t, 0);
          const z = level < 0 ? ends.z0 - 1.4 : ends.z1 + 1.4;
          return new THREE.Vector3(pose.x, 0, z);
        }
        const geom = api.getVisualLane(level);
        const tt = ((t % 1) + 1) % 1;
        const p = api.stadiumPointAt(tt, geom);
        return svgToWorld(p.x, p.y);
      }

      function pullZoom(pos, look) {
        pos.sub(look).multiplyScalar(zoom).add(look);
      }

      function frameCamera(dt) {
        const pack = packCenter().clone();
        const focus = focusHorse();
        const pos = focus ? focus.pos : pack;
        const yaw = focus ? focus.yaw : 0;
        const focusT = focus ? focus.t : (game.state.trackTOffset || 0);
        _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
        const out = outward(pos).clone();
        let fov = 46;

        if (camId === 'broadcast') {
          // Stay behind the leader on the racing line. Looking back at the
          // pack put the first horse out of frame on the last bend.
          const backT = focusT - 0.032;
          desiredPos.copy(worldAtLevel(backT, -0.42));
          desiredPos.y = 6.4;
          const glance = worldAtLevel(focusT + 0.014, 1.1);
          desiredLook.copy(pos).lerp(glance, 0.4);
          desiredLook.y = 1.2;
          pullZoom(desiredPos, desiredLook);
          fov = 50;
        } else if (camId === 'rail') {
          desiredPos.copy(worldAtLevel(focusT, -0.06)).addScaledVector(_fwd, -1.6);
          desiredPos.y = 1.55;
          desiredLook.copy(pos).addScaledVector(_fwd, 2.2);
          desiredLook.y = 1.2;
          pullZoom(desiredPos, desiredLook);
          fov = 42;
        } else if (camId === 'chase') {
          desiredPos.copy(pos).addScaledVector(_fwd, -6.2).addScaledVector(out, 0.35).add(new THREE.Vector3(0, 2.7, 0));
          desiredLook.copy(pos).addScaledVector(_fwd, 7).add(new THREE.Vector3(0, 1.35, 0));
          pullZoom(desiredPos, desiredLook);
        } else if (camId === 'jockey') {
          desiredPos.copy(pos).addScaledVector(_fwd, 0.45).add(new THREE.Vector3(0, 2.05, 0));
          desiredLook.copy(pos).addScaledVector(_fwd, 16).add(new THREE.Vector3(0, 1.2, 0));
          fov = 66;
        } else if (camId === 'drone') {
          droneAng += dt * 0.22;
          const ang = yaw + droneAng;
          desiredPos.set(pos.x + Math.sin(ang) * 18 * zoom, 16 * zoom, pos.z + Math.cos(ang) * 18 * zoom);
          desiredLook.copy(pack);
          desiredLook.y = 0.5;
          fov = 50;
        } else if (camId === 'stands') {
          if (game.state.trackMode === 'straight') {
            desiredPos.set(pack.x * 0.15, 8.2, straightEnds().z0 - 6);
          } else {
            desiredPos.copy(worldAtLevel(game.state.trackTOffset || 0.125, -1.2));
            desiredPos.y = 7.2;
          }
          desiredLook.copy(pack);
          desiredLook.y = 1.1;
          pullZoom(desiredPos, desiredLook);
          fov = 40;
        } else if (camId === 'orbit') {
          const r = orbit.radius * zoom;
          const sp = Math.sin(orbit.phi);
          const raceNow = api.getRace && api.getRace();
          const freshRace = game.state.phase === 'RACING' && !(raceNow && raceNow.order && raceNow.order.length);
          const anchor = finishAnchor();
          const atLine = !freshRace && (
            game.state.phase === 'RESULTS' ||
            (raceNow && raceNow.order && raceNow.order.length > 0)
          );
          if (freshRace && orbitAtFinish) {
            orbitAtFinish = false;
            orbitEase = true;
          }
          const orbitAround = (look) => {
            desiredPos.set(
              look.x + sp * Math.cos(orbit.theta) * r,
              look.y + Math.cos(orbit.phi) * r,
              look.z + sp * Math.sin(orbit.theta) * r
            );
          };
          if (atLine) {
            if (!orbitAtFinish) {
              orbitAtFinish = true;
              orbitEase = true;
            }
            desiredLook.set(anchor.pos.x, 0.8, anchor.pos.z);
            orbitAround(desiredLook);
          } else {
            desiredLook.copy(pack);
            if (focus && game.state.phase === 'RACING') {
              const dx = focus.pos.x - pack.x;
              const dz = focus.pos.z - pack.z;
              const gap = Math.hypot(dx, dz);
              const keep = Math.tan(THREE.MathUtils.degToRad(24)) * r * 0.72;
              if (gap > keep) {
                const push = (gap - keep) / gap;
                desiredLook.x += dx * push;
                desiredLook.z += dz * push;
              }
              const prog = api.raceLeaderProgress ? api.raceLeaderProgress() : 0;
              if (prog > 0.8) {
                const k = smoothstep(0.8, 0.96, prog);
                desiredLook.x += (anchor.pos.x - desiredLook.x) * k;
                desiredLook.z += (anchor.pos.z - desiredLook.z) * k;
              }
            }
            desiredLook.y = 0.8;
            orbitAround(desiredLook);
          }
          fov = 48;
        } else {
          const anchor = finishAnchor();
          const fwd = new THREE.Vector3(Math.sin(anchor.yaw), 0, Math.cos(anchor.yaw));
          const wirePos = worldAtLevel(anchor.t, -0.12).addScaledVector(fwd, 3.2);
          wirePos.y = 2.8;
          const wireLook = anchor.pos.clone().addScaledVector(fwd, -10);
          wireLook.y = 1.2;
          const widePos = worldAtLevel(anchor.t, -0.35).addScaledVector(fwd, -4);
          widePos.y = 6.4;
          const wideLook = pack.clone();
          wideLook.y = 1.15;
          let prog = 0;
          if (game.state.phase === 'RACING' || game.state.phase === 'RESULTS') {
            prog = api.raceLeaderProgress ? api.raceLeaderProgress() : 0;
          }
          const k = game.state.phase === 'RESULTS' ? 1 : smoothstep(0.55, 0.8, prog);
          desiredPos.copy(widePos).lerp(wirePos, k);
          desiredLook.copy(wideLook).lerp(wireLook, k);
          pullZoom(desiredPos, desiredLook);
          fov = 40;
        }

        if (camId === 'rail' || camId === 'jockey') {
          desiredPos.y += Math.sin(performance.now() * 0.014) * (camId === 'jockey' ? 0.012 : 0.02);
        }
        if (desiredPos.y < 0.45 && camId !== 'jockey') desiredPos.y = 0.45;

        if (snapCam) {
          camPos.copy(desiredPos);
          camLook.copy(desiredLook);
          camera.fov = fov;
          snapCam = false;
        } else {
          let follow = camId === 'jockey' ? 10 : camId === 'broadcast' ? 9 : 6;
          if (camId === 'orbit' && orbitEase) follow = 1.35;
          const blend = 1 - Math.exp(-dt * follow);
          camPos.lerp(desiredPos, blend);
          camLook.lerp(desiredLook, blend);
          camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 5));
          if (orbitEase && camId === 'orbit' && camPos.distanceTo(desiredPos) < 0.45 && camLook.distanceTo(desiredLook) < 0.3) {
            orbitEase = false;
          }
        }
        camera.position.copy(camPos);
        camera.lookAt(camLook);
        camera.updateProjectionMatrix();

        const skin = PAL[game.state.course] || PAL.grass;
        const sunOff = refs.sunPos || skin.sunPos;
        sun.position.copy(pack).add(new THREE.Vector3(sunOff[0], sunOff[1], sunOff[2]));
        sunTarget.position.copy(pack);
        sunTarget.updateMatrixWorld();
        const ext = 22;
        sun.shadow.camera.left = -ext;
        sun.shadow.camera.right = ext;
        sun.shadow.camera.top = ext;
        sun.shadow.camera.bottom = -ext;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 140;
        sun.shadow.camera.updateProjectionMatrix();
      }

      function finishAnchor() {
        const lane = (api.currentLaneCount() - 1) / 2;
        const t = game.state.trackMode === 'straight'
          ? (game.state.trackTOffset || 0) + 1
          : (game.state.trackTOffset || 0);
        const pose = worldPose(t, lane);
        return { pos: new THREE.Vector3(pose.x, 0, pose.z), yaw: pose.yaw, t };
      }

      function step(ts) {
        const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
        lastTs = ts;
        const time = ts / 1000;
        if (worldDirty) rebuildWorld();
        if (fieldDirty) rebuildField();
        updateGates(dt);
        updateHorses(dt, time);
        updateDust(dt);
        updateFlags(time);
        if (!refs.toteAt || time - refs.toteAt > 0.3) {
          refs.toteAt = time;
          paintTote();
          paintToteBack();
        }
        updateTvnBoards(time, dt);
        syncLamps();
        updateRoulette(dt);
        frameCamera(dt);
        renderer.render(scene, camera);
      }

      function loop(ts) {
        if (!active) { loopStarted = false; return; }
        raf = requestAnimationFrame(loop);
        try {
          step(ts);
        } catch (err) {
          console.error(err);
          active = false;
          if (hudHint) hudHint.textContent = '3D view hit an error';
        }
      }

      function startLoop() {
        if (loopStarted) return;
        loopStarted = true;
        lastTs = 0;
        raf = requestAnimationFrame(loop);
      }

      function setActive(on) {
        if (on && !renderer && !boot()) {
          if (hudHint) hudHint.textContent = 'WebGL is unavailable';
          return;
        }
        active = on;
        game.state.viewMode = on ? '3d' : '2d';
        if (outer) outer.classList.toggle('is-3d', on);
        document.body.classList.toggle('view-3d', on);
        if (btn) btn.classList.toggle('active', on);
        const label = btn && btn.querySelector('.ctl-label');
        const text = on ? 'View: 3D' : 'View: 2D';
        if (label) label.textContent = text;
        else if (btn) btn.textContent = text;
        if (on) {
          if (worldDirty || !worldGroup) rebuildWorld();
          if (fieldDirty || !horses.length) rebuildField();
          resize();
          snapCam = true;
          startLoop();
        }
        if (api.onViewChange) api.onViewChange();
      }

      function setCamera(id) {
        if (!CAMS.some(c => c.id === id)) id = 'broadcast';
        if (id !== camId) zoomByCam[camId] = zoom;
        camId = id;
        zoom = zoomByCam[id] != null ? zoomByCam[id] : 1;
        snapCam = true;
        game.state.camera = id;
        if (sel) sel.value = id;
        if (bar) bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.cam === id));
        const cam = CAMS.find(c => c.id === id);
        if (hudName) hudName.textContent = cam ? cam.label : id;
        if (hudHint) {
          hudHint.textContent = id === 'orbit'
            ? 'Drag to look · scroll to zoom'
            : 'V view · C camera · scroll zoom';
        }
      }

      function cycle(dir) {
        const i = Math.max(0, CAMS.findIndex(c => c.id === camId));
        setCamera(CAMS[(i + dir + CAMS.length) % CAMS.length].id);
      }

      if (btn) btn.onclick = () => setActive(!active);
      if (sel) sel.onchange = () => setCamera(sel.value);
      if (bar) {
        bar.querySelectorAll('button').forEach(b => {
          b.onclick = () => setCamera(b.dataset.cam);
        });
      }
      setCamera(game.state.camera || 'orbit');

      if (canvas) {
        canvas.addEventListener('wheel', (e) => {
          if (!active) return;
          e.preventDefault();
          zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (e.deltaY > 0 ? 1.08 : 0.92)));
          zoomByCam[camId] = zoom;
        }, { passive: false });
        let drag = null;
        let press = null;
        const raycaster = new THREE.Raycaster();
        const pointerNdc = new THREE.Vector2();
        function pointerRay(e) {
          const rect = canvas.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
        }
        function infieldHit(e) {
          if (!active || !camera || game.state.rouletteOpen) return null;
          pointerRay(e);
          const roots = [refs.rouletteRoot, refs.pitchRoot, refs.chessRoot, refs.jumboRoot].filter(Boolean);
          const hits = raycaster.intersectObjects(roots, true);
          if (!hits.length) return null;
          let node = hits[0].object;
          while (node) {
            if (node.userData && node.userData.kind) {
              return { kind: node.userData.kind, href: node.userData.href || '' };
            }
            node = node.parent;
          }
          return null;
        }
        function showComingSoon() {
          const el = document.getElementById('comingSoon');
          if (!el) return;
          el.hidden = false;
          clearTimeout(refs.soonTid);
          refs.soonTid = setTimeout(() => { el.hidden = true; }, 1700);
        }
        canvas.addEventListener('pointerdown', (e) => {
          if (!active) return;
          press = { x: e.clientX, y: e.clientY };
          if (camId !== 'orbit') return;
          drag = { x: e.clientX, y: e.clientY, theta: orbit.theta, phi: orbit.phi };
          canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', (e) => {
          if (drag) {
            orbit.theta = drag.theta - (e.clientX - drag.x) * 0.007;
            orbit.phi = Math.min(1.35, Math.max(0.28, drag.phi + (e.clientY - drag.y) * 0.005));
            return;
          }
          const hit = infieldHit(e);
          canvas.style.cursor = hit && hit.kind ? 'pointer' : '';
        });
        canvas.addEventListener('pointerup', (e) => {
          const start = press;
          press = null;
          drag = null;
          if (!start || !active) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (dx * dx + dy * dy > 36) return;
          const hit = infieldHit(e);
          if (!hit) return;
          if (hit.kind === 'roulette' && api.openRoulette) api.openRoulette();
          else if (hit.kind === 'football' || hit.kind === 'chess') showComingSoon();
          else if (hit.kind === 'ad' && hit.href) window.open(hit.href, '_blank', 'noopener,noreferrer');
        });
        canvas.addEventListener('pointercancel', () => { press = null; drag = null; });
      }

      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (game.state.rouletteOpen) return;
        if (e.key === 'v' || e.key === 'V') setActive(!active);
        else if (e.key === 'c' || e.key === 'C' || e.key === ']') cycle(1);
        else if (e.key === '[') cycle(-1);
        else if (e.key >= '1' && e.key <= '8') setCamera(CAMS[Number(e.key) - 1].id);
      });

      setActive(game.state.viewMode !== '2d');

      return {
        onField() {
          fieldDirty = true;
          if (active && renderer) rebuildField();
        },
        onCourse() {
          if (active && renderer) {
            applySkin();
          } else {
            worldDirty = true;
          }
        },
        onTrack() {
          worldDirty = true;
          fieldDirty = true;
          if (active && renderer) {
            rebuildWorld();
            rebuildField();
          }
        },
        resize
      };
    }
  };
})();
