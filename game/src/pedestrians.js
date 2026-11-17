// Pedestrians: walkers on the sidewalks with their own colours and pace.
// They stroll, wait at corners, and flee from gunfire or a speeding car.
// Hitting one is a crime — the police system watches for it.
import * as THREE from 'three';
import { mulberry32, pick, range, clamp, PALETTE } from './util.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e, 0xff6b9d, 0x00b8a9];
const HATS = [0x111111, 0xc0392b, 0xf1c40f, 0x2e86c1, 0xecf0f1];
function makePedMesh(shirt, pants, rng) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), legMat); l1.position.set(-0.14, 0.4, 0); g.add(l1);
  const l2 = l1.clone(); l2.position.x = 0.14; g.add(l2);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.78; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, 1.4), new THREE.MeshLambertMaterial({ color: 0x2c1a0e }));
  hair.position.y = 1.84; g.add(hair);
  // A third of walkers wear a cap or a sun hat — the crowd stops cloning.
  if (rng() < 0.34) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.12, 10), new THREE.MeshLambertMaterial({ color: pick(rng, HATS) }));
    hat.position.y = 2.0; g.add(hat);
  }
  // Height varies a little so the crowd is not one height.
  g.scale.setScalar(range(rng, 0.88, 1.1));
  g.userData.legs = [l1, l2];
  return g;
}

export function createPedestrians(scene, seed) {
  const rng = mulberry32(seed + 21);
  const peds = [];
  for (let i = 0; i < 44; i++) {
    const mesh = makePedMesh(pick(rng, SHIRTS), pick(rng, [0x2c3e50, 0x7f8c8d, 0x5d4037, 0x1a1a2e]), rng);
    const x = range(rng, -240, 240), z = range(rng, -240, 240);
    mesh.position.set(x, 0, z); scene.add(mesh);
    peds.push({ mesh, x, z, angle: range(rng, 0, Math.PI * 2), speed: range(rng, 1.2, 2.4),
      state: 'walk', wait: range(rng, 0, 4), flee: 0, alive: true, phase: rng() * 6 });
  }
  return { peds };
}

export function updatePedestrians(sys, dt, danger) {
  // danger: {x, z, radius} gunfire / speeding car — peds inside flee.
  for (const p of sys.peds) {
    if (!p.alive) continue;
    let fleeing = p.flee > 0;
    if (danger && Math.hypot(p.x - danger.x, p.z - danger.z) < danger.radius) { p.flee = 2.5; fleeing = true; }
    if (p.flee > 0) p.flee -= dt;
    if (p.wait > 0 && !fleeing) { p.wait -= dt; if (p.wait <= 0) p.angle = Math.random() * Math.PI * 2; }
    else {
      const sp = fleeing ? 5.5 : p.speed;
      p.x += Math.sin(p.angle) * sp * dt; p.z += Math.cos(p.angle) * sp * dt;
      if (Math.abs(p.x) > 250 || Math.abs(p.z) > 250) p.angle += Math.PI;
      if (!fleeing && Math.random() < dt * 0.08) p.wait = 1 + Math.random() * 3;
    }
    p.phase += dt * (fleeing ? 14 : 7);
    const s = Math.sin(p.phase) * 0.35;
    p.mesh.userData.legs[0].rotation.x = s; p.mesh.userData.legs[1].rotation.x = -s;
    p.mesh.position.set(p.x, Math.abs(Math.sin(p.phase)) * 0.04, p.z);
    p.mesh.rotation.y = p.angle;
  }
}
export function nearestPed(sys, x, z, maxD) {
  let best = null, bd = maxD;
  for (const p of sys.peds) { if (!p.alive) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  return best;
}
