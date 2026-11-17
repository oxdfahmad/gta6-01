// Solmar Bay — an original sun-soaked coastal city, built from boxes, planes
// and procedural canvas textures. Grid of streets, a beach and pier on the
// east, a marina, a downtown of towers, palm-lined boulevards, neon signs,
// billboards, street props, a distant skyline and clouds. Exports the
// collision boxes (AABBs) every other system steers around.
import * as THREE from 'three';
import { mulberry32, pick, range, PALETTE } from './util.js';

export const CITY_SIZE = 520; // half-extent 260
const BLOCK = 46, ROAD = 14, PITCH = BLOCK + ROAD;

function facadeTexture(rng, base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 14) for (let x = 6; x < 58; x += 12) {
    g.fillStyle = rng() < 0.55 ? '#ffe9a8' : (rng() < 0.5 ? '#2b3a4a' : '#7fb0c9');
    g.fillRect(x, y, 8, 9);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Second facade variant: taller windows with balcony rails, for variety.
function facadeTextureTall(rng, base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 18) {
    for (let x = 5; x < 56; x += 16) {
      g.fillStyle = rng() < 0.5 ? '#ffe9a8' : (rng() < 0.5 ? '#223140' : '#8fd0e8');
      g.fillRect(x, y, 10, 12);
    }
    g.fillStyle = 'rgba(40,40,50,0.85)'; g.fillRect(0, y + 13, 64, 2); // balcony rail
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Billboard face: big flat-colour panel with a bold wordmark, drawn once.
function billboardTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  g.font = 'bold 20px Arial, sans-serif'; g.fillText('SOLMAR BAY', 128, 100);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// One zebra-crossing texture reused at every central intersection: white
// stripes in four bands around the junction — north/south bands cross the
// north–south road, east/west bands cross the east–west road — with the
// centre and corners left clear, so the tile reads as four real crosswalks
// around the junction, not a checkerboard. Stripes sit in the middle
// third of each side so the bands never overlap each other.
function crosswalkTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(245,245,240,0.88)';
  for (let i = 0; i < 3; i++) {
    const o = 44 + i * 14;
    g.fillRect(o, 8, 12, 34); // north band: stripes crossing the z-road
    g.fillRect(o, 86, 12, 34); // south band
    g.fillRect(8, o, 34, 12); // west band: stripes crossing the x-road
    g.fillRect(86, o, 34, 12); // east band
  }
  const t = new THREE.CanvasTexture(c); return t;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const group = new THREE.Group(); scene.add(group);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4); sun.position.set(180, 260, 120); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd9ff, 0.85));
  const hemi = new THREE.HemisphereLight(0x9fd0ff, 0x8a6a4a, 0.7); scene.add(hemi);
  scene.fog = new THREE.Fog(0xffc98a, 320, 900);
  scene.background = new THREE.Color(0x87b8e8);

  // Ground: sand east beach, grass/park patches, asphalt base.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshLambertMaterial({ color: 0x6f6a63 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; group.add(ground);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(120, 1100), new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(300, 0, 0); group.add(beach);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 1100), new THREE.MeshLambertMaterial({ color: PALETTE.sea }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(520, -0.4, 0); group.add(sea);

  // Roads: light asphalt strips on the grid + centre dashes + sidewalks.
  // The asphalt is deliberately mid-grey now (was near-black): the road
  // used to swallow half of every screenshot in a black void.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const curbMat = new THREE.MeshLambertMaterial({ color: PALETTE.curb });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const crossMat = new THREE.MeshBasicMaterial({ map: crosswalkTexture(), transparent: true, depthWrite: false });
  for (let i = -4; i <= 4; i++) {
    const c = i * PITCH;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 60, ROAD), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, c); group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CITY_SIZE + 60), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0.02, 0); group.add(v);
    // Curbs: raised edges so the sidewalk reads against the asphalt.
    for (const off of [-ROAD / 2 - 0.4, ROAD / 2 + 0.4]) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(CITY_SIZE + 60, 0.3, 0.8), curbMat);
      ch.position.set(0, 0.15, c + off); group.add(ch);
      const cv = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, CITY_SIZE + 60), curbMat);
      cv.position.set(c + off, 0.15, 0); group.add(cv);
    }
    for (let d = -CITY_SIZE / 2; d < CITY_SIZE / 2; d += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.04, c); group.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 6), dashMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(c, 0.04, d); group.add(dash2);
    }
  }
  // Zebra crossings on the central intersections, one textured tile each.
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const xw = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), crossMat);
    xw.rotation.x = -Math.PI / 2; xw.position.set(i * PITCH, 0.045, j * PITCH); group.add(xw);
  }
  // Sidewalk pads under every block so streets read as a grid, not dirt.
  // Blocks sit HALF a pitch off the roads: roads run on multiples of 60,
  // block centres on 30, 90, 150 ... so no building ever stands on a road.
  for (let gx = -4; gx <= 3; gx++) for (let gz = -4; gz <= 3; gz++) {
    const bx = gx * PITCH + 30, bz = gz * PITCH + 30;
    if (bx > 230) continue;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 4, BLOCK + 4), walkMat);
    pad.rotation.x = -Math.PI / 2; pad.position.set(bx, 0.015, bz); group.add(pad);
  }
  // Parks: two green squares with trees.
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x5da864 });
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
  function tree(x, z, s) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 3 * s, 6), trunkMat); trunk.position.y = 1.5 * s; t.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.2 * s, 8, 6), treeMat); top.position.y = 4.2 * s; t.add(top);
    t.position.set(x, 0, z); group.add(t);
  }
  [[-90, -90], [150, 150]].forEach(([px, pz]) => {
    const park = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), parkMat);
    park.rotation.x = -Math.PI / 2; park.position.set(px, 0.03, pz); group.add(park);
    for (let i = 0; i < 6; i++) tree(px + range(rng, -18, 18), pz + range(rng, -18, 18), range(rng, 0.8, 1.4));
  });
  // Palm-lined boulevard along the beach.
  for (let z = -240; z <= 240; z += 30) tree(268, z, 1.2);

  // Street props: lamps, hydrants, benches, bus stops, traffic lights.
  // Shared geometries/materials keep the extra meshes cheap.
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
  function lamp(x, z) {
    const p = new THREE.Mesh(poleGeo, lampPoleMat); p.position.set(x, 3, z); group.add(p);
    const head = new THREE.Mesh(lampGeo, lampHeadMat); head.position.set(x, 6.2, z); group.add(head);
  }
  for (let d = -240; d <= 240; d += 60) { lamp(8, d); lamp(-8, d + 30); lamp(d, 8); lamp(d + 30, -8); }
  for (let z = -210; z <= 210; z += 60) lamp(252, z);
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const hydrantGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.1, 8);
  for (let i = 0; i < 12; i++) {
    const hx = Math.floor(range(rng, -4, 4)) * PITCH + 8, hz = Math.floor(range(rng, -4, 4)) * PITCH + 8;
    const hy = new THREE.Mesh(hydrantGeo, hydrantMat); hy.position.set(hx, 0.55, hz); group.add(hy);
  }
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  function bench(x, z, rot) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 1), benchMat); seat.position.y = 0.6; b.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.2), benchMat); back.position.set(0, 1.1, -0.45); b.add(back);
    b.position.set(x, 0, z); b.rotation.y = rot; group.add(b);
  }
  [[-90, -70], [-70, -90], [150, 130], [130, 150], [280, -40], [280, 40], [280, 120], [-30, 30]].forEach(([x, z]) => bench(x, z, range(rng, 0, Math.PI)));
  // Bus stops: shelter roof + back panel + pole, along the two main avenues.
  const stopMat = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  [[60, 8], [-60, -8], [8, 120], [-8, -120], [180, 8], [-180, -8]].forEach(([x, z]) => {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 2.4), stopMat); roof.position.set(x, 2.6, z); group.add(roof);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 0.2), new THREE.MeshLambertMaterial({ color: 0x9fd0e8 })); back.position.set(x, 1.3, z - 1.1); group.add(back);
    const post = new THREE.Mesh(poleGeo, lampPoleMat); post.position.set(x + 2.2, 1.3, z + 1); post.scale.y = 0.45; group.add(post);
  });
  // Traffic lights at the eight central intersections: pole + signal head.
  // The three lamps are toggled by updateSignals() below, so the lights
  // actually cycle green–amber–red instead of sitting frozen.
  const lightPoleMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const sigRed = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  const sigAmber = new THREE.MeshBasicMaterial({ color: 0xffc233 });
  const sigGreen = new THREE.MeshBasicMaterial({ color: 0x33dd66 });
  const sigGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const signals = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    if (i === 0 && j === 0) continue;
    const x = i * PITCH + 8, z = j * PITCH + 8;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.5, 6), lightPoleMat);
    pole.position.set(x, 2.75, z); group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), lightPoleMat);
    head.position.set(x, 5.6, z); group.add(head);
    const lamps = [sigRed, sigAmber, sigGreen].map((m, k) => {
      const lampMesh = new THREE.Mesh(sigGeo, m); lampMesh.position.set(x, 6.3 - k * 0.7, z + 0.4); group.add(lampMesh);
      return lampMesh;
    });
    // Phase offset per intersection so the grid is not one synced blink.
    signals.push({ lamps, offset: (i + 2) * 1.7 + (j + 2) * 2.3 });
  }

  // Buildings: 1-4 per block, towers downtown near the centre.
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  let buildingCount = 0;
  for (let gx = -4; gx <= 3; gx++) for (let gz = -4; gz <= 3; gz++) {
    const cx = gx * PITCH + 30, cz = gz * PITCH + 30;
    if ((gx === -2 && gz === -2) || (gx === 2 && gz === 2)) continue; // parks
    if (cx > 230) continue; // beach
    const downtown = Math.abs(gx) <= 1 && Math.abs(gz) <= 1;
    const n = downtown ? 1 : (rng() < 0.6 ? 2 : 1);
    for (let k = 0; k < n; k++) {
      const w = range(rng, 16, 30), d = range(rng, 16, 30);
      // Landmark towers: a few downtown blocks rise far above the rest,
      // with a spire and a vertical neon strip so the skyline reads.
      const landmark = downtown && rng() < 0.3;
      const h = landmark ? range(rng, 115, 155) : downtown ? range(rng, 55, 110) : range(rng, 12, 42);
      const ox = k === 0 ? -8 : 10, oz = k === 0 ? -8 : 10;
      const bx = cx + ox, bz = cz + oz;
      const base = landmark ? pick(rng, [0x2a6a8a, 0x8a6a2a, 0x3a4a6a]) : pick(rng, PALETTE.building);
      const tex = rng() < 0.5 ? facadeTexture(rng, hex(base)) : facadeTextureTall(rng, hex(base));
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(bx, h / 2, bz); group.add(b);
      // Roof furniture: AC boxes, water tower, antenna — roofs were bare.
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 3, d * 0.4), roofMat);
      roof.position.set(bx, h + 1.5, bz); group.add(roof);
      const acN = 1 + Math.floor(rng() * 3);
      for (let a = 0; a < acN; a++) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.2), new THREE.MeshLambertMaterial({ color: 0x888888 }));
        ac.position.set(bx + range(rng, -w / 4, w / 4), h + 0.6, bz + range(rng, -d / 4, d / 4)); group.add(ac);
      }
      if (rng() < 0.3) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4, 8), new THREE.MeshLambertMaterial({ color: 0x7a5a3a }));
        tank.position.set(bx + w / 4, h + 2, bz - d / 4); group.add(tank);
      }
      if (landmark) {
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 22, 6), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
        spire.position.set(bx, h + 11, bz); group.add(spire);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
        tip.position.set(bx, h + 22, bz); group.add(tip);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.7, h * 0.6, 0.7), new THREE.MeshBasicMaterial({ color: pick(rng, PALETTE.neon) }));
        strip.position.set(bx, h * 0.55, bz + d / 2 + 0.4); group.add(strip);
      } else if (rng() < 0.55) {
        // Neon sign on most buildings now (was 0.35): the city glows.
        // Signs face both ways so they read from either approach.
        const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 3, 0.6),
          new THREE.MeshBasicMaterial({ color: pick(rng, PALETTE.neon) }));
        sign.position.set(bx, h * 0.72, bz + d / 2 + 0.4); group.add(sign);
        if (rng() < 0.5) {
          const sign2 = sign.clone();
          sign2.position.set(bx, h * 0.72, bz - d / 2 - 0.4); group.add(sign2);
        }
      }
      colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      buildingCount++;
    }
  }
  // Billboards on poles at busy corners: big flat wordmarks, pure Solmar.
  const boards = [
    ['SOLMAR', '#ff2e88', '#ffffff', 120, -68, 0.4],
    ['CASINO', '#00b8a9', '#ffffff', -68, 120, -0.4],
    ['PIER 9', '#1e7fa8', '#ffd23f', 240, 68, Math.PI / 2],
    ['SUNSET MOTEL', '#ff6b35', '#ffffff', -120, -68, 0.4],
    ['COMET GT', '#7cff5e', '#111111', 68, -120, -0.4],
  ];
  for (const [text, bg, fg, x, z, rot] of boards) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 12, 8), lampPoleMat);
    post.position.set(x, 6, z); group.add(post);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(20, 10),
      new THREE.MeshBasicMaterial({ map: billboardTexture(text, bg, fg), side: THREE.DoubleSide }));
    face.position.set(x, 16, z); face.rotation.y = rot; group.add(face);
  }
  // Distant skyline silhouette: dark towers beyond the playable grid so
  // the horizon is a city, not empty fog.
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x33414f });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + range(rng, -0.1, 0.1);
    const r = range(rng, 380, 470);
    const w = range(rng, 24, 44), h = range(rng, 50, 150);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    tower.position.set(Math.sin(a) * r, h / 2 - 1, Math.cos(a) * r); group.add(tower);
  }
  // Clouds: flat white blobs high up, drifting slowly with the sky.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 12; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 14, 26), 8, 6), cloudMat);
    cl.scale.y = 0.32;
    cl.position.set(range(rng, -380, 380), range(rng, 130, 190), range(rng, -380, 380));
    group.add(cl);
  }
  // Pier + marina boats + lighthouse at the beach, plus umbrellas.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 10), new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  pier.position.set(300, 0.6, -60); group.add(pier);
  for (let i = 0; i < 9; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 4), new THREE.MeshLambertMaterial({ color: pick(rng, PALETTE.car) }));
    hull.position.y = 0.4; boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), trunkMat); mast.position.y = 3; boat.add(mast);
    boat.position.set(400 + range(rng, -20, 60), 0, -200 + i * 50); group.add(boat);
  }
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xff6b9d });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0x00b8a9 });
  for (let i = 0; i < 8; i++) {
    const ux = 282, uz = -200 + i * 55;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), trunkMat);
    pole.position.set(ux, 1.5, uz); group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3, 1.4, 8), i % 2 ? umbrellaMat : umbrellaMat2);
    top.position.set(ux, 3.2, uz); group.add(top);
  }
  const light = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 42, 10), new THREE.MeshLambertMaterial({ color: 0xf2e6d0 }));
  light.position.set(285, 21, 180); group.add(light);
  const lampTop = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  lampTop.position.set(285, 44, 180); group.add(lampTop);
  colliders.push({ minX: 281, maxX: 289, minZ: 176, maxZ: 184 });
  return { group, colliders, buildingCount, sun, hemi, scene, signals };
}

// Cycle the traffic lights: 4 s green, 1 s amber, 4 s red, offset per
// intersection so the grid breathes instead of blinking in unison.
export function updateSignals(city, nowMs) {
  if (!city.signals) return;
  for (const s of city.signals) {
    const phase = ((nowMs / 1000 + s.offset) % 9);
    const show = phase < 4 ? 2 : phase < 5 ? 1 : 0; // green, amber, red
    s.lamps.forEach((lamp, k) => { lamp.visible = k === show; });
  }
}

// Push a circle (player / car) out of building AABBs. Returns true on hit.
export function collideBuildings(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) return { hit: true, nx, nz };
  }
  return { hit: false };
}
// Time-of-day lighting: hour 6..24; sunset glow late, dusk darkens, lamps pop.
export function applyTimeOfDay(city, hour) {
  const t = (hour - 6) / 18; // 0 dawn .. 1 night
  const sunH = Math.sin(Math.PI * (1 - t * 0.9));
  city.sun.intensity = 0.5 + 2.0 * Math.max(0.15, sunH);
  const warm = t > 0.55;
  city.sun.color.setHex(warm ? 0xff9a50 : 0xffd9a0);
  city.hemi.intensity = warm ? 0.45 : 0.7;
  // Dusk sky: day blue melts into a burnt-orange dusk after 18:00.
  const duskAmt = Math.max(0, Math.min(1, (t - 0.5) / 0.35));
  city.sun.intensity *= (1 - duskAmt * 0.55);
  const day = new THREE.Color(0x87b8e8), dusk = new THREE.Color(0x35304e);
  city.scene.background.lerpColors(day, dusk, duskAmt);
  city.scene.fog.color.lerpColors(new THREE.Color(0xffc98a), new THREE.Color(0x8a5570), duskAmt);
}
