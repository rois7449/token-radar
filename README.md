# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rois7449/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rois7449/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar (model radar-2): ranks every pre-token protocol DefiLlama tracks by the implied value of its launch, from a sealed snapshot. 183 rows, 40/40 watchlist covered, a dark dashboard with a detail view and a 6-step farm plan per protocol. The implied value follows from the snapshot's own figures (TVL, 7-day growth, time running with no token, chain breadth, category), never from a hardcoded list of names. The dashboard recomputes every row in-page, so the code and the board always agree.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22 or later, standard library only, no network. Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Runs twice and writes the same bytes both times.

## The model

```
implied = TVL x 0.30
        x (1 + clamp(change_7d, -60, 120) / 100 x 0.60)
        x (0.60 + min(age_days, 1095) / 1095 x 0.40)
        x (1 + 0.04 x min(chains, 5))
        x category_multiple
```

Category multiples: Dexs 1.15, Lending / Derivatives / Prediction Market 1.10, Yield / RWA / Yield Aggregator / Liquidity Manager / CDP 1.05, everything else 1.00. See `lib/model.ts` and the dashboard's "How implied value is computed" panel.

---

<sub>Entered on [make.fun](https://make.fun/?ref=q01zn3wt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
