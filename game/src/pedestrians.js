// Walkers: pedestrians strolling the sidewalks in their own colours and
// at their own pace. They wander, pause at corners, and run from gunfire
// or a speeding car. Running one over is a crime — the police watch.
import * as THREE from 'three';
import { mulberry, pick, rand } from './util.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e, 0xff6b9d, 0x00b8a9];
const HATS = [0x111111, 0xc0392b, 0xf1c40f, 0x2e86c1, 0xecf0f1];

function makeWalker(top, bottom, rng) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: bottom });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), legMat);
  l1.position.set(-0.14, 0.4, 0);
  g.add(l1);
  const l2 = l1.clone();
  l2.position.x = 0.14;
  g.add(l2);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.75, 0.36),
    new THREE.MeshLambertMaterial({ color: top }),
  );
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.78;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x2c1a0e }),
  );
  hair.position.y = 1.84;
  g.add(hair);
  // A third of the crowd wears a cap or a sun hat, and heights vary a
  // little, so the street never reads as one cloned walker.
  if (rng() < 0.34) {
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: pick(rng, HATS) }),
    );
    hat.position.y = 2.0;
    g.add(hat);
  }
  g.scale.setScalar(rand(rng, 0.88, 1.1));
  g.userData.legs = [l1, l2];
  return g;
}

export function spawnWalkers(scene, seed) {
  const rng = mulberry(seed + 21);
  const walkers = [];
  for (let i = 0; i < 44; i++) {
    const mesh = makeWalker(
      pick(rng, SHIRTS),
      pick(rng, [0x2c3e50, 0x7f8c8d, 0x5d4037, 0x1a1a2e]),
      rng,
    );
    const x = rand(rng, -240, 240);
    const z = rand(rng, -240, 240);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    walkers.push({
      mesh, x, z,
      heading: rand(rng, 0, Math.PI * 2),
      pace: rand(rng, 1.2, 2.4),
      wait: rand(rng, 0, 4),
      run: 0,
      alive: true,
      stride: rng() * 6,
    });
  }
  return { walkers };
}

export function stepWalkers(crowd, dt, threat) {
  // threat: {x, z, radius} — gunfire or a speeding car makes walkers flee.
  for (const p of crowd.walkers) {
    if (!p.alive) continue;
    let fleeing = p.run > 0;
    if (threat && Math.hypot(p.x - threat.x, p.z - threat.z) < threat.radius) {
      p.run = 2.5;
      fleeing = true;
    }
    if (p.run > 0) p.run -= dt;
    if (p.wait > 0 && !fleeing) {
      p.wait -= dt;
      if (p.wait <= 0) p.heading = Math.random() * Math.PI * 2;
    } else {
      const sp = fleeing ? 5.5 : p.pace;
      p.x += Math.sin(p.heading) * sp * dt;
      p.z += Math.cos(p.heading) * sp * dt;
      if (Math.abs(p.x) > 250 || Math.abs(p.z) > 250) p.heading += Math.PI;
      if (!fleeing && Math.random() < dt * 0.08) p.wait = 1 + Math.random() * 3;
    }
    p.stride += dt * (fleeing ? 14 : 7);
    const s = Math.sin(p.stride) * 0.35;
    p.mesh.userData.legs[0].rotation.x = s;
    p.mesh.userData.legs[1].rotation.x = -s;
    p.mesh.position.set(p.x, Math.abs(Math.sin(p.stride)) * 0.04, p.z);
    p.mesh.rotation.y = p.heading;
  }
}

export function nearestWalker(crowd, x, z, maxD) {
  let best = null;
  let bd = maxD;
  for (const p of crowd.walkers) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
