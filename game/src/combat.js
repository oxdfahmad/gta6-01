// Combat: on-foot pistol shooting, enemy gunmen, health and ammo, muzzle
// flash, tracers and hit particles. Hitscan against a ray from the camera:
// the nearest enemy / pedestrian / traffic car within a cone of the aim
// direction takes the hit. Enemies shoot back when close.
import * as THREE from 'three';
import { mulberry32, range } from './util.js';
import { makeCarMesh } from './vehicles.js';

function makeEnemyMesh(rng) {
  const g = new THREE.Group();
  const shirt = pickShirt(rng);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc98a6b }));
  head.position.y = 1.8; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  legs.position.y = 0.4; g.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.3, 1.3, 0.3); g.add(gun);
  // Some gunmen wear a dark cap — the crew is not one clone either.
  if (rng && rng() < 0.5) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    cap.position.y = 2.0; g.add(cap);
  }
  return g;
}
// Gunmen wear dark reds — a small palette so each one reads individually.
const ENEMY_SHIRTS = [0x8e1616, 0x6e1010, 0xa8231a, 0x7a1a2a, 0x5e1a1a];
function pickShirt(rng) { return rng ? ENEMY_SHIRTS[Math.floor(rng() * ENEMY_SHIRTS.length)] : 0x8e1616; }

export function createCombat(scene) {
  const particles = [];
  const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  return { scene, enemies: [], particles, pGeo, fireCooldown: 0, enemyFireAt: 0,
    muzzle: null, armoured: null };
}
// The Commodore's armoured car: a tough target for the finale — shoot it
// (or ram it) until its armour gives out.
export function spawnArmouredCar(combat, at) {
  const mesh = makeCarMesh(0x222222, 'police');
  mesh.position.set(at[0], 0, at[1]); combat.scene.add(mesh);
  combat.armoured = { mesh, x: at[0], z: at[1], health: 12 };
}
export function spawnParticles(combat, x, y, z, color, n) {
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(combat.pGeo, mat);
    m.position.set(x, y, z);
    combat.scene.add(m);
    combat.particles.push({ mesh: m, vx: Math.random() * 8 - 4, vy: 1 + Math.random() * 4, vz: Math.random() * 8 - 4, life: 0.6 });
  }
}
export function spawnEnemies(combat, count, at) {
  const rng = mulberry32((Date.now() % 100000) + count);
  for (let i = 0; i < count; i++) {
    const mesh = makeEnemyMesh(rng);
    const x = at[0] + range(rng, -12, 12), z = at[1] + range(rng, -12, 12);
    mesh.position.set(x, 0, z); combat.scene.add(mesh);
    combat.enemies.push({ mesh, x, z, health: 3, angle: 0, shootAt: 0 });
  }
}
// Deterministic placement for staged shots: enemies at exact spots,
// facing a fixed point (usually the player), so the frame is repeatable.
export function spawnEnemiesAt(combat, spots, faceTo) {
  const rng = mulberry32(20261117);
  for (const [x, z] of spots) {
    const mesh = makeEnemyMesh(rng);
    mesh.position.set(x, 0, z); combat.scene.add(mesh);
    const angle = faceTo ? Math.atan2(faceTo[0] - x, faceTo[1] - z) : 0;
    mesh.rotation.y = angle;
    combat.enemies.push({ mesh, x, z, health: 3, angle, shootAt: 0.6 });
  }
}
// A visible tracer line from the muzzle to the hit point, plus a muzzle
// flash burst at the gun — a gunfight needs to be seen, not just heard.
// The tracer is registered as a particle so the combat loop cleans it up.
export function spawnTracer(combat, x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const len = Math.hypot(dx, dy, dz) || 1;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, len),
    new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  m.lookAt(x2, y2, z2);
  combat.scene.add(m);
  combat.particles.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0.45 });
}
export function spawnMuzzleFlash(combat, x, y, z) {
  spawnParticles(combat, x, y, z, 0xffe066, 10);
  spawnParticles(combat, x, y, z, 0xff8800, 5);
}
export function clearEnemies(combat) {
  for (const e of combat.enemies) combat.scene.remove(e.mesh);
  combat.enemies.length = 0;
}
// Fire the pistol. dir is the camera forward (x,z). Returns what was hit.
export function fireWeapon(state, dirX, dirZ) {
  const combat = state.combat;
  if (state.ammo <= 0) { state.toast = 'Out of ammo — find the green ammo pickup.'; state.toastAt = performance.now(); return 'empty'; }
  if (combat.fireCooldown > 0) return 'cool';
  combat.fireCooldown = 0.28; state.ammo -= 1; state.shake = 0.25;
  if (state.audio) state.audio.gunshot();
  const ox = state.player.x, oz = state.player.z;
  let best = null, bd = 60, kind = null;
  for (const e of combat.enemies) {
    const dx = e.x - ox, dz = e.z - oz, d = Math.hypot(dx, dz);
    const dot = (dx * dirX + dz * dirZ) / (d || 1);
    if (d < bd && dot > 0.94) { bd = d; best = e; kind = 'enemy'; }
  }
  for (const p of state.peds.peds) {
    if (!p.alive) continue;
    const dx = p.x - ox, dz = p.z - oz, d = Math.hypot(dx, dz);
    const dot = (dx * dirX + dz * dirZ) / (d || 1);
    if (d < bd && dot > 0.96) { bd = d; best = p; kind = 'ped'; }
  }
  const arm = combat.armoured;
  if (arm && arm.health > 0) {
    const dx = arm.x - ox, dz = arm.z - oz, d = Math.hypot(dx, dz);
    const dot = (dx * dirX + dz * dirZ) / (d || 1);
    if (d < bd && dot > 0.9) { bd = d; best = arm; kind = 'armoured'; }
  }
  const hx = ox + dirX * bd, hz = oz + dirZ * bd;
  spawnParticles(combat, hx, 1.3, hz, 0xffd23f, 6);
  // Every shot draws a tracer from the muzzle to the hit point and a
  // flash at the gun, so the firefight reads on screen.
  spawnTracer(combat, ox + dirX * 0.6, 1.35, oz + dirZ * 0.6, hx, 1.3, hz);
  spawnMuzzleFlash(combat, ox + dirX * 0.8, 1.35, oz + dirZ * 0.8);
  if (kind === 'enemy') {
    best.health -= 1;
    if (state.audio) state.audio.hit();
    if (best.health <= 0) {
      spawnParticles(combat, best.x, 1.2, best.z, 0xff4444, 14);
      combat.scene.remove(best.mesh);
      combat.enemies.splice(combat.enemies.indexOf(best), 1);
      state.missions.enemiesLeft = Math.max(0, state.missions.enemiesLeft - 1);
      state.money += 25;
    }
    return 'enemy';
  }
  if (kind === 'ped') {
    best.alive = false; best.mesh.visible = false;
    spawnParticles(combat, best.x, 1.2, best.z, 0xff4444, 10);
    state.police.wanted = Math.min(5, state.police.wanted + 1); state.police.heat = 1;
    return 'ped';
  }
  if (kind === 'armoured') {
    best.health -= 1;
    if (state.audio) state.audio.hit();
    spawnParticles(combat, best.x, 1.2, best.z, 0xff8800, 8);
    if (best.health <= 0) {
      spawnParticles(combat, best.x, 1.5, best.z, 0xffcc00, 24);
      combat.scene.remove(best.mesh);
      state.toast = 'Armoured car destroyed!'; state.toastAt = performance.now();
    }
    return 'armoured';
  }
  return 'miss';
}
export function updateCombat(combat, dt, state) {
  combat.fireCooldown = Math.max(0, combat.fireCooldown - dt);
  // Particles.
  for (let i = combat.particles.length - 1; i >= 0; i--) {
    const p = combat.particles[i];
    p.life -= dt; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.vy -= 9 * dt;
    if (p.life <= 0) { combat.scene.remove(p.mesh); combat.particles.splice(i, 1); }
  }
  // Enemies advance and shoot back.
  for (const e of combat.enemies) {
    const dx = state.player.x - e.x, dz = state.player.z - e.z, d = Math.hypot(dx, dz);
    e.angle = Math.atan2(dx, dz);
    e.mesh.rotation.y = e.angle;
    if (d > 9) { e.x += Math.sin(e.angle) * 3.2 * dt; e.z += Math.cos(e.angle) * 3.2 * dt; }
    e.mesh.position.set(e.x, 0, e.z);
    e.shootAt -= dt;
    if (d < 26 && e.shootAt <= 0) {
      e.shootAt = 1.2 + Math.random() * 1.0;
      if (Math.random() < 0.45) {
        state.health = Math.max(0, state.health - 7);
        spawnParticles(combat, state.player.x, 1.4, state.player.z, 0xff6666, 4);
        if (state.audio) state.audio.hit();
      }
    }
  }
}
