// Solmar Bay — an original open-world drive in a seeded coastal city.
// Top-down 2D canvas game: drive, walk, steal cars, outrun the police, run 5 missions.
// Everything here is written for this entry; no Rockstar names, maps or assets.
(function () {
  'use strict';

  // ---------------------------------------------------------------- config
  const WORLD_W = 3200, WORLD_H = 2600;
  const ROAD_W = 92;
  const AVENUES = [220, 620, 1020, 1420, 1820, 2220, 2560]; // vertical roads (x)
  const STREETS = [220, 560, 900, 1240, 1580, 1920, 2280]; // horizontal roads (y)
  const BEACH_X0 = 2720, WATER_X0 = 2970;                 // sand strip, then the bay
  const GARAGE = { x: 330, y: 330 };                       // respawn / start
  const HIDEOUT = { x: 330, y: 2380 };                     // mission 5 destination
  const PIER = { x0: 2920, x1: 3160, y: 1240 };             // wooden pier into the bay
  const SAVE_KEY = 'solmarbay.v4.save';
  const BUST_FINE = 150;
  const PLAYER_TOP = 430, POLICE_TOP = 398, RIVAL_BASE = 315;

  // Seeded RNG so the city is identical every run (mulberry32).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20261118);

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

  // ---------------------------------------------------------------- world
  // Buildings live inside the blocks between roads. Parks replace two blocks.
  const PARK_BLOCKS = [{ ax: 1, ay: 3 }, { ax: 4, ay: 1 }];
  const buildings = [];
  const trees = [];
  const palms = [];

  function isPark(ax, ay) {
    return PARK_BLOCKS.some(p => p.ax === ax && p.ay === ay);
  }

  function buildCity() {
    const palette = ['#c96f4a', '#d9a05b', '#7fa3b8', '#b8b0a0', '#a87f9e', '#8fae8b', '#d98a7a', '#6f8fae'];
    for (let ay = 0; ay < STREETS.length - 1; ay++) {
      for (let ax = 0; ax < AVENUES.length - 1; ax++) {
        const x0 = AVENUES[ax] + ROAD_W / 2 + 14;
        const x1 = AVENUES[ax + 1] - ROAD_W / 2 - 14;
        const y0 = STREETS[ay] + ROAD_W / 2 + 14;
        const y1 = STREETS[ay + 1] - ROAD_W / 2 - 14;
        if (isPark(ax, ay)) {
          for (let i = 0; i < 9; i++) {
            trees.push({ x: x0 + 20 + rng() * (x1 - x0 - 40), y: y0 + 20 + rng() * (y1 - y0 - 40), r: 9 + rng() * 8 });
          }
          continue;
        }
        // One or two buildings per block, with a margin for sidewalks.
        const n = rng() < 0.45 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const bw = (x1 - x0) / n - 22;
          const bh = (y1 - y0) - 22 - (n > 1 ? 0 : 0);
          const bx = x0 + 11 + i * ((x1 - x0) / n);
          const by = y0 + 11;
          const w = Math.max(60, bw), h = Math.max(60, Math.min(bh, 150 + rng() * 90));
          buildings.push({
            x: bx, y: by, w, h,
            color: pick(palette),
            roof: pick(['#5b4a68', '#3e5a6b', '#7a5a4a', '#4a6b5a']),
            floors: 2 + Math.floor(rng() * 5),
          });
        }
      }
    }
    // Palm trees along the beach and the pier road.
    for (let y = 120; y < WORLD_H - 100; y += 130) {
      palms.push({ x: BEACH_X0 + 46 + rng() * 60, y: y + rng() * 40 });
      if (rng() < 0.5) palms.push({ x: BEACH_X0 + 150 + rng() * 60, y: y + 60 + rng() * 40 });
    }
    for (let i = 0; i < 14; i++) {
      trees.push({ x: 100 + rng() * 2400, y: 100 + rng() * 2300, r: 8 + rng() * 7 });
    }
  }

  function onRoad(x, y) {
    for (const ax of AVENUES) if (Math.abs(x - ax) < ROAD_W / 2 + 4) return true;
    for (const sy of STREETS) if (Math.abs(y - sy) < ROAD_W / 2 + 4) return true;
    return false;
  }
  function inWater(x, y) { return x > WATER_X0; }
  function onPier(x, y) {
    return x >= PIER.x0 - 10 && x <= PIER.x1 + 10 && Math.abs(y - PIER.y) < 34;
  }
  function onBeach(x, y) { return x >= BEACH_X0 && x <= WATER_X0 && !onPier(x, y); }
  function buildingAt(x, y, r) {
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }
  // Push a circle out of buildings; returns the building hit (or null).
  function collideBuildings(e, r) {
    let hit = null;
    for (const b of buildings) {
      const cx = clamp(e.x, b.x, b.x + b.w), cy = clamp(e.y, b.y, b.y + b.h);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        hit = b;
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          e.x = cx + (dx / d) * r;
          e.y = cy + (dy / d) * r;
        } else {
          e.y = b.y - r; // shoved straight out (rare centre case)
        }
      }
    }
    return hit;
  }

  // ---------------------------------------------------------------- state
  const state = {
    screen: 'title', // title | playing | paused | briefing | result | busted
    money: 0,
    unlocked: 1,     // highest mission number available (1..5)
    bestRace: 0,     // best race placement (1 is best)
    missionIndex: 0, // 0-based mission currently running
    mission: null,   // live mission runtime object
    wanted: 0,
    wantedCooldown: 0, // seconds since last crime
    decayTimer: 0,
    bustedHold: 0,     // seconds of sustained police contact
    time: 0,
    paused: false,
    muted: false,
    stats: { missionsDone: 0, carsStolen: 0, busted: 0 },
  };

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.money === 'number') state.money = s.money;
      if (typeof s.unlocked === 'number') state.unlocked = clamp(s.unlocked, 1, 5);
      if (typeof s.bestRace === 'number') state.bestRace = s.bestRace;
      if (s.stats && typeof s.stats.missionsDone === 'number') state.stats.missionsDone = s.stats.missionsDone;
      if (s.stats && typeof s.stats.carsStolen === 'number') state.stats.carsStolen = s.stats.carsStolen;
      if (s.stats && typeof s.stats.busted === 'number') state.stats.busted = s.stats.busted;
    } catch (e) { /* fresh start on a bad save */ }
  }
  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money, unlocked: state.unlocked, bestRace: state.bestRace,
        stats: { missionsDone: state.stats.missionsDone, carsStolen: state.stats.carsStolen, busted: state.stats.busted },
      }));
    } catch (e) { /* storage unavailable: keep playing unsaved */ }
  }

  // ---------------------------------------------------------------- entities
  const TRAFFIC_COLORS = ['#e8b64c', '#4a90d9', '#d94a4a', '#7ac74f', '#c9c9c9', '#9b59b6', '#e67e22', '#1abc9c'];
  const PED_COLORS = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#ecf0f1', '#fd79a8'];

  const player = {
    x: GARAGE.x, y: GARAGE.y, angle: 0, speed: 0,
    inCar: true, carId: 0, onFoot: false, walkAngle: 0,
    punchTimer: 0, punchHit: false, invuln: 0,
  };

  const cars = [];      // traffic + rivals + player car share this list
  const peds = [];
  const police = [];
  const particles = [];

  let nextCarId = 1;

  function makeCar(x, y, angle, color, kind) {
    const car = {
      id: nextCarId++, x, y, angle, speed: 0, color,
      kind: kind || 'traffic', // traffic | player | police | rival
      maxSpeed: 150, accel: 90, brake: 220,
      targetSpeed: 0, route: null, routeIdx: 0,
      wobble: rng() * Math.PI * 2, stuck: 0,
    };
    if (kind === 'player') { car.maxSpeed = PLAYER_TOP; car.accel = 210; car.brake = 320; }
    if (kind === 'police') { car.maxSpeed = POLICE_TOP; car.accel = 200; car.brake = 300; }
    cars.push(car);
    return car;
  }

  function spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const vertical = rng() < 0.5;
      let x, y, angle;
      if (vertical) {
        x = pick(AVENUES) + (rng() < 0.5 ? -22 : 22);
        y = 120 + rng() * (WORLD_H - 240);
        angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        x = 120 + rng() * (WORLD_W - 480);
        y = pick(STREETS) + (rng() < 0.5 ? -22 : 22);
        angle = rng() < 0.5 ? 0 : Math.PI;
      }
      const c = makeCar(x, y, angle, pick(TRAFFIC_COLORS), 'traffic');
      c.maxSpeed = 120 + rng() * 60;
      c.targetSpeed = c.maxSpeed;
      c.route = randomRoute(x, y);
    }
  }

  function randomRoute(x, y) {
    // A loop of nearby road intersections to cruise between.
    const pts = [];
    for (let i = 0; i < 6; i++) {
      pts.push({ x: pick(AVENUES), y: pick(STREETS) });
    }
    return pts;
  }

  function spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      const vertical = rng() < 0.5;
      let x, y;
      if (vertical) {
        x = pick(AVENUES) + (rng() < 0.5 ? -58 : 58);
        y = 120 + rng() * (WORLD_H - 240);
      } else {
        x = 120 + rng() * (WORLD_W - 480);
        y = pick(STREETS) + (rng() < 0.5 ? -58 : 58);
      }
      if (buildingAt(x, y, 10) || inWater(x, y)) continue;
      peds.push({
        x, y, angle: rng() * Math.PI * 2, speed: 22 + rng() * 26,
        color: pick(PED_COLORS), state: 'walk', stateT: 0,
        panic: 0, down: 0, bob: rng() * 6,
      });
    }
  }

  function nearestRoadPoint(x, y) {
    let best = null, bestD = 1e9;
    for (const ax of AVENUES) for (const sy of STREETS) {
      const d = dist(x, y, ax, sy);
      if (d < bestD) { bestD = d; best = { x: ax, y: sy }; }
    }
    return best;
  }

  function spawnPolice(n) {
    for (let i = 0; i < n; i++) {
      // Spawn on a road about 900px away, never on top of the player.
      let x, y, tries = 0;
      do {
        const a = rng() * Math.PI * 2;
        x = player.x + Math.cos(a) * 900;
        y = player.y + Math.sin(a) * 900;
        x = clamp(x, 140, WORLD_W - 420);
        y = clamp(y, 140, WORLD_H - 140);
        const rp = nearestRoadPoint(x, y);
        x = rp.x + (rng() < 0.5 ? -22 : 22);
        y = rp.y + (rng() < 0.5 ? -22 : 22);
        tries++;
      } while ((buildingAt(x, y, 18) || dist(x, y, player.x, player.y) < 500) && tries < 12);
      const c = makeCar(x, y, 0, '#f5f5f5', 'police');
      c.maxSpeed = POLICE_TOP;
      police.push(c);
    }
  }

  function clearPolice() {
    for (const p of police) {
      const i = cars.indexOf(p);
      if (i >= 0) cars.splice(i, 1);
    }
    police.length = 0;
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      particles.push({
        x, y, vx: Math.cos(a) * speed * (0.4 + rng() * 0.6),
        vy: Math.sin(a) * speed * (0.4 + rng() * 0.6),
        life: 0.5 + rng() * 0.4, max: 0.9, color, r: 2 + rng() * 3,
      });
    }
  }

  // Steering helper shared by traffic, rivals and police.
  // Returns -1 (steer left), 0, or 1 (steer right) toward a target point.
  // Convention: angle 0 = east, angle grows clockwise on screen (y down).
  // Turning right (D) increases the angle; turning left (A) decreases it.
  function steerToward(car, tx, ty) {
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = wrapAngle(desired - car.angle);
    if (diff > 0.12) return 1;
    if (diff < -0.12) return -1;
    return 0;
  }

  function driveCar(car, dt, steer, throttle) {
    // throttle: 1 accelerate, -1 brake/reverse, 0 coast
    const top = car.maxSpeed;
    if (throttle > 0) car.speed += car.accel * dt;
    else if (throttle < 0) {
      if (car.speed > 12) car.speed -= car.brake * dt;
      else car.speed -= car.accel * 0.55 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 60 * dt;
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    car.speed = clamp(car.speed, -top * 0.42, top);
    const turnRate = 2.5 * clamp(Math.abs(car.speed) / 130, 0.45, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steer * turnRate * dt;
    const prevX = car.x, prevY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 40, WORLD_W - 40);
    car.y = clamp(car.y, 40, WORLD_H - 40);
    if (inWater(car.x, car.y) && !onPier(car.x, car.y)) { car.x = prevX; car.y = prevY; car.speed *= 0.4; }
    const hit = collideBuildings(car, 17);
    if (hit) {
      if (Math.abs(car.speed) > 240) {
        burst(car.x, car.y, '#ffd23e', 8, 160);
        SolmarAudio.crash(Math.min(1, Math.abs(car.speed) / 430));
      }
      car.speed *= 0.35;
    }
    return hit;
  }

  function updateTraffic(dt) {
    for (const c of cars) {
      if (c.kind !== 'traffic') continue;
      if (!c.route || c.route.length === 0) c.route = randomRoute(c.x, c.y);
      const target = c.route[c.routeIdx];
      // Slow down for a tailgater: if the player is right behind, speed up to clear.
      let want = c.targetSpeed;
      const pd = dist(c.x, c.y, player.x, player.y);
      if (pd < 130 && player.inCar && Math.abs(player.speed) > 60) want = c.maxSpeed * 1.35;
      const steer = steerToward(c, target.x, target.y);
      const prevSpeed = c.speed;
      c.speed = approach(c.speed, want, c.accel * dt);
      const turnRate = 2.2 * clamp(Math.abs(c.speed) / 130, 0.25, 1);
      c.angle += steer * turnRate * dt;
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      if (inWater(c.x, c.y) && !onPier(c.x, c.y)) { c.x -= Math.cos(c.angle) * c.speed * dt; c.y -= Math.sin(c.angle) * c.speed * dt; }
      collideBuildings(c, 17);
      if (dist(c.x, c.y, target.x, target.y) < 70) c.routeIdx = (c.routeIdx + 1) % c.route.length;
      // Gentle separation between traffic cars.
      for (const o of cars) {
        if (o === c || o.kind === 'player') continue;
        const d = dist(c.x, c.y, o.x, o.y);
        if (d > 0.01 && d < 34) {
          const push = (34 - d) / 2;
          const nx = (c.x - o.x) / d, ny = (c.y - o.y) / d;
          c.x += nx * push; c.y += ny * push;
        }
      }
      if (Math.abs(c.speed - prevSpeed) < 0.001) c.stuck += dt; else c.stuck = 0;
      if (c.stuck > 4) { c.route = randomRoute(c.x, c.y); c.routeIdx = 0; c.stuck = 0; }
    }
  }

  function approach(v, target, step) {
    if (v < target) return Math.min(target, v + step);
    if (v > target) return Math.max(target, v - step);
    return v;
  }

  function updatePeds(dt) {
    for (const p of peds) {
      p.bob += dt * 8;
      if (p.down > 0) { p.down -= dt; continue; }
      if (p.panic > 0) {
        p.panic -= dt;
        // Flee away from the player.
        const away = Math.atan2(p.y - player.y, p.x - player.x);
        p.angle = away;
        p.x += Math.cos(p.angle) * 95 * dt;
        p.y += Math.sin(p.angle) * 95 * dt;
      } else {
        p.stateT -= dt;
        if (p.stateT <= 0) {
          p.stateT = 2 + rng() * 3;
          p.angle += (rng() - 0.5) * 1.6;
        }
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        // Keep pedestrians on sidewalks: steer back toward roads when lost.
        if (!onRoad(p.x, p.y) && !onBeach(p.x, p.y) && rng() < 0.02) {
          const rp = nearestRoadPoint(p.x, p.y);
          p.angle = Math.atan2(rp.y - p.y, rp.x - p.x);
        }
      }
      p.x = clamp(p.x, 30, WATER_X0 - 10);
      p.y = clamp(p.y, 30, WORLD_H - 30);
      if (buildingAt(p.x, p.y, 8)) { p.angle += Math.PI / 2; p.x -= Math.cos(p.angle) * 30 * dt; p.y -= Math.sin(p.angle) * 30 * dt; }
    }
  }

  function updatePolice(dt) {
    // Wanted level sets how many cruisers are out; spawn or retire to match.
    const want = state.wanted;
    while (police.length < want) spawnPolice(1);
    while (police.length > want) {
      const p = police.pop();
      const i = cars.indexOf(p);
      if (i >= 0) cars.splice(i, 1);
    }
    let touching = false;
    for (const cop of police) {
      const d = dist(cop.x, cop.y, player.x, player.y);
      // Chase: steer toward the player, full throttle, slower than the player.
      const steer = steerToward(cop, player.x, player.y);
      const prevSpeed = cop.speed;
      cop.speed = approach(cop.speed, cop.maxSpeed, cop.accel * dt);
      const turnRate = 2.4 * clamp(Math.abs(cop.speed) / 130, 0.45, 1);
      cop.angle += steer * turnRate * dt;
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      collideBuildings(cop, 17);
      cop.x = clamp(cop.x, 40, WORLD_W - 40);
      cop.y = clamp(cop.y, 40, WORLD_H - 40);
      // Police never steal or gift speed in a collision: resolve overlap
      // positionally only, so they cannot pin the player against a wall.
      if (player.inCar) {
        const pd = dist(cop.x, cop.y, player.x, player.y);
        if (pd < 36 && pd > 0.01) {
          const push = (36 - pd) / 2;
          const nx = (player.x - cop.x) / pd, ny = (player.y - cop.y) / pd;
          player.x += nx * push; player.y += ny * push;
          cop.x -= nx * push; cop.y -= ny * push;
          if (Math.abs(player.speed - prevSpeed) > 60) {
            burst(player.x, player.y, '#9be7ff', 5, 120);
          }
        }
        if (dist(cop.x, cop.y, player.x, player.y) < 34) touching = true;
      } else {
        if (dist(cop.x, cop.y, player.x, player.y) < 26) touching = true;
      }
    }
    // BUSTED needs a sustained 1.2s hold, never an instant touch.
    if (touching && state.wanted > 0) {
      state.bustedHold += dt;
      if (state.bustedHold >= 1.2) doBusted();
    } else {
      state.bustedHold = Math.max(0, state.bustedHold - dt * 2);
    }
  }

  // ---------------------------------------------------------------- player
  const keys = {};
  let playerCar = null;

  function resetPlayerToGarage() {
    player.x = GARAGE.x; player.y = GARAGE.y; player.angle = 0; player.speed = 0;
    player.inCar = true;
    if (!playerCar) playerCar = makeCar(GARAGE.x, GARAGE.y, 0, '#ff6b4a', 'player');
    playerCar.x = GARAGE.x; playerCar.y = GARAGE.y; playerCar.angle = 0; playerCar.speed = 0;
    player.carId = playerCar.id;
  }

  function updatePlayer(dt) {
    if (player.invuln > 0) player.invuln -= dt;
    if (player.punchTimer > 0) player.punchTimer -= dt;

    if (player.inCar) {
      const steer = (keys['a'] || keys['arrowleft'] ? -1 : 0) + (keys['d'] || keys['arrowright'] ? 1 : 0);
      const throttle = (keys['w'] || keys['arrowup'] ? 1 : 0) + (keys['s'] || keys['arrowdown'] ? -1 : 0);
      const before = Math.abs(player.speed);
      driveCar(playerCar, dt, steer, throttle);
      player.x = playerCar.x; player.y = playerCar.y; player.angle = playerCar.angle;
      player.speed = playerCar.speed;
      // Traffic collisions: only HARD crashes raise wanted.
      for (const c of cars) {
        if (c.kind !== 'traffic' && c.kind !== 'rival') continue;
        const d = dist(player.x, player.y, c.x, c.y);
        if (d < 36 && d > 0.01) {
          const rel = Math.abs(player.speed - c.speed);
          const nx = (player.x - c.x) / d, ny = (player.y - c.y) / d;
          const push = (36 - d) / 2;
          player.x += nx * push; player.y += ny * push;
          c.x -= nx * push; c.y -= ny * push;
          playerCar.x = player.x; playerCar.y = player.y;
          if (rel > 320) {
            addWanted(1, 'hard crash');
            burst(player.x, player.y, '#ffd23e', 10, 180);
            SolmarAudio.crash(Math.min(1, rel / 430));
            player.speed *= 0.55; playerCar.speed = player.speed;
            c.speed *= 0.4;
          } else if (rel > 120) {
            player.speed *= 0.8; playerCar.speed = player.speed;
            SolmarAudio.crash(0.25);
          }
          if (before > 200 && Math.abs(player.speed) < before * 0.5) {
            // a real shunt: nearby pedestrians panic
            for (const p of peds) if (dist(p.x, p.y, player.x, player.y) < 260) p.panic = 2;
          }
        }
      }
      // Running over a pedestrian on foot-level contact.
      for (const p of peds) {
        if (p.down > 0) continue;
        if (dist(player.x, player.y, p.x, p.y) < 20 && Math.abs(player.speed) > 40) {
          p.down = 2.5;
          p.panic = 0;
          addWanted(1, 'pedestrian hit');
          burst(p.x, p.y, '#ff8a7a', 8, 140);
          SolmarAudio.crash(0.5);
          for (const q of peds) if (q !== p && dist(q.x, q.y, p.x, p.y) < 300) q.panic = 3;
        }
      }
    } else {
      // On foot: WASD walks, F punches, E gets back in a car.
      let mx = 0, my = 0;
      if (keys['w'] || keys['arrowup']) my -= 1;
      if (keys['s'] || keys['arrowdown']) my += 1;
      if (keys['a'] || keys['arrowleft']) mx -= 1;
      if (keys['d'] || keys['arrowright']) mx += 1;
      if (mx || my) {
        const len = Math.hypot(mx, my);
        player.walkAngle = Math.atan2(my / len, mx / len);
        const sp = 165;
        player.x += (mx / len) * sp * dt;
        player.y += (my / len) * sp * dt;
        player.x = clamp(player.x, 30, WATER_X0 - 10);
        player.y = clamp(player.y, 30, WORLD_H - 30);
        if (inWater(player.x, player.y) && !onPier(player.x, player.y)) {
          player.x -= (mx / len) * sp * dt; player.y -= (my / len) * sp * dt;
        }
        collideBuildings(player, 10);
      }
      player.speed = 0;
      // Punch: knock down a pedestrian in front of you (combat).
      if (player.punchTimer > 0.25 && !player.punchHit) {
        player.punchHit = true;
        const px = player.x + Math.cos(player.walkAngle) * 26;
        const py = player.y + Math.sin(player.walkAngle) * 26;
        for (const p of peds) {
          if (p.down > 0) continue;
          if (dist(px, py, p.x, p.y) < 24) {
            p.down = 3;
            burst(p.x, p.y, '#ffd23e', 6, 120);
            SolmarAudio.crash(0.3);
            if (police.some(c => dist(c.x, c.y, player.x, player.y) < 700)) addWanted(1, 'assault seen');
            for (const q of peds) if (q !== p && dist(q.x, q.y, p.x, p.y) < 260) q.panic = 2.5;
            break;
          }
        }
      }
      if (player.punchTimer <= 0) player.punchHit = false;
    }
    SolmarAudio.setEngine(Math.abs(player.speed) / PLAYER_TOP, player.inCar);
  }

  function tryEnterExitCar() {
    if (player.inCar) {
      // Get out: leave the car where it is.
      player.inCar = false;
      player.walkAngle = player.angle;
      player.x += Math.cos(player.angle + Math.PI / 2) * 26;
      player.y += Math.sin(player.angle + Math.PI / 2) * 26;
      player.speed = 0;
      return;
    }
    // Find the nearest car within reach (own car, parked traffic, or a moving one).
    let best = null, bestD = 62;
    for (const c of cars) {
      if (c.kind === 'police') continue;
      const d = dist(player.x, player.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) { toast('No car in reach — walk closer'); return; }
    const wasTraffic = best.kind === 'traffic' || best.kind === 'rival';
    if (wasTraffic) {
      state.stats.carsStolen++;
      best.kind = 'player';
      best.maxSpeed = PLAYER_TOP;
      best.accel = 210;
      best.brake = 320;
      // Stealing in front of the police is a crime; out of sight, it is just a car.
      if (police.some(c => dist(c.x, c.y, player.x, player.y) < 700)) {
        addWanted(1, 'car stolen');
        toast('STOLEN — the police saw you!');
      } else {
        toast('Car taken. Drive!');
      }
      // Any traffic that loses its driver stops where it is.
      if (playerCar && playerCar !== best) {
        playerCar.kind = 'traffic';
        playerCar.maxSpeed = 130;
        playerCar.targetSpeed = 0;
        playerCar.speed = 0;
        playerCar.route = randomRoute(playerCar.x, playerCar.y);
      }
    }
    playerCar = best;
    player.carId = best.id;
    player.inCar = true;
    player.x = best.x; player.y = best.y; player.angle = best.angle; player.speed = best.speed;
    SolmarAudio.pickup();
  }

  // ---------------------------------------------------------------- wanted
  function addWanted(n, reason) {
    if (state.wanted >= 5) return;
    state.wanted = Math.min(5, state.wanted + n);
    state.wantedCooldown = 0;
    state.decayTimer = 0;
    if (reason) toast('Wanted level ' + state.wanted + ' — ' + reason);
  }

  function updateWanted(dt) {
    if (state.wanted === 0) return;
    state.wantedCooldown += dt;
    SolmarAudio.setSiren(true);
    // Decay: 12s clean, then one star fades every 8s.
    if (state.wantedCooldown > 12) {
      state.decayTimer += dt;
      if (state.decayTimer >= 8) {
        state.decayTimer = 0;
        state.wanted = Math.max(0, state.wanted - 1);
        if (state.wanted === 0) SolmarAudio.setSiren(false);
      }
    }
  }

  function doBusted() {
    state.stats.busted++;
    const fine = Math.min(BUST_FINE, state.money);
    state.money -= fine;
    state.wanted = 0;
    state.bustedHold = 0;
    state.decayTimer = 0;
    state.wantedCooldown = 0;
    SolmarAudio.setSiren(false);
    SolmarAudio.bustedSting();
    clearPolice();
    resetPlayerToGarage();
    saveGame();
    // The current mission restarts from its beginning.
    if (state.mission) startMission(state.missionIndex, true);
    showScreen('busted');
    document.getElementById('busted-fine').textContent = 'Fine paid: $' + fine + ' — cash now $' + state.money;
  }

  // ---------------------------------------------------------------- missions
  const MISSIONS = [
    {
      name: 'Welcome to Solmar',
      pay: 100,
      brief: 'Marisol: "Rio, you are new here. Prove you can drive. Hit the three checkpoints across town — fast, but do not wreck my city."',
      setup(m) {
        m.targets = [
          { x: 1420, y: 560, label: 'Checkpoint 1 — Marina Ave', r: 46 },
          { x: 2220, y: 1580, label: 'Checkpoint 2 — Palm Row', r: 46 },
          { x: 620, y: 1920, label: 'Checkpoint 3 — Old Town', r: 46 },
        ];
        m.stage = 0;
      },
      objective(m) { return m.targets[m.stage].label + ' (' + (m.stage + 1) + '/3)'; },
      point(m) { return m.targets[m.stage]; },
      onReach(m) {
        SolmarAudio.beep();
        burst(m.targets[m.stage].x, m.targets[m.stage].y, '#7dff9b', 14, 170);
        m.stage++;
        if (m.stage >= m.targets.length) return completeMission(m);
        toast('Checkpoint ' + m.stage + '/3 — next: ' + m.targets[m.stage].label);
      },
    },
    {
      name: 'Cab Business',
      pay: 140,
      brief: 'Marisol: "The cab firm needs a driver. Pick up two fares and drop them off. Fast legs earn tips — the meter loves speed, the passengers love smooth driving."',
      setup(m) {
        m.fares = [
          { px: 1020, py: 1240, dx: 2220, dy: 560, label: 'Fare 1 — pick up at Central', tip: 0, legStart: 0 },
          { px: 1820, py: 1920, dx: 620, dy: 900, label: 'Fare 2 — pick up at the Docks', tip: 0, legStart: 0 },
        ];
        m.stage = 0; // 0 = drive to pickup 1, 1 = drive to drop 1, 2 = pickup 2, 3 = drop 2
        m.tips = 0;
        m.farePed = null;
        spawnFarePed(m, 0);
      },
      objective(m) {
        const f = m.fares[Math.floor(m.stage / 2)];
        return m.stage % 2 === 0 ? 'Pick up: ' + f.label : 'Drop off the fare — drive smoothly, tip for speed';
      },
      point(m) {
        const f = m.fares[Math.floor(m.stage / 2)];
        return m.stage % 2 === 0 ? { x: f.px, y: f.py, label: 'Pick up the fare', r: 44 } : { x: f.dx, y: f.dy, label: 'Drop off here', r: 48 };
      },
      onReach(m) {
        const f = m.fares[Math.floor(m.stage / 2)];
        if (m.stage % 2 === 0) {
          // Pickup: the fare gets in.
          SolmarAudio.pickup();
          if (m.farePed) { const i = peds.indexOf(m.farePed); if (i >= 0) peds.splice(i, 1); m.farePed = null; }
          m.legStart = state.time;
          m.stage++;
          toast('Fare aboard — take them to the drop-off');
        } else {
          const legTime = state.time - m.legStart;
          const tip = legTime < 45 ? 20 : legTime < 70 ? 10 : 0;
          m.tips += tip;
          SolmarAudio.beep();
          burst(f.dx, f.dy, '#7dff9b', 14, 170);
          m.stage++;
          toast(tip > 0 ? 'Drop-off done — $' + tip + ' tip!' : 'Drop-off done');
          if (m.stage >= 4) return completeMission(m, m.tips);
          spawnFarePed(m, Math.floor(m.stage / 2));
        }
      },
    },
    {
      name: 'Bayfront GP',
      pay: 250,
      brief: 'Marisol: "Street race, Bayfront loop. Two laps, eight gates, three rivals. Win it and the whole town talks about Rio. Payout depends on where you finish."',
      setup(m) {
        m.gates = [
          { x: 2560, y: 560 }, { x: 2560, y: 1240 }, { x: 2560, y: 1920 }, { x: 2220, y: 1920 },
          { x: 1820, y: 1920 }, { x: 1820, y: 1240 }, { x: 2220, y: 1240 }, { x: 2220, y: 560 },
        ];
        m.lap = 1; m.gateIdx = 0;
        m.rivals = [];
        const colors = ['#ffd23e', '#4a90d9', '#9b59b6'];
        const starts = [{ x: 2560, y: 480 }, { x: 2560, y: 520 }, { x: 2560, y: 600 }];
        for (let i = 0; i < 3; i++) {
          const r = makeCar(starts[i].x, starts[i].y, Math.PI / 2, colors[i], 'rival');
          r.maxSpeed = RIVAL_BASE + i * 6;
          r.accel = 185;
          r.gateIdx = 0; r.lap = 1;
          m.rivals.push(r);
        }
        // Player starts just behind the grid.
        playerCar.x = 2560; playerCar.y = 440; playerCar.angle = Math.PI / 2; playerCar.speed = 0;
        player.x = 2560; player.y = 440; player.angle = Math.PI / 2; player.speed = 0;
      },
      objective(m) { return 'Bayfront GP — Lap ' + m.lap + '/2, Gate ' + (m.gateIdx + 1) + '/8'; },
      point(m) { return { x: m.gates[m.gateIdx].x, y: m.gates[m.gateIdx].y, label: 'Race gate ' + (m.gateIdx + 1), r: 60 }; },
      onReach(m) {
        SolmarAudio.beep();
        burst(m.gates[m.gateIdx].x, m.gates[m.gateIdx].y, '#ffd23e', 10, 150);
        m.gateIdx++;
        if (m.gateIdx >= m.gates.length) {
          m.gateIdx = 0; m.lap++;
          if (m.lap > 2) return finishRace(m);
          toast('Lap 2 — final lap!');
        }
      },
    },
    {
      name: 'Hot Delivery',
      pay: 240,
      brief: 'Marisol: "Three packages, three addresses, one very impatient client. Eighty dollars a drop. Do not ask what is in the boxes."',
      setup(m) {
        m.targets = [
          { x: 620, y: 560, label: 'Drop 1 — Blue House, North Ave', r: 46 },
          { x: 1820, y: 900, label: 'Drop 2 — Corner Store, Palm Row', r: 46 },
          { x: 1020, y: 2280, label: 'Drop 3 — The Pier Kiosk', r: 46 },
        ];
        m.stage = 0;
      },
      objective(m) { return m.targets[m.stage].label + ' (' + (m.stage + 1) + '/3)'; },
      point(m) { return m.targets[m.stage]; },
      onReach(m) {
        SolmarAudio.pickup();
        burst(m.targets[m.stage].x, m.targets[m.stage].y, '#7dff9b', 14, 170);
        m.stage++;
        if (m.stage >= m.targets.length) return completeMission(m);
        toast('Delivered ' + m.stage + '/3 — $80 each');
      },
    },
    {
      name: 'The Big Escape',
      pay: 400,
      brief: 'Marisol: "The package is on the Pier and the whole PD is awake — three stars before you even start. Grab it, lose the cops, reach the Hideout. Do not get caught."',
      setup(m) {
        m.targets = [
          { x: PIER.x1 - 30, y: PIER.y, label: 'Grab the package on the Pier', r: 44 },
          { x: HIDEOUT.x, y: HIDEOUT.y, label: 'Reach the Hideout — lose the cops', r: 52 },
        ];
        m.stage = 0;
        state.wanted = 3;
        state.wantedCooldown = 0;
        state.decayTimer = 0;
      },
      objective(m) { return m.targets[m.stage].label + (m.stage === 1 ? ' (wanted ' + state.wanted + '★)' : ''); },
      point(m) { return m.targets[m.stage]; },
      onReach(m) {
        if (m.stage === 0) {
          SolmarAudio.pickup();
          burst(PIER.x1 - 30, PIER.y, '#ffd23e', 16, 180);
          m.stage = 1;
          toast('Package grabbed — now LOSE THEM and reach the Hideout');
        } else {
          // Finish only counts if the player is not actively busted; wanted may remain.
          completeMission(m);
        }
      },
    },
  ];

  function spawnFarePed(m, fareIdx) {
    const f = m.fares[fareIdx];
    const ped = {
      x: f.px, y: f.py, angle: 0, speed: 0, color: '#ffd23e',
      state: 'fare', stateT: 0, panic: 0, down: 0, bob: 0,
    };
    peds.push(ped);
    m.farePed = ped;
  }

  function raceProgress(m, isPlayer, rival) {
    if (isPlayer) return m.lap * 100 + m.gateIdx * 10 - dist(player.x, player.y, m.gates[m.gateIdx].x, m.gates[m.gateIdx].y) / 1000;
    return rival.lap * 100 + rival.gateIdx * 10 - dist(rival.x, rival.y, m.gates[rival.gateIdx].x, m.gates[rival.gateIdx].y) / 1000;
  }

  function racePlacement(m) {
    const mine = raceProgress(m, true, null);
    let place = 1;
    for (const r of m.rivals) if (raceProgress(m, false, r) > mine) place++;
    return place;
  }

  function finishRace(m) {
    const place = racePlacement(m);
    const payouts = { 1: 250, 2: 120, 3: 60, 4: 30 };
    const pay = payouts[place] || 30;
    state.bestRace = state.bestRace === 0 ? place : Math.min(state.bestRace, place);
    for (const r of m.rivals) {
      const i = cars.indexOf(r);
      if (i >= 0) cars.splice(i, 1);
    }
    m.rivals = [];
    completeMission(m, 0, pay, 'Finished ' + place + (place === 1 ? 'st — you won the Bayfront GP!' : place === 2 ? 'nd — so close to the win.' : place === 3 ? 'rd — the podium, barely.' : 'th — the rivals were faster today.'));
  }

  function startMission(index, silentRestart) {
    const def = MISSIONS[index];
    if (!def) return;
    state.missionIndex = index;
    const m = { def, index, stage: 0, time: 0 };
    state.mission = m;
    def.setup(m);
    if (!silentRestart) showScreen('playing');
    updateHUD();
  }

  function completeMission(m, tips, overridePay, extraText) {
    const pay = (overridePay != null ? overridePay : m.def.pay) + (tips || 0);
    state.money += pay;
    state.stats.missionsDone++;
    if (state.missionIndex + 1 < MISSIONS.length) {
      state.unlocked = Math.max(state.unlocked, state.missionIndex + 2);
    } else {
      state.unlocked = 5;
    }
    state.mission = null;
    saveGame();
    SolmarAudio.winJingle();
    showScreen('result');
    document.getElementById('result-head').textContent = 'MISSION COMPLETE';
    document.getElementById('result-title').textContent = m.def.name;
    document.getElementById('result-text').textContent =
      (extraText || 'Nice driving, Rio. Marisol is impressed.') + ' You earned $' + pay + '. Cash: $' + state.money + '.';
    document.getElementById('btn-result-next').textContent =
      state.missionIndex + 1 < MISSIONS.length ? 'NEXT MISSION' : 'FREE ROAM';
  }

  function updateMission(dt) {
    const m = state.mission;
    if (!m) return;
    m.time += dt;
    const def = m.def;
    // Race rivals drive the gates with rubber-banding: they stay close, but a
    // competent driver wins — their top speed is capped below the player's.
    if (m.rivals) {
      for (const r of m.rivals) {
        const gate = m.gates[r.gateIdx];
        const steer = steerToward(r, gate.x, gate.y);
        // Rubber-band: slow a rival far ahead, lift one far behind — never above 96% of player top.
        const prog = raceProgress(m, false, r) - raceProgress(m, true, null);
        let top = r.maxSpeed;
        if (prog > 6) top = r.maxSpeed * 0.88;
        else if (prog < -6) top = Math.min(RIVAL_BASE * 1.04, PLAYER_TOP * 0.96);
        r.speed = approach(r.speed, top, r.accel * dt);
        const turnRate = 2.3 * clamp(Math.abs(r.speed) / 130, 0.45, 1);
        r.angle += steer * turnRate * dt;
        r.x += Math.cos(r.angle) * r.speed * dt;
        r.y += Math.sin(r.angle) * r.speed * dt;
        collideBuildings(r, 17);
        if (dist(r.x, r.y, gate.x, gate.y) < 60) {
          r.gateIdx++;
          if (r.gateIdx >= m.gates.length) { r.gateIdx = 0; r.lap++; }
        }
      }
    }
    // Reaching the current objective point.
    const pt = def.point(m);
    const reachR = pt.r || 46;
    const d = dist(player.x, player.y, pt.x, pt.y);
    if (d < reachR) def.onReach(m);
  }

  // ---------------------------------------------------------------- render
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');
  const cam = { x: 0, y: 0 };
  let waveT = 0;
  let titlePan = 0;

  function drawCar(c, x, y, angle, color, kind) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.roundRect(-19, -9, 38, 18, 5); ctx.fill();
    // Body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-20, -11, 40, 22, 6); ctx.fill();
    // Cabin + windshield
    ctx.fillStyle = 'rgba(20,40,55,0.9)';
    ctx.beginPath(); ctx.roundRect(-6, -9, 14, 18, 3); ctx.fill();
    ctx.fillStyle = 'rgba(160,220,255,0.85)';
    ctx.beginPath(); ctx.roundRect(8, -8, 5, 16, 2); ctx.fill();
    // Headlights / taillights
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(18, -9, 2, 4); ctx.fillRect(18, 5, 2, 4);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-20, -9, 2, 4); ctx.fillRect(-20, 5, 2, 4);
    if (kind === 'police') {
      ctx.fillStyle = '#111';
      ctx.fillRect(-2, -11, 6, 22);
      const flash = Math.floor(state.time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
      ctx.beginPath(); ctx.arc(-1, -6, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
      ctx.beginPath(); ctx.arc(-1, 6, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.down > 0) {
      ctx.rotate(1.2);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      const bob = Math.sin(p.bob) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 4, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, bob * 0.3, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath(); ctx.arc(0, -5 + bob * 0.3, 3.4, 0, Math.PI * 2); ctx.fill();
      if (p.state === 'fare') {
        ctx.fillStyle = '#ffd23e';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, -14);
      }
    }
    ctx.restore();
  }

  function render(dt) {
    waveT += dt;
    // Camera follows the player with a little velocity lookahead; on the title
    // screen it drifts slowly across the city as a living backdrop.
    if (state.screen === 'title' || state.screen === 'missions' || state.screen === 'howto') {
      titlePan += dt * 26;
      cam.x = (titlePan % (WORLD_W - 1280));
      cam.y = 300 + Math.sin(titlePan * 0.0009) * 260;
    } else {
      const lookX = player.inCar ? Math.cos(player.angle) * player.speed * 0.22 : 0;
      const lookY = player.inCar ? Math.sin(player.angle) * player.speed * 0.22 : 0;
      cam.x = clamp(player.x + lookX - 640, 0, WORLD_W - 1280);
      cam.y = clamp(player.y + lookY - 360, 0, WORLD_H - 720);
    }

    // Ground: grass, then sand, then the bay.
    ctx.fillStyle = '#69a85e';
    ctx.fillRect(0, 0, 1280, 720);
    const sx0 = BEACH_X0 - cam.x, wx0 = WATER_X0 - cam.x;
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(Math.max(0, sx0), 0, Math.max(0, Math.min(1280, wx0) - Math.max(0, sx0)), 720);
    ctx.fillStyle = '#2f8fb8';
    ctx.fillRect(Math.max(0, wx0), 0, 1280 - Math.max(0, wx0), 720);
    // Animated wave lines on the water.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const wy = ((i * 173 + waveT * 26) % 760) - 20;
      ctx.beginPath();
      for (let x = Math.max(0, wx0); x < 1280; x += 24) {
        const yy = wy + Math.sin(x * 0.02 + waveT * 1.4 + i) * 5;
        if (x === Math.max(0, wx0)) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // Sidewalks (pale border around each block).
    ctx.fillStyle = '#c9c2b2';
    for (let ay = 0; ay < STREETS.length - 1; ay++) {
      for (let ax = 0; ax < AVENUES.length - 1; ax++) {
        const x0 = AVENUES[ax] + ROAD_W / 2 - 8 - cam.x;
        const y0 = STREETS[ay] + ROAD_W / 2 - 8 - cam.y;
        const w = (AVENUES[ax + 1] - AVENUES[ax]) - ROAD_W + 16;
        const h = (STREETS[ay + 1] - STREETS[ay]) - ROAD_W + 16;
        if (x0 > 1280 || y0 > 720 || x0 + w < 0 || y0 + h < 0) continue;
        if (isPark(ax, ay)) {
          ctx.fillStyle = '#4e8f4a';
          ctx.fillRect(x0, y0, w, h);
          ctx.fillStyle = '#c9c2b2';
        } else {
          ctx.fillRect(x0, y0, w, h);
        }
      }
    }

    // Roads.
    ctx.fillStyle = '#3a3f46';
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2 - cam.x, 0, ROAD_W, 720);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2 - cam.y, 1280, ROAD_W);
    // Centre dashes.
    ctx.strokeStyle = 'rgba(255,214,90,0.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]);
    for (const ax of AVENUES) {
      ctx.beginPath(); ctx.moveTo(ax - cam.x, 0); ctx.lineTo(ax - cam.x, 720); ctx.stroke();
    }
    for (const sy of STREETS) {
      ctx.beginPath(); ctx.moveTo(0, sy - cam.y); ctx.lineTo(1280, sy - cam.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Pier: wooden planks into the bay.
    ctx.fillStyle = '#8a6b4a';
    ctx.fillRect(PIER.x0 - cam.x, PIER.y - 30 - cam.y, PIER.x1 - PIER.x0, 60);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let x = PIER.x0; x < PIER.x1; x += 18) {
      ctx.beginPath(); ctx.moveTo(x - cam.x, PIER.y - 30 - cam.y); ctx.lineTo(x - cam.x, PIER.y + 30 - cam.y); ctx.stroke();
    }
    ctx.fillStyle = '#6b4f33';
    ctx.fillRect(PIER.x1 - 8 - cam.x, PIER.y - 42 - cam.y, 16, 84);

    // Buildings with roof colour, windows and a soft shadow.
    for (const b of buildings) {
      const bx = b.x - cam.x, by = b.y - cam.y;
      if (bx > 1280 || by > 720 || bx + b.w < 0 || by + b.h < 0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(bx + 5, by + 7, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(bx, by, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(bx + 4, by + 4, b.w - 8, b.h - 8);
      ctx.fillStyle = 'rgba(255,244,180,0.75)';
      const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 30));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          ctx.fillRect(bx + 9 + i * ((b.w - 18) / cols), by + 9 + j * ((b.h - 18) / rows), 7, 9);
        }
      }
    }

    // Trees and palms.
    for (const t of trees) {
      const tx = t.x - cam.x, ty = t.y - cam.y;
      if (tx < -20 || tx > 1300 || ty < -20 || ty > 740) continue;
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath(); ctx.arc(tx, ty, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4e8f4a';
      ctx.beginPath(); ctx.arc(tx - 3, ty - 3, t.r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    for (const p of palms) {
      const px = p.x - cam.x, py = p.y - cam.y;
      if (px < -20 || px > 1300 || py < -20 || py > 740) continue;
      ctx.strokeStyle = '#7a5a3a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 4, py - 16); ctx.stroke();
      ctx.fillStyle = '#3f9e4d';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        ctx.beginPath();
        ctx.ellipse(px + 4 + Math.cos(a) * 11, py - 16 + Math.sin(a) * 6, 11, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mission objective marker (pulsing ring + beacon).
    if (state.mission) {
      const pt = state.mission.def.point(state.mission);
      const px = pt.x - cam.x, py = pt.y - cam.y;
      const pulse = 1 + Math.sin(state.time * 5) * 0.15;
      ctx.strokeStyle = '#ff6b4a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(px, py, (pt.r || 46) * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,107,74,0.18)';
      ctx.beginPath(); ctx.arc(px, py, (pt.r || 46) * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6b4a';
      ctx.beginPath(); ctx.moveTo(px, py - 66); ctx.lineTo(px - 9, py - 46); ctx.lineTo(px + 9, py - 46); ctx.closePath(); ctx.fill();
      // Edge arrow when the objective is off-screen.
      const arrow = document.getElementById('beacon-arrow');
      if (px < -20 || px > 1300 || py < -20 || py > 740) {
        const ang = Math.atan2(pt.y - player.y, pt.x - player.x);
        arrow.style.display = 'block';
        arrow.style.left = (640 + Math.cos(ang) * 260) + 'px';
        arrow.style.top = (360 + Math.sin(ang) * 200) + 'px';
        arrow.style.transform = 'translate(-50%,-50%) rotate(' + (ang * 180 / Math.PI + 90) + 'deg)';
      } else {
        arrow.style.display = 'none';
      }
    } else {
      document.getElementById('beacon-arrow').style.display = 'none';
    }

    // Hideout + garage markers in free roam.
    if (!state.mission) {
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GARAGE', GARAGE.x - cam.x, GARAGE.y - 30 - cam.y);
      ctx.fillText('HIDEOUT', HIDEOUT.x - cam.x, HIDEOUT.y - 30 - cam.y);
    }

    // Pedestrians, traffic, police, player.
    for (const p of peds) drawPed(p);
    for (const c of cars) {
      if (c.kind === 'player') continue;
      drawCar(c, c.x - cam.x, c.y - cam.y, c.angle, c.color, c.kind);
    }
    // Player: on foot as a walker, in a car as the car.
    if (player.inCar) {
      drawCar(playerCar, player.x - cam.x, player.y - cam.y, player.angle, '#ff6b4a', 'player');
    } else {
      ctx.save();
      ctx.translate(player.x - cam.x, player.y - cam.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 5, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6b4a';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath(); ctx.arc(0, -7, 4.4, 0, Math.PI * 2); ctx.fill();
      if (player.punchTimer > 0) {
        ctx.strokeStyle = '#ffd23e';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(Math.cos(player.walkAngle) * 16, Math.sin(player.walkAngle) * 16, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Particles.
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x - cam.x, pt.y - cam.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    renderMinimap();
  }

  function renderMinimap() {
    const sx = 190 / WORLD_W, sy = 156 / WORLD_H;
    mctx.fillStyle = '#123243';
    mctx.fillRect(0, 0, 190, 156);
    mctx.fillStyle = '#69a85e';
    mctx.fillRect(0, 0, 190, 156);
    mctx.fillStyle = '#e8d29a';
    mctx.fillRect(BEACH_X0 * sx, 0, (WATER_X0 - BEACH_X0) * sx, 156);
    mctx.fillStyle = '#2f8fb8';
    mctx.fillRect(WATER_X0 * sx, 0, 190 - WATER_X0 * sx, 156);
    mctx.strokeStyle = '#3a3f46';
    mctx.lineWidth = 3;
    for (const ax of AVENUES) { mctx.beginPath(); mctx.moveTo(ax * sx, 0); mctx.lineTo(ax * sx, 156); mctx.stroke(); }
    for (const sy2 of STREETS) { mctx.beginPath(); mctx.moveTo(0, sy2 * sy); mctx.lineTo(190, sy2 * sy); mctx.stroke(); }
    // Buildings as dots.
    mctx.fillStyle = 'rgba(40,40,50,0.7)';
    for (const b of buildings) mctx.fillRect(b.x * sx, b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    // Objective.
    if (state.mission) {
      const pt = state.mission.def.point(state.mission);
      mctx.fillStyle = '#ff6b4a';
      mctx.beginPath(); mctx.arc(pt.x * sx, pt.y * sy, 4 + Math.sin(state.time * 5) * 1.2, 0, Math.PI * 2); mctx.fill();
    }
    // Police as blue dots.
    mctx.fillStyle = '#2d6bff';
    for (const c of police) { mctx.beginPath(); mctx.arc(c.x * sx, c.y * sy, 3, 0, Math.PI * 2); mctx.fill(); }
    // Player arrow.
    mctx.save();
    mctx.translate(player.x * sx, player.y * sy);
    mctx.rotate(player.inCar ? player.angle : player.walkAngle);
    mctx.fillStyle = '#fff';
    mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -4.5); mctx.lineTo(-5, 4.5); mctx.closePath(); mctx.fill();
    mctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function updateHUD() {
    document.getElementById('cash').textContent = '$' + state.money;
    const starsEl = document.getElementById('stars');
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += i < state.wanted ? '★' : '<span class="off">★</span>';
    }
    starsEl.innerHTML = html;
    const m = state.mission;
    if (m) {
      document.getElementById('objective').textContent = '▶ ' + m.def.name + ' — ' + m.def.objective(m);
      const timerEl = document.getElementById('mission-timer');
      if (m.def === MISSIONS[2]) {
        timerEl.textContent = 'Place: ' + racePlacement(m) + (racePlacement(m) === 1 ? 'st' : racePlacement(m) === 2 ? 'nd' : racePlacement(m) === 3 ? 'rd' : 'th') + '  •  Lap ' + m.lap + '/2';
      } else if (m.def === MISSIONS[1]) {
        timerEl.textContent = 'Tips earned: $' + (m.tips || 0);
      } else {
        timerEl.textContent = '';
      }
    } else {
      document.getElementById('objective').textContent = 'Free roam — press MISSIONS on the title screen, or drive to the next job.';
      document.getElementById('mission-timer').textContent = '';
    }
    const speedEl = document.getElementById('speed-num');
    speedEl.textContent = String(Math.round(Math.abs(player.speed) * 0.55));
    document.getElementById('gear').textContent = player.inCar
      ? (player.speed > 4 ? 'DRIVE' : player.speed < -4 ? 'REVERSE' : 'PARK')
      : 'ON FOOT';
    document.getElementById('hint').textContent = player.inCar
      ? 'E exit car  •  Space honk  •  P pause'
      : 'E enter car  •  F punch  •  P pause';
  }

  // ---------------------------------------------------------------- screens
  const SCREENS = ['title', 'missions', 'howto', 'briefing', 'paused', 'result', 'busted'];
  function showScreen(name) {
    state.screen = name;
    for (const s of SCREENS) {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== name);
    }
    document.getElementById('hud').classList.toggle('hidden', name !== 'playing' && name !== 'paused');
    if (name === 'playing') state.paused = false;
    if (name === 'paused') state.paused = true;
    if (name === 'title') {
      document.getElementById('btn-continue').disabled = state.money === 0 && state.unlocked <= 1 && state.stats.missionsDone === 0;
    }
  }

  function openBriefing(index) {
    const def = MISSIONS[index];
    document.getElementById('brief-mission-no').textContent = 'MISSION ' + (index + 1) + ' OF 5';
    document.getElementById('brief-title').textContent = def.name;
    document.getElementById('brief-text').textContent = def.brief;
    const pay = index === 2 ? 'Payout by finish: 1st $250 · 2nd $120 · 3rd $60 · 4th $30' : 'Payout: $' + def.pay;
    document.getElementById('brief-pay').textContent = pay;
    document.getElementById('btn-start-mission').onclick = () => {
      SolmarAudio.ensure();
      startMission(index);
    };
    showScreen('briefing');
  }

  function buildMissionList() {
    const list = document.getElementById('mission-list');
    list.innerHTML = '';
    MISSIONS.forEach((def, i) => {
      const row = document.createElement('div');
      row.className = 'mission-row';
      const done = i < state.unlocked - 1 || (i === 0 && state.stats.missionsDone > 0);
      const locked = i >= state.unlocked;
      row.innerHTML = '<div><div class="m-name">' + (i + 1) + '. ' + def.name + '</div>' +
        '<div class="m-state">' + (locked ? 'LOCKED — finish mission ' + i : done ? 'COMPLETED' : 'AVAILABLE') + '</div></div>' +
        '<div class="m-pay">$' + def.pay + '</div>';
      const btn = document.createElement('button');
      btn.className = 'menu-btn';
      btn.textContent = 'PLAY';
      btn.disabled = locked;
      btn.onclick = () => openBriefing(i);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function bindMenus() {
    document.getElementById('btn-new').onclick = () => {
      SolmarAudio.ensure();
      SolmarAudio.startMusic('assets/solmar-loop.wav');
      state.money = 0; state.unlocked = 1; state.stats = { missionsDone: 0, carsStolen: 0, busted: 0 };
      resetPlayerToGarage();
      saveGame();
      openBriefing(0);
    };
    document.getElementById('btn-continue').onclick = () => {
      SolmarAudio.ensure();
      SolmarAudio.startMusic('assets/solmar-loop.wav');
      resetPlayerToGarage();
      const next = Math.min(state.unlocked, 5) - 1;
      if (state.stats.missionsDone >= 5) { showScreen('playing'); toast('All missions done — free roam!'); }
      else openBriefing(next);
    };
    document.getElementById('btn-missions').onclick = () => { buildMissionList(); showScreen('missions'); };
    document.getElementById('btn-how').onclick = () => showScreen('howto');
    document.getElementById('btn-missions-back').onclick = () => showScreen('title');
    document.getElementById('btn-how-back').onclick = () => showScreen('title');
    document.getElementById('btn-resume').onclick = () => showScreen('playing');
    document.getElementById('btn-quit-title').onclick = () => { state.mission = null; showScreen('title'); };
    document.getElementById('btn-result-next').onclick = () => {
      if (state.missionIndex + 1 < MISSIONS.length) openBriefing(state.missionIndex + 1);
      else { showScreen('playing'); toast('All missions done — free roam the city!'); }
    };
    document.getElementById('btn-busted-ok').onclick = () => showScreen('playing');
  }

  // ---------------------------------------------------------------- input
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (k === 'm') {
      state.muted = !state.muted;
      SolmarAudio.setMuted(state.muted);
      toast(state.muted ? 'Sound muted' : 'Sound on');
      return;
    }
    if (state.screen !== 'playing') return;
    if (k === 'p' || k === 'escape') {
      document.getElementById('pause-stats').textContent =
        'Cash $' + state.money + '  •  Missions done ' + state.stats.missionsDone + '/5  •  Cars stolen ' + state.stats.carsStolen + '  •  Busted ' + state.stats.busted + '×';
      showScreen('paused');
      return;
    }
    if (k === 'e') tryEnterExitCar();
    if (k === 'f' && !player.inCar && player.punchTimer <= 0) {
      player.punchTimer = 0.45;
      player.punchHit = false;
    }
    if (k === ' ') SolmarAudio.honk();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // ---------------------------------------------------------------- loop
  let lastT = 0;
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (state.screen === 'playing' && !state.paused) {
      state.time += dt;
      updatePlayer(dt);
      updateTraffic(dt);
      updatePeds(dt);
      updatePolice(dt);
      updateWanted(dt);
      updateMission(dt);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
      updateHUD();
    }
    if (state.screen === 'playing' || state.screen === 'paused' ||
        state.screen === 'title' || state.screen === 'missions' || state.screen === 'howto') render(dt);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------- debug hook (playtests)
  // Exposes live state so an automated driver can play the game. Not a cheat:
  // it only reads state and reports it; the game itself never reads it back.
  window.__solmar = {
    state: () => ({
      screen: state.screen,
      money: state.money,
      unlocked: state.unlocked,
      wanted: state.wanted,
      bustedHold: state.bustedHold,
      mission: state.mission ? { index: state.missionIndex, name: state.mission.def.name, stage: state.mission.stage } : null,
      player: { x: Math.round(player.x), y: Math.round(player.y), angle: player.angle, speed: Math.round(player.speed), inCar: player.inCar },
      objective: state.mission ? (() => { const p = state.mission.def.point(state.mission); return { x: p.x, y: p.y, label: p.label || '' }; })() : null,
      racePlacement: state.mission && state.mission.def === MISSIONS[2] ? racePlacement(state.mission) : null,
      raceLap: state.mission && state.mission.def === MISSIONS[2] ? state.mission.lap : null,
      raceGate: state.mission && state.mission.def === MISSIONS[2] ? state.mission.gateIdx : null,
      raceNextGate: state.mission && state.mission.def === MISSIONS[2] ? (() => {
        const m = state.mission;
        const ni = (m.gateIdx + 1) % m.gates.length;
        return { x: m.gates[ni].x, y: m.gates[ni].y };
      })() : null,
      police: police.length,
      cops: police.map(c => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      traffic: cars.filter(c => c.kind === 'traffic').slice(0, 24).map(c => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      stats: { ...state.stats },
      cars: cars.filter(c => c.kind === 'traffic').length,
      time: state.time,
    }),
    startMission: (i) => { resetPlayerToGarage(); startMission(i); },
    setWanted: (n) => { state.wanted = n; },
    teleport: (x, y) => { player.x = x; player.y = y; if (player.inCar && playerCar) { playerCar.x = x; playerCar.y = y; } },
  };

  // ------------------------------------------------------- screenshot setup
  // ?shot=chase|drive|taxi|race stages a real gameplay scene for screenshots.
  function applyShotParam() {
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (!shot) return;
    SolmarAudio.ensure();
    if (shot === 'chase') {
      resetPlayerToGarage();
      startMission(4);
      // Beachfront avenue, heading east toward the Pier: the bay and the pier
      // are in frame on the right, police closing in from behind.
      player.x = 2560; player.y = 1240; player.angle = 0;
      playerCar.x = 2560; playerCar.y = 1240; playerCar.angle = 0;
      playerCar.speed = 200;
      state.wanted = 3;
      spawnPolice(3);
    } else if (shot === 'drive') {
      resetPlayerToGarage();
      startMission(0);
      player.x = 1420; player.y = 900; player.angle = Math.PI / 2;
      playerCar.x = 1420; playerCar.y = 900; playerCar.angle = Math.PI / 2;
      playerCar.speed = 180;
    } else if (shot === 'taxi') {
      resetPlayerToGarage();
      startMission(1);
      // Fare already aboard: jump straight to the drop-off leg.
      const m = state.mission;
      if (m.farePed) { const i = peds.indexOf(m.farePed); if (i >= 0) peds.splice(i, 1); m.farePed = null; }
      m.stage = 1; m.legStart = state.time;
      player.x = 1420; player.y = 1240; player.angle = 0;
      playerCar.x = 1420; playerCar.y = 1240; playerCar.angle = 0;
      playerCar.speed = 200;
    } else if (shot === 'race') {
      resetPlayerToGarage();
      startMission(2);
      const m = state.mission;
      m.gateIdx = 3; m.lap = 1;
      // Rivals run just ahead and behind the player on the same avenue.
      const rivalSpots = [{ x: 2560, y: 1380 }, { x: 2560, y: 1620 }, { x: 2560, y: 1740 }];
      m.rivals.forEach((r, i) => { r.gateIdx = 3; r.x = rivalSpots[i].x; r.y = rivalSpots[i].y; r.angle = Math.PI / 2; r.speed = 300; });
      player.x = 2560; player.y = 1500; player.angle = Math.PI / 2;
      playerCar.x = 2560; playerCar.y = 1500; playerCar.angle = Math.PI / 2;
      playerCar.speed = 320;
    }
    showScreen('playing');
  }

  // ---------------------------------------------------------------- boot
  buildCity();
  loadSave();
  resetPlayerToGarage();
  spawnTraffic(14);
  spawnPeds(18);
  bindMenus();
  showScreen('title');
  applyShotParam();
  requestAnimationFrame(loop);
})();
