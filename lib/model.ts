// Token launch radar model, version "radar-3".
//
// The board ranks pre-token protocols by an implied launch value derived only
// from the sealed snapshot's own figures:
//
//   implied = TVL x category multiple x growth x maturity x breadth
//
// The category multiple is the median market-cap/TVL of traded peers in the
// category, shrunk toward the global median. radar-3 adds three things on top
// of the radar-2 model, all still derived from the snapshot alone:
//
//   (a) a held-out fit of every category multiple: peers are split in half by
//       sorted slug, the multiple is fitted on one half and scored on the
//       other, and the median absolute log error is reported per category and
//       pooled. The board still uses the full-peer multiple; the held-out
//       numbers are a validation strip, not a second model.
//   (b) token odds per category: the share of comparable protocols in the
//       snapshot that already record a token. A base rate, not a prediction.
//   (c) fully costed farm plans: every step prices its gas on the protocol's
//       cheapest listed chain from a small fee-band table, and each plan
//       carries a total (gas, active minutes, hold days).
//
// No protocol name is an input anywhere below: categories, chains, TVL, age
// and seven-day change are the only signals.

export const MODEL_VERSION = 'radar-3';

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface CalibrationRow {
  category: string;
  peers: number;
  multiple: number;
  heldout_n: number;
  heldout_err: number | null;
}

export interface FarmPlanTotal {
  gas_usd: number;
  active_minutes: number;
  hold_days: number;
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  group: 'watchlist' | 'early';
  multiple: number;
  growth_sat: number;
  growth_factor: number;
  maturity: number;
  breadth: number;
  implied_value_usd: number;
  token_odds: number | null;
  odds_base: number;
  odds_traded: number;
  cheap_chain: string | null;
  cheap_fee: number | null;
  farm_steps: string[];
  farm_plan_total: FarmPlanTotal;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface RadarData {
  model_version: string;
  as_of: string;
  floor_usd: number;
  global: {
    median_multiple: number;
    heldout_err: number | null;
    heldout_n: number;
    peers: number;
  };
  fee_bands: {
    ethereum: number;
    mid: number;
    cheap: number;
    fallback: number;
    mid_chains: string[];
    cheap_chains: string[];
  };
  calibration: CalibrationRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

// ------------------------------------------------------------------ helpers

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const round4 = (x: number): number => Math.round(x * 10000) / 10000;
const round2 = (x: number): number => Math.round(x * 100) / 100;
const bySlug = (a: SnapshotProtocol, b: SnapshotProtocol): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** Whole dollars with thousands separators, e.g. 1646797086 -> "$1,646,797,086". */
export function fmtMoney(n: number): string {
  const neg = n < 0;
  const digits = String(Math.round(Math.abs(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return `${neg ? '-' : ''}$${out}`;
}

/** A per-transaction gas price, e.g. 0.08 -> "$0.08", 3 -> "$3.00". */
export function fmtFee(x: number): string {
  return `$${x.toFixed(2)}`;
}

/** A farm step, trimmed and kept inside the gate's 600-character cap. */
function stepText(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= 600) return t;
  const cut = t.slice(0, 597);
  const at = cut.lastIndexOf(' ');
  return `${at > 400 ? cut.slice(0, at) : cut}...`;
}

// ------------------------------------------------------------- fee bands

// Typical cost of one transaction, in USD, by chain name as the snapshot
// spells it. Ethereum is the expensive band; Binance, Avalanche, Bitcoin and
// Tron sit in the middle; the cheap layer-2s and Solana are the low band;
// every other chain takes the fallback. The dashboard's method view prints
// these bands so a reader can audit every farm plan's gas figures.
const FEE_ETHEREUM = 3.0;
const FEE_MID = 0.3;
const FEE_CHEAP = 0.08;
const FEE_FALLBACK = 0.25;
const MID_CHAINS = ['Binance', 'Avalanche', 'Bitcoin', 'Tron'];
const CHEAP_CHAINS = [
  'Arbitrum',
  'Arbitrum Nova',
  'Base',
  'Blast',
  'Boba',
  'Celo',
  'Fantom',
  'Fraxtal',
  'Gnosis',
  'Linea',
  'Manta',
  'Mantle',
  'Metis',
  'Mode',
  'Optimism',
  'Polygon',
  'Scroll',
  'Solana',
  'Sonic',
  'Taiko',
  'Zora',
  'zkSync Era',
];
const MID_SET = new Set(MID_CHAINS);
const CHEAP_SET = new Set(CHEAP_CHAINS);

export function feeOf(chain: string): number {
  if (chain === 'Ethereum') return FEE_ETHEREUM;
  if (MID_SET.has(chain)) return FEE_MID;
  if (CHEAP_SET.has(chain)) return FEE_CHEAP;
  return FEE_FALLBACK;
}

/** The cheapest chain a protocol lists, by fee band, earliest listed on a tie. */
export function cheapChainOf(chains: string[]): string | null {
  let best: string | null = null;
  let bestFee = Number.POSITIVE_INFINITY;
  for (const c of chains) {
    const f = feeOf(c);
    if (f < bestFee) {
      bestFee = f;
      best = c;
    }
  }
  return best;
}

// ------------------------------------------------------------- calibration

const MULTIPLE_MIN = 0.03;
const MULTIPLE_MAX = 1.5;
const SHRINK_K = 6;

/** A traded peer for calibration: a recorded market cap over real TVL, CEX aside. */
function isPeer(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX';
}

/** A protocol records a token when DefiLlama carries a gecko id or a symbol for it. */
function recordsToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** The shrunk category multiple: median peer ratio pulled toward the global median. */
function shrunkMultiple(ratios: number[], globalMedian: number): number {
  const n = ratios.length;
  if (n === 0) return clamp(globalMedian, MULTIPLE_MIN, MULTIPLE_MAX);
  return clamp((n * median(ratios) + SHRINK_K * globalMedian) / (n + SHRINK_K), MULTIPLE_MIN, MULTIPLE_MAX);
}

interface Calibration {
  globalMedian: number;
  globalHeldoutErr: number | null;
  globalHeldoutN: number;
  peerCount: number;
  multipleOf: Map<string, number>;
  peersOf: Map<string, number>;
  rows: CalibrationRow[];
}

/**
 * Fit every category multiple on all its traded peers, and validate it on a
 * held-out half: peers sorted by slug alternate into fit and holdout halves,
 * the multiple is fitted on the fit half alone, and the holdout half scores
 * it by median absolute log error of predicted vs actual market-cap/TVL.
 */
function calibrate(snapshot: Snapshot): Calibration {
  const peers = snapshot.protocols.filter(isPeer);
  const globalMedian = median(peers.map((p) => p.mcap_usd! / p.tvl_usd));

  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of peers) {
    const cat = p.category ?? 'Uncategorized';
    const list = byCategory.get(cat);
    if (list) list.push(p);
    else byCategory.set(cat, [p]);
  }

  const multipleOf = new Map<string, number>();
  const peersOf = new Map<string, number>();
  const rows: CalibrationRow[] = [];
  const pooledErrors: number[] = [];

  const categories = new Set<string>();
  for (const p of snapshot.protocols) categories.add(p.category ?? 'Uncategorized');

  for (const cat of categories) {
    const catPeers = (byCategory.get(cat) ?? []).slice().sort(bySlug);
    const ratios = catPeers.map((p) => p.mcap_usd! / p.tvl_usd);
    const multiple = shrunkMultiple(ratios, globalMedian);
    multipleOf.set(cat, multiple);
    peersOf.set(cat, catPeers.length);

    const fit = catPeers.filter((_, i) => i % 2 === 0);
    const hold = catPeers.filter((_, i) => i % 2 === 1);
    let heldoutErr: number | null = null;
    if (fit.length > 0 && hold.length > 0) {
      const fitMultiple = shrunkMultiple(
        fit.map((p) => p.mcap_usd! / p.tvl_usd),
        globalMedian,
      );
      const errors = hold.map((p) => Math.abs(Math.log(fitMultiple / (p.mcap_usd! / p.tvl_usd))));
      heldoutErr = round4(median(errors));
      pooledErrors.push(...errors);
    }
    rows.push({
      category: cat,
      peers: catPeers.length,
      multiple: round4(multiple),
      heldout_n: hold.length,
      heldout_err: heldoutErr,
    });
  }

  rows.sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  return {
    globalMedian,
    globalHeldoutErr: pooledErrors.length > 0 ? round4(median(pooledErrors)) : null,
    globalHeldoutN: pooledErrors.length,
    peerCount: peers.length,
    multipleOf,
    peersOf,
    rows,
  };
}

// ------------------------------------------------------------- token odds

interface Odds {
  odds: number | null;
  base: number;
  traded: number;
}

/**
 * Token odds per category: of the protocols the snapshot lists in a category,
 * the share that already record a token. CEX is excluded (an exchange's token
 * is not a farmable launch), and a category with fewer than five protocols
 * reads as too few peers to call.
 */
function tokenOdds(snapshot: Snapshot): Map<string, Odds> {
  const total = new Map<string, number>();
  const traded = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const cat = p.category ?? 'Uncategorized';
    total.set(cat, (total.get(cat) ?? 0) + 1);
    if (recordsToken(p)) traded.set(cat, (traded.get(cat) ?? 0) + 1);
  }
  const out = new Map<string, Odds>();
  for (const [cat, base] of total) {
    const t = traded.get(cat) ?? 0;
    out.set(cat, { odds: cat === 'CEX' || base < 5 ? null : round4(t / base), base, traded: t });
  }
  return out;
}

// ------------------------------------------------------------- value model

const GROWTH_WEIGHT = 0.45;

function ageDaysOf(p: SnapshotProtocol, asOf: string): number {
  if (!p.listed_at) return 0;
  const ms = Date.parse(asOf) - Date.parse(p.listed_at);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86400000));
}

/** Seven-day growth, clamped then saturated so a spike cannot dominate the value. */
function growthSat(change7d: number | null): number {
  const g = clamp(change7d ?? 0, -60, 120);
  return g / (1 + Math.abs(g) / 50);
}

function growthFactor(change7d: number | null): number {
  return 1 + (GROWTH_WEIGHT * growthSat(change7d)) / 100;
}

/** Older protocols that still record no token have had longer to be farmed early. */
function maturityOf(ageDays: number): number {
  return 0.6 + (0.45 * ageDays) / (ageDays + 540);
}

/** Each extra chain is another surface to farm; the bonus caps at ten extra chains. */
function breadthOf(chainCount: number): number {
  return 1 + 0.015 * Math.min(Math.max(chainCount - 1, 0), 10);
}

// ------------------------------------------------------------- farm plans

/** Working capital for a plan, by the protocol's TVL tier. */
function capitalOf(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 1000;
  if (tvlUsd >= 300_000_000) return 500;
  if (tvlUsd >= 100_000_000) return 300;
  if (tvlUsd >= 50_000_000) return 200;
  if (tvlUsd >= 20_000_000) return 100;
  return 50;
}

/** How long a plan holds, from the protocol's age and seven-day momentum. */
function holdDaysOf(ageDays: number, change7d: number | null): number {
  const g = change7d ?? 0;
  if (g > 15) return 90;
  if (g < -15) return 30;
  if (ageDays > 1095) return 45;
  return 60;
}

type ActionGroup = 'lend' | 'dex' | 'yield' | 'stake' | 'trade' | 'bridge' | 'rwa' | 'cex' | 'use';

function actionGroupOf(category: string): ActionGroup {
  switch (category) {
    case 'Lending':
    case 'CDP':
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'lend';
    case 'Dexs':
      return 'dex';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Leveraged Farming':
      return 'yield';
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaked BTC':
    case 'Staking Pool':
      return 'stake';
    case 'Derivatives':
    case 'Basis Trading':
      return 'trade';
    case 'Bridge':
    case 'Canonical Bridge':
      return 'bridge';
    case 'RWA':
      return 'rwa';
    case 'CEX':
      return 'cex';
    default:
      return 'use';
  }
}

interface Step {
  text: string;
  gas: number;
  minutes: number;
}

/**
 * A concrete, costed farm plan for one protocol. Every step prices its gas on
 * the protocol's cheapest listed chain (the main action also names the
 * working capital) and says how long it takes; the plan total sums the steps.
 * Steps are derived from category, chains, TVL, age and seven-day change.
 */
function farmPlan(p: SnapshotProtocol, ageDays: number): { steps: string[]; total: FarmPlanTotal } {
  const name = p.name;
  const chains = p.chains ?? [];
  const cheap = cheapChainOf(chains) ?? 'Ethereum';
  const fee = feeOf(cheap);
  const capital = capitalOf(p.tvl_usd);
  const holdDays = holdDaysOf(ageDays, p.change_7d);
  const weeks = Math.max(1, Math.round(holdDays / 7));
  const group = actionGroupOf(p.category ?? 'Uncategorized');
  const g = p.change_7d;

  const steps: Step[] = [];

  steps.push({
    text: stepText(
      `Create a fresh wallet for farming and fund it on ${cheap}, the cheapest chain ${name} lists, where a transaction costs about ${fmtFee(fee)} of gas. Bridge in only what this plan needs and keep the rest off-chain. Takes about 20 minutes.`,
    ),
    gas: 2 * fee,
    minutes: 20,
  });

  const mainByGroup: Record<ActionGroup, string> = {
    lend: `Supply about ${fmtMoney(capital)} of a major stablecoin or ETH into ${name} on ${cheap} and leave it earning; this position is the core of the record. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
    dex: `Provide about ${fmtMoney(capital)} of liquidity to a major pair on ${name} (${cheap}) and keep it in the pool; steady liquidity is what a launch usually rewards. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
    yield: `Deposit about ${fmtMoney(capital)} into one of ${name}'s main vaults on ${cheap} and leave it compounding; the vault position is the core of the record. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
    stake: `Stake about ${fmtMoney(capital)} of the base asset through ${name} on ${cheap} and hold the receipt token; the staked balance is the core of the record. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
    trade: `Open small, hedged positions on ${name} (${cheap}) with about ${fmtMoney(capital)} of margin and close them cleanly; steady, real volume is the record that counts. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
    bridge: `Bridge about ${fmtMoney(capital)} across ${name} on ${cheap} and back again; completed transfers are the record a launch usually rewards. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
    rwa: `Deposit about ${fmtMoney(capital)} into ${name}'s RWA product on ${cheap} and hold the position; a funded, held balance is the core of the record. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
    cex: `Open an account with ${name}, deposit about ${fmtMoney(capital)} and trade spot in small, regular sizes; a funded account with steady activity is the record that counts. Budget about ${fmtFee(2 * fee)} in network fees and 15 minutes.`,
    use: `Use ${name}'s core product on ${cheap} with about ${fmtMoney(capital)} and leave the position in place; real, repeated use is the record a launch usually rewards. Budget about ${fmtFee(2 * fee)} of gas and 15 minutes.`,
  };
  steps.push({ text: stepText(mainByGroup[group]), gas: 2 * fee, minutes: 15 });

  const secondByGroup: Record<ActionGroup, string> = {
    lend: `Borrow a small amount against the supplied collateral and repay it a few days later, so the account shows both sides of the market. About ${fmtFee(fee)} of gas and 10 minutes.`,
    dex: `Make a few small swaps through the same pools each week, in both directions, so the wallet shows trading as well as liquidity. About ${fmtFee(fee)} of gas and 10 minutes.`,
    yield: `Turn on auto-compounding if the vault offers it, and move a small part into a second vault so the record is not a single deposit. About ${fmtFee(fee)} of gas and 10 minutes.`,
    stake: `Put the receipt token to work in a second protocol that accepts it, in a small size, so the stake shows up in more than one place. About ${fmtFee(fee)} of gas and 10 minutes.`,
    trade: `Also provide a small amount of liquidity to the margin pool, so the account is on both sides of the market. About ${fmtFee(fee)} of gas and 10 minutes.`,
    bridge: `Use a second route or a second destination chain once, so the record is not a single repeated transfer. About ${fmtFee(fee)} of gas and 10 minutes.`,
    rwa: `Complete any identity or eligibility steps the product asks for, and keep the confirmation; verified holders are usually first in line. About ${fmtFee(fee)} of gas and 10 minutes.`,
    cex: `Put a small balance into its earn or staking product as well, so the account holds more than a trading balance. About ${fmtFee(fee)} in fees and 10 minutes.`,
    use: `Try a second feature of the product once — a different pool, market or tool — so the record shows breadth, not one repeated click. About ${fmtFee(fee)} of gas and 10 minutes.`,
  };
  steps.push({ text: stepText(secondByGroup[group]), gas: fee, minutes: 10 });

  steps.push({
    text: stepText(
      `Repeat the main action once a week for about ${weeks} weeks: small, regular use reads better than one large deposit. Each repeat costs about ${fmtFee(2 * fee)} of gas on ${cheap} and about 5 minutes.`,
    ),
    gas: 2 * fee * weeks,
    minutes: 5 * weeks,
  });

  if (chains.length >= 3) {
    const others = chains.filter((c) => c !== cheap);
    const second = cheapChainOf(others) ?? others[0]!;
    const fee2 = feeOf(second);
    steps.push({
      text: stepText(
        `${name} also runs on ${second}; repeat the main action there once so the record spans two chains instead of one. Budget about ${fmtFee(2 * fee2)} of gas and 15 minutes.`,
      ),
      gas: 2 * fee2,
      minutes: 15,
    });
  }

  let momentum: string;
  if (g !== null && g >= 10) {
    momentum = `TVL is up ${g.toFixed(1)}% in seven days; momentum like that draws attention, so keep the position at the planned size and add only on calm days. About 5 minutes a week to check.`;
  } else if (g !== null && g <= -10) {
    momentum = `TVL is down ${Math.abs(g).toFixed(1)}% in seven days; start with half the planned size and add the rest only if TVL steadies. About 5 minutes a week to check.`;
  } else if (ageDays >= 730 && p.listed_at) {
    momentum = `${name} has been tracked since ${p.listed_at.slice(0, 4)} with no token recorded; a long, steady history is what launch allocations usually reward, so consistency beats size here. About 5 minutes a week to check.`;
  } else {
    momentum = `Check ${name}'s TVL and announcements once a week and keep every transaction record; a clean, steady history is what counts if a token comes. About 5 minutes a week.`;
  }
  steps.push({ text: stepText(momentum), gas: 0, minutes: 5 * weeks });

  steps.push({
    text: stepText(
      `Hold the position for about ${holdDays} days in total, claiming any points or rewards as they appear, and keep a simple log of dates and amounts. If a token is announced, the history is already in place. About 10 minutes a month.`,
    ),
    gas: 0,
    minutes: 10,
  });

  const total: FarmPlanTotal = {
    gas_usd: round2(steps.reduce((n, s) => n + s.gas, 0)),
    active_minutes: steps.reduce((n, s) => n + s.minutes, 0),
    hold_days: holdDays,
  };
  return { steps: steps.map((s) => s.text), total };
}

// ------------------------------------------------------------- the board

const EARLY_COUNT = 170;
const LIVE_COUNT = 24;

/**
 * Build the whole radar from the snapshot: the ranked board (the watchlist
 * plus the largest pre-token protocols below the floor), the live set of
 * already-trading protocols shown apart, and the calibration strip.
 */
export function buildRadar(snapshot: Snapshot): RadarData {
  const cal = calibrate(snapshot);
  const odds = tokenOdds(snapshot);
  const bySlugMap = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlistSet = new Set(snapshot.watchlist);

  const watchlist = snapshot.watchlist.map((s) => bySlugMap.get(s)).filter((p): p is SnapshotProtocol => p !== undefined);
  const early = snapshot.protocols
    .filter((p) => !recordsToken(p) && p.tvl_usd < snapshot.floor_usd && !watchlistSet.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlug(a, b))
    .slice(0, EARLY_COUNT);

  const boardProtocols: { p: SnapshotProtocol; group: 'watchlist' | 'early' }[] = [
    ...watchlist.map((p) => ({ p, group: 'watchlist' as const })),
    ...early.map((p) => ({ p, group: 'early' as const })),
  ];

  const rows: RadarRow[] = boardProtocols.map(({ p, group }) => {
    const cat = p.category ?? 'Uncategorized';
    const multiple = cal.multipleOf.get(cat) ?? clamp(cal.globalMedian, MULTIPLE_MIN, MULTIPLE_MAX);
    const age = ageDaysOf(p, snapshot.as_of);
    const sat = growthSat(p.change_7d);
    const growth = growthFactor(p.change_7d);
    const maturity = maturityOf(age);
    const breadth = breadthOf((p.chains ?? []).length);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity * breadth));
    const o = odds.get(cat) ?? { odds: null, base: 0, traded: 0 };
    const cheap = cheapChainOf(p.chains ?? []);
    const plan = farmPlan(p, age);
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: cat,
      chains: p.chains ?? [],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      group,
      multiple: round4(multiple),
      growth_sat: round4(sat),
      growth_factor: round4(growth),
      maturity: round4(maturity),
      breadth: round4(breadth),
      implied_value_usd: implied,
      token_odds: o.odds,
      odds_base: o.base,
      odds_traded: o.traded,
      cheap_chain: cheap,
      cheap_fee: cheap === null ? null : feeOf(cheap),
      farm_steps: plan.steps,
      farm_plan_total: plan.total,
    };
  });

  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || bySlug(a, b))
    .slice(0, LIVE_COUNT)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorized',
      chains: p.chains ?? [],
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: p.tvl_usd > 0 ? round4(p.mcap_usd! / p.tvl_usd) : 0,
    }));

  return {
    model_version: MODEL_VERSION,
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    global: {
      median_multiple: round4(cal.globalMedian),
      heldout_err: cal.globalHeldoutErr,
      heldout_n: cal.globalHeldoutN,
      peers: cal.peerCount,
    },
    fee_bands: {
      ethereum: FEE_ETHEREUM,
      mid: FEE_MID,
      cheap: FEE_CHEAP,
      fallback: FEE_FALLBACK,
      mid_chains: [...MID_CHAINS],
      cheap_chains: [...CHEAP_CHAINS],
    },
    calibration: cal.rows,
    rows,
    live,
  };
}
