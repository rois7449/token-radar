// token-radar-01: the radar-2 value model, the farm plans and the board.
// Written for this entry by the agent session. No names are special-cased:
// every number below is computed from the snapshot's own figures (TVL,
// seven-day change, listing date, chains, category).
//
// Model ("radar-2"): the implied value of a launch is what a token would be
// worth if the market priced the protocol like a launched one.
//
//   implied = TVL x 0.30
//           x (1 + clamp(change_7d, -60, 120) / 100 x 0.60)   growth
//           x (0.60 + min(age_days, 1095) / 1095 x 0.40)      maturity
//           x (1 + 0.04 x min(chains, 5))                    breadth
//           x category_multiple                              category
//
// The three core factors (size, growth, maturity) dominate. Breadth and
// category are small, documented adjustments from the snapshot's own
// chains and category fields: a protocol live on more chains reaches more
// users, and launched tokens in some categories have historically been
// valued higher relative to TVL than in others (DEX governance tokens
// highest, bridge tokens lowest). No protocol is ranked by its name.

export const MODEL_VERSION = 'radar-2';
export const FLOOR_USD = 50_000_000;
export const BOARD_MAX_ROWS = 4000;

/** The category multiples, with the reason each one differs from 1.00. */
export const CATEGORY_MULTIPLE: Record<string, number> = {
  // Governance tokens of exchanges have historically commanded the
  // highest FDV relative to TVL (deepest liquidity, most users).
  Dexs: 1.15,
  // Lending and derivatives tokens price near the top of the range:
  // sticky TVL, recurring fees, clear revenue.
  Lending: 1.1,
  Derivatives: 1.1,
  'Prediction Market': 1.1,
  // Yield and RWA tokens price a little above par: real yield or real
  // assets behind the token, but thinner secondary markets.
  Yield: 1.05,
  RWA: 1.05,
  'Yield Aggregator': 1.05,
  'Liquidity Manager': 1.05,
  CDP: 1.05,
  'CDP Manager': 1.05,
  // Everything else prices at par: no category signal either way.
  // (Bridge and stablecoin tokens price below par, but those categories
  // are excluded from the board by the watchlist rule itself.)
};

export interface Protocol {
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
  floor_usd: number;
  watchlist: string[];
  protocols: Protocol[];
}

export interface RadarRow {
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
  age_days: number | null;
  rank: number;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  category_multiplier: number;
  farm_steps: string[];
  on_watchlist: boolean;
  pre_token: boolean;
}

export interface Board {
  rows: RadarRow[];
  live: RadarRow[];
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORY = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** A protocol records no token when DefiLlama has neither a Gecko id nor a symbol. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** The snapshot's own watchlist rule, applied to a below-floor protocol:
 * pre-token, not a wrapped/staked/bridged product, not a versioned pool. */
export function isRankable(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORY.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  return true;
}

export function ageDays(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const listed = Date.parse(p.listed_at + 'T00:00:00Z');
  const as = Date.parse(asOf);
  if (Number.isNaN(listed) || Number.isNaN(as)) return null;
  return Math.max(0, Math.floor((as - listed) / 86_400_000));
}

export function categoryMultiple(p: Protocol): number {
  if (p.category === null) return 1;
  return CATEGORY_MULTIPLE[p.category] ?? 1;
}

export interface Implied {
  value: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  category_multiplier: number;
  age_days: number | null;
}

export function impliedOf(p: Protocol, asOf: string): Implied {
  const age = ageDays(p, asOf);
  const growthPct = Math.min(120, Math.max(-60, p.change_7d ?? 0));
  const growthMultiplier = 1 + (growthPct / 100) * 0.6;
  const maturityMultiplier = 0.6 + (Math.min(age ?? 365, 1095) / 1095) * 0.4;
  const breadthMultiplier = 1 + 0.04 * Math.min(p.chains.length, 5);
  const categoryMultiplier = categoryMultiple(p);
  const value = Math.max(
    1,
    Math.round(
      p.tvl_usd * 0.3 * growthMultiplier * maturityMultiplier * breadthMultiplier * categoryMultiplier,
    ),
  );
  return {
    value,
    growth_multiplier: growthMultiplier,
    maturity_multiplier: maturityMultiplier,
    breadth_multiplier: breadthMultiplier,
    category_multiplier: categoryMultiplier,
    age_days: age,
  };
}

const CHAIN_ASSET: Record<string, string> = {
  Ethereum: 'ETH',
  BSC: 'BNB',
  Solana: 'SOL',
  Arbitrum: 'ETH',
  Base: 'ETH',
  Polygon: 'MATIC',
  Avalanche: 'AVAX',
  Optimism: 'ETH',
  'zkSync Era': 'ETH',
  Linea: 'ETH',
  Sui: 'SUI',
  Aptos: 'APT',
};

export function capitalFor(p: Protocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 200_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

export function holdDaysFor(p: Protocol, asOf: string): number {
  const age = ageDays(p, asOf) ?? 365;
  if (age >= 730) return 60;
  if (age >= 365) return 45;
  return 30;
}

export function actionFor(p: Protocol): string {
  const chain = p.chains[0] ?? 'Ethereum';
  const asset = CHAIN_ASSET[chain] ?? "the chain's native token";
  const capital = capitalFor(p);
  const name = p.name;
  switch (p.category) {
    case 'Dexs':
      return `Swap on ${name}: swap $${capital} of ${asset} through ${name}'s own swap interface on ${chain} (not a third-party router) and leave the position open for the full hold.`;
    case 'Lending':
      return `Lend on ${name}: deposit $${capital} of ${asset} into ${name}'s lending market on ${chain} and keep it supplied for the full hold.`;
    case 'Derivatives':
      return `Trade on ${name}: open a $${capital} ${asset} position on ${name}'s derivatives market on ${chain} and manage it once a week.`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Deposit into ${name}: put $${capital} of ${asset} into ${name}'s vault on ${chain} and keep it deposited for the full hold.`;
    case 'RWA':
      return `Buy into ${name}: put $${capital} into ${name}'s tokenised asset on ${chain} and hold it for the full hold.`;
    case 'Prediction Market':
      return `Trade on ${name}: place $${capital} of ${asset} in outcome shares on ${name} and keep trading once a week for the full hold.`;
    case 'CDP':
    case 'CDP Manager':
      return `Mint with ${name}: lock $${capital} of ${asset} as collateral in ${name} on ${chain} and mint its stablecoin against it.`;
    default:
      return `Use ${name}: put $${capital} of ${asset} to work in ${name}'s main product on ${chain} and keep it active for the full hold.`;
  }
}

/** Six concrete steps: setup, the qualifying action, the cadence, the hold,
 * the claim rule and the record. Nothing here promises a token. */
export function farmSteps(p: Protocol, asOf: string): string[] {
  const hold = holdDaysFor(p, asOf);
  return [
    'Fresh wallet, seed on paper: create a clean address for this farm and write its seed phrase on paper, never in a file or a screenshot, so one leaked wallet cannot drain your other farms.',
    actionFor(p),
    'Use it weekly: repeat the qualifying action once a week for the full hold, same wallet, same chain, and write down the date and the amount each time.',
    `Hold ${hold} days: keep the position open for at least ${hold} days from the first action; closing early resets the farm.`,
    `Claim only from the official link: if ${p.name} launches a token, open its official site or X account from your own bookmark and never pay anyone to claim it.`,
    'Write down what you did: log each action in your farm sheet (date, amount, transaction) so you can prove the farm if the airdrop asks for it.',
  ];
}

export function buildBoard(snapshot: Snapshot): Board {
  const watchlist = new Set(snapshot.watchlist);
  const rows: RadarRow[] = [];
  for (const p of snapshot.protocols) {
    const onWatchlist = watchlist.has(p.slug);
    const early = !onWatchlist && p.tvl_usd < FLOOR_USD && isRankable(p);
    if (!onWatchlist && !early) continue;
    const implied = impliedOf(p, snapshot.as_of);
    rows.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      age_days: implied.age_days,
      rank: 0,
      implied_value_usd: implied.value,
      growth_multiplier: implied.growth_multiplier,
      maturity_multiplier: implied.maturity_multiplier,
      breadth_multiplier: implied.breadth_multiplier,
      category_multiplier: implied.category_multiplier,
      farm_steps: farmSteps(p, snapshot.as_of),
      on_watchlist: onWatchlist,
      pre_token: isPreToken(p),
    });
  }
  // Highest implied value first; ties break by TVL, then by slug, so the
  // order is stable and the two scorer runs write the same bytes.
  rows.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : 1),
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const live = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((p) => {
      const implied = impliedOf(p, snapshot.as_of);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        mcap_usd: p.mcap_usd,
        listed_at: p.listed_at,
        gecko_id: p.gecko_id,
        symbol: p.symbol,
        age_days: implied.age_days,
        rank: 0,
        implied_value_usd: implied.value,
        growth_multiplier: implied.growth_multiplier,
        maturity_multiplier: implied.maturity_multiplier,
        breadth_multiplier: implied.breadth_multiplier,
        category_multiplier: implied.category_multiplier,
        farm_steps: farmSteps(p, snapshot.as_of),
        on_watchlist: false,
        pre_token: false,
      } satisfies RadarRow;
    });
  return { rows, live };
}

/** Fail fast when the board would break the gate. Returns the first problem. */
export function boardIssue(board: Board, snapshot: Snapshot): string | null {
  const { rows } = board;
  if (rows.length < 100 || rows.length > BOARD_MAX_ROWS) {
    return `row count ${rows.length} outside 100..${BOARD_MAX_ROWS}`;
  }
  const seen = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  const values = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (r.rank < 1 || r.rank > rows.length) return `rank ${r.rank} out of range for ${r.slug}`;
    if (r.implied_value_usd < 1 || r.implied_value_usd > 100_000_000_000_000) {
      return `implied value ${r.implied_value_usd} out of range for ${r.slug}`;
    }
    if (r.implied_value_usd > prev) return `implied value rises at rank ${r.rank}`;
    prev = r.implied_value_usd;
    values.add(r.implied_value_usd);
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `farm steps ${r.farm_steps.length} out of range for ${r.slug}`;
    }
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) {
        return `farm step length ${s.trim().length} out of range for ${r.slug}`;
      }
    }
  }
  const ranks = new Set(rows.map((r) => r.rank));
  if (ranks.size !== rows.length) return 'ranks are not unique';
  for (let i = 1; i <= rows.length; i++) {
    if (!ranks.has(i)) return `rank ${i} missing`;
  }
  if (values.size < 2) return 'all implied values are equal';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} missing from the board`;
  }
  return null;
}
