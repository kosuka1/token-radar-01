// Token launch radar entrypoint.
//
// Reads the sealed snapshot, builds the ranked board with lib/model.ts, and
// writes everything the gate reads into the output directory:
//
//   board.json    the ranked board (slug, name, rank, implied value, farm steps)
//   data.js       the dashboard's data, beside the page at the output root
//   dashboard/    copied from this repository
//   screenshots/  copied from this repository
//   dossier.json  buildDossier's bytes over dashboard/ and screenshots/
//
// The program is deterministic: two runs on the same snapshot write the same
// bytes. It exits non-zero when the board it built would fail the gate's own
// shape checks, or when the repository does not hold 3 to 4 screenshots.
//
// Run it the way the grader does:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, type RadarData, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));

function inputPath(argv: string[]): string {
  const at = argv.indexOf('--input');
  if (at >= 0 && argv[at + 1]) return argv[at + 1]!;
  return '/input/snapshot.json';
}

/** The first way the built board breaks the gate's shape, or null when it holds. */
function boardIssue(data: RadarData, snapshot: Snapshot): string | null {
  const rows = data.rows;
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows, outside 100..4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of rows) {
    if (!slugs.has(r.slug)) return `row slug ${r.slug} is not one of the snapshot's protocols`;
    if (seen.has(r.slug)) return `row slug ${r.slug} appears twice`;
    seen.add(r.slug);
    if (!r.name) return `row ${r.slug} has an empty name`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `row ${r.slug} implied value ${r.implied_value_usd} is not a positive whole number of dollars in range`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `row ${r.slug} holds ${r.farm_steps.length} farm steps, outside 3..12`;
    }
    for (const s of r.farm_steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `row ${r.slug} has a farm step of ${len} characters, outside 20..600`;
    }
  }
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `ranks are not exactly 1..${byRank.length}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${byRank[i]!.rank}`;
    }
  }
  if (byRank.length >= 2 && byRank.every((r) => r.implied_value_usd === byRank[0]!.implied_value_usd)) {
    return 'every implied value is the same; the board ranks nothing by value';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

function screenshotCount(): number {
  const names = readdirSync(join(repoRoot, 'screenshots'), { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name);
  return names.length;
}

function main(): void {
  const snapshot = JSON.parse(readFileSync(inputPath(process.argv.slice(2)), 'utf8')) as Snapshot;
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  const data = buildRadar(snapshot);
  const issue = boardIssue(data, snapshot);
  if (issue !== null) {
    console.error(`token-radar: board refused: ${issue}`);
    process.exit(1);
  }
  const shots = screenshotCount();
  if (shots < 3 || shots > 4) {
    console.error(`token-radar: screenshots/ holds ${shots} images, outside 3..4`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  const board = {
    rows: data.rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      implied_value_usd: r.implied_value_usd,
      farm_steps: r.farm_steps,
    })),
  };
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(board)}\n`);
  writeFileSync(join(outDir, 'data.js'), `window.RADAR = ${JSON.stringify(data)};\n`);

  cpSync(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: 65536 }));

  console.log(
    `token-radar ${data.model_version}: ${data.rows.length} board rows, ${data.live.length} live, ` +
      `held-out error ${data.global.heldout_err ?? 'n/a'} on ${data.global.heldout_n} peers -> ${outDir}`,
  );
}

main();
