// Cars: traffic that loops the street grid, parked rides to steal, and
// the arcade driving model — accelerate, steer, brake, handbrake drift,
// damage. A car is a box body + cabin + four wheels; police rides reuse
// this builder with a light bar, the taxi with a roof sign. Three body
// styles (sedan, hauler, racer) so the streets never read as one cloned car.
import * as THREE from 'three';
import { mulberry, pick, rand, clamp, wrapAngle, PALETTE } from './util.js';
import { hitBuilding } from './city.js';

const PITCH = 60;
const CAR_NAMES = ['Comet GT', 'Sunrunner', 'Bayliner', 'Palmera', 'Vortex S', 'Coral Coupe', 'Dune Buggy', 'Harbor Van'];

export function makeCarMesh(paint, kind) {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: paint });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  let body;
  if (kind === 'hauler') {
    // Tall box van: one big body, small windscreen, white side stripe.
    body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 5.2), coat);
    body.position.y = 1.0;
    g.add(body);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.4), glass);
    shield.position.set(0, 1.5, 2.2);
    g.add(shield);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.24, 0.35, 5.24),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    stripe.position.y = 1.1;
    g.add(stripe);
  } else if (kind === 'racer') {
    // Low wide coupe with a rear spoiler.
    body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 4.8), coat);
    body.position.y = 0.55;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.9), glass);
    cabin.position.set(0, 1.1, -0.3);
    g.add(cabin);
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    wing.position.set(0, 1.05, -2.3);
    g.add(wing);
  } else {
    body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.6), coat);
    body.position.y = 0.65;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glass);
    cabin.position.set(0, 1.3, -0.2);
    g.add(cabin);
  }
  g.userData.body = body;
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10), tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
    wheels.push(w);
  }
  if (kind === 'cop') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    bar.position.set(0, 1.75, -0.2);
    g.add(bar);
    g.userData.bar = bar;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.12, 0.3, 4.62),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    stripe.position.y = 0.7;
    g.add(stripe);
  }
  if (kind === 'cab') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    sign.position.set(0, 1.75, -0.2);
    g.add(sign);
  }
  // Headlight cones at the front, dark by day. They switch on after
  // dusk (see toggleHeadlights) so night driving actually reads.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beams = [];
  for (const bx of [-0.7, 0.7]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.55, 5, 8, 1, true), beamMat);
    beam.rotation.x = Math.PI / 2;
    beam.position.set(bx, 0.7, 4.4);
    beam.visible = false;
    g.add(beam);
    beams.push(beam);
  }
  g.userData.beams = beams;
  g.userData.wheels = wheels;
  return g;
}

// Flip a ride's headlight cones on or off (night driving).
export function toggleHeadlights(mesh, on) {
  const beams = mesh && mesh.userData.beams;
  if (!beams) return;
  for (const b of beams) b.visible = on;
}

export function spawnCars(scene, city, seed) {
  const rng = mulberry(seed + 7);
  const cars = [];
  // Slide a kerbside spot along the road axis until it clears every
  // building wall: some towers jut right up to the road edge, and a ride
  // spawned 1 unit inside a wall's reach can never drive away — it just
  // crashes in place every frame. Try the spot itself, then steps out
  // along the road in both directions.
  function clearSpot(x, z, slideZ) {
    for (let d = 0; d <= 48; d += 4) {
      for (const s of [0, 1, -1]) {
        const nx = slideZ ? x : x + d * s;
        const nz = slideZ ? z + d * s : z;
        if (!hitBuilding(city.walls, nx, nz, 2.6).hit) return [nx, nz];
      }
    }
    return [x, z];
  }
  function addCar(x, z, heading, kind, parked) {
    const paint = kind === 'cop' ? 0x111111 : kind === 'cab' ? 0xf1c40f : pick(rng, PALETTE.paints);
    const mesh = makeCarMesh(paint, kind);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh, x, z, heading, vel: 0, kind, parked: !!parked,
      label: pick(rng, CAR_NAMES), paint, hp: 100,
      route: null, routeStep: 0, driven: false,
    };
    cars.push(car);
    return car;
  }
  // Traffic: 28 rides looping rectangular routes ON the roads — corners
  // are street intersections, multiples of 60, never through buildings.
  // A few are haulers so the flow is not one cloned sedan.
  for (let i = 0; i < 28; i++) {
    const gx = Math.floor(rand(rng, -3, 3)) * PITCH;
    const gz = Math.floor(rand(rng, -3, 3)) * PITCH;
    const route = [[gx, gz], [gx + PITCH, gz], [gx + PITCH, gz + PITCH], [gx, gz + PITCH]];
    const kind = rng() < 0.2 ? 'hauler' : 'sedan';
    const c = addCar(route[0][0], route[0][1], 0, kind, false);
    c.route = route;
    c.vel = rand(rng, 7, 12);
  }
  // Parked rides along the kerb — the stealable ones. Mixed bodies:
  // sedans, haulers and a couple of racers. Every spot is slid clear
  // of walls first (see clearSpot above).
  const parked = [];
  for (let i = 0; i < 20; i++) {
    const road = Math.floor(rand(rng, -4, 5)) * PITCH;
    const along = rng() < 0.5;
    const x = along ? road + (rng() < 0.5 ? -8 : 8) : rand(rng, -230, 230);
    const z = along ? rand(rng, -230, 230) : road + (rng() < 0.5 ? -8 : 8);
    const kind = rng() < 0.22 ? 'hauler' : rng() < 0.16 ? 'racer' : 'sedan';
    const [sx, sz] = clearSpot(x, z, along);
    const c = addCar(sx, sz, along ? 0 : Math.PI / 2, kind, true);
    parked.push(c);
  }
  // One taxi for the side job — slid clear of walls the same way.
  const [tx, tz] = clearSpot(30, 8, false);
  const taxi = addCar(tx, tz, Math.PI / 2, 'cab', true);
  return { cars, parked, taxi, addCar };
}

export function nearestOpenCar(fleet, x, z, maxD) {
  let best = null;
  let bd = maxD;
  for (const c of fleet.cars) {
    if (c.driven || c.kind === 'cop') continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

// One arcade driving step for the player's ride. Returns crash info.
export function driveCar(car, input, dt, city, fleet) {
  const push = input.forward ? 22 : input.back ? -14 : 0;
  car.vel += push * dt;
  if (!input.forward && !input.back) car.vel *= Math.pow(0.4, dt);
  if (input.handbrake) car.vel *= Math.pow(0.08, dt);
  car.vel = clamp(car.vel, -10, 34);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const turn = steer * 1.9 * dt * Math.sign(car.vel || 1) * clamp(Math.abs(car.vel) / 8, 0, 1);
  car.heading += turn;
  const nx = car.x + Math.sin(car.heading) * car.vel * dt;
  const nz = car.z + Math.cos(car.heading) * car.vel * dt;
  const col = hitBuilding(city.walls, nx, nz, 2.2);
  if (col.hit || Math.abs(nx) > 285 || Math.abs(nz) > 285) {
    car.vel *= -0.25;
    car.hp -= 2;
    return { crashed: true };
  }
  // Bumping a traffic ride.
  for (const o of fleet.cars) {
    if (o === car || o.driven) continue;
    if (Math.hypot(o.x - nx, o.z - nz) < 3.4) {
      car.vel *= 0.4;
      o.vel = Math.max(o.vel, 4);
      car.hp -= 1;
      return { crashed: true };
    }
  }
  car.x = nx;
  car.z = nz;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.userData.wheels.forEach((w) => {
    w.rotation.x += car.vel * dt * 2;
  });
  return { crashed: false };
}

export function stepTraffic(fleet, dt, city) {
  for (const c of fleet.cars) {
    if (c.driven || !c.route) continue;
    const target = c.route[c.routeStep];
    const dx = target[0] - c.x;
    const dz = target[1] - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      c.routeStep = (c.routeStep + 1) % c.route.length;
      continue;
    }
    const want = Math.atan2(dx, dz);
    c.heading += wrapAngle(want - c.heading) * Math.min(1, dt * 2.5);
    c.x += Math.sin(c.heading) * c.vel * dt;
    c.z += Math.cos(c.heading) * c.vel * dt;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
  }
}
