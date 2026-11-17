// SOLMAR BAY — an original open-world crime game. Boot, the one loop, input,
// third-person camera, on-foot movement, car enter/exit, crime + wanted,
// pickups, screens (title / play / pause / wasted / busted) and saving.
// ?shot=chase|combat|steal|dusk stages a screenshot scene instead of the loop.
import * as THREE from 'three';
import { clamp, wrapAngle } from './util.js';
import { buildCity, collideBuildings, applyTimeOfDay, updateSignals } from './city.js';
import { createVehicleFleet, nearestStealableCar, driveCar, updateTraffic, setHeadlights } from './vehicles.js';
import { createPedestrians, updatePedestrians, nearestPed } from './pedestrians.js';
import { createPolice, addWanted, updatePolice, clearPolice } from './police.js';
import { createMissions, startMission, updateMissions, startTaxi, startRace, currentMission } from './missions.js';
import { createCombat, fireWeapon, updateCombat, clearEnemies, spawnParticles } from './combat.js';
import { createPackages, updatePackages, restorePackages } from './packages.js';
import { createHud, updateHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
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
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const audio = createAudio();
const city = buildCity(scene, seed);
const fleet = createVehicleFleet(scene, city, seed);
const peds = createPedestrians(scene, seed);
const police = createPolice(scene);
const missions = createMissions(scene);
const combat = createCombat(scene);
const packages = createPackages(scene);
const hud = createHud();

// Player mesh: Leo Marin, a wheelman in a teal jacket.
function makePlayerMesh() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), new THREE.MeshLambertMaterial({ color: 0x0e7c7b }));
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 9), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.82; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  cap.position.y = 2.02; g.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.24), legMat); l1.position.set(-0.15, 0.4, 0); g.add(l1);
  const l2 = l1.clone(); l2.position.x = 0.15; g.add(l2);
  g.userData.legs = [l1, l2];
  return g;
}
const playerMesh = makePlayerMesh(); scene.add(playerMesh);

// Pickups: green ammo crates and red health kits, scattered around the city.
const pickups = [];
function addPickup(kind, x, z) {
  const color = kind === 'ammo' ? 0x2ecc71 : 0xe74c3c;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, 0.45, z); scene.add(m);
  pickups.push({ mesh: m, kind, x, z, taken: false, respawn: 0 });
}
[[40, -30], [-90, 90], [150, 150], [-180, -40], [90, -150], [0, 120]].forEach(([x, z]) => addPickup('ammo', x, z));
[[-40, 60], [120, -90], [-150, 150]].forEach(([x, z]) => addPickup('health', x, z));

const state = {
  scene, audio, city, fleet, peds, police, missions, combat, packages,
  screen: 'title', money: 0, health: 100, ammo: 60, missionIndex: 0, completedMissions: 0,
  wanted: 0, hour: 17.5, taxiFares: 0, racesWon: 0, packagesTaken: [],
  toast: 'Welcome to Solmar Bay.', toastAt: 0, shake: 0,
  player: { x: 0, z: 20, angle: 0, inCar: false, car: null, carSpeed: 0, walkPhase: 0 },
};
const game = { state, audio, cameraAngle: 0, cameraPitch: 0.32, stepWorld, renderFrame };

const keys = {};
let dragging = false, lastMX = 0, lastMY = 0;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyP' && state.screen === 'play') pauseGame(true);
  else if (e.code === 'KeyP' && state.screen === 'paused') pauseGame(false);
  if (e.code === 'KeyM') { audio.setMuted(!audio.isMuted()); }
  if (e.code === 'KeyH' && state.screen === 'play') {
    // Photo mode: hide the HUD for a clean screenshot, H again to bring it back.
    state.hudHidden = !state.hudHidden;
    document.getElementById('hud').style.display = state.hudHidden ? 'none' : 'block';
  }
  if (e.code === 'KeyE' && state.screen === 'play') tryEnterExitCar();
  if (e.code === 'KeyT' && state.screen === 'play') startTaxi(state);
  if (e.code === 'KeyR' && state.screen === 'play') startRace(state);
  if (e.code === 'Enter' && state.screen === 'title') startNewGame(false);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lastMX = e.clientX; lastMY = e.clientY; });
window.addEventListener('mouseup', (e) => {
  if (dragging && Math.hypot(e.clientX - lastMX, e.clientY - lastMY) < 5 && state.screen === 'play' && !state.player.inCar) {
    const dirX = Math.sin(game.cameraAngle), dirZ = Math.cos(game.cameraAngle);
    fireWeapon(state, dirX, dirZ);
  }
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  game.cameraAngle -= (e.clientX - lastMX) * 0.005;
  game.cameraPitch = clamp(game.cameraPitch + (e.clientY - lastMY) * 0.003, 0.05, 1.1);
  lastMX = e.clientX; lastMY = e.clientY;
});

function tryEnterExitCar() {
  const p = state.player;
  if (p.inCar) {
    const car = p.car; car.isPlayer = false; car.speed = 0;
    p.inCar = false; p.car = null; p.carSpeed = 0;
    p.x = car.x + Math.cos(car.angle) * 3; p.z = car.z - Math.sin(car.angle) * 3;
    p.angle = car.angle; audio.setEngine(0, false);
    return;
  }
  const car = nearestStealableCar(fleet, p.x, p.z, 5);
  if (!car) { state.toast = 'No car close enough — walk to a parked car and press E.'; state.toastAt = performance.now(); return; }
  const wasParked = car.parked; // read before the lines below clear it
  p.inCar = true; p.car = car; car.isPlayer = true; car.parked = false;
  p.x = car.x; p.z = car.z; p.angle = car.angle;
  if (wasParked) { addWanted(police, 1, audio); state.toast = 'Car stolen! ' + car.name + ' is yours — the police noticed.'; }
  else state.toast = 'You took the ' + car.name + '.';
  state.toastAt = performance.now();
  audio.unlock();
}

function pauseGame(on) {
  state.screen = on ? 'paused' : 'play';
  document.getElementById('pause-screen').style.display = on ? 'flex' : 'none';
  if (on) {
    // The pause screen is also the run summary: money, story progress,
    // side jobs and the package hunt, so a break still shows the run.
    document.getElementById('pause-stats').textContent =
      'Cash $' + Math.floor(state.money).toLocaleString('en-US') +
      '  ·  Missions ' + state.completedMissions + '/5' +
      '  ·  Taxi fares ' + state.taxiFares +
      '  ·  Races won ' + state.racesWon +
      '  ·  Packages ' + (state.packages ? state.packages.collected : 0) + '/10' +
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
  if (kind === 'busted') { state.money = Math.max(0, state.money - 200); }
  audio.busted();
  clearPolice(police, scene); clearEnemies(combat);
  state.health = 100; state.player.inCar = false; if (state.player.car) { state.player.car.isPlayer = false; state.player.car = null; }
}
function startNewGame(fromSave) {
  const saved = fromSave ? loadGame() : null;
  audio.unlock();
  if (saved) {
    Object.assign(state, { money: saved.money, health: saved.health, missionIndex: saved.missionIndex,
      completedMissions: saved.completedMissions, hour: saved.hour, taxiFares: saved.taxiFares, racesWon: saved.racesWon });
    state.packagesTaken = saved.packages || [];
    restorePackages(packages, state.packagesTaken);
    state.player.x = saved.playerX; state.player.z = saved.playerZ; state.player.angle = saved.playerAngle;
    police.wanted = saved.wanted || 0;
    state.toast = 'Save loaded — welcome back to Solmar Bay.';
  } else {
    Object.assign(state, { money: 0, health: 100, ammo: 60, missionIndex: 0, completedMissions: 0, hour: 17.5, taxiFares: 0, racesWon: 0 });
    state.packagesTaken = [];
    restorePackages(packages, []);
    state.player.x = 0; state.player.z = 20; state.player.angle = 0;
    clearSave(); state.toast = 'Mara Solis: Leo, I need a driver. Steal a car and meet me at the marina.';
  }
  state.toastAt = performance.now();
  state.screen = 'play';
  audio.startRadio();
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  startMission(state, scene);
}
document.getElementById('btn-new').addEventListener('click', () => startNewGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startNewGame(true));
document.getElementById('btn-resume').addEventListener('click', () => pauseGame(false));
document.getElementById('btn-restart').addEventListener('click', () => startNewGame(false));
document.getElementById('btn-resume2').addEventListener('click', () => { document.getElementById('end-screen').style.display = 'none'; state.screen = 'play'; });
if (!hasSave()) document.getElementById('btn-continue').style.display = 'none';

let saveTimer = 0;
function update(dt) {
  const p = state.player;
  state.hour += dt / 240; if (state.hour >= 24) state.hour = 6;
  applyTimeOfDay(city, state.hour);
  updateSignals(city, performance.now());
  const input = {
    forward: keys['KeyW'] || keys['ArrowUp'], back: keys['KeyS'] || keys['ArrowDown'],
    left: keys['KeyA'] || keys['ArrowLeft'], right: keys['KeyD'] || keys['ArrowRight'],
    handbrake: keys['Space'], run: keys['ShiftLeft'] || keys['ShiftRight'],
  };
  if (p.inCar && p.car) {
    const res = driveCar(p.car, input, dt, city, fleet);
    if (res.crashed) { state.shake = 0.5; if (Math.abs(p.car.speed) > 12) { audio.crash(); spawnParticles(combat, p.car.x, 1, p.car.z, 0xaaaaaa, 8); } }
    p.x = p.car.x; p.z = p.car.z; p.angle = p.car.angle; p.carSpeed = p.car.speed;
    audio.setEngine(Math.abs(p.car.speed) / 34, true);
    // Headlights on after dark — the player's car and every police unit.
    setHeadlights(p.car.mesh, state.hour >= 19 || state.hour < 6.5);
    for (const u of police.units) setHeadlights(u.mesh, state.hour >= 19 || state.hour < 6.5);
    if (p.car.health <= 0) { spawnParticles(combat, p.car.x, 1, p.car.z, 0x333333, 20); p.car.health = 100; p.car.speed = 0; }
    // Running over a pedestrian while driving is a crime.
    const ped = nearestPed(peds, p.x, p.z, 2.6);
    if (ped && Math.abs(p.car.speed) > 8) {
      ped.alive = false; ped.mesh.visible = false;
      addWanted(police, 1, audio); state.toast = 'You hit a pedestrian! Wanted level up.'; state.toastAt = performance.now();
    }
  } else {
    const sp = input.run ? 9 : 5;
    const move = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (move || strafe) {
      const a = game.cameraAngle;
      const dx = Math.sin(a) * move + Math.cos(a) * strafe;
      const dz = Math.cos(a) * move - Math.sin(a) * strafe;
      const len = Math.hypot(dx, dz) || 1;
      const nx = p.x + (dx / len) * sp * dt, nz = p.z + (dz / len) * sp * dt;
      const col = collideBuildings(city.colliders, nx, nz, 0.7);
      if (!col.hit && Math.abs(nx) < 285 && Math.abs(nz) < 285) { p.x = nx; p.z = nz; }
      p.angle = Math.atan2(dx, dz);
      p.walkPhase += dt * sp * 1.6;
    }
    audio.setEngine(0, false);
  }
  updateTraffic(fleet, dt, city);
  updatePedestrians(peds, dt, { x: p.x, z: p.z, radius: p.inCar && Math.abs(p.carSpeed) > 10 ? 12 : 6 });
  updateCombat(combat, dt, state);
  updatePackages(packages, dt, state);
  updateMissions(state, dt, combat);
  const busted = updatePolice(police, scene, dt, state, audio);
  state.wanted = police.wanted;
  if (busted) { showEnd('busted'); return; }
  if (state.health <= 0) { showEnd('wasted'); return; }
  // Pickups.
  for (const pk of pickups) {
    if (pk.taken) { pk.respawn -= dt; if (pk.respawn <= 0) { pk.taken = false; pk.mesh.visible = true; } continue; }
    pk.mesh.rotation.y += dt;
    if (Math.hypot(p.x - pk.x, p.z - pk.z) < 2 && !p.inCar) {
      pk.taken = true; pk.mesh.visible = false; pk.respawn = 45;
      if (pk.kind === 'ammo') { state.ammo += 30; state.toast = 'Ammo +30'; }
      else { state.health = Math.min(100, state.health + 40); state.toast = 'Health +40'; }
      state.toastAt = performance.now(); audio.pickup();
    }
  }
  // Player mesh + camera follow.
  playerMesh.visible = !p.inCar;
  playerMesh.position.set(p.x, 0, p.z); playerMesh.rotation.y = p.angle;
  const s = Math.sin(p.walkPhase) * 0.4;
  playerMesh.userData.legs[0].rotation.x = s; playerMesh.userData.legs[1].rotation.x = -s;
  const camDist = game.camDistOverride || (p.inCar ? 17 : 10), camH = p.inCar ? 4.6 : 3.6;
  const cx = p.x - Math.sin(game.cameraAngle) * camDist;
  const cz = p.z - Math.cos(game.cameraAngle) * camDist;
  state.shake = Math.max(0, (state.shake || 0) - dt * 1.6);
  const sh = state.shake;
  camera.position.set(cx + (Math.random() - 0.5) * sh, camH + game.cameraPitch * 4 + (Math.random() - 0.5) * sh, cz + (Math.random() - 0.5) * sh);
  camera.lookAt(p.x, 1.6, p.z);
  // Damage smoke from a battered car.
  if (p.inCar && p.car && p.car.health < 40 && Math.random() < dt * 6) spawnParticles(combat, p.car.x, 1.5, p.car.z, 0x888888, 1);
  saveTimer += dt;
  if (saveTimer > 20) { saveTimer = 0; saveGame(state); }
  updateHud(hud, state);
}
function renderFrame() { updateHud(hud, state); renderer.render(scene, camera); }
function stepWorld(seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) update(1 / 60);
}
let last = performance.now(), acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (state.screen !== 'play') { renderer.render(scene, camera); return; }
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  acc += dt;
  while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60; if (state.screen !== 'play') break; }
  renderer.render(scene, camera);
}
if (shotName) {
  // Screenshot mode: stage the scene, paint, signal readiness.
  state.screen = 'play';
  startMission(state, scene);
  stageShot(game, shotName);
} else {
  startMission(state, scene);
  requestAnimationFrame(loop);
}
window.__solmar = { state, game, startMission, fireWeapon };
