// Hidden parcels: ten gold packages stashed around Solmar Bay — on the
// pier, in the parks, behind the lighthouse, on the docks, on the beach.
// Walk over one to collect it: +$50 each, a HUD counter, and the haul
// persists in the save. It is the cheap extra progression the city was
// missing: a reason to explore every corner between missions, not just
// drive the mission line.
import * as THREE from 'three';

export const PARCEL_TOTAL = 10;
export const PARCEL_PAY = 50;
// Fixed spots, spread across the map: pier, marina, lighthouse, parks,
// downtown, docks, beach, and two quiet side streets.
export const PARCEL_SPOTS = [
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

export function hidePackages(scene) {
  const parcels = [];
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  for (let i = 0; i < PARCEL_SPOTS.length; i++) {
    const [x, z] = PARCEL_SPOTS[i];
    const g = new THREE.Group();
    const box = new THREE.Mesh(geo, mat);
    box.position.y = 0.7;
    g.add(box);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.95), trimMat);
    trim.position.y = 0.7;
    g.add(trim);
    g.position.set(x, 0, z);
    scene.add(g);
    parcels.push({ mesh: g, x, z, got: false });
  }
  return { parcels, found: 0 };
}

export function restorePackages(sys, foundIdx) {
  const foundSet = new Set(foundIdx || []);
  sys.found = 0;
  sys.parcels.forEach((it, i) => {
    it.got = foundSet.has(i);
    it.mesh.visible = !it.got;
    if (it.got) sys.found += 1;
  });
}

export function stepPackages(sys, dt, run) {
  const p = run.player;
  for (let i = 0; i < sys.parcels.length; i++) {
    const it = sys.parcels[i];
    if (it.got) continue;
    it.mesh.rotation.y += dt * 1.5;
    it.mesh.position.y = Math.sin(performance.now() / 400 + i) * 0.12;
    // On foot only — you cannot scoop a parcel from a moving car.
    if (!p.inCar && Math.hypot(p.x - it.x, p.z - it.z) < 2.2) {
      it.got = true;
      it.mesh.visible = false;
      sys.found += 1;
      run.money += PARCEL_PAY;
      run.parcelsFound = run.parcelsFound || [];
      run.parcelsFound.push(i);
      run.notice = 'Hidden package found!  +$' + PARCEL_PAY + '  (' + sys.found + '/' + PARCEL_TOTAL + ')';
      run.noticeAt = performance.now();
      if (run.sound) run.sound.pickup();
    }
  }
}
