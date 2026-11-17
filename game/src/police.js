// Wanted level and the police answer. Stars 0–5: crime adds stars, and
// lying low with no fresh crime cools them off. Police cars spawn at the
// edge of view, chase, ram and try to stop the player; officers on foot
// appear at 3+ stars. Caught slow near a unit while wanted at 2+, or flat
// broke on health while wanted, means BUSTED.
import * as THREE from 'three';
import { clamp, wrapAngle } from './util.js';
import { makeCarMesh } from './vehicles.js';

// Siren halo: a soft radial sprite floating above the light bar that
// pulses with it, so a police car reads as flashing from across the
// street — not just a small coloured box on the roof.
let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

export function createPolice(scene) {
  const cars = []; // {mesh, x, z, heading, vel, halo}
  const foot = []; // on-foot officers at wanted 3+
  return { cars, foot, wanted: 0, heat: 0, arrest: 0, sirenAt: 0 };
}

function makeOfficer() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.8, 0.38),
    new THREE.MeshLambertMaterial({ color: 0x1a3a8a }),
  );
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.8;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
    new THREE.MeshLambertMaterial({ color: 0x0a1a4a }),
  );
  cap.position.y = 2.0;
  g.add(cap);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.8, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x111122 }),
  );
  legs.position.y = 0.4;
  g.add(legs);
  return g;
}

export function addWanted(police, n, sound) {
  police.wanted = clamp(police.wanted + n, 0, 5);
  police.heat = 1;
  if (sound && n > 0) sound.siren();
}

function spawnPatrol(scene, police, x, z) {
  const mesh = makeCarMesh(0x111111, 'cop');
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture(),
    color: 0xff2222,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  halo.position.set(0, 2.1, -0.2);
  halo.scale.set(8, 4, 1);
  mesh.add(halo);
  const u = { mesh, x, z, heading: 0, vel: 0, halo };
  police.cars.push(u);
  return u;
}

// Drop one police car at an exact spot, facing an exact heading — the
// staged screenshots use this so the chase is in frame, not random.
export function placePatrolCar(scene, police, x, z, heading) {
  const u = spawnPatrol(scene, police, x, z);
  u.heading = heading;
  u.vel = 24;
  u.mesh.rotation.y = heading;
  return u;
}

export function updatePolice(police, scene, dt, run, sound) {
  const hero = run.player;
  const stars = Math.min(5, Math.max(0, Math.floor(police.wanted)));
  const target = police.wanted >= 1 ? Math.min(2 + stars, 6) : 0;
  while (police.cars.length < target) {
    const a = Math.random() * Math.PI * 2;
    spawnPatrol(scene, police, hero.x + Math.sin(a) * 70, hero.z + Math.cos(a) * 70);
  }
  while (police.cars.length > target) {
    const u = police.cars.pop();
    scene.remove(u.mesh);
  }
  let nearest = 999;
  for (const u of police.cars) {
    const dx = hero.x - u.x;
    const dz = hero.z - u.z;
    const d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    const wantHeading = Math.atan2(dx, dz);
    u.heading += wrapAngle(wantHeading - u.heading) * Math.min(1, dt * 2.2);
    const cruise = d > 12 ? 26 + stars * 1.5 : 12;
    u.vel += (cruise - u.vel) * dt * 1.2;
    u.x += Math.sin(u.heading) * u.vel * dt;
    u.z += Math.cos(u.heading) * u.vel * dt;
    u.mesh.position.set(u.x, 0, u.z);
    u.mesh.rotation.y = u.heading;
    // Flashing bar + halo, alternating red and blue.
    const bar = u.mesh.userData.bar;
    if (bar) {
      const col = Math.floor(performance.now() / 300) % 2 ? 0xff2222 : 0x2244ff;
      bar.material.color.setHex(col);
      if (u.halo) u.halo.material.color.setHex(col);
    }
    if (d < 3.6 && hero.inCar) hero.carVel *= 0.55;
  }
  // Cool-down: no fresh crime for a while, police far away, stars decay.
  if (police.wanted > 0) {
    police.heat = Math.max(0, police.heat - dt * 0.05);
    if (police.heat <= 0 && nearest > 55) {
      police.wanted = Math.max(0, police.wanted - dt * 0.12);
    }
  }
  // Officers on foot at 3+ stars, only while Leo is walking: they run
  // him down and grab him.
  const wantOfficers = police.wanted >= 3 && !hero.inCar ? 2 : 0;
  while (police.foot.length < wantOfficers) {
    const a = Math.random() * Math.PI * 2;
    const mesh = makeOfficer();
    const x = hero.x + Math.sin(a) * 30;
    const z = hero.z + Math.cos(a) * 30;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    police.foot.push({ mesh, x, z, heading: 0 });
  }
  while (police.foot.length > wantOfficers) {
    const o = police.foot.pop();
    scene.remove(o.mesh);
  }
  for (const o of police.foot) {
    const dx = hero.x - o.x;
    const dz = hero.z - o.z;
    const d = Math.hypot(dx, dz);
    o.heading = Math.atan2(dx, dz);
    if (d > 1.6) {
      o.x += Math.sin(o.heading) * 4.6 * dt;
      o.z += Math.cos(o.heading) * 4.6 * dt;
    }
    o.mesh.position.set(o.x, 0, o.z);
    o.mesh.rotation.y = o.heading;
    if (d < 2.2) run.hp = Math.max(0, run.hp - 9 * dt);
  }
  // Busted: wanted and a unit close while the player is slow or on foot.
  const slow = hero.inCar ? Math.abs(hero.carVel) < 2 : true;
  if (police.wanted >= 2 && nearest < 4 && slow) {
    police.arrest += dt;
    if (police.arrest > 2.2) return 'busted';
  } else {
    police.arrest = Math.max(0, police.arrest - dt * 2);
  }
  if (sound && police.cars.length && performance.now() - police.sirenAt > 4000) {
    police.sirenAt = performance.now();
    sound.siren();
  }
  return null;
}

export function clearPolice(police, scene) {
  for (const u of police.cars) scene.remove(u.mesh);
  for (const o of police.foot) scene.remove(o.mesh);
  police.cars.length = 0;
  police.foot.length = 0;
  police.wanted = 0;
  police.heat = 0;
  police.arrest = 0;
}
