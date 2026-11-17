// SOLMAR BAY — an original open-world crime game. Boot, the one loop,
// input, third-person camera, on-foot movement, car enter/exit, crime +
// wanted, pickups, screens (title / play / pause / wasted / busted) and
// saving. ?shot=chase|combat|steal|dusk stages a screenshot scene instead
// of the loop.
import * as THREE from 'three';
import { clamp, wrapAngle } from './util.js';
import { buildCity, hitBuilding, applyDaylight, updateSignals } from './city.js';
import { spawnCars, nearestOpenCar, driveCar, stepTraffic, toggleHeadlights } from './vehicles.js';
import { spawnWalkers, stepWalkers, nearestWalker } from './pedestrians.js';
import { createPolice, addWanted, updatePolice, clearPolice } from './police.js';
import { createStory, startChapter, stepStory, startTaxi, startRace, storyChapter } from './missions.js';
import { createCombat, firePistol, stepCombat, clearFoes, spawnSparks } from './combat.js';
import { hidePackages, stepPackages, restorePackages } from './packages.js';
import { buildHud, updateHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveRun, loadRun, hasSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = 20261117;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const sound = createAudio();
const city = buildCity(scene, seed);
const fleet = spawnCars(scene, city, seed);
const crowd = spawnWalkers(scene, seed);
const police = createPolice(scene);
const story = createStory(scene);
const combat = createCombat(scene);
const parcels = hidePackages(scene);
const panel = buildHud();

// Hero mesh: Leo Marin, a wheelman in a teal jacket and dark cap.
function makeHero() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0e7c7b });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), jacket);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 9),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.82;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  cap.position.y = 2.02;
  g.add(cap);
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.24), pants);
  l1.position.set(-0.15, 0.4, 0);
  g.add(l1);
  const l2 = l1.clone();
  l2.position.x = 0.15;
  g.add(l2);
  g.userData.legs = [l1, l2];
  return g;
}
const heroMesh = makeHero();
scene.add(heroMesh);

// Pickups: green ammo crates and red health kits, scattered around town.
const pickups = [];
function spawnPickup(kind, x, z) {
  const hue = kind === 'ammo' ? 0x2ecc71 : 0xe74c3c;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshLambertMaterial({ color: hue }),
  );
  m.position.set(x, 0.45, z);
  scene.add(m);
  pickups.push({ mesh: m, kind, x, z, taken: false, respawn: 0 });
}
for (const [x, z] of [[40, -30], [-90, 90], [150, 150], [-180, -40], [90, -150], [0, 120]]) {
  spawnPickup('ammo', x, z);
}
for (const [x, z] of [[-40, 60], [120, -90], [-150, 150]]) {
  spawnPickup('health', x, z);
}

const state = {
  scene, sound, city, fleet, crowd, police, story, combat, parcels,
  screen: 'title', money: 0, hp: 100, shells: 60, missionIndex: 0, done: 0,
  wanted: 0, hour: 17.5, fares: 0, trials: 0, parcelsFound: [],
  notice: 'Welcome to Solmar Bay.', noticeAt: 0, shake: 0, hudOff: false,
  player: { x: 0, z: 20, face: 0, inCar: false, car: null, carVel: 0, step: 0 },
};
const game = { state, sound, camYaw: 0, camTilt: 0.32, camPull: 0, advance, paint };

const keys = {};
let dragging = false;
let lastMX = 0;
let lastMY = 0;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyP' && state.screen === 'play') pauseGame(true);
  else if (e.code === 'KeyP' && state.screen === 'paused') pauseGame(false);
  if (e.code === 'KeyM') sound.setMuted(!sound.isMuted());
  if (e.code === 'KeyH' && state.screen === 'play') {
    // Photo mode: hide the HUD for a clean screenshot, H again to bring it back.
    state.hudOff = !state.hudOff;
    document.getElementById('hud').style.display = state.hudOff ? 'none' : 'block';
  }
  if (e.code === 'KeyE' && state.screen === 'play') enterExitCar();
  if (e.code === 'KeyT' && state.screen === 'play') startTaxi(state);
  if (e.code === 'KeyR' && state.screen === 'play') startRace(state);
  if (e.code === 'Enter' && state.screen === 'title') startGame(false);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  lastMX = e.clientX;
  lastMY = e.clientY;
});
window.addEventListener('mouseup', (e) => {
  if (dragging && Math.hypot(e.clientX - lastMX, e.clientY - lastMY) < 5
      && state.screen === 'play' && !state.player.inCar) {
    const dirX = Math.sin(game.camYaw);
    const dirZ = Math.cos(game.camYaw);
    firePistol(state, dirX, dirZ);
  }
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  game.camYaw -= (e.clientX - lastMX) * 0.005;
  game.camTilt = clamp(game.camTilt + (e.clientY - lastMY) * 0.003, 0.05, 1.1);
  lastMX = e.clientX;
  lastMY = e.clientY;
});

function enterExitCar() {
  const hero = state.player;
  if (hero.inCar) {
    const car = hero.car;
    car.driven = false;
    car.vel = 0;
    hero.inCar = false;
    hero.car = null;
    hero.carVel = 0;
    hero.x = car.x + Math.cos(car.heading) * 3;
    hero.z = car.z - Math.sin(car.heading) * 3;
    hero.face = car.heading;
    sound.setEngine(0, false);
    return;
  }
  const car = nearestOpenCar(fleet, hero.x, hero.z, 5);
  if (!car) {
    state.notice = 'No car close enough — walk to a parked car and press E.';
    state.noticeAt = performance.now();
    return;
  }
  const wasParked = car.parked; // read before the lines below clear it
  hero.inCar = true;
  hero.car = car;
  car.driven = true;
  car.parked = false;
  hero.x = car.x;
  hero.z = car.z;
  hero.face = car.heading;
  if (wasParked) {
    addWanted(police, 1, sound);
    state.notice = 'Car stolen! ' + car.label + ' is yours — the police noticed.';
  } else {
    state.notice = 'You took the ' + car.label + '.';
  }
  state.noticeAt = performance.now();
  sound.unlock();
}

function pauseGame(on) {
  state.screen = on ? 'paused' : 'play';
  document.getElementById('pause-screen').style.display = on ? 'flex' : 'none';
  if (on) {
    // The pause screen doubles as the run summary: cash, story progress,
    // side jobs and the parcel hunt, so a break still shows the run.
    document.getElementById('pause-stats').textContent =
      'Cash $' + Math.floor(state.money).toLocaleString('en-US') +
      '  ·  Missions ' + state.done + '/5' +
      '  ·  Taxi fares ' + state.fares +
      '  ·  Races won ' + state.trials +
      '  ·  Packages ' + (state.parcels ? state.parcels.found : 0) + '/10' +
      '  ·  Wanted ' + Math.round(state.wanted) + '★';
  }
}

function showEnd(kind) {
  state.screen = kind; // 'wasted' | 'busted'
  const el = document.getElementById('end-screen');
  document.getElementById('end-title').textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
  document.getElementById('end-sub').textContent = kind === 'wasted'
    ? 'Leo went down in Solmar Bay. The story continues — try again.'
    : 'The Solmar Bay police caught Leo. Bail is $200 — the story continues.';
  el.style.display = 'flex';
  if (kind === 'busted') state.money = Math.max(0, state.money - 200);
  sound.busted();
  clearPolice(police, scene);
  clearFoes(combat);
  state.hp = 100;
  state.player.inCar = false;
  if (state.player.car) {
    state.player.car.driven = false;
    state.player.car = null;
  }
}

function startGame(fromSave) {
  const saved = fromSave ? loadRun() : null;
  sound.unlock();
  if (saved) {
    Object.assign(state, {
      money: saved.cash, hp: saved.hp, missionIndex: saved.chapter,
      done: saved.done, hour: saved.clock, fares: saved.fares, trials: saved.trials,
    });
    state.parcelsFound = saved.parcels || [];
    restorePackages(parcels, state.parcelsFound);
    state.player.x = saved.px;
    state.player.z = saved.pz;
    state.player.face = saved.face;
    police.wanted = saved.heat || 0;
    state.notice = 'Save loaded — welcome back to Solmar Bay.';
  } else {
    Object.assign(state, {
      money: 0, hp: 100, shells: 60, missionIndex: 0, done: 0,
      hour: 17.5, fares: 0, trials: 0,
    });
    state.parcelsFound = [];
    restorePackages(parcels, []);
    state.player.x = 0;
    state.player.z = 20;
    state.player.face = 0;
    clearSave();
    state.notice = 'Mara Solis: Leo, I need a driver. Steal a car and meet me at the marina.';
  }
  state.noticeAt = performance.now();
  state.screen = 'play';
  sound.startRadio();
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  startChapter(state, scene);
}
document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => pauseGame(false));
document.getElementById('btn-restart').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume2').addEventListener('click', () => {
  document.getElementById('end-screen').style.display = 'none';
  state.screen = 'play';
});
if (!hasSave()) document.getElementById('btn-continue').style.display = 'none';

let saveTimer = 0;
function step(dt) {
  const hero = state.player;
  state.hour += dt / 240;
  if (state.hour >= 24) state.hour = 6;
  applyDaylight(city, state.hour);
  updateSignals(city, performance.now());
  const input = {
    forward: keys['KeyW'] || keys['ArrowUp'],
    back: keys['KeyS'] || keys['ArrowDown'],
    left: keys['KeyA'] || keys['ArrowLeft'],
    right: keys['KeyD'] || keys['ArrowRight'],
    handbrake: keys['Space'],
    run: keys['ShiftLeft'] || keys['ShiftRight'],
  };
  if (hero.inCar && hero.car) {
    const res = driveCar(hero.car, input, dt, city, fleet);
    if (res.crashed) {
      state.shake = 0.5;
      if (Math.abs(hero.car.vel) > 12) {
        sound.crash();
        spawnSparks(combat, hero.car.x, 1, hero.car.z, 0xaaaaaa, 8);
      }
    }
    hero.x = hero.car.x;
    hero.z = hero.car.z;
    hero.face = hero.car.heading;
    hero.carVel = hero.car.vel;
    sound.setEngine(Math.abs(hero.car.vel) / 34, true);
    // Headlights on after dark — the player's car and every police unit.
    const night = state.hour >= 19 || state.hour < 6.5;
    toggleHeadlights(hero.car.mesh, night);
    for (const u of police.cars) toggleHeadlights(u.mesh, night);
    if (hero.car.hp <= 0) {
      spawnSparks(combat, hero.car.x, 1, hero.car.z, 0x333333, 20);
      hero.car.hp = 100;
      hero.car.vel = 0;
    }
    // Running over a walker while driving is a crime.
    const walker = nearestWalker(crowd, hero.x, hero.z, 2.6);
    if (walker && Math.abs(hero.car.vel) > 8) {
      walker.alive = false;
      walker.mesh.visible = false;
      addWanted(police, 1, sound);
      state.notice = 'You hit a pedestrian! Wanted level up.';
      state.noticeAt = performance.now();
    }
  } else {
    const sp = input.run ? 9 : 5;
    const move = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (move || strafe) {
      const a = game.camYaw;
      const dx = Math.sin(a) * move + Math.cos(a) * strafe;
      const dz = Math.cos(a) * move - Math.sin(a) * strafe;
      const len = Math.hypot(dx, dz) || 1;
      const nx = hero.x + (dx / len) * sp * dt;
      const nz = hero.z + (dz / len) * sp * dt;
      const col = hitBuilding(city.walls, nx, nz, 0.7);
      if (!col.hit && Math.abs(nx) < 285 && Math.abs(nz) < 285) {
        hero.x = nx;
        hero.z = nz;
      }
      hero.face = Math.atan2(dx, dz);
      hero.step += dt * sp * 1.6;
    }
    sound.setEngine(0, false);
  }
  stepTraffic(fleet, dt, city);
  stepWalkers(crowd, dt, {
    x: hero.x, z: hero.z,
    radius: hero.inCar && Math.abs(hero.carVel) > 10 ? 12 : 6,
  });
  stepCombat(combat, dt, state);
  stepPackages(parcels, dt, state);
  stepStory(state, dt, combat);
  const busted = updatePolice(police, scene, dt, state, sound);
  state.wanted = police.wanted;
  if (busted) {
    showEnd('busted');
    return;
  }
  if (state.hp <= 0) {
    showEnd('wasted');
    return;
  }
  // Pickups.
  for (const pk of pickups) {
    if (pk.taken) {
      pk.respawn -= dt;
      if (pk.respawn <= 0) {
        pk.taken = false;
        pk.mesh.visible = true;
      }
      continue;
    }
    pk.mesh.rotation.y += dt;
    if (Math.hypot(hero.x - pk.x, hero.z - pk.z) < 2 && !hero.inCar) {
      pk.taken = true;
      pk.mesh.visible = false;
      pk.respawn = 45;
      if (pk.kind === 'ammo') {
        state.shells += 30;
        state.notice = 'Ammo +30';
      } else {
        state.hp = Math.min(100, state.hp + 40);
        state.notice = 'Health +40';
      }
      state.noticeAt = performance.now();
      sound.pickup();
    }
  }
  // Hero mesh + camera follow.
  heroMesh.visible = !hero.inCar;
  heroMesh.position.set(hero.x, 0, hero.z);
  heroMesh.rotation.y = hero.face;
  const s = Math.sin(hero.step) * 0.4;
  heroMesh.userData.legs[0].rotation.x = s;
  heroMesh.userData.legs[1].rotation.x = -s;
  const camDist = game.camPull || (hero.inCar ? 17 : 10);
  const camH = hero.inCar ? 4.6 : 3.6;
  const cx = hero.x - Math.sin(game.camYaw) * camDist;
  const cz = hero.z - Math.cos(game.camYaw) * camDist;
  state.shake = Math.max(0, (state.shake || 0) - dt * 1.6);
  const sh = state.shake;
  camera.position.set(
    cx + (Math.random() - 0.5) * sh,
    camH + game.camTilt * 4 + (Math.random() - 0.5) * sh,
    cz + (Math.random() - 0.5) * sh,
  );
  camera.lookAt(hero.x, 1.6, hero.z);
  // Damage smoke from a battered car.
  if (hero.inCar && hero.car && hero.car.hp < 40 && Math.random() < dt * 6) {
    spawnSparks(combat, hero.car.x, 1.5, hero.car.z, 0x888888, 1);
  }
  saveTimer += dt;
  if (saveTimer > 20) {
    saveTimer = 0;
    saveRun(state);
  }
  updateHud(panel, state);
}

function paint() {
  updateHud(panel, state);
  renderer.render(scene, camera);
}

function advance(seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) step(1 / 60);
}

let last = performance.now();
let acc = 0;
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  if (state.screen !== 'play') {
    renderer.render(scene, camera);
    return;
  }
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= 1 / 60) {
    step(1 / 60);
    acc -= 1 / 60;
    if (state.screen !== 'play') break;
  }
  renderer.render(scene, camera);
}

if (shotName) {
  // Screenshot mode: stage the scene, paint, signal readiness.
  state.screen = 'play';
  startChapter(state, scene);
  stageShot(game, shotName);
} else {
  startChapter(state, scene);
  requestAnimationFrame(frameLoop);
}
window.__solmar = { state, game, startChapter, firePistol };
