// Story missions and side jobs for Solmar Bay.
// Leo Marin, a wheelman fresh off the docks, works for fixer Mara Solis
// against the harbour boss known as the Commodore. Five chained missions,
// each with a beacon, dialogue, an objective and a cash reward — plus two
// side jobs: taxi fares and a beachfront time-trial race.
import * as THREE from 'three';
import { spawnBrute, spawnGunmen } from './combat.js';

export const STORY = [
  {
    id: 1, name: 'First Wheels', giver: 'Mara Solis',
    brief: 'Mara needs a driver she can trust. Steal any parked car and bring it to the blue marker at the marina.',
    debrief: 'Clean wheels, no questions. Mara is watching you, Leo.',
    goals: ['Steal a car (press E near a parked car)', 'Drive to the marina marker'],
    pay: 150, spot: [240, -60], kind: 'steal-drive',
  },
  {
    id: 2, name: 'The Pickup', giver: 'Mara Solis',
    brief: 'A courier is waiting by the lighthouse with a package. Pick it up on foot, then lose the heat — the Commodore\'s men are watching.',
    debrief: 'Package safe. The Commodore knows your face now — drive careful.',
    goals: ['Reach the lighthouse on foot', 'Grab the package', 'Lose the wanted level'],
    pay: 250, spot: [285, 180], kind: 'pickup',
  },
  {
    id: 3, name: 'Harbour Heat', giver: 'Mara Solis',
    brief: 'The Commodore sent gunmen to the docks. Clear them out with your pistol — watch your health, use cover.',
    debrief: 'The docks are quiet again. The Commodore will not forget this.',
    goals: ['Defeat 3 gunmen at the docks', 'Return to the safe marker'],
    pay: 400, spot: [230, 120], kind: 'combat',
  },
  {
    id: 4, name: 'The Getaway', giver: 'Mara Solis',
    brief: 'Grab the cash stash at the park, then outrun the police to the hideout. Wanted level 3 is guaranteed — drive fast.',
    debrief: 'Three stars and you still made it. That is why Mara hired you.',
    goals: ['Grab the stash at the park', 'Reach the hideout with the cash'],
    pay: 600, spot: [-90, -90], kind: 'getaway',
  },
  {
    id: 5, name: 'The Commodore', giver: 'Mara Solis',
    brief: 'Final job: storm the Commodore\'s penthouse garage downtown, take down his guards and his armoured car. End this.',
    debrief: 'The Commodore is done. Solmar Bay is yours, Leo.',
    goals: ['Defeat 4 guards downtown', 'Destroy the armoured car'],
    pay: 1200, spot: [0, 0], kind: 'finale',
  },
];
export const TAXI_PAY = 80;
export const RACE_PAY = 300;

export function createStory(scene) {
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 18, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beacon = new THREE.Mesh(geo, mat);
  beacon.position.y = 9;
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  scene.add(ring);
  return {
    beacon, ring,
    phase: 0, live: false,
    side: null, sideClock: 0, sideSpot: null,
    foesLeft: 0, stashGot: false, deployed: false,
  };
}

export function storyChapter(run) {
  return STORY[run.missionIndex] || null;
}

export function chapterGoal(run, m) {
  if (!m) return 'Story complete — Solmar Bay is yours. Free roam!';
  const s = run.story.phase;
  return m.goals[Math.min(s, m.goals.length - 1)];
}

export function startChapter(run, scene) {
  const m = storyChapter(run);
  if (!m) {
    run.story.live = false;
    run.story.beacon.visible = false;
    run.story.ring.visible = false;
    return;
  }
  run.story.live = true;
  run.story.phase = 0;
  run.story.foesLeft = 0;
  run.story.stashGot = false;
  run.story.deployed = false;
  run.story.beacon.visible = true;
  run.story.ring.visible = true;
  run.story.beacon.position.set(m.spot[0], 9, m.spot[1]);
  run.story.ring.position.set(m.spot[0], 0.1, m.spot[1]);
  run.notice = m.giver + ': ' + m.brief;
  run.noticeAt = performance.now();
}

export function finishChapter(run, sound) {
  const m = storyChapter(run);
  if (!m) return;
  run.money += m.pay;
  run.done += 1;
  run.missionIndex += 1;
  run.notice = 'Mission complete: ' + m.name + '  +$' + m.pay + ' — ' + m.giver + ': ' + m.debrief;
  run.noticeAt = performance.now();
  if (sound) sound.cash();
  startChapter(run, run.scene);
}

export function stepStory(run, dt, combat) {
  const st = run.story;
  if (!st.live) return;
  const m = storyChapter(run);
  if (!m) return;
  const px = run.player.x;
  const pz = run.player.z;
  const atSpot = Math.hypot(px - m.spot[0], pz - m.spot[1]) < 6;
  if (m.kind === 'steal-drive') {
    if (st.phase === 0 && run.player.inCar) st.phase = 1;
    else if (st.phase === 1 && atSpot) finishChapter(run, run.sound);
  } else if (m.kind === 'pickup') {
    if (st.phase === 0 && atSpot && !run.player.inCar) {
      st.phase = 1;
      run.notice = 'Package grabbed — now lose the heat!';
      run.noticeAt = performance.now();
      run.police.wanted = Math.max(run.police.wanted, 2);
    } else if (st.phase === 1 && run.police.wanted < 0.5) {
      st.phase = 2;
      finishChapter(run, run.sound);
    }
  } else if (m.kind === 'combat' || m.kind === 'finale') {
    const count = m.kind === 'finale' ? 4 : 3;
    if (st.phase === 0 && st.foesLeft === 0 && !st.deployed) {
      st.deployed = true;
      spawnGunmen(combat, count, m.spot);
      st.foesLeft = count;
      run.notice = 'Gunmen incoming — take them down!';
      run.noticeAt = performance.now();
    }
    if (st.phase === 0 && st.deployed && st.foesLeft <= 0) {
      if (m.kind === 'finale') {
        st.phase = 1;
        spawnBrute(combat, m.spot);
        run.notice = 'Guards down — now destroy the Commodore\'s armoured car!';
        run.noticeAt = performance.now();
      } else {
        st.phase = 1;
        run.notice = 'Area clear — return to the marker.';
        run.noticeAt = performance.now();
      }
    } else if (st.phase === 1 && m.kind === 'finale' && combat.brute && combat.brute.hp <= 0) {
      finishChapter(run, run.sound);
    } else if (st.phase === 1 && m.kind !== 'finale' && atSpot) {
      finishChapter(run, run.sound);
    }
  } else if (m.kind === 'getaway') {
    if (st.phase === 0 && atSpot) {
      st.phase = 1;
      st.stashGot = true;
      run.police.wanted = Math.max(run.police.wanted, 3);
      run.notice = 'Stash grabbed — run! Hideout is downtown.';
      run.noticeAt = performance.now();
      st.beacon.position.set(0, 9, 0);
      st.ring.position.set(0, 0.1, 0);
    } else if (st.phase === 1 && Math.hypot(px, pz) < 6) {
      finishChapter(run, run.sound);
    }
  }
  // Beacon pulse.
  st.beacon.rotation.y += dt;
  st.beacon.material.opacity = 0.25 + 0.15 * Math.sin(performance.now() / 300);
  // Side jobs.
  if (st.side === 'taxi' && st.sideSpot) {
    if (Math.hypot(px - st.sideSpot[0], pz - st.sideSpot[1]) < 7 && run.player.inCar) {
      run.money += TAXI_PAY;
      run.fares += 1;
      run.notice = 'Fare complete  +$' + TAXI_PAY;
      run.noticeAt = performance.now();
      if (run.sound) run.sound.cash();
      st.side = null;
      st.sideSpot = null;
    }
  }
  if (st.side === 'trial') {
    st.sideClock -= dt;
    if (st.sideSpot && Math.hypot(px - st.sideSpot[0], pz - st.sideSpot[1]) < 8) {
      run.money += RACE_PAY;
      run.trials += 1;
      run.notice = 'Race won!  +$' + RACE_PAY;
      run.noticeAt = performance.now();
      if (run.sound) run.sound.cash();
      st.side = null;
      st.sideSpot = null;
    } else if (st.sideClock <= 0) {
      run.notice = 'Race failed — too slow. Try again at the beach.';
      run.noticeAt = performance.now();
      st.side = null;
      st.sideSpot = null;
    }
  }
}

export function startTaxi(run) {
  const spots = [[-180, 180], [180, -180], [-60, 200], [200, 60], [-200, -60]];
  const s = spots[Math.floor(Math.random() * spots.length)];
  run.story.side = 'taxi';
  run.story.sideSpot = s;
  run.notice = 'Taxi fare: take the passenger to the yellow marker.';
  run.noticeAt = performance.now();
}

export function startRace(run) {
  run.story.side = 'trial';
  run.story.sideClock = 60;
  run.story.sideSpot = [240, -200];
  run.notice = 'Beachfront time trial: reach the far pier in 60 seconds!';
  run.noticeAt = performance.now();
}
