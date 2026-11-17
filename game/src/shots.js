// Screenshot scenes behind ?shot=chase|combat|steal|dusk. Each one stages
// a real gameplay state (wanted level, police chase, mission beacon,
// traffic), advances the world a fixed number of steps so traffic and
// walkers are mid-motion, paints twice and sets window.__shotReady for
// the screenshot tool. Shot 1 (chase) is the cover: a real police chase —
// a moving player car, police units in frame, stars + minimap + mission
// objective. Every shot is a DIFFERENT mission, and every toast is one
// short line so no dialogue banner ever covers the action. Staging is
// deterministic: fixed spots, fixed speeds, fixed camera — the same seed
// gives the same frame every time.
import { addWanted, clearPolice, placePatrolCar } from './police.js';
import { placeGunmen, spawnBrute, firePistol } from './combat.js';
import { startChapter } from './missions.js';

// Short toast, one line, set after startChapter (which writes the long
// mission brief). Call this last in every branch.
function setNote(run, text) {
  run.notice = text;
  run.noticeAt = performance.now();
}

// Teleport a traffic car onto a road spot so the street is alive.
function moveCar(run, idx, x, z, heading) {
  const routed = run.fleet.cars.filter((c) => c.route && !c.driven);
  const c = routed[idx % routed.length];
  c.x = x;
  c.z = z;
  c.heading = heading;
  c.vel = 9;
  c.mesh.position.set(x, 0, z);
  c.mesh.rotation.y = heading;
}

// Teleport a walker onto a sidewalk spot near the action.
function moveWalker(run, idx, x, z) {
  const p = run.crowd.walkers[idx % run.crowd.walkers.length];
  p.x = x;
  p.z = z;
  p.heading = Math.PI;
  p.wait = 0;
  p.mesh.position.set(x, 0, z);
  p.mesh.rotation.y = Math.PI;
}

export function stageShot(game, name) {
  const run = game.state;
  run.screen = 'play';
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  game.sound.unlock();
  if (name === 'combat') {
    // MISSION 3 — Harbour Heat: on-foot gunfight at the docks. Leo stands
    // in the road with three gunmen close ahead, muzzle flash + tracer
    // frozen mid-shot, beacon behind them, health/ammo on the HUD.
    run.missionIndex = 2;
    startChapter(run, run.scene);
    run.player.x = 228;
    run.player.z = 108;
    run.player.face = 0.17;
    run.player.inCar = false;
    run.hour = 17.5;
    run.money = 1250;
    run.shells = 42;
    run.hp = 82;
    game.camYaw = 0.17;
    // Gunmen 9–13 units ahead, fanned across the aim line so all three
    // are in frame and inside the fire cone.
    const fx = Math.sin(0.17);
    const fz = Math.cos(0.17);
    const rx = Math.cos(0.17);
    const rz = -Math.sin(0.17);
    placeGunmen(run.combat, [
      [228 + fx * 9 + rx * -3, 108 + fz * 9 + rz * -3],
      [228 + fx * 11 + rx * 1, 108 + fz * 11 + rz * 1],
      [228 + fx * 13 + rx * 4.5, 108 + fz * 13 + rz * 4.5],
    ], [228, 108]);
    run.story.foesLeft = 3;
    run.story.deployed = true;
    game.advance(0.8);
    // Fire one shot at the nearest gunman: tracer + muzzle flash + hit
    // burst are meshes, so they survive the final paint.
    firePistol(run, Math.sin(game.camYaw), Math.cos(game.camYaw));
    setNote(run, 'Gunmen at the docks — take them down!');
  } else if (name === 'steal') {
    // MISSION 1 — First Wheels: the car-steal moment, but the street is
    // alive — traffic rolling past on the road, walkers on the sidewalk.
    // parked[1] is the staged spot: its camera line is clear of towers
    // (the most-central spot puts the camera inside a building).
    const near = run.fleet.parked[1];
    run.player.x = near.x + 3;
    run.player.z = near.z + 3;
    run.player.face = Math.PI / 2;
    run.player.inCar = false;
    run.hour = 16.0;
    run.money = 150;
    run.shells = 60;
    game.camYaw = Math.PI * 1.15;
    game.advance(0.8);
    // Bright staged paint for the target car (userData.body is the body
    // mesh in every body style) so the steal target pops off the road.
    if (near.mesh.userData.body && near.mesh.userData.body.material) {
      near.mesh.userData.body.material = near.mesh.userData.body.material.clone();
      near.mesh.userData.body.material.color.setHex(0xe74c3c);
    }
    // Parked cars sit kerbside on a road line: traffic runs along that
    // line. Walkers go on the open street ahead of the player, along the
    // camera's view axis, so they are actually in frame — sidewalk spots
    // beside the car kept landing behind the camera or inside a tower.
    const alongZ = Math.abs(near.heading) < 0.1;
    if (alongZ) {
      moveCar(run, 0, near.x, near.z - 26, 0);
      moveCar(run, 1, near.x + 1, near.z + 24, 0);
    } else {
      moveCar(run, 0, near.x - 26, near.z, Math.PI / 2);
      moveCar(run, 1, near.x + 24, near.z + 1, Math.PI / 2);
    }
    const fx = Math.sin(Math.PI * 1.15);
    const fz = Math.cos(Math.PI * 1.15);
    const rx = Math.cos(Math.PI * 1.15);
    const rz = -Math.sin(Math.PI * 1.15);
    const px = run.player.x;
    const pz = run.player.z;
    const walkerSpots = [
      [px + fx * 10 + rx * 7, pz + fz * 10 + rz * 7],
      [px + fx * 16 + rx * -7, pz + fz * 16 + rz * -7],
      [px + fx * 22 + rx * 8, pz + fz * 22 + rz * 8],
    ];
    walkerSpots.forEach(([x, z], i) => moveWalker(run, i, x, z));
    setNote(run, 'Parked car ahead — press E to steal it.');
  } else if (name === 'dusk') {
    // MISSION 5 — The Commodore (finale): dusk drive downtown toward the
    // penthouse garage, guards and the armoured car ahead, traffic on the
    // avenue, neon on the towers, dusk sky in frame (low camera tilt).
    run.missionIndex = 4;
    startChapter(run, run.scene);
    run.player.x = 0;
    run.player.z = 140;
    run.player.face = Math.PI;
    run.player.inCar = true;
    run.hour = 20.3;
    run.money = 2400;
    run.shells = 30;
    run.hp = 100;
    const car = run.fleet.parked[2];
    run.player.car = car;
    car.driven = true;
    car.x = 0;
    car.z = 140;
    car.heading = Math.PI;
    car.vel = 0;
    game.camYaw = Math.PI;
    game.camTilt = 0.08;
    game.advance(1.5);
    // The finale spawns four guards at (0,0); pull two of them up the
    // avenue so they are in frame, and park the armoured car ahead.
    const guards = run.combat.foes.slice(0, 2);
    const guardSpots = [[-4, 62], [5, 76]];
    guards.forEach((e, i) => {
      e.x = guardSpots[i][0];
      e.z = guardSpots[i][1];
      e.heading = Math.atan2(0 - e.x, 140 - e.z);
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
    });
    spawnBrute(run.combat, [9, 52]);
    moveCar(run, 0, 1.5, 100, Math.PI);
    moveCar(run, 1, -2, 116, Math.PI);
    moveWalker(run, 0, 9, 88);
    moveWalker(run, 1, -9, 104);
    // The world steps decayed the car to a crawl; restore cruising speed
    // after the steps so the HUD reads a real driving speed.
    car.vel = 28;
    run.player.carVel = 28;
    setNote(run, "The Commodore's garage — downtown. End this tonight.");
  } else { // chase — the cover shot: MISSION 4 The Getaway, mid-chase.
    // Straight down the x=0 avenue so the chase reads. The car is held
    // still (speed 0) while the world steps — otherwise it drives 20+
    // units and the police staged behind it end up behind the camera.
    // Police are placed AFTER the steps, relative to where the car
    // actually is, and the camera pulls back (24 units, higher tilt)
    // so both units stay in frame. Speed is restored after the steps
    // so the HUD reads a real chase speed.
    run.missionIndex = 3;
    startChapter(run, run.scene);
    run.story.phase = 1; // stash already grabbed: run for the hideout
    run.story.beacon.position.set(0, 9, 0);
    run.story.ring.position.set(0, 0.1, 0);
    run.player.x = 0;
    run.player.z = -60;
    run.player.face = 0;
    run.player.inCar = true;
    run.hour = 17.8;
    run.money = 1850;
    run.shells = 48;
    run.hp = 100;
    const car = run.fleet.parked[0];
    run.player.car = car;
    car.driven = true;
    car.x = 0;
    car.z = -60;
    car.heading = 0;
    car.vel = 0;
    game.camYaw = 0;
    game.camTilt = 0.55;
    game.camPull = 24;
    game.advance(1.5);
    // Traffic ahead on the avenue + walkers on the sidewalks.
    moveCar(run, 0, 1.5, -25, 0);
    moveCar(run, 1, -2, -5, 0);
    moveWalker(run, 0, 9, -35);
    moveWalker(run, 1, -9, -15);
    moveWalker(run, 2, 9, -5);
    // Two police units in frame: one in the right lane just behind Leo,
    // one in the left lane a little further back, both facing his heading.
    clearPolice(run.police, run.scene);
    addWanted(run.police, 3, null);
    run.wanted = 3;
    placePatrolCar(run.scene, run.police, run.player.x + 4, run.player.z - 7, 0);
    placePatrolCar(run.scene, run.police, run.player.x - 4, run.player.z - 11, 0);
    car.vel = 30;
    run.player.carVel = 30;
    run.shake = 0.15;
    setNote(run, 'Outrun the police — reach the downtown hideout!');
  }
  game.paint();
  game.paint();
  window.__shotReady = true;
}
