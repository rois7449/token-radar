// token-radar-01 entrypoint. Node 22, standard library only, no network.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Reads the sealed snapshot, builds the radar board with the radar-2 model
// (lib/model.ts), and writes the submission output: board.json, data.js,
// the dashboard and the screenshots, and dossier.json built with the kit's
// own vendor/makefun-board.ts. Runs twice and writes the same bytes both
// times: no wall clock, no randomness, no network, sorted iteration.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, boardIssue, MODEL_VERSION } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function usage(): never {
  console.error(
    'usage: node main.ts --input <snapshot.json|dir> [--output <dir>]\n' +
      '  or set MAKEFUN_OUTPUT_DIR. Reads /input/snapshot.json by default.',
  );
  process.exit(2);
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) input = argv[++i];
    else if (argv[i] === '--output' && argv[i + 1]) output = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') usage();
    else usage();
  }
  if (!output) usage();
  return { input, output };
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshotPath = existsSync(input) && !input.endsWith('.json') ? join(input, 'snapshot.json') : input;
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const board = buildBoard(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`board fails the gate: ${issue}`);

  mkdirSync(output, { recursive: true });
  const boardJson = {
    model_version: MODEL_VERSION,
    model: {
      formula:
        'implied = TVL x 0.30 x (1 + clamp(change_7d,-60,120)/100 x 0.60) x (0.60 + min(age_days,1095)/1095 x 0.40) x (1 + 0.04 x min(chains,5)) x category_multiple',
      base_multiple: 0.3,
      growth_weight: 0.6,
      growth_clamp: [-60, 120],
      maturity_floor: 0.6,
      maturity_cap_days: 1095,
      breadth_per_chain: 0.04,
      breadth_max_chains: 5,
      unknown_age_days: 365,
    },
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    watchlist: snapshot.watchlist,
    row_count: board.rows.length,
    live_count: board.live.length,
    rows: board.rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      implied_value_usd: r.implied_value_usd,
      farm_steps: r.farm_steps,
    })),
  };
  writeFileSync(join(output, 'board.json'), JSON.stringify(boardJson, null, 2) + '\n', 'utf8');

  const data = {
    model_version: MODEL_VERSION,
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    protocol_count: snapshot.protocols.length,
    pre_token_count: snapshot.protocols.filter(
      (p) => p.gecko_id === null && p.symbol === null,
    ).length,
    rows: board.rows,
    live: board.live,
    watchlist: snapshot.watchlist,
  };
  writeFileSync(
    join(output, 'data.js'),
    'window.RADAR = ' + JSON.stringify(data) + ';\n',
    'utf8',
  );

  cpSync(join(HERE, 'dashboard'), join(output, 'dashboard'), { recursive: true });
  cpSync(join(HERE, 'screenshots'), join(output, 'screenshots'), { recursive: true });

  const dossier = buildDossier(resolve(output), { text_max_bytes: 65536 });
  writeFileSync(join(output, 'dossier.json'), dossier);

  console.log(
    `radar-2: ${board.rows.length} rows (${board.live.length} live), ` +
      `board.json + data.js + dashboard + screenshots written to ${resolve(output)}`,
  );
}

main();
