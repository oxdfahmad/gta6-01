// Screenshot scenes behind ?shot=chase|combat|steal|dusk. Each one stages a
// real gameplay state (wanted level, police chase, mission marker, traffic),
// advances the world a fixed number of steps so traffic and peds are mid-
// motion, paints twice and sets window.__shotReady for the screenshot tool.
// Shot 1 (chase) is the cover: a real police chase — moving player car,
// police units visible in frame, stars + minimap + mission objective.
// Every shot is a DIFFERENT mission/moment, and every toast is one short
// line so no dialogue banner ever covers the action. Staging is
// deterministic: fixed spots, fixed speeds, fixed camera — the same seed
// gives the same frame every time.
import { addWanted, clearPolice, spawnPoliceUnit } from './police.js';
import { spawnEnemiesAt, spawnArmouredCar, fireWeapon } from './combat.js';
import { startMission } from './missions.js';

// Short toast, one line, set after startMission (which writes the long
// mission brief). Call this last in every branch.
function shortToast(s, text) { s.toast = text; s.toastAt = performance.now(); }
// Teleport a traffic car onto a road spot so the street is alive in frame.
function placeTraffic(s, idx, x, z, angle) {
  const routed = s.fleet.cars.filter((c) => c.route && !c.isPlayer);
  const c = routed[idx % routed.length];
  c.x = x; c.z = z; c.angle = angle; c.speed = 9;
  c.mesh.position.set(x, 0, z); c.mesh.rotation.y = angle;
}
// Teleport a pedestrian onto a sidewalk spot near the action.
function placePed(s, idx, x, z) {
  const p = s.peds.peds[idx % s.peds.peds.length];
  p.x = x; p.z = z; p.angle = Math.PI; p.wait = 0;
  p.mesh.position.set(x, 0, z); p.mesh.rotation.y = Math.PI;
}

export function stageShot(game, name) {
  const s = game.state;
  s.screen = 'play';
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  game.audio.unlock();
  if (name === 'combat') {
    // MISSION 3 — Harbour Heat: on-foot gunfight at the docks. Leo stands
    // in the road with three gunmen close ahead, muzzle flash + tracer
    // frozen mid-shot, beacon behind them, health/ammo on the HUD.
    s.missionIndex = 2; startMission(s, s.scene);
    s.player.x = 228; s.player.z = 108; s.player.angle = 0.17; s.player.inCar = false;
    s.hour = 17.5; s.money = 1250; s.ammo = 42; s.health = 82;
    game.cameraAngle = 0.17;
    // Gunmen 9–13 units ahead, fanned across the aim line so all three
    // are in frame and inside the fire cone.
    const fx = Math.sin(0.17), fz = Math.cos(0.17), rx = Math.cos(0.17), rz = -Math.sin(0.17);
    spawnEnemiesAt(s.combat, [
      [228 + fx * 9 + rx * -3, 108 + fz * 9 + rz * -3],
      [228 + fx * 11 + rx * 1, 108 + fz * 11 + rz * 1],
      [228 + fx * 13 + rx * 4.5, 108 + fz * 13 + rz * 4.5],
    ], [228, 108]);
    s.missions.enemiesLeft = 3; s.missions.spawned = true;
    game.stepWorld(0.8);
    // Fire one shot at the nearest gunman: tracer + muzzle flash + hit
    // burst are meshes, so they survive the final paint.
    fireWeapon(s, Math.sin(game.cameraAngle), Math.cos(game.cameraAngle));
    shortToast(s, 'Gunmen at the docks — take them down!');
  } else if (name === 'steal') {
    // MISSION 1 — First Wheels: the car-steal moment, but the street is
    // alive — traffic rolling past on the road, walkers on the sidewalk.
    // parkedSpots[1] is the staged spot: its camera line is clear of
    // buildings (the most-central spot puts the camera inside a tower).
    const near = s.fleet.parkedSpots[1];
    s.player.x = near.x + 3; s.player.z = near.z + 3; s.player.angle = Math.PI / 2; s.player.inCar = false;
    s.hour = 16.0; s.money = 150; s.ammo = 60;
    game.cameraAngle = Math.PI * 1.15;
    game.stepWorld(0.8);
    // Bright staged paint for the target car (children[0] is the body
    // mesh in every body style) so the steal target pops off the road.
    if (near.mesh.children[0] && near.mesh.children[0].material) {
      near.mesh.children[0].material = near.mesh.children[0].material.clone();
      near.mesh.children[0].material.color.setHex(0xe74c3c);
    }
    // Parked cars sit kerbside on a road line: traffic runs along that
    // line, peds on the sidewalk beside it.
    const alongZ = Math.abs(near.angle) < 0.1;
    if (alongZ) {
      placeTraffic(s, 0, near.x, near.z - 26, 0);
      placeTraffic(s, 1, near.x + 1, near.z + 24, 0);
      placePed(s, 0, near.x + 9, near.z - 12);
      placePed(s, 1, near.x - 9, near.z + 8);
      placePed(s, 2, near.x + 9, near.z + 18);
    } else {
      placeTraffic(s, 0, near.x - 26, near.z, Math.PI / 2);
      placeTraffic(s, 1, near.x + 24, near.z + 1, Math.PI / 2);
      placePed(s, 0, near.x - 12, near.z + 9);
      placePed(s, 1, near.x + 8, near.z - 9);
      placePed(s, 2, near.x + 18, near.z + 9);
    }
    shortToast(s, 'Parked car ahead — press E to steal it.');
  } else if (name === 'dusk') {
    // MISSION 5 — The Commodore (finale): dusk drive downtown toward the
    // penthouse garage, guards and the armoured car ahead, traffic on the
    // avenue, neon on the towers, dusk sky in frame (low camera pitch).
    s.missionIndex = 4; startMission(s, s.scene);
    s.player.x = 0; s.player.z = 140; s.player.angle = Math.PI; s.player.inCar = true;
    s.hour = 20.3; s.money = 2400; s.ammo = 30; s.health = 100;
    const car = s.fleet.parkedSpots[2];
    s.player.car = car; car.isPlayer = true; car.x = 0; car.z = 140; car.angle = Math.PI; car.speed = 0;
    game.cameraAngle = Math.PI;
    game.cameraPitch = 0.08;
    game.stepWorld(1.5);
    // The finale spawns four guards at (0,0); pull two of them up the
    // avenue so they are in frame, and park the armoured car ahead.
    const guards = s.combat.enemies.slice(0, 2);
    const guardSpots = [[-4, 62], [5, 76]];
    guards.forEach((e, i) => {
      e.x = guardSpots[i][0]; e.z = guardSpots[i][1];
      e.angle = Math.atan2(0 - e.x, 140 - e.z);
      e.mesh.position.set(e.x, 0, e.z); e.mesh.rotation.y = e.angle;
    });
    spawnArmouredCar(s.combat, [9, 52]);
    placeTraffic(s, 0, 1.5, 100, Math.PI);
    placeTraffic(s, 1, -2, 116, Math.PI);
    placePed(s, 0, 9, 88);
    placePed(s, 1, -9, 104);
    // The world steps decayed the car to a crawl; restore cruising speed
    // after the steps so the HUD reads a real driving speed.
    car.speed = 28; s.player.carSpeed = 28;
    shortToast(s, "The Commodore's garage — downtown. End this tonight.");
  } else { // chase — the cover shot: MISSION 4 The Getaway, mid-chase.
    // Straight down the x=0 avenue so the chase reads. The car is held
    // still (speed 0) while the world steps — otherwise it drives 20+
    // units and the police staged behind it end up behind the camera.
    // Police are placed AFTER the steps, relative to where the car
    // actually is, and the camera pulls back (24 units, higher pitch)
    // so both units stay in frame. Speed is restored after the steps
    // so the HUD reads a real chase speed.
    s.missionIndex = 3; startMission(s, s.scene);
    s.missions.step = 1; // stash already grabbed: run for the hideout
    s.missions.beacon.position.set(0, 9, 0); s.missions.ring.position.set(0, 0.1, 0);
    s.player.x = 0; s.player.z = -60; s.player.angle = 0; s.player.inCar = true;
    s.hour = 17.8; s.money = 1850; s.ammo = 48; s.health = 100;
    const car = s.fleet.parkedSpots[0];
    s.player.car = car; car.isPlayer = true; car.x = 0; car.z = -60; car.angle = 0; car.speed = 0;
    game.cameraAngle = 0;
    game.cameraPitch = 0.55;
    game.camDistOverride = 24;
    game.stepWorld(1.5);
    // Traffic ahead on the avenue + walkers on the sidewalks.
    placeTraffic(s, 0, 1.5, -25, 0);
    placeTraffic(s, 1, -2, -5, 0);
    placePed(s, 0, 9, -35);
    placePed(s, 1, -9, -15);
    placePed(s, 2, 9, -5);
    // Two police units in frame: one in the right lane just behind Leo,
    // one in the left lane a little further back, both facing his heading.
    clearPolice(s.police, s.scene);
    addWanted(s.police, 3, null);
    s.wanted = 3;
    spawnPoliceUnit(s.scene, s.police, s.player.x + 4, s.player.z - 7, 0);
    spawnPoliceUnit(s.scene, s.police, s.player.x - 4, s.player.z - 11, 0);
    car.speed = 30; s.player.carSpeed = 30;
    s.shake = 0.15;
    shortToast(s, 'Outrun the police — reach the downtown hideout!');
  }
  game.renderFrame();
  game.renderFrame();
  window.__shotReady = true;
}
