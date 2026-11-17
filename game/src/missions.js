// Story missions + side activities for Solmar Bay.
// Leo Marin, a wheelman fresh out of the docks, works for fixer Mara Solis
// against the harbour boss known as the Commodore. Five chained missions,
// each with a marker, dialogue lines, an objective and a cash reward, plus
// two side jobs: taxi fares and a beachfront time-trial race.
import * as THREE from 'three';
import { spawnArmouredCar, spawnEnemies } from './combat.js';

export const MISSIONS = [
  { id: 1, title: 'First Wheels', giver: 'Mara Solis',
    brief: 'Mara needs a driver she can trust. Steal any parked car and bring it to the blue marker at the marina.',
    debrief: 'Clean wheels, no questions. Mara is watching you, Leo.',
    steps: ['Steal a car (press E near a parked car)', 'Drive to the marina marker'],
    reward: 150, marker: [240, -60], kind: 'steal-drive' },
  { id: 2, title: 'The Pickup', giver: 'Mara Solis',
    brief: 'A courier is waiting by the lighthouse with a package. Pick it up on foot, then lose the heat — the Commodore\'s men are watching.',
    debrief: 'Package safe. The Commodore knows your face now — drive careful.',
    steps: ['Reach the lighthouse on foot', 'Grab the package', 'Lose the wanted level'],
    reward: 250, marker: [285, 180], kind: 'pickup' },
  { id: 3, title: 'Harbour Heat', giver: 'Mara Solis',
    brief: 'The Commodore sent gunmen to the docks. Clear them out with your pistol — watch your health, use cover.',
    debrief: 'The docks are quiet again. The Commodore will not forget this.',
    steps: ['Defeat 3 gunmen at the docks', 'Return to the safe marker'],
    reward: 400, marker: [230, 120], kind: 'combat' },
  { id: 4, title: 'The Getaway', giver: 'Mara Solis',
    brief: 'Grab the cash stash at the park, then outrun the police to the hideout. Wanted level 3 is guaranteed — drive fast.',
    debrief: 'Three stars and you still made it. That is why Mara hired you.',
    steps: ['Grab the stash at the park', 'Reach the hideout with the cash'],
    reward: 600, marker: [-90, -90], kind: 'getaway' },
  { id: 5, title: 'The Commodore', giver: 'Mara Solis',
    brief: 'Final job: storm the Commodore\'s penthouse garage downtown, take down his guards and his armoured car. End this.',
    debrief: 'The Commodore is done. Solmar Bay is yours, Leo.',
    steps: ['Defeat 4 guards downtown', 'Destroy the armoured car'],
    reward: 1200, marker: [0, 0], kind: 'finale' },
];
export const TAXI_FARE = 80;
export const RACE_REWARD = 300;

export function createMissions(scene) {
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 18, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(geo, mat); beacon.position.y = 9; scene.add(beacon);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 24), new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; scene.add(ring);
  return { beacon, ring, step: 0, active: false, side: null, sideTimer: 0, sideTarget: null, enemiesLeft: 0, stashTaken: false };
}
export function currentMission(state) { return MISSIONS[state.missionIndex] || null; }
export function missionObjectiveText(state, m) {
  if (!m) return 'Story complete — Solmar Bay is yours. Free roam!';
  const s = state.missions.step;
  return m.steps[Math.min(s, m.steps.length - 1)];
}
export function startMission(state, scene) {
  const m = currentMission(state);
  if (!m) { state.missions.active = false; state.missions.beacon.visible = false; state.missions.ring.visible = false; return; }
  state.missions.active = true; state.missions.step = 0; state.missions.enemiesLeft = 0; state.missions.stashTaken = false;
  state.missions.beacon.visible = true; state.missions.ring.visible = true;
  state.missions.beacon.position.set(m.marker[0], 9, m.marker[1]);
  state.missions.ring.position.set(m.marker[0], 0.1, m.marker[1]);
  state.toast = m.giver + ': ' + m.brief; state.toastAt = performance.now();
}
export function completeMission(state, audio) {
  const m = currentMission(state);
  if (!m) return;
  state.money += m.reward; state.completedMissions += 1; state.missionIndex += 1;
  state.toast = 'Mission complete: ' + m.title + '  +$' + m.reward + ' — ' + m.giver + ': ' + m.debrief; state.toastAt = performance.now();
  if (audio) audio.cash();
  startMission(state, state.scene);
}
export function updateMissions(state, dt, combat) {
  const ms = state.missions; if (!ms.active) return;
  const m = currentMission(state); if (!m) return;
  const px = state.player.x, pz = state.player.z;
  const atMarker = Math.hypot(px - m.marker[0], pz - m.marker[1]) < 6;
  if (m.kind === 'steal-drive') {
    if (ms.step === 0 && state.player.inCar) ms.step = 1;
    else if (ms.step === 1 && atMarker) completeMission(state, state.audio);
  } else if (m.kind === 'pickup') {
    if (ms.step === 0 && atMarker && !state.player.inCar) { ms.step = 1; state.toast = 'Package grabbed — now lose the heat!'; state.toastAt = performance.now(); state.police.wanted = Math.max(state.police.wanted, 2); }
    else if (ms.step === 1 && state.police.wanted < 0.5) { ms.step = 2; completeMission(state, state.audio); }
  } else if (m.kind === 'combat' || m.kind === 'finale') {
    if (ms.step === 0 && ms.enemiesLeft === 0 && !ms.spawned) { ms.spawned = true; spawnEnemies(combat, m.kind === 'finale' ? 4 : 3, m.marker); ms.enemiesLeft = m.kind === 'finale' ? 4 : 3; state.toast = 'Gunmen incoming — take them down!'; state.toastAt = performance.now(); }
    if (ms.step === 0 && ms.spawned && ms.enemiesLeft <= 0) {
      if (m.kind === 'finale') { ms.step = 1; spawnArmouredCar(combat, m.marker); state.toast = 'Guards down — now destroy the Commodore\'s armoured car!'; state.toastAt = performance.now(); }
      else { ms.step = 1; state.toast = 'Area clear — return to the marker.'; state.toastAt = performance.now(); }
    }
    else if (ms.step === 1 && m.kind === 'finale' && combat.armoured && combat.armoured.health <= 0) completeMission(state, state.audio);
    else if (ms.step === 1 && m.kind !== 'finale' && atMarker) completeMission(state, state.audio);
  } else if (m.kind === 'getaway') {
    if (ms.step === 0 && atMarker) { ms.step = 1; ms.stashTaken = true; state.police.wanted = Math.max(state.police.wanted, 3); state.toast = 'Stash grabbed — run! Hideout is downtown.'; state.toastAt = performance.now(); ms.beacon.position.set(0, 9, 0); ms.ring.position.set(0, 0.1, 0); }
    else if (ms.step === 1 && Math.hypot(px, pz) < 6) completeMission(state, state.audio);
  }
  // Beacon pulse.
  ms.beacon.rotation.y += dt; ms.beacon.material.opacity = 0.25 + 0.15 * Math.sin(performance.now() / 300);
  // Side jobs.
  if (ms.side === 'taxi' && ms.sideTarget) {
    if (Math.hypot(px - ms.sideTarget[0], pz - ms.sideTarget[1]) < 7 && state.player.inCar) {
      state.money += TAXI_FARE; state.taxiFares += 1; state.toast = 'Fare complete  +$' + TAXI_FARE; state.toastAt = performance.now();
      if (state.audio) state.audio.cash();
      ms.side = null; ms.sideTarget = null;
    }
  }
  if (ms.side === 'race') {
    ms.sideTimer -= dt;
    if (ms.sideTarget && Math.hypot(px - ms.sideTarget[0], pz - ms.sideTarget[1]) < 8) {
      state.money += RACE_REWARD; state.racesWon += 1; state.toast = 'Race won!  +$' + RACE_REWARD; state.toastAt = performance.now();
      if (state.audio) state.audio.cash(); ms.side = null; ms.sideTarget = null;
    } else if (ms.sideTimer <= 0) { state.toast = 'Race failed — too slow. Try again at the beach.'; state.toastAt = performance.now(); ms.side = null; ms.sideTarget = null; }
  }
}
export function startTaxi(state) {
  const spots = [[-180, 180], [180, -180], [-60, 200], [200, 60], [-200, -60]];
  const s = spots[Math.floor(Math.random() * spots.length)];
  state.missions.side = 'taxi'; state.missions.sideTarget = s;
  state.toast = 'Taxi fare: take the passenger to the yellow marker.'; state.toastAt = performance.now();
}
export function startRace(state) {
  state.missions.side = 'race'; state.missions.sideTimer = 60;
  state.missions.sideTarget = [240, -200];
  state.toast = 'Beachfront time trial: reach the far pier in 60 seconds!'; state.toastAt = performance.now();
}
