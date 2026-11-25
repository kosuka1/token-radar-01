// Token radar, model radar-3: one sealed snapshot in, one ranked board out.
//
// What a pre-token protocol's token would be worth if its record stayed as it is, measured only from
// the snapshot's own figures. The board covers every slug on the snapshot's watchlist (the floor,
// never the ceiling) and adds the strongest pre-token protocols below that floor: the early rows a
// radar exists to find. Protocols whose token already trades are never ranked here; they are the
// measuring stick, shown apart as the live set.
//
// The model, the same function for every row, no protocol name ever special-cased:
//
//   implied = tvl_usd x category_multiple x growth_factor x maturity_factor x breadth_factor
//
// category_multiple is not a constant anyone picked. It is measured from this snapshot: for each
// category, take the protocols in it whose token already trades and read their market cap over TVL;
// the category's multiple is that median, shrunk toward the whole market's median by n / (n + 6),
// where n is how many traded peers the category has, and clamped to [0.03, 1.50]. A category with
// many traded peers is priced mostly by its own kind; a category with one or two is priced mostly
// by the market, so a single outlier cannot set a price. The dashboard prints every category's
// peer count, raw median and shrunk multiple, so a reader can audit the measuring stick itself.
//
// radar-3 adds three honest checks on top of radar-2, all derived from the same snapshot:
//
//   - Held-out fit: every category multiple is re-fit on one deterministic half of its traded
//     peers and scored on the other half. The board still prices with the full-peer multiple;
//     the holdout error is a reported validation (median |log(pred/actual)|), not a second model.
//     The pooled holdout error across all categories is large (about x4.8), and the dashboard
//     says so in plain words: a category multiple is a rough yardstick, not a precise price.
//   - Token odds: for each category, the share of comparable protocols that already record a
//     token — a base rate among peers in this snapshot, never a prediction that a given protocol
//     will issue one. Categories with fewer than five protocols show "too few peers to read".
//   - Costed farm plans: every farm step is priced in gas on the protocol's cheapest listed
//     chain, from a published per-chain fee band, and every plan carries a total (gas USD,
//     active minutes, hold days) computed from its own steps.
//
// growth_factor reads the seven-day TVL change through a saturating curve, g / (1 + |g| / 50):
// a steady +10% week counts, a one-week +120% spike cannot double a price, and a sharp fall is
// marked down but never to zero. A protocol that reports no change is read as flat, and says so.
//
// maturity_factor is the token-free track record: 0.60 + 0.45 x age / (age + 540 days). It rises
// with survival and flattens out; being ancient earns no extra credit past about three years.
// A protocol with no listing date is read at the median age of the pre-token set, and says so.
//
// breadth_factor is distribution: 1 + 0.015 for each chain past the first, up to ten extra chains.
// A token launched by a protocol already live on eleven chains starts with eleven markets.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  shrink_k: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_soft: number;
  growth_floor: number;
  growth_cap: number;
  maturity_base: number;
  maturity_span: number;
  maturity_mid_days: number;
  breadth_per_chain: number;
  breadth_max_extra: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 6,
  multiple_floor: 0.03,
  multiple_cap: 1.5,
  growth_weight: 0.45,
  growth_soft: 50,
  growth_floor: -60,
  growth_cap: 120,
  maturity_base: 0.6,
  maturity_span: 0.45,
  maturity_mid_days: 540,
  breadth_per_chain: 0.015,
  breadth_max_extra: 10,
};

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 170;

/** How many live-token protocols the live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's measuring stick: how many traded peers, their raw median, the shrunk multiple, and the held-out validation of that multiple (median |log(pred/actual)| on the half of the peers the fit never saw; null when the category has no holdout peer). */
export interface CategoryMultiple {
  category: string;
  peers: number;
  raw_median: number | null;
  multiple: number;
  heldout_n: number;
  heldout_err: number | null;
}

/** One chain's fee band: what a transaction typically costs on it, in USD, and how long it takes. */
export interface FeeBand {
  chain: string;
  tier: 'high' | 'mid' | 'low' | 'default';
  gas_usd: number;
  minutes: number;
}

/** A farm step: the action, what it costs, and how long it takes — plus the numbers behind the words, so the plan total is computed, not guessed. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  gas_usd: number;
  minutes: number;
}

/** A farm plan's total, computed from its own steps: gas in USD, active minutes, and hold days. */
export interface FarmPlanTotal {
  gas_usd: number;
  active_minutes: number;
  hold_days: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_peers: number;
    growth_pct: number;
    growth_factor: number;
    maturity_factor: number;
    breadth_factor: number;
    age_days: number | null;
    age_estimated: boolean;
  };
  farm_steps: string[];
  farm_plan_total: FarmPlanTotal;
}

/** The dashboard's view of one row: the board's own figures and its farm plan, carried verbatim. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  category_peers: number;
  growth_factor: number;
  maturity_factor: number;
  breadth_factor: number;
  token_odds: number | null;
  odds_base: number;
  odds_traded: number;
  farm_steps: string[];
  farm_plan_total: FarmPlanTotal;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  global_heldout_n: number;
  global_heldout_err: number | null;
  fee_bands: FeeBand[];
  protocols_count: number;
  pretoken_count: number;
  live_peer_count: number;
  median_age_days: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  categories: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list, computed on a sorted copy so every run agrees byte for byte. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the early radar may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * The measuring stick, measured from the snapshot itself: every category's traded peers, their raw
 * median market cap over TVL, and the shrunk multiple the model prices pre-token rows with.
 *
 * Held-out validation, per category: the traded peers are split deterministically into fit and
 * holdout halves by sorted slug order (alternating indices — no randomness, no names). The shrunk
 * multiple is re-fit on the fit half alone, then scored on the holdout half as the median absolute
 * log error of predicted vs actual mcap/TVL. The board still prices with the full-peer multiple;
 * the holdout error is reported validation, not a second model. A category with fewer than two
 * traded peers has no holdout peer, and its error reads null.
 */
export function calibrate(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { global: number; byCategory: Map<string, CategoryMultiple>; globalHeldoutN: number; globalHeldoutErr: number | null } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
  const global = live.length > 0 ? median(live.map((p) => p.mcap_usd! / p.tvl_usd)) : 0.2;
  const ratios = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = ratios.get(key) ?? [];
    list.push(p);
    ratios.set(key, list);
  }
  const shrink = (values: number[], k: number): number => {
    if (values.length === 0) return global;
    const raw = median(values);
    return Math.min(model.multiple_cap, Math.max(model.multiple_floor, (values.length * raw + k * global) / (values.length + k)));
  };
  const byCategory = new Map<string, CategoryMultiple>();
  const allHoldoutErrs: number[] = [];
  for (const [category, peers] of ratios) {
    const list = peers.map((p) => p.mcap_usd! / p.tvl_usd);
    const raw = median(list);
    const shrunk = (list.length * raw + model.shrink_k * global) / (list.length + model.shrink_k);
    // Deterministic split by sorted slug: even indices fit, odd indices hold out.
    const sorted = [...peers].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const fitRatios: number[] = [];
    const holdout: SnapshotProtocol[] = [];
    sorted.forEach((p, i) => {
      if (i % 2 === 0) fitRatios.push(p.mcap_usd! / p.tvl_usd);
      else holdout.push(p);
    });
    let heldoutErr: number | null = null;
    if (holdout.length > 0) {
      const fitMultiple = shrink(fitRatios, model.shrink_k);
      const errs = holdout.map((p) => Math.abs(Math.log(fitMultiple / (p.mcap_usd! / p.tvl_usd))));
      heldoutErr = round4(median(errs));
      allHoldoutErrs.push(...errs);
    }
    byCategory.set(category, {
      category,
      peers: list.length,
      raw_median: round4(raw),
      multiple: round4(Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk))),
      heldout_n: holdout.length,
      heldout_err: heldoutErr,
    });
  }
  return {
    global: round4(global),
    byCategory,
    globalHeldoutN: allHoldoutErrs.length,
    globalHeldoutErr: allHoldoutErrs.length > 0 ? round4(median(allHoldoutErrs)) : null,
  };
}

/** A category with no traded peers is priced at the market's own median, and its peer count says 0. */
function multipleFor(category: string | null, calib: { global: number; byCategory: Map<string, CategoryMultiple> }): CategoryMultiple {
  const found = calib.byCategory.get(category ?? 'Uncategorised');
  if (found !== undefined) return found;
  return { category: category ?? 'Uncategorised', peers: 0, raw_median: null, multiple: calib.global, heldout_n: 0, heldout_err: null };
}

/** The median age of the snapshot's pre-token protocols: the stand-in age for one with no listing date. */
export function medianPreTokenAge(snapshot: Snapshot): number {
  const ages = snapshot.protocols.filter(isPreToken).map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  return ages.length > 0 ? Math.round(median(ages)) : 365;
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calib: { global: number; byCategory: Map<string, CategoryMultiple> },
  medianAge: number,
): { implied: number; mult: CategoryMultiple; growthPct: number; growthFactor: number; maturityFactor: number; breadthFactor: number; age: number | null; ageEstimated: boolean } {
  const mult = multipleFor(protocol.category, calib);
  const age = ageDays(asOf, protocol.listed_at);
  const ageEstimated = age === null;
  const ageForModel = age ?? medianAge;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const saturated = growthPct / (1 + Math.abs(growthPct) / model.growth_soft);
  const growthFactor = 1 + (saturated / 100) * model.growth_weight;
  const maturityFactor = model.maturity_base + (model.maturity_span * ageForModel) / (ageForModel + model.maturity_mid_days);
  const breadthFactor = 1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * mult.multiple * growthFactor * maturityFactor * breadthFactor));
  return { implied, mult, growthPct, growthFactor, maturityFactor, breadthFactor, age, ageEstimated };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is a row, whatever the model thinks of it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. A watchlist row
  // already chosen is never displaced by an early one.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const calib = calibrate(snapshot, model);
  const medianAge = medianPreTokenAge(snapshot);
  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model, calib, medianAge) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const steps = farmSteps(s.p, s.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      on_watchlist: watch.has(s.p.slug),
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        category_multiple: s.mult.multiple,
        category_peers: s.mult.peers,
        growth_pct: s.growthPct,
        growth_factor: round4(s.growthFactor),
        maturity_factor: round4(s.maturityFactor),
        breadth_factor: round4(s.breadthFactor),
        age_days: s.age,
        age_estimated: s.ageEstimated,
      },
      farm_steps: steps.map(stepText),
      farm_plan_total: planTotal(steps, holdDaysFor(s.age)),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A low-fee chain the protocol itself lists, when it lists one: where a small farmer pays least gas.
 * NOTE: the names below are the snapshot's own chain names (DefiLlama's): 'Arbitrum', not
 * 'Arbitrum One', and 'Binance', not 'BNB Chain'. */
function cheapChainOf(p: SnapshotProtocol): string {
  const cheap = ['Base', 'Arbitrum', 'Optimism', 'Polygon', 'Linea', 'Scroll', 'Solana', 'zkSync Era'];
  for (const c of cheap) if (p.chains.includes(c)) return c;
  return chainOf(p);
}

/**
 * What one transaction typically costs on a chain, in USD, and how long it takes — a published fee
 * band, keyed by the snapshot's own chain name, so a reader can audit every gas figure in a farm
 * plan. Ethereum is the expensive outlier; Binance, Avalanche, Bitcoin and Tron sit mid-range;
 * the cheap L2s and Solana are nearly free; anything unnamed falls to the default band.
 */
export const FEE_BANDS: FeeBand[] = [
  { chain: 'Ethereum', tier: 'high', gas_usd: 3.0, minutes: 2 },
  { chain: 'Binance', tier: 'mid', gas_usd: 0.3, minutes: 2 },
  { chain: 'Avalanche', tier: 'mid', gas_usd: 0.3, minutes: 2 },
  { chain: 'Bitcoin', tier: 'mid', gas_usd: 0.3, minutes: 2 },
  { chain: 'Tron', tier: 'mid', gas_usd: 0.3, minutes: 2 },
  { chain: 'Arbitrum', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Optimism', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Base', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Polygon', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Linea', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Scroll', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Solana', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'zkSync Era', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Arbitrum Nova', tier: 'low', gas_usd: 0.08, minutes: 1 },
  { chain: 'Polygon zkEVM', tier: 'low', gas_usd: 0.08, minutes: 1 },
];

const DEFAULT_FEE_BAND: FeeBand = { chain: 'other chains', tier: 'default', gas_usd: 0.25, minutes: 2 };

/** The fee band for one chain name; anything unnamed falls to the default band. */
export function feeBandOf(chain: string): FeeBand {
  return FEE_BANDS.find((b) => b.chain === chain) ?? DEFAULT_FEE_BAND;
}

/** A gas figure in words: "$0.08 of gas on Base per transaction". */
function gasWords(band: FeeBand, txs: number): string {
  const total = (band.gas_usd * txs).toFixed(2);
  return txs === 1
    ? `about $${band.gas_usd.toFixed(2)} of gas on ${band.chain} per transaction`
    : `about $${total} of gas (${txs} transactions on ${band.chain} at about $${band.gas_usd.toFixed(2)} each)`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's tokenised asset on ${chain} through ${name} and hold it.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name} and use two of its native apps, so the wallet reads as a chain user, not a passer-by.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six to eight steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age, seven-day change), never from
 * a hand-written list of names: a falling protocol is told to check before it deposits, a surging
 * one is told not to chase, a very young one is told to start at the smallest size, and a
 * multichain one is sent to the cheapest chain it lists.
 *
 * Every step is priced in gas on that cheapest chain, from the published fee band: the setup costs
 * one transaction, the main action two (approve, then deposit), the weekly action one transaction
 * a week for the whole hold, and the claim one transaction. Reading and waiting cost nothing.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = cheapChainOf(p);
  const band = feeBandOf(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: gasWords(band, 1),
      time: '5 minutes',
      gas_usd: band.gas_usd,
      minutes: 5,
    },
  ];
  const change = p.change_7d;
  if (change !== null && change <= -15) {
    steps.push({
      text: `${p.name}'s TVL fell ${Math.abs(Math.round(change))}% in seven days: open its status page and recent announcements first, and start with half the usual size until the outflow stops.`,
      cost: 'nothing to check; half size is $' + Math.round(capital / 2) + ' of capital',
      time: '15 minutes of reading',
      gas_usd: 0,
      minutes: 15,
    });
  } else if (change !== null && change >= 25) {
    steps.push({
      text: `${p.name}'s TVL rose ${Math.round(change)}% in seven days: the farm is getting crowded and any reward is being diluted, so keep the standard size and do not chase the inflow.`,
      cost: `$${capital} of capital, no extra for the surge`,
      time: '10 minutes',
      gas_usd: 0,
      minutes: 10,
    });
  }
  if (age !== null && age < 90) {
    steps.push({
      text: `${p.name} has been tracked for only ${age} days: treat it as unproven, use the smallest size, and re-check that its contracts are the ones its own site links to.`,
      cost: `$50 of capital at most until it has a longer record`,
      time: '10 minutes of checking',
      gas_usd: 0,
      minutes: 10,
    });
  }
  steps.push(
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gasWords(band, 2)}`,
      time: '15 minutes to set up',
      gas_usd: band.gas_usd * 2,
      minutes: 15,
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${band.gas_usd.toFixed(2)} of gas on ${band.chain} a week, about $${(band.gas_usd * weeks).toFixed(2)} over ${weeks} weeks`,
      time: '10 minutes a week',
      gas_usd: band.gas_usd * weeks,
      minutes: 10 * weeks,
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
      gas_usd: 0,
      minutes: 0,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: `claiming costs ${gasWords(band, 1)}; never pay anyone to claim for you`,
      time: '10 minutes',
      gas_usd: band.gas_usd,
      minutes: 10,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
      gas_usd: 0,
      minutes: 5,
    },
  );
  return steps.slice(0, 8);
}

/** A plan's total, computed from its own steps: gas in USD, active minutes, and hold days. */
export function planTotal(steps: FarmStep[], hold: number): FarmPlanTotal {
  return {
    gas_usd: Math.round(steps.reduce((n, s) => n + s.gas_usd, 0) * 100) / 100,
    active_minutes: steps.reduce((n, s) => n + s.minutes, 0),
    hold_days: hold,
  };
}

/** One category's token odds: the share of its comparable protocols that already record a token. */
export interface TokenOdds {
  odds: number | null;
  base: number;
  traded: number;
}

/**
 * Token odds per category, from the snapshot alone: traded protocols over all protocols in the
 * category (traded + pre-token), excluding CEX. A base rate among comparable protocols in this
 * snapshot — never a prediction that a given protocol will issue one. Categories with fewer than
 * five protocols show null: too few peers to read.
 */
export function tokenOddsByCategory(snapshot: Snapshot): Map<string, TokenOdds> {
  const counts = new Map<string, { traded: number; pretoken: number }>();
  for (const p of snapshot.protocols) {
    if (p.category === 'CEX') continue;
    const key = p.category ?? 'Uncategorised';
    const c = counts.get(key) ?? { traded: 0, pretoken: 0 };
    if (isPreToken(p)) c.pretoken += 1;
    else c.traded += 1;
    counts.set(key, c);
  }
  const out = new Map<string, TokenOdds>();
  for (const [key, c] of counts) {
    const total = c.traded + c.pretoken;
    out.set(key, { odds: total >= 5 ? Math.round((c.traded / total) * 100) / 100 : null, base: total, traded: c.traded });
  }
  return out;
}

/** The live-token protocols, by market cap, for the dashboard's live view: the measuring stick itself. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's form for data.js: the same figures and the same farm plan board.json carries. */
export function radarRow(row: BoardRow, odds?: TokenOdds): RadarRow {
  const o = odds ?? { odds: null, base: 0, traded: 0 };
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    on_watchlist: row.on_watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_peers: row.model.category_peers,
    growth_factor: row.model.growth_factor,
    maturity_factor: row.model.maturity_factor,
    breadth_factor: row.model.breadth_factor,
    token_odds: o.odds,
    odds_base: o.base,
    odds_traded: o.traded,
    farm_steps: row.farm_steps,
    farm_plan_total: row.farm_plan_total,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const calib = calibrate(snapshot, model);
  const odds = tokenOddsByCategory(snapshot);
  const categories = [...calib.byCategory.values()].sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: calib.global,
    global_heldout_n: calib.globalHeldoutN,
    global_heldout_err: calib.globalHeldoutErr,
    fee_bands: [...FEE_BANDS, DEFAULT_FEE_BAND],
    protocols_count: snapshot.protocols.length,
    pretoken_count: snapshot.protocols.filter(isPreToken).length,
    live_peer_count: snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX').length,
    median_age_days: medianPreTokenAge(snapshot),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    categories,
    rows: board.map((r) => radarRow(r, odds.get(r.category ?? 'Uncategorised'))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, size, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows: the gate takes 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears on the board twice';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
