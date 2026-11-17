// Solmar Bay itself: a sun-soaked coastal city drawn from boxes, planes
// and procedural canvas textures. A street grid with a beach and pier on
// the east edge, a marina, a downtown of towers, palm boulevards, neon,
// billboards, props, a far skyline and drifting clouds. This module also
// owns the building boxes every other system steers around, the signal
// cycle and the time-of-day lighting.
import * as THREE from 'three';
import { mulberry, pick, rand, PALETTE } from './util.js';

export const CITY_SIZE = 520; // playable half-extent is 260
const PITCH = 60;
const BLOCK = 46;
const LANE = 14;

// A windowed facade, painted once onto a canvas and reused as a texture.
function paintFacade(rng, base, tall) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  const stepY = tall ? 20 : 15;
  const stepX = tall ? 15 : 11;
  for (let y = 8; y < 118; y += stepY) {
    for (let x = 6; x < 56; x += stepX) {
      const roll = rng();
      g.fillStyle = roll < 0.5 ? '#ffe9a8' : roll < 0.75 ? '#2b3a4a' : '#7fb0c9';
      g.fillRect(x, y, tall ? 9 : 7, tall ? 11 : 8);
    }
    if (tall) {
      g.fillStyle = 'rgba(40,40,50,0.85)';
      g.fillRect(0, y + 14, 64, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A billboard face: flat colour, one bold word, one small line beneath.
function paintBoard(word, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg;
  g.font = 'bold 44px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(word, 128, 52);
  g.font = 'bold 20px Arial, sans-serif';
  g.fillText('SOLMAR BAY', 128, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Zebra crossings for the central junctions: striped bands on all four
// arms, centre left clear, so each tile reads as crosswalks rather than
// a checkerboard.
function paintCrossing() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(245,245,240,0.88)';
  for (let i = 0; i < 3; i++) {
    const o = 44 + i * 14;
    g.fillRect(o, 8, 12, 34);
    g.fillRect(o, 86, 12, 34);
    g.fillRect(8, o, 34, 12);
    g.fillRect(86, o, 34, 12);
  }
  return new THREE.CanvasTexture(c);
}

function layGround(group) {
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0x6f6a63 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.05;
  group.add(base);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 1100),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(300, 0, 0);
  group.add(beach);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 1100),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(520, -0.4, 0);
  group.add(sea);
}

function layStreets(group) {
  // Light asphalt on purpose — near-black roads used to eat half of
  // every screenshot.
  const tar = new THREE.MeshLambertMaterial({ color: PALETTE.tarmac });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.pavement });
  const kerbMat = new THREE.MeshLambertMaterial({ color: PALETTE.kerb });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const crossMat = new THREE.MeshBasicMaterial({
    map: paintCrossing(),
    transparent: true,
    depthWrite: false,
  });
  for (let i = -4; i <= 4; i++) {
    const c = i * PITCH;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 60, LANE), tar);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, c);
    group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(LANE, CITY_SIZE + 60), tar);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.02, 0);
    group.add(v);
    for (const off of [-LANE / 2 - 0.4, LANE / 2 + 0.4]) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(CITY_SIZE + 60, 0.3, 0.8), kerbMat);
      ch.position.set(0, 0.15, c + off);
      group.add(ch);
      const cv = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, CITY_SIZE + 60), kerbMat);
      cv.position.set(c + off, 0.15, 0);
      group.add(cv);
    }
    for (let d = -CITY_SIZE / 2; d < CITY_SIZE / 2; d += 24) {
      const d1 = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), dashMat);
      d1.rotation.x = -Math.PI / 2;
      d1.position.set(d, 0.04, c);
      group.add(d1);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 6), dashMat);
      d2.rotation.x = -Math.PI / 2;
      d2.position.set(c, 0.04, d);
      group.add(d2);
    }
  }
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const xw = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), crossMat);
      xw.rotation.x = -Math.PI / 2;
      xw.position.set(i * PITCH, 0.045, j * PITCH);
      group.add(xw);
    }
  }
  // Sidewalk pads under each block. Blocks sit half a pitch off the
  // roads — roads run on multiples of 60, block centres on 30, 90, 150
  // — so no building ever stands in the middle of a street.
  for (let gx = -4; gx <= 3; gx++) {
    for (let gz = -4; gz <= 3; gz++) {
      const bx = gx * PITCH + 30;
      const bz = gz * PITCH + 30;
      if (bx > 230) continue;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 4, BLOCK + 4), walkMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, 0.015, bz);
      group.add(pad);
    }
  }
}

function layParks(group, rng) {
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const barkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
  function plant(x, z, s) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 3 * s, 6), barkMat);
    trunk.position.y = 1.5 * s;
    t.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2 * s, 8, 6), leafMat);
    crown.position.y = 4.2 * s;
    t.add(crown);
    t.position.set(x, 0, z);
    group.add(t);
  }
  const lawnMat = new THREE.MeshLambertMaterial({ color: 0x5da864 });
  for (const [px, pz] of [[-90, -90], [150, 150]]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), lawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(px, 0.03, pz);
    group.add(lawn);
    for (let i = 0; i < 6; i++) {
      plant(px + rand(rng, -18, 18), pz + rand(rng, -18, 18), rand(rng, 0.8, 1.4));
    }
  }
  for (let z = -240; z <= 240; z += 30) plant(268, z, 1.2);
  return { plant };
}

function layFurniture(group, rng, plant) {
  const ironMat = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.45, 8, 6);
  function lampPost(x, z) {
    const p = new THREE.Mesh(poleGeo, ironMat);
    p.position.set(x, 3, z);
    group.add(p);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 6.2, z);
    group.add(bulb);
  }
  for (let d = -240; d <= 240; d += 60) {
    lampPost(8, d);
    lampPost(-8, d + 30);
    lampPost(d, 8);
    lampPost(d + 30, -8);
  }
  for (let z = -210; z <= 210; z += 60) lampPost(252, z);
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const hydGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.1, 8);
  for (let i = 0; i < 12; i++) {
    const hx = Math.floor(rand(rng, -4, 4)) * PITCH + 8;
    const hz = Math.floor(rand(rng, -4, 4)) * PITCH + 8;
    const hy = new THREE.Mesh(hydGeo, hydMat);
    hy.position.set(hx, 0.55, hz);
    group.add(hy);
  }
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  function benchSeat(x, z, rot) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 1), woodMat);
    seat.position.y = 0.6;
    b.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.2), woodMat);
    back.position.set(0, 1.1, -0.45);
    b.add(back);
    b.position.set(x, 0, z);
    b.rotation.y = rot;
    group.add(b);
  }
  for (const [x, z] of [[-90, -70], [-70, -90], [150, 130], [130, 150], [280, -40], [280, 40], [280, 120], [-30, 30]]) {
    benchSeat(x, z, rand(rng, 0, Math.PI));
  }
  const shelterMat = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  for (const [x, z] of [[60, 8], [-60, -8], [8, 120], [-8, -120], [180, 8], [-180, -8]]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 2.4), shelterMat);
    roof.position.set(x, 2.6, z);
    group.add(roof);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(5, 2, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x9fd0e8 }),
    );
    back.position.set(x, 1.3, z - 1.1);
    group.add(back);
    const post = new THREE.Mesh(poleGeo, ironMat);
    post.position.set(x + 2.2, 1.3, z + 1);
    post.scale.y = 0.45;
    group.add(post);
  }
  // Traffic signals at the eight junctions around the centre. The three
  // lamps cycle through updateSignals() below, so the grid breathes.
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const glowGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampMats = [
    new THREE.MeshBasicMaterial({ color: 0xff3333 }),
    new THREE.MeshBasicMaterial({ color: 0xffc233 }),
    new THREE.MeshBasicMaterial({ color: 0x33dd66 }),
  ];
  const lights = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const x = i * PITCH + 8;
      const z = j * PITCH + 8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.5, 6), darkMat);
      pole.position.set(x, 2.75, z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), darkMat);
      head.position.set(x, 5.6, z);
      group.add(head);
      const bulbs = lampMats.map((m, k) => {
        const b = new THREE.Mesh(glowGeo, m);
        b.position.set(x, 6.3 - k * 0.7, z + 0.4);
        group.add(b);
        return b;
      });
      lights.push({ bulbs, phase: (i + 2) * 1.7 + (j + 2) * 2.3 });
    }
  }
  return lights;
}

function layTowers(group, rng, walls) {
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  let towers = 0;
  for (let gx = -4; gx <= 3; gx++) {
    for (let gz = -4; gz <= 3; gz++) {
      const cx = gx * PITCH + 30;
      const cz = gz * PITCH + 30;
      if ((gx === -2 && gz === -2) || (gx === 2 && gz === 2)) continue; // parks
      if (cx > 230) continue; // beach
      const downtown = Math.abs(gx) <= 1 && Math.abs(gz) <= 1;
      const slots = downtown ? 1 : rng() < 0.6 ? 2 : 1;
      for (let k = 0; k < slots; k++) {
        const w = rand(rng, 16, 30);
        const d = rand(rng, 16, 30);
        const landmark = downtown && rng() < 0.3;
        const h = landmark ? rand(rng, 115, 155) : downtown ? rand(rng, 55, 110) : rand(rng, 12, 42);
        const ox = k === 0 ? -8 : 10;
        const oz = k === 0 ? -8 : 10;
        const bx = cx + ox;
        const bz = cz + oz;
        const base = landmark ? pick(rng, [0x2a6a8a, 0x8a6a2a, 0x3a4a6a]) : pick(rng, PALETTE.walls);
        const tex = paintFacade(rng, hex(base), rng() < 0.5);
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ map: tex }),
        );
        b.position.set(bx, h / 2, bz);
        group.add(b);
        // Roof clutter: plant boxes, AC units, the odd water tank.
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const plantBox = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 3, d * 0.4), roofMat);
        plantBox.position.set(bx, h + 1.5, bz);
        group.add(plantBox);
        const acN = 1 + Math.floor(rng() * 3);
        for (let a = 0; a < acN; a++) {
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 1.2, 2.2),
            new THREE.MeshLambertMaterial({ color: 0x888888 }),
          );
          ac.position.set(bx + rand(rng, -w / 4, w / 4), h + 0.6, bz + rand(rng, -d / 4, d / 4));
          group.add(ac);
        }
        if (rng() < 0.3) {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2, 4, 8),
            new THREE.MeshLambertMaterial({ color: 0x7a5a3a }),
          );
          tank.position.set(bx + w / 4, h + 2, bz - d / 4);
          group.add(tank);
        }
        if (landmark) {
          const spire = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 1.2, 22, 6),
            new THREE.MeshLambertMaterial({ color: 0xcccccc }),
          );
          spire.position.set(bx, h + 11, bz);
          group.add(spire);
          const tip = new THREE.Mesh(
            new THREE.SphereGeometry(1.1, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xff2e88 }),
          );
          tip.position.set(bx, h + 22, bz);
          group.add(tip);
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, h * 0.6, 0.7),
            new THREE.MeshBasicMaterial({ color: pick(rng, PALETTE.neons) }),
          );
          strip.position.set(bx, h * 0.55, bz + d / 2 + 0.4);
          group.add(strip);
        } else if (rng() < 0.55) {
          // Neon sign on most towers, facing both ways so it reads
          // from either approach.
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.8, 3, 0.6),
            new THREE.MeshBasicMaterial({ color: pick(rng, PALETTE.neons) }),
          );
          sign.position.set(bx, h * 0.72, bz + d / 2 + 0.4);
          group.add(sign);
          if (rng() < 0.5) {
            const sign2 = sign.clone();
            sign2.position.set(bx, h * 0.72, bz - d / 2 - 0.4);
            group.add(sign2);
          }
        }
        walls.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
        towers++;
      }
    }
  }
  // Billboards on tall poles at busy corners — big flat wordmarks, all
  // original Solmar names.
  const ironMat = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });
  const boards = [
    ['SOLMAR', '#ff2e88', '#ffffff', 120, -68, 0.4],
    ['CASINO', '#00b8a9', '#ffffff', -68, 120, -0.4],
    ['PIER 9', '#1e7fa8', '#ffd23f', 240, 68, Math.PI / 2],
    ['SUNSET MOTEL', '#ff6b35', '#ffffff', -120, -68, 0.4],
    ['COMET GT', '#7cff5e', '#111111', 68, -120, -0.4],
  ];
  for (const [word, bg, fg, x, z, rot] of boards) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 12, 8), ironMat);
    post.position.set(x, 6, z);
    group.add(post);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 10),
      new THREE.MeshBasicMaterial({ map: paintBoard(word, bg, fg), side: THREE.DoubleSide }),
    );
    face.position.set(x, 16, z);
    face.rotation.y = rot;
    group.add(face);
  }
  // Far skyline: dark towers ringing the playable grid so the horizon
  // is a city, not empty fog.
  const farMat = new THREE.MeshLambertMaterial({ color: 0x33414f });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand(rng, -0.1, 0.1);
    const r = rand(rng, 380, 470);
    const w = rand(rng, 24, 44);
    const h = rand(rng, 50, 150);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat);
    tower.position.set(Math.sin(a) * r, h / 2 - 1, Math.cos(a) * r);
    group.add(tower);
  }
  // Clouds: flat white blobs high up.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 12; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(rand(rng, 14, 26), 8, 6), cloudMat);
    cl.scale.y = 0.32;
    cl.position.set(rand(rng, -380, 380), rand(rng, 130, 190), rand(rng, -380, 380));
    group.add(cl);
  }
  return towers;
}

function layWaterfront(group, rng, walls) {
  const barkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(70, 1.2, 10),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  pier.position.set(300, 0.6, -60);
  group.add(pier);
  for (let i = 0; i < 9; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2, 4),
      new THREE.MeshLambertMaterial({ color: pick(rng, PALETTE.paints) }),
    );
    hull.position.y = 0.4;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), barkMat);
    mast.position.y = 3;
    boat.add(mast);
    boat.position.set(400 + rand(rng, -20, 60), 0, -200 + i * 50);
    group.add(boat);
  }
  const shadeA = new THREE.MeshLambertMaterial({ color: 0xff6b9d });
  const shadeB = new THREE.MeshLambertMaterial({ color: 0x00b8a9 });
  for (let i = 0; i < 8; i++) {
    const ux = 282;
    const uz = -200 + i * 55;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), barkMat);
    pole.position.set(ux, 1.5, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3, 1.4, 8), i % 2 ? shadeA : shadeB);
    top.position.set(ux, 3.2, uz);
    group.add(top);
  }
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 4.5, 42, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2e6d0 }),
  );
  tower.position.set(285, 21, 180);
  group.add(tower);
  const lampTop = new THREE.Mesh(
    new THREE.SphereGeometry(3, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  lampTop.position.set(285, 44, 180);
  group.add(lampTop);
  walls.push({ x0: 281, x1: 289, z0: 176, z1: 184 });
}

export function buildCity(scene, seed) {
  const rng = mulberry(seed);
  const walls = []; // {x0,x1,z0,z1}
  const group = new THREE.Group();
  scene.add(group);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd9ff, 0.85));
  const sky = new THREE.HemisphereLight(0x9fd0ff, 0x8a6a4a, 0.7);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xffc98a, 320, 900);
  scene.background = new THREE.Color(0x87b8e8);

  layGround(group);
  layStreets(group);
  const { plant } = layParks(group, rng);
  const lights = layFurniture(group, rng, plant);
  const towers = layTowers(group, rng, walls);
  layWaterfront(group, rng, walls);
  return { group, walls, towers, sun, sky, scene, lights };
}

// Signals cycle green 4s, amber 1s, red 4s, each junction offset so the
// grid breathes instead of blinking in unison.
export function updateSignals(city, nowMs) {
  if (!city.lights) return;
  for (const s of city.lights) {
    const phase = (nowMs / 1000 + s.phase) % 9;
    const show = phase < 4 ? 2 : phase < 5 ? 1 : 0;
    s.bulbs.forEach((bulb, k) => {
      bulb.visible = k === show;
    });
  }
}

// Push a circle (walker or car) out of the building boxes. True on hit.
export function hitBuilding(walls, x, z, r) {
  for (const w of walls) {
    const nx = Math.max(w.x0, Math.min(x, w.x1));
    const nz = Math.max(w.z0, Math.min(z, w.z1));
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < r * r) return { hit: true, nx, nz };
  }
  return { hit: false };
}

// Daylight: hour 6..24. Late sun turns warm, dusk melts the sky into a
// burnt orange and then darkens, lamps and neon take over.
export function applyDaylight(city, hour) {
  const t = (hour - 6) / 18; // 0 at dawn, 1 at night
  const sunH = Math.sin(Math.PI * (1 - t * 0.9));
  city.sun.intensity = 0.5 + 2.0 * Math.max(0.15, sunH);
  const late = t > 0.55;
  city.sun.color.setHex(late ? 0xff9a50 : 0xffd9a0);
  city.sky.intensity = late ? 0.45 : 0.7;
  const duskAmt = Math.max(0, Math.min(1, (t - 0.5) / 0.35));
  city.sun.intensity *= 1 - duskAmt * 0.55;
  const day = new THREE.Color(0x87b8e8);
  const dusk = new THREE.Color(0x35304e);
  city.scene.background.lerpColors(day, dusk, duskAmt);
  city.scene.fog.color.lerpColors(new THREE.Color(0xffc98a), new THREE.Color(0x8a5570), duskAmt);
}
