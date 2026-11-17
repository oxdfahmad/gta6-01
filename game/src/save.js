// Save / load through localStorage: cash, health, story progress, the
// clock, side-job tallies and the hidden parcels already found. One slot;
// the game autosaves every 20 seconds and whenever a mission closes.
const SLOT = 'solmar-bay-save-v1';

export function saveRun(run) {
  try {
    const snap = {
      cash: run.money,
      hp: run.hp,
      chapter: run.missionIndex,
      done: run.done,
      heat: run.wanted,
      clock: run.hour,
      fares: run.fares,
      trials: run.trials,
      parcels: run.parcelsFound || [],
      px: run.player.x,
      pz: run.player.z,
      face: run.player.face,
      when: Date.now(),
    };
    window.localStorage.setItem(SLOT, JSON.stringify(snap));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadRun() {
  try {
    const raw = window.localStorage.getItem(SLOT);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadRun() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SLOT);
  } catch (e) {}
}
