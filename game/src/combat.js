// Combat: the on-foot pistol, enemy gunmen, health and ammo, muzzle
// flash, tracers and hit bursts. Hitscan against a ray from the camera:
// the nearest foe, walker or traffic car inside a cone of the aim
// direction takes the hit. Gunmen shoot back when close enough.
import * as THREE from 'three';
import { mulberry, rand } from './util.js';
import { makeCarMesh } from './vehicles.js';

// Gunmen wear dark reds — a small palette so each one reads on his own.
const CREW_SHIRTS = [0x8e1616, 0x6e1010, 0xa8231a, 0x7a1a2a, 0x5e1a1a];

function makeGunman(rng) {
  const g = new THREE.Group();
  const shirt = CREW_SHIRTS[Math.floor(rng() * CREW_SHIRTS.length)];
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.8, 0.38),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xc98a6b }),
  );
  head.position.y = 1.8;
  g.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.8, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  );
  legs.position.y = 0.4;
  g.add(legs);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  gun.position.set(0.3, 1.3, 0.3);
  g.add(gun);
  // Half the crew wears a dark cap — the gunmen are not one clone.
  if (rng() < 0.5) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.28, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    cap.position.y = 2.0;
    g.add(cap);
  }
  return g;
}

export function createCombat(scene) {
  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const combat = { scene, foes: [], sparks, sparkGeo, cooldown: 0, brute: null };
  // Alias kept for tooling that reads the foe list as `enemies`.
  Object.defineProperty(combat, 'enemies', { get() { return combat.foes; } });
  return combat;
}

// The Commodore's armoured car: the finale's tough target — shoot it
// (or ram it) until its armour gives out.
export function spawnBrute(combat, at) {
  const mesh = makeCarMesh(0x222222, 'cop');
  mesh.position.set(at[0], 0, at[1]);
  combat.scene.add(mesh);
  combat.brute = { mesh, x: at[0], z: at[1], hp: 12 };
}

export function spawnSparks(combat, x, y, z, color, n) {
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(combat.sparkGeo, mat);
    m.position.set(x, y, z);
    combat.scene.add(m);
    combat.sparks.push({
      mesh: m,
      vx: Math.random() * 8 - 4,
      vy: 1 + Math.random() * 4,
      vz: Math.random() * 8 - 4,
      life: 0.6,
    });
  }
}

let foeSeed = 20261117;
export function spawnGunmen(combat, n, at) {
  const rng = mulberry((foeSeed += 7919));
  for (let i = 0; i < n; i++) {
    const mesh = makeGunman(rng);
    const x = at[0] + rand(rng, -12, 12);
    const z = at[1] + rand(rng, -12, 12);
    mesh.position.set(x, 0, z);
    combat.scene.add(mesh);
    combat.foes.push({ mesh, x, z, hp: 3, heading: 0, shootIn: 0 });
  }
}

// Exact placement for staged shots: foes at fixed spots, facing a fixed
// point (usually the player), so the frame is repeatable.
export function placeGunmen(combat, spots, faceTo) {
  const rng = mulberry(20261117);
  for (const [x, z] of spots) {
    const mesh = makeGunman(rng);
    mesh.position.set(x, 0, z);
    combat.scene.add(mesh);
    const heading = faceTo ? Math.atan2(faceTo[0] - x, faceTo[1] - z) : 0;
    mesh.rotation.y = heading;
    combat.foes.push({ mesh, x, z, hp: 3, heading, shootIn: 0.6 });
  }
}

// A visible tracer from the muzzle to the hit point, plus a flash burst
// at the gun — a gunfight has to be seen, not just heard. The tracer is
// registered as a spark so the combat tick cleans it up.
export function drawShotLine(combat, x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dy, dz) || 1;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, len),
    new THREE.MeshBasicMaterial({ color: 0xffe066 }),
  );
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  m.lookAt(x2, y2, z2);
  combat.scene.add(m);
  combat.sparks.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0.45 });
}

export function flashAt(combat, x, y, z) {
  spawnSparks(combat, x, y, z, 0xffe066, 10);
  spawnSparks(combat, x, y, z, 0xff8800, 5);
}

export function clearFoes(combat) {
  for (const e of combat.foes) combat.scene.remove(e.mesh);
  combat.foes.length = 0;
}

// Fire the pistol. dir is the camera forward (x, z). Returns what it hit.
export function firePistol(run, dirX, dirZ) {
  const combat = run.combat;
  if (run.shells <= 0) {
    run.notice = 'Out of ammo — find the green ammo pickup.';
    run.noticeAt = performance.now();
    return 'empty';
  }
  if (combat.cooldown > 0) return 'cool';
  combat.cooldown = 0.28;
  run.shells -= 1;
  run.shake = 0.25;
  if (run.sound) run.sound.gunshot();
  const ox = run.player.x;
  const oz = run.player.z;
  let best = null;
  let bd = 60;
  let kind = null;
  const inCone = (tx, tz, need) => {
    const dx = tx - ox;
    const dz = tz - oz;
    const d = Math.hypot(dx, dz);
    const dot = (dx * dirX + dz * dirZ) / (d || 1);
    return d < bd && dot > need ? d : -1;
  };
  for (const e of combat.foes) {
    const d = inCone(e.x, e.z, 0.94);
    if (d > 0) {
      bd = d;
      best = e;
      kind = 'foe';
    }
  }
  for (const p of run.crowd.walkers) {
    if (!p.alive) continue;
    const d = inCone(p.x, p.z, 0.96);
    if (d > 0) {
      bd = d;
      best = p;
      kind = 'walker';
    }
  }
  const brute = combat.brute;
  if (brute && brute.hp > 0) {
    const d = inCone(brute.x, brute.z, 0.9);
    if (d > 0) {
      bd = d;
      best = brute;
      kind = 'brute';
    }
  }
  const hx = ox + dirX * bd;
  const hz = oz + dirZ * bd;
  spawnSparks(combat, hx, 1.3, hz, 0xffd23f, 6);
  // Every shot draws its tracer and flash, so the firefight reads.
  drawShotLine(combat, ox + dirX * 0.6, 1.35, oz + dirZ * 0.6, hx, 1.3, hz);
  flashAt(combat, ox + dirX * 0.8, 1.35, oz + dirZ * 0.8);
  if (kind === 'foe') {
    best.hp -= 1;
    if (run.sound) run.sound.hit();
    if (best.hp <= 0) {
      spawnSparks(combat, best.x, 1.2, best.z, 0xff4444, 14);
      combat.scene.remove(best.mesh);
      combat.foes.splice(combat.foes.indexOf(best), 1);
      run.story.foesLeft = Math.max(0, run.story.foesLeft - 1);
      run.money += 25;
    }
    return 'foe';
  }
  if (kind === 'walker') {
    best.alive = false;
    best.mesh.visible = false;
    spawnSparks(combat, best.x, 1.2, best.z, 0xff4444, 10);
    run.police.wanted = Math.min(5, run.police.wanted + 1);
    run.police.heat = 1;
    return 'walker';
  }
  if (kind === 'brute') {
    best.hp -= 1;
    if (run.sound) run.sound.hit();
    spawnSparks(combat, best.x, 1.2, best.z, 0xff8800, 8);
    if (best.hp <= 0) {
      spawnSparks(combat, best.x, 1.5, best.z, 0xffcc00, 24);
      combat.scene.remove(best.mesh);
      run.notice = 'Armoured car destroyed!';
      run.noticeAt = performance.now();
    }
    return 'brute';
  }
  return 'miss';
}

export function stepCombat(combat, dt, run) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  // Sparks drift and fall, then get cleaned up.
  for (let i = combat.sparks.length - 1; i >= 0; i--) {
    const p = combat.sparks[i];
    p.life -= dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 9 * dt;
    if (p.life <= 0) {
      combat.scene.remove(p.mesh);
      combat.sparks.splice(i, 1);
    }
  }
  // Foes advance and shoot back.
  for (const e of combat.foes) {
    const dx = run.player.x - e.x;
    const dz = run.player.z - e.z;
    const d = Math.hypot(dx, dz);
    e.heading = Math.atan2(dx, dz);
    e.mesh.rotation.y = e.heading;
    if (d > 9) {
      e.x += Math.sin(e.heading) * 3.2 * dt;
      e.z += Math.cos(e.heading) * 3.2 * dt;
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.shootIn -= dt;
    if (d < 26 && e.shootIn <= 0) {
      e.shootIn = 1.2 + Math.random() * 1.0;
      if (Math.random() < 0.45) {
        run.hp = Math.max(0, run.hp - 7);
        spawnSparks(combat, run.player.x, 1.4, run.player.z, 0xff6666, 4);
        if (run.sound) run.sound.hit();
      }
    }
  }
}
