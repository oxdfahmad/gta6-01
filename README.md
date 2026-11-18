[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/oxdfahmad/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/oxdfahmad/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay — Make GTA 6

An original open-world crime game for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).
Sun, sea, and a city that never stops moving. You are **Rio**, new in town; **Marisol** has work
for you — if you can drive.

## The game

A seeded coastal city (3200×2600) with avenues, streets, parks, a beach and a wooden pier
into the bay. Everything runs offline from static files under `game/` — no network, no account.

- **Drive or walk** — car physics with collisions, or get out and walk the sidewalks
- **Steal cars** — take any traffic car; do it in front of the police and your wanted level rises
- **Wanted system** — 0–5 stars, police cruisers chase you, and getting BUSTED costs a $150 fine
- **Traffic and pedestrians** — cars cruise the grid, people wander, flee and panic
- **5 missions with a story** — checkpoints, taxi fares with speed tips, a 2-lap street race
  against 3 rivals, hot deliveries, and a big escape from the pier at wanted level 3
- **HUD with minimap** — cash, stars, speed, gear, objective, timer, and a live minimap
- **Combat** — punch on foot (F)
- **Save** — progress, cash and best race placement save to localStorage automatically
- **Sound** — every effect synthesized live with Web Audio, plus an 8-second ambient loop
  (`game/assets/solmar-loop.wav`) generated for this entry

## Play

Open `game/index.html` in a desktop browser, or serve the folder:

```sh
node serve.ts   # serves game/ at http://localhost:8080 (if present)
```

Controls: **WASD / arrows** drive · **E** enter/exit/steal car · **F** punch · **Space** honk ·
**P / Esc** pause · **M** mute.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output`
and writes `/output/dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`.
