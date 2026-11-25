# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kosuka1/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kosuka1/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over one sealed DefiLlama snapshot (758 protocols, 14 Nov 2026). It ranks the 210 protocols whose token does not exist yet — all 40 on the snapshot's watchlist plus the 170 strongest below its $50M floor — by what that token would be worth if the protocol's record stayed as it is, and gives every row a concrete farm plan with costs and times.

The model (**radar-3**) measures its multiples instead of picking them, and then checks them:

```
implied value = TVL × category multiple × growth factor × maturity factor × breadth factor
```

- **Category multiple** — for each category, the protocols in the same snapshot whose token already trades give a market-cap/TVL median; the multiple used is that median shrunk toward the market median (×0.246) by n/(n+6) traded peers and clamped to [×0.03, ×1.50], so a category with one traded peer cannot be priced by a single outlier. The dashboard prints every category's peer count, raw median and shrunk multiple.
- **Held-out check** — every multiple is also fitted on one deterministic half of its category's traded peers (alternating by slug) and tested on the other half; the dashboard prints the holdout error beside the multiple, and the pooled median error for the whole board. The board still prices with the full-peer multiple — the holdout is reported validation, not a second model.
- **Token odds** — for each category, the share of its comparable protocols (traded plus pre-token, exchanges excluded) that already record a token. Shown in each detail view as a base rate among peers, never as a prediction that the protocol will issue one; categories with fewer than five comparable protocols show no odds.
- **Growth factor** — the 7-day TVL change through a saturating curve: a steady week counts, a one-week spike cannot double a price.
- **Maturity factor** — the token-free track record: rises with survival, flattens after about three years.
- **Breadth factor** — a small credit for each chain the protocol already runs on, up to ten extra chains.
- **Costed farm plans** — every step's gas is priced on the protocol's cheapest listed chain from stated bands (Ethereum ~$3.00/tx, BNB Chain/Avalanche/Bitcoin/Tron ~$0.30, the cheap L2s and Solana ~$0.08, everything else ~$0.25), and each detail view totals the plan's gas, active minutes and hold days. Capital is not a cost — it stays in the position.

No protocol's name is ever an input; the same function scores every row. Protocols that already trade are never ranked — they are the measuring stick, shown in the dashboard's "Already trading" view beside the calibration table.

The dashboard is a static page (no framework, no network): a sortable, filterable board, a detail view per protocol with the full value decomposition and farm plan, and a sandbox that re-ranks the board live under constants the reader changes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

This writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser to use the radar. Node 22.18 or later, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9dkktyzh&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
