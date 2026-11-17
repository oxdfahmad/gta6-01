// HUD: the DOM overlay (cash, health, ammo, wanted stars, speed, clock,
// mission tracker, toast, crosshair) plus a live canvas minimap with the
// player, police, foes and mission marker and a north indicator.
import { storyChapter, chapterGoal } from './missions.js';

export function buildHud() {
  const root = document.getElementById('hud');
  root.innerHTML =
    '<div id="hud-top"><div id="hud-money">$0</div><div id="hud-stars"></div><div id="hud-clock">18:00</div></div>' +
    '<div id="hud-mission"><div id="hud-mission-title"></div><div id="hud-mission-obj"></div></div>' +
    '<div id="hud-toast"></div>' +
    '<div id="hud-bottom"><div id="hud-health"></div><div id="hud-ammo"></div><div id="hud-packages"></div><div id="hud-speed">0 mph</div></div>' +
    '<canvas id="minimap" width="180" height="180"></canvas>' +
    '<div id="hud-cross">+</div>' +
    '<div id="hud-controls">WASD move/drive &nbsp;·&nbsp; Mouse drag camera &nbsp;·&nbsp; Click shoot &nbsp;·&nbsp; E enter/exit car &nbsp;·&nbsp; Shift run &nbsp;·&nbsp; Space handbrake &nbsp;·&nbsp; T taxi &nbsp;·&nbsp; R race &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute &nbsp;·&nbsp; H hide HUD</div>';
  return { root, map: document.getElementById('minimap') };
}

function starRow(wanted) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += '<span class="star' + (i < Math.round(wanted) ? ' on' : '') + '">★</span>';
  }
  return s;
}

export function updateHud(panel, run) {
  document.getElementById('hud-money').textContent =
    '$' + Math.floor(run.money).toLocaleString('en-US');
  document.getElementById('hud-stars').innerHTML = starRow(run.wanted);
  const h = Math.floor(run.hour);
  const m = Math.floor((run.hour - h) * 60);
  document.getElementById('hud-clock').textContent =
    String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const chapter = storyChapter(run);
  document.getElementById('hud-mission-title').textContent =
    chapter ? 'MISSION ' + chapter.id + ' — ' + chapter.name : 'FREE ROAM';
  document.getElementById('hud-mission-obj').textContent = chapterGoal(run, chapter);
  document.getElementById('hud-health').innerHTML =
    'HEALTH <span class="bar"><span class="fill" style="width:' + Math.max(0, run.hp) + '%"></span></span> ' +
    Math.max(0, Math.round(run.hp));
  document.getElementById('hud-ammo').textContent = run.player.inCar
    ? 'IN CAR — ' + (run.player.car ? run.player.car.label : '')
    : 'AMMO ' + run.shells + '  ·  PISTOL';
  document.getElementById('hud-packages').textContent =
    'PACKAGES ' + (run.parcels ? run.parcels.found : 0) + '/10';
  const mph = run.player.inCar ? Math.round(Math.abs(run.player.carVel) * 2.2) : 0;
  document.getElementById('hud-speed').textContent = run.player.inCar ? mph + ' mph' : 'ON FOOT';
  const toast = document.getElementById('hud-toast');
  toast.textContent = performance.now() - run.noticeAt < 5000 ? run.notice : '';
  document.getElementById('hud-cross').style.display = run.player.inCar ? 'none' : 'block';
  drawMap(panel, run);
}

function drawMap(panel, run) {
  const c = panel.map.getContext('2d');
  const S = 180;
  const scale = S / 560;
  c.fillStyle = 'rgba(10,20,30,0.85)';
  c.fillRect(0, 0, S, S);
  // Sea and beach on the east edge.
  c.fillStyle = '#1e7fa8';
  c.fillRect(150, 0, 30, S);
  c.fillStyle = '#d9c08a';
  c.fillRect(142, 0, 8, S);
  // Street grid.
  c.strokeStyle = '#555';
  c.lineWidth = 3;
  for (let i = -4; i <= 4; i++) {
    const p = S / 2 + i * 60 * scale;
    c.beginPath();
    c.moveTo(p, 0);
    c.lineTo(p, S);
    c.stroke();
    c.beginPath();
    c.moveTo(0, p);
    c.lineTo(S, p);
    c.stroke();
  }
  const px = (x) => S / 2 + x * scale;
  const pz = (z) => S / 2 + z * scale;
  // Mission marker (cyan diamond) and side-job marker (yellow).
  const m = storyChapter(run);
  if (m && run.story.live) {
    c.fillStyle = '#00e5ff';
    c.beginPath();
    c.moveTo(px(m.spot[0]), pz(m.spot[1]) - 7);
    c.lineTo(px(m.spot[0]) + 7, pz(m.spot[1]));
    c.lineTo(px(m.spot[0]), pz(m.spot[1]) + 7);
    c.lineTo(px(m.spot[0]) - 7, pz(m.spot[1]));
    c.fill();
  }
  // Hidden parcels (gold dots).
  if (run.parcels) {
    c.fillStyle = '#ffd23f';
    for (const it of run.parcels.parcels) {
      if (it.got) continue;
      c.beginPath();
      c.arc(px(it.x), pz(it.z), 3, 0, 7);
      c.fill();
    }
  }
  if (run.story.sideSpot) {
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.arc(px(run.story.sideSpot[0]), pz(run.story.sideSpot[1]), 5, 0, 7);
    c.fill();
  }
  // Police (red dots), foes (orange), player (white triangle, facing).
  for (const u of run.police.cars) {
    c.fillStyle = '#ff3333';
    c.beginPath();
    c.arc(px(u.x), pz(u.z), 3.5, 0, 7);
    c.fill();
  }
  for (const e of run.combat.foes) {
    c.fillStyle = '#ff8800';
    c.beginPath();
    c.arc(px(e.x), pz(e.z), 3, 0, 7);
    c.fill();
  }
  c.save();
  c.translate(px(run.player.x), pz(run.player.z));
  c.rotate(run.player.face);
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(0, -7);
  c.lineTo(5, 6);
  c.lineTo(-5, 6);
  c.closePath();
  c.fill();
  c.restore();
  // North indicator and border.
  c.fillStyle = '#fff';
  c.font = 'bold 13px sans-serif';
  c.fillText('N', 8, 16);
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.lineWidth = 2;
  c.strokeRect(1, 1, S - 2, S - 2);
}
