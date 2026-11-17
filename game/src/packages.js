// Hidden packages: ten gold parcels stashed around Solmar Bay — on the
// pier, in the parks, behind the lighthouse, on rooftops of the imagination
// (all at street level, all reachable on foot). Walk over one to collect
// it: +$50 each, a HUD counter, and the haul persists in the save. It is
// the cheap extra progression the city was missing: a reason to explore
// every corner between missions, not just drive the mission line.
import * as THREE from 'three';

export const PACKAGE_COUNT = 10;
export const PACKAGE_REWARD = 50;
// Fixed spots, spread across the map: pier, marina, lighthouse, parks,
// downtown, docks, beach, and two quiet side streets.
export const PACKAGE_SPOTS = [
  [300, -30], // on the pier
  [240, -60], // marina marker
  [285, 165], // behind the lighthouse
  [-90, -70], // park corner
  [150, 130], // park corner
  [0, 30], // downtown plaza
  [230, 100], // the docks
  [275, 90], // beach
  [-180, 180], // south-west corner
  [180, -180], // north-east corner
];

export function createPackages(scene) {
  const items = [];
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  for (let i = 0; i < PACKAGE_SPOTS.length; i++) {
    const [x, z] = PACKAGE_SPOTS[i];
    const g = new THREE.Group();
    const box = new THREE.Mesh(geo, mat); box.position.y = 0.7; g.add(box);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.95), trimMat);
    trim.position.y = 0.7; g.add(trim);
    g.position.set(x, 0, z);
    scene.add(g);
    items.push({ mesh: g, x, z, taken: false });
  }
  return { items, collected: 0 };
}
export function restorePackages(sys, taken) {
  const takenSet = new Set(taken || []);
  sys.collected = 0;
  sys.items.forEach((it, i) => {
    it.taken = takenSet.has(i);
    it.mesh.visible = !it.taken;
    if (it.taken) sys.collected += 1;
  });
}
export function updatePackages(sys, dt, state) {
  const p = state.player;
  for (let i = 0; i < sys.items.length; i++) {
    const it = sys.items[i];
    if (it.taken) continue;
    it.mesh.rotation.y += dt * 1.5;
    it.mesh.position.y = Math.sin(performance.now() / 400 + i) * 0.12;
    // On foot only — you cannot scoop a package from a moving car.
    if (!p.inCar && Math.hypot(p.x - it.x, p.z - it.z) < 2.2) {
      it.taken = true; it.mesh.visible = false;
      sys.collected += 1;
      state.money += PACKAGE_REWARD;
      state.packagesTaken = state.packagesTaken || [];
      state.packagesTaken.push(i);
      state.toast = 'Hidden package found!  +$' + PACKAGE_REWARD + '  (' + sys.collected + '/' + PACKAGE_COUNT + ')';
      state.toastAt = performance.now();
      if (state.audio) state.audio.pickup();
    }
  }
}
