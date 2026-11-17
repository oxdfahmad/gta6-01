// Wanted level + police response. Stars 0-5: crime adds stars, hiding
// (no crime, out of sight) decays them. Police cars spawn at the edge of
// view, chase, ram and try to stop the player; officers on foot appear at
// 3+ stars. Caught at low speed near a police car while wanted >= 3, or
// health 0 while wanted, means BUSTED.
import * as THREE from 'three';
import { clamp, wrapAngle } from './util.js';
import { makeCarMesh } from './vehicles.js';

// Siren glow: a soft radial sprite above the light bar that pulses with
// it, so a police car reads as flashing from across the street, not just
// as a small coloured box on the roof.
let glowTex = null;
function makeGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function createPolice(scene) {
  const units = []; // {mesh, x, z, angle, speed, kind}
  const officers = []; // on-foot officers at wanted 3+
  return { units, officers, wanted: 0, heat: 0, bustedTimer: 0, sirenAt: 0 };
}
function makeOfficerMesh() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), new THREE.MeshLambertMaterial({ color: 0x1a3a8a }));
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.8; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x0a1a4a }));
  cap.position.y = 2.0; g.add(cap);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x111122 }));
  legs.position.y = 0.4; g.add(legs);
  return g;
}
export function addWanted(police, n, audio) {
  police.wanted = clamp(police.wanted + n, 0, 5);
  police.heat = 1;
  if (audio && n > 0) audio.sirenBlip();
}
function spawnUnit(scene, police, x, z) {
  const mesh = makeCarMesh(0x111111, 'police');
  mesh.position.set(x, 0, z); scene.add(mesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xff2222, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0, 2.1, -0.2); glow.scale.set(8, 4, 1); mesh.add(glow);
  const u = { mesh, x, z, angle: 0, speed: 0, kind: 'car', glow };
  police.units.push(u); return u;
}
// Place one police unit at an exact spot, facing an exact angle — used by
// staged screenshots so the chase is in frame, not somewhere random.
export function spawnPoliceUnit(scene, police, x, z, angle) {
  const u = spawnUnit(scene, police, x, z);
  u.angle = angle; u.speed = 24;
  u.mesh.rotation.y = angle;
  return u;
}
export function updatePolice(police, scene, dt, state, audio) {
  const player = state.player;
  const want = Math.min(5, Math.max(0, Math.floor(police.wanted)));
  const target = police.wanted >= 1 ? Math.min(2 + want, 6) : 0;
  while (police.units.length < target) {
    const a = Math.random() * Math.PI * 2;
    spawnUnit(scene, police, player.x + Math.sin(a) * 70, player.z + Math.cos(a) * 70);
  }
  while (police.units.length > target) {
    const u = police.units.pop(); scene.remove(u.mesh);
  }
  let nearest = 999;
  for (const u of police.units) {
    const dx = player.x - u.x, dz = player.z - u.z, d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    const wantAngle = Math.atan2(dx, dz);
    u.angle += wrapAngle(wantAngle - u.angle) * Math.min(1, dt * 2.2);
    const targetSpeed = d > 12 ? 26 + want * 1.5 : 12;
    u.speed += (targetSpeed - u.speed) * dt * 1.2;
    u.x += Math.sin(u.angle) * u.speed * dt; u.z += Math.cos(u.angle) * u.speed * dt;
    u.mesh.position.set(u.x, 0, u.z); u.mesh.rotation.y = u.angle;
    // Flashing light bar + glow sprite, alternating red / blue.
    const bar = u.mesh.userData.lightBar;
    if (bar) {
      const col = Math.floor(performance.now() / 300) % 2 ? 0xff2222 : 0x2244ff;
      bar.material.color.setHex(col);
      if (u.glow) u.glow.material.color.setHex(col);
    }
    if (d < 3.6 && player.inCar) { player.carSpeed *= 0.55; }
  }
  // Decay: no crime for a while and police far away cools the heat.
  if (police.wanted > 0) {
    police.heat = Math.max(0, police.heat - dt * 0.05);
    if (police.heat <= 0 && nearest > 55) police.wanted = Math.max(0, police.wanted - dt * 0.12);
  }
  // On-foot officers at wanted 3+: they run the player down and grab him.
  const wantOfficers = police.wanted >= 3 && !player.inCar ? 2 : 0;
  while (police.officers.length < wantOfficers) {
    const a = Math.random() * Math.PI * 2;
    const mesh = makeOfficerMesh();
    const x = player.x + Math.sin(a) * 30, z = player.z + Math.cos(a) * 30;
    mesh.position.set(x, 0, z); scene.add(mesh);
    police.officers.push({ mesh, x, z, angle: 0 });
  }
  while (police.officers.length > wantOfficers) { const o = police.officers.pop(); scene.remove(o.mesh); }
  for (const o of police.officers) {
    const dx = player.x - o.x, dz = player.z - o.z, d = Math.hypot(dx, dz);
    o.angle = Math.atan2(dx, dz);
    if (d > 1.6) { o.x += Math.sin(o.angle) * 4.6 * dt; o.z += Math.cos(o.angle) * 4.6 * dt; }
    o.mesh.position.set(o.x, 0, o.z); o.mesh.rotation.y = o.angle;
    if (d < 2.2) { state.health = Math.max(0, state.health - 9 * dt); }
  }
  // Busted: wanted and a unit close while the player is slow / on foot.
  const slow = player.inCar ? Math.abs(player.carSpeed) < 2 : true;
  if (police.wanted >= 2 && nearest < 4 && slow) {
    police.bustedTimer += dt;
    if (police.bustedTimer > 2.2) return 'busted';
  } else police.bustedTimer = Math.max(0, police.bustedTimer - dt * 2);
  if (audio && police.units.length && performance.now() - police.sirenAt > 4000) { police.sirenAt = performance.now(); audio.sirenBlip(); }
  return null;
}
export function clearPolice(police, scene) {
  for (const u of police.units) scene.remove(u.mesh);
  for (const o of police.officers) scene.remove(o.mesh);
  police.units.length = 0; police.officers.length = 0; police.wanted = 0; police.heat = 0; police.bustedTimer = 0;
}
