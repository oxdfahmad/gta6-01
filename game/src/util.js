// Small shared helpers for Solmar Bay: seeded random, clamps, angles, colours.
// Every module imports from here so the random city, traffic and missions all
// stay deterministic for a given seed while playing differently each new game.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
// Deterministic colour from a small palette, so the city reads as one place.
export const PALETTE = {
  sand: 0xd9c08a, sea: 0x1e7fa8, road: 0x55555e, sidewalk: 0x9a938a, curb: 0x6f6a62,
  building: [0xe8dcc8, 0xd8b48a, 0xc98a6b, 0x8fb8c9, 0xf2e6d0, 0xb8a88a, 0xe0a080, 0x7fb0a0],
  car: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1a1a1a, 0x16a085, 0xd35400],
  neon: [0xff2e88, 0x00e5ff, 0xffd23f, 0x7cff5e, 0xff6b35],
};
