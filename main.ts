// Solmar Bay — gta6-01 entry program (Node 22, standard library only).
//
// Hands the game in: copies this repository's game/ and screenshots/ into the
// output directory and writes /output/dossier.json with the vendored make.fun
// library (vendor/makefun-game.ts, the kit's copy, unchanged). The dossier is
// what the judge reads: the game's source as text plus the screenshots.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The scorer's caps (from the kit's reference/gate.json) are passed to
// buildDossier so an entry this program writes can never exceed them:
//   game/ at most 993 files and 48 MiB, paths at most 1000 bytes,
//   3-4 screenshots at most 256 KiB each, dossier text at most 163,840 bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(repoRoot, 'screenshots');
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
