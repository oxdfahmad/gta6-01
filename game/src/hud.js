// HUD: DOM overlay (money, health, ammo, wanted stars, speed, clock,
// mission tracker, toast, crosshair) plus a live canvas minimap with
// player / police / mission markers and a north indicator.
import { currentMission, missionObjectiveText } from './missions.js';

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML =
    '<div id="hud-top"><div id="hud-money">$0</div><div id="hud-stars"></div><div id="hud-clock">18:00</div></div>' +
    '<div id="hud-mission"><div id="hud-mission-title"></div><div id="hud-mission-obj"></div></div>' +
    '<div id="hud-toast"></div>' +
    '<div id="hud-bottom"><div id="hud-health"></div><div id="hud-ammo"></div><div id="hud-packages"></div><div id="hud-speed">0 mph</div></div>' +
    '<canvas id="minimap" width="180" height="180"></canvas>' +
    '<div id="hud-cross">+</div>' +
    '<div id="hud-controls">WASD move/drive &nbsp;·&nbsp; Mouse drag camera &nbsp;·&nbsp; Click shoot &nbsp;·&nbsp; E enter/exit car &nbsp;·&nbsp; Shift run &nbsp;·&nbsp; Space handbrake &nbsp;·&nbsp; T taxi &nbsp;·&nbsp; R race &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute &nbsp;·&nbsp; H hide HUD &nbsp;·&nbsp; 10 hidden packages: $50 each</div>';
  return { root, map: document.getElementById('minimap') };
}
function starsHtml(wanted) {
  let s = '';
  for (let i = 0; i < 5; i++) s += '<span class="star' + (i < Math.round(wanted) ? ' on' : '') + '">★</span>';
  return s;
}
export function updateHud(hud, state) {
  document.getElementById('hud-money').textContent = '$' + Math.floor(state.money).toLocaleString('en-US');
  document.getElementById('hud-stars').innerHTML = starsHtml(state.wanted);
  const h = Math.floor(state.hour), m = Math.floor((state.hour - h) * 60);
  document.getElementById('hud-clock').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const mission = currentMission(state);
  document.getElementById('hud-mission-title').textContent = mission ? ('MISSION ' + mission.id + ' — ' + mission.title) : 'FREE ROAM';
  document.getElementById('hud-mission-obj').textContent = missionObjectiveText(state, mission);
  document.getElementById('hud-health').innerHTML = 'HEALTH <span class="bar"><span class="fill" style="width:' + Math.max(0, state.health) + '%"></span></span> ' + Math.max(0, Math.round(state.health));
  document.getElementById('hud-ammo').textContent = state.player.inCar ? 'IN CAR — ' + (state.player.car ? state.player.car.name : '') : ('AMMO ' + state.ammo + '  ·  PISTOL');
  document.getElementById('hud-packages').textContent = 'PACKAGES ' + (state.packages ? state.packages.collected : 0) + '/10';
  const mph = state.player.inCar ? Math.round(Math.abs(state.player.carSpeed) * 2.2) : 0;
  document.getElementById('hud-speed').textContent = state.player.inCar ? mph + ' mph' : 'ON FOOT';
  const toast = document.getElementById('hud-toast');
  toast.textContent = (performance.now() - state.toastAt < 5000) ? state.toast : '';
  document.getElementById('hud-cross').style.display = state.player.inCar ? 'none' : 'block';
  drawMinimap(hud, state);
}
function drawMinimap(hud, state) {
  const c = hud.map.getContext('2d');
  const S = 180, scale = S / 560;
  c.fillStyle = 'rgba(10,20,30,0.85)'; c.fillRect(0, 0, S, S);
  // Sea + beach on the east edge.
  c.fillStyle = '#1e7fa8'; c.fillRect(150, 0, 30, S);
  c.fillStyle = '#d9c08a'; c.fillRect(142, 0, 8, S);
  // Roads grid.
  c.strokeStyle = '#555'; c.lineWidth = 3;
  for (let i = -4; i <= 4; i++) {
    const p = S / 2 + i * 60 * scale;
    c.beginPath(); c.moveTo(p, 0); c.lineTo(p, S); c.stroke();
    c.beginPath(); c.moveTo(0, p); c.lineTo(S, p); c.stroke();
  }
  const px = (x) => S / 2 + x * scale, pz = (z) => S / 2 + z * scale;
  // Mission marker (cyan diamond) + side marker (yellow).
  const m = currentMission(state);
  if (m && state.missions.active) {
    c.fillStyle = '#00e5ff';
    c.beginPath(); c.moveTo(px(m.marker[0]), pz(m.marker[1]) - 7); c.lineTo(px(m.marker[0]) + 7, pz(m.marker[1])); c.lineTo(px(m.marker[0]), pz(m.marker[1]) + 7); c.lineTo(px(m.marker[0]) - 7, pz(m.marker[1])); c.fill();
  }
  // Hidden packages (gold parcels) + side-job markers.
  if (state.packages) {
    c.fillStyle = '#ffd23f';
    for (const it of state.packages.items) {
      if (it.taken) continue;
      c.beginPath(); c.arc(px(it.x), pz(it.z), 3, 0, 7); c.fill();
    }
  }
  if (state.missions.sideTarget) {
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(px(state.missions.sideTarget[0]), pz(state.missions.sideTarget[1]), 5, 0, 7); c.fill();
  }
  // Police (red dots), enemies (orange), player (white triangle, facing).
  for (const u of state.police.units) { c.fillStyle = '#ff3333'; c.beginPath(); c.arc(px(u.x), pz(u.z), 3.5, 0, 7); c.fill(); }
  for (const e of state.combat.enemies) { c.fillStyle = '#ff8800'; c.beginPath(); c.arc(px(e.x), pz(e.z), 3, 0, 7); c.fill(); }
  c.save(); c.translate(px(state.player.x), pz(state.player.z)); c.rotate(state.player.angle);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore();
  // North indicator + border.
  c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText('N', 8, 16);
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2);
}
