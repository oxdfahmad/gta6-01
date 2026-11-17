// Solmar Bay — the gta6-01 entrypoint, re-authored in this session.
// It hands in game/ + screenshots/ as a static open-world game (three.js
// vendored under game/vendor/). The game itself is plain static files a
// desktop browser loads offline — game/index.html and its ES modules, no
// library fetch and no network request — and this program copies them to
// /output and writes /output/dossier.json, the summary the judge reads,
// using the vendored make.fun library.
//
// The kit's starter shipped a different game in this file's place (a 2D
// canvas dodger with a paddle, falling blocks and coins); this entry
// replaces it with the Solmar Bay open world. Put 3 or 4 PNG or JPEG
// screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open it on localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Authored check, run before anything is copied: measure game/ and the
// screenshots so a bloated, empty or oversized build is caught here, not
// by the grader. The caps below are the scorer's own (reference/gate.json);
// this log is only a sanity read.
function measureGame(dir, base = '') {
  let files = 0;
  let bytes = 0;
  let biggest = { path: '', size: 0 };
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = base ? base + '/' + name : name;
    const st = statSync(p);
    if (st.isDirectory()) {
      const sub = measureGame(p, rel);
      files += sub.files;
      bytes += sub.bytes;
      if (sub.biggest.size > biggest.size) biggest = sub.biggest;
    } else {
      files += 1;
      bytes += st.size;
      if (st.size > biggest.size) biggest = { path: rel, size: st.size };
    }
  }
  return { files, bytes, biggest };
}

const shape = measureGame(join(here, 'game'));
console.log(
  `Solmar Bay: ${shape.files} game files, ${(shape.bytes / 1048576).toFixed(2)} MiB, ` +
  `largest ${shape.biggest.path} (${shape.biggest.size} bytes)`,
);

// Screenshots: the cover is the first by name, and every shot must be a
// real render of the game's own code, 256 KiB or under, or the scorer
// refuses the entry. Report the set here so a bad shot is visible in
// the run log before the dossier is built.
const shotDir = join(here, 'screenshots');
if (existsSync(shotDir)) {
  const shots = readdirSync(shotDir).sort();
  for (const name of shots) {
    const st = statSync(join(shotDir, name));
    console.log(`shot ${name}: ${(st.size / 1024).toFixed(1)} KiB`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
