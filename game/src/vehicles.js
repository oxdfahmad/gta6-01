// Vehicles: traffic cars that loop the street grid, parked cars to steal,
// and the arcade driving model (accelerate, steer, brake, handbrake drift,
// damage smoke). A car is a box body + cabin + 4 wheels; police cars reuse
// this builder with a light bar. Three body styles — sedan, van, sport —
// so the streets and the stealable row do not read as one cloned car.
import * as THREE from 'three';
import { mulberry32, pick, range, clamp, wrapAngle, PALETTE } from './util.js';
import { collideBuildings } from './city.js';

const PITCH = 60;
export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  if (kind === 'van') {
    // Tall box van: one big body, small windscreen, side stripe.
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 5.2), bodyMat);
    body.position.y = 1.0; g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.4), new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
    glass.position.set(0, 1.5, 2.2); g.add(glass);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.35, 5.24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 1.1; g.add(stripe);
  } else if (kind === 'sport') {
    // Low wide coupe with a rear spoiler.
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 4.8), bodyMat);
    body.position.y = 0.55; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.9), new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
    cabin.position.set(0, 1.1, -0.3); g.add(cabin);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    spoiler.position.set(0, 1.05, -2.3); g.add(spoiler);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.6), bodyMat);
    body.position.y = 0.65; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
    cabin.position.set(0, 1.3, -0.2); g.add(cabin);
  }
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w); wheels.push(w);
  });
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.75, -0.2); g.add(bar); g.userData.lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.3, 4.62), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.7; g.add(stripe);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    sign.position.set(0, 1.75, -0.2); g.add(sign);
  }
  // Headlights: two soft additive cones at the front, off by day. They
  // switch on after dark (see setHeadlights) so dusk driving reads.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [];
  for (const bx of [-0.7, 0.7]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.55, 5, 8, 1, true), beamMat);
    beam.rotation.x = Math.PI / 2; beam.position.set(bx, 0.7, 4.4); beam.visible = false;
    g.add(beam); beams.push(beam);
  }
  g.userData.headlights = beams;
  g.userData.wheels = wheels;
  return g;
}
// Switch a car's headlight cones on or off (night driving).
export function setHeadlights(mesh, on) {
  const beams = mesh && mesh.userData.headlights;
  if (!beams) return;
  for (const b of beams) b.visible = on;
}

export function createVehicleFleet(scene, city, seed) {
  const rng = mulberry32(seed + 7);
  const cars = [];
  const names = ['Comet GT', 'Sunrunner', 'Bayliner', 'Palmera', 'Vortex S', 'Coral Coupe', 'Dune Buggy', 'Harbor Van'];
  function addCar(x, z, angle, kind, parked) {
    const color = kind === 'police' ? 0x111111 : (kind === 'taxi' ? 0xf1c40f : pick(rng, PALETTE.car));
    const mesh = makeCarMesh(color, kind);
    mesh.position.set(x, 0, z); mesh.rotation.y = angle; scene.add(mesh);
    const car = { mesh, x, z, angle, speed: 0, kind, parked: !!parked, name: pick(rng, names),
      color, health: 100, route: null, routeIdx: 0, stuck: 0, isPlayer: false, driver: null };
    cars.push(car); return car;
  }
  // Traffic: 28 cars looping rectangular routes ON the roads (corners are
  // street intersections, multiples of 60 — never through buildings).
  // A few are vans so the flow is not one cloned sedan.
  for (let i = 0; i < 28; i++) {
    const gx = Math.floor(range(rng, -3, 3)) * PITCH, gz = Math.floor(range(rng, -3, 3)) * PITCH;
    const route = [[gx, gz], [gx + PITCH, gz], [gx + PITCH, gz + PITCH], [gx, gz + PITCH]];
    const kind = rng() < 0.2 ? 'van' : 'traffic';
    const c = addCar(route[0][0], route[0][1], 0, kind, false);
    c.route = route; c.speed = range(rng, 7, 12);
  }
  // Parked cars along streets — the stealable ones, kerbside on road lines.
  // Mixed body styles: sedans, vans and a couple of sports cars.
  const parkedSpots = [];
  for (let i = 0; i < 20; i++) {
    const road = Math.floor(range(rng, -4, 5)) * PITCH;
    const along = rng() < 0.5;
    const x = along ? road + (rng() < 0.5 ? -8 : 8) : range(rng, -230, 230);
    const z = along ? range(rng, -230, 230) : road + (rng() < 0.5 ? -8 : 8);
    const kind = rng() < 0.22 ? 'van' : (rng() < 0.16 ? 'sport' : 'parked');
    const c = addCar(x, z, along ? 0 : Math.PI / 2, kind, true);
    parkedSpots.push(c);
  }
  // One taxi for the side job.
  const taxi = addCar(30, 8, Math.PI / 2, 'taxi', true);
  return { cars, parkedSpots, taxi, addCar };
}

export function nearestStealableCar(fleet, x, z, maxD) {
  let best = null, bd = maxD;
  for (const c of fleet.cars) {
    if (c.isPlayer || c.kind === 'police') continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// Arcade drive step for the player's car. Returns collision info.
export function driveCar(car, input, dt, city, fleet) {
  const accel = input.forward ? 22 : input.back ? -14 : 0;
  car.speed += accel * dt;
  if (!input.forward && !input.back) car.speed *= Math.pow(0.4, dt);
  if (input.handbrake) car.speed *= Math.pow(0.08, dt);
  car.speed = clamp(car.speed, -10, 34);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerAmt = steer * 1.9 * dt * Math.sign(car.speed || 1) * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.angle += steerAmt;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const col = collideBuildings(city.colliders, nx, nz, 2.2);
  if (col.hit || Math.abs(nx) > 285 || Math.abs(nz) > 285) {
    car.speed *= -0.25; car.health -= 2; return { crashed: true };
  }
  // Bump traffic cars.
  for (const o of fleet.cars) {
    if (o === car || o.isPlayer) continue;
    if (Math.hypot(o.x - nx, o.z - nz) < 3.4) { car.speed *= 0.4; o.speed = Math.max(o.speed, 4); car.health -= 1; return { crashed: true }; }
  }
  car.x = nx; car.z = nz;
  car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.angle;
  car.mesh.userData.wheels.forEach((w) => { w.rotation.x += car.speed * dt * 2; });
  return { crashed: false };
}

export function updateTraffic(fleet, dt, city) {
  for (const c of fleet.cars) {
    if (c.isPlayer || !c.route) continue;
    const target = c.route[c.routeIdx];
    const dx = target[0] - c.x, dz = target[1] - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) { c.routeIdx = (c.routeIdx + 1) % c.route.length; continue; }
    const want = Math.atan2(dx, dz);
    c.angle += wrapAngle(want - c.angle) * Math.min(1, dt * 2.5);
    c.x += Math.sin(c.angle) * c.speed * dt;
    c.z += Math.cos(c.angle) * c.speed * dt;
    c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.angle;
  }
}
