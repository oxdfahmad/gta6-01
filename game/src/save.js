// Save / load to localStorage: position, money, health, mission progress,
// wanted level, unlocked cars and the clock. One slot, autosaves on mission
// completion and every 20 seconds of play.
const KEY = 'solmar-bay-save-v1';
export function saveGame(state) {
  try {
    const data = {
      money: state.money, health: state.health, missionIndex: state.missionIndex,
      completedMissions: state.completedMissions, wanted: state.wanted,
      hour: state.hour, taxiFares: state.taxiFares, racesWon: state.racesWon,
      packages: state.packagesTaken || [],
      playerX: state.player.x, playerZ: state.player.z, playerAngle: state.player.angle,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function hasSave() { return loadGame() !== null; }
export function clearSave() { try { window.localStorage.removeItem(KEY); } catch (e) {} }
