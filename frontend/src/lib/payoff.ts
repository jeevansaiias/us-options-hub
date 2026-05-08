/**
 * Pure expiry-payoff math for option strategies.
 *
 * Computes the P/L of a multi-leg structure as a function of the
 * underlying price at expiry. No volatility model, no time decay,
 * no Black-Scholes — this is the AT-EXPIRY view, which is what every
 * standard "Strategy Builder" payoff diagram shows.
 *
 * Units: every leg's `entryPrice` is per-share (the standard option
 * quote). Multiplying by 100 (`OPTION_MULTIPLIER`) and qty gives the
 * dollar payoff per leg.
 *
 * Convention: positive qty = long, negative qty = short. Buyers pay the
 * `entryPrice` (so it's a debit); sellers collect it (credit). The math
 * handles both via signed `qty`:
 *   long call:   payoff = max(S - K, 0) - entryPrice   (per share)
 *   short call:  payoff = entryPrice - max(S - K, 0)   (per share)
 *   long put:    payoff = max(K - S, 0) - entryPrice
 *   short put:   payoff = entryPrice - max(K - S, 0)
 *
 * Multiplied by qty × 100 → dollar payoff per leg. Sum across legs
 * → total strategy payoff at price S.
 */

export const OPTION_MULTIPLIER = 100;

export type OptionType = 'CALL' | 'PUT';

export interface Leg {
  id: string; // stable id for React keys
  optionType: OptionType;
  /** Strike price in dollars per share. */
  strike: number;
  /** Per-share entry price (mid/mark/limit — whatever you'd pay or collect). */
  entryPrice: number;
  /** Signed: positive = long, negative = short. Integers only. */
  qty: number;
}

export interface SweepPoint {
  underlying: number;
  payoff: number; // dollars (already × multiplier × qty)
}

export interface StrategySummary {
  /** Net debit (negative) or net credit (positive) at entry, in dollars. */
  netCashAtEntry: number;
  /** Max profit across the sweep range. May be Infinity for unbounded structures. */
  maxProfit: number;
  /** Max loss across the sweep range. May be -Infinity for unbounded. */
  maxLoss: number;
  /** Breakeven prices — every underlying price where total payoff = 0. */
  breakevens: number[];
  /** Range of sweep used for max/min calc — surface to UI for context. */
  sweepFrom: number;
  sweepTo: number;
}

/**
 * Per-leg payoff at a single underlying price `S`.
 * Long debit is paid up front, so the entry cost subtracts from payoff.
 * For shorts the sign of qty handles it.
 */
export function legPayoff(leg: Leg, S: number): number {
  const intrinsic =
    leg.optionType === 'CALL' ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0);
  // Per-share P/L: intrinsic at expiry minus what we paid (or plus what we collected).
  // For qty>0 (long): perShare = intrinsic - entryPrice
  // For qty<0 (short): perShare = -intrinsic + entryPrice (because we'd be assigned for intrinsic)
  // The compact form: (intrinsic - entryPrice) × sign(qty)
  // …but qty itself encodes sign and magnitude, so multiply directly:
  const perShare = intrinsic - leg.entryPrice;
  return perShare * leg.qty * OPTION_MULTIPLIER;
}

/** Total strategy payoff at one underlying price. */
export function totalPayoff(legs: Leg[], S: number): number {
  let sum = 0;
  for (const leg of legs) sum += legPayoff(leg, S);
  return sum;
}

/**
 * Sweep underlying from `from` to `to` in `steps` evenly-spaced points.
 * Returns `[{ underlying, payoff }]` for charting.
 */
export function sweepPayoff(
  legs: Leg[],
  from: number,
  to: number,
  steps = 401, // odd = a midpoint exists
): SweepPoint[] {
  if (steps < 2) steps = 2;
  const out: SweepPoint[] = [];
  const stepSize = (to - from) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    const S = from + i * stepSize;
    out.push({ underlying: S, payoff: totalPayoff(legs, S) });
  }
  return out;
}

/**
 * Net cash at entry. Positive = credit received, negative = debit paid.
 * For each leg: -entryPrice × qty × 100 (long pays, short collects).
 */
export function netCashAtEntry(legs: Leg[]): number {
  let total = 0;
  for (const leg of legs) total += -leg.entryPrice * leg.qty * OPTION_MULTIPLIER;
  return total;
}

/**
 * Find every breakeven (zero crossing) in the sweep. Linear interpolation
 * between adjacent points where the sign flips. Returns prices sorted
 * ascending. Handles the rare case where a sample lands exactly on zero.
 */
export function findBreakevens(points: SweepPoint[]): number[] {
  const breaks: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.payoff === 0) {
      breaks.push(a.underlying);
      continue;
    }
    if ((a.payoff < 0 && b.payoff > 0) || (a.payoff > 0 && b.payoff < 0)) {
      // Linear interp: where does the segment cross y=0?
      const t = -a.payoff / (b.payoff - a.payoff);
      breaks.push(a.underlying + t * (b.underlying - a.underlying));
    }
  }
  // Catch the very-last point if it's exactly zero and not duplicated above
  const last = points[points.length - 1];
  if (last && last.payoff === 0 && (breaks.length === 0 || breaks[breaks.length - 1] !== last.underlying)) {
    breaks.push(last.underlying);
  }
  // De-dupe within rounding tolerance
  return Array.from(new Set(breaks.map((b) => Math.round(b * 100) / 100))).sort((a, b) => a - b);
}

/**
 * Full summary — net cash, max P/L, breakevens. Computes a sweep
 * automatically based on the legs' strike range × 1.5 (gives 25% room
 * either side of the structure for visualizing the wings).
 *
 * Returns -Infinity / Infinity for unbounded P/L when the sweep edges
 * are still moving away from zero (uncovered short put → unbounded
 * loss; long call → unbounded profit).
 */
export function summarize(legs: Leg[]): StrategySummary {
  if (legs.length === 0) {
    return {
      netCashAtEntry: 0,
      maxProfit: 0,
      maxLoss: 0,
      breakevens: [],
      sweepFrom: 0,
      sweepTo: 0,
    };
  }
  const strikes = legs.map((l) => l.strike).filter((s) => Number.isFinite(s) && s > 0);
  const minK = Math.min(...strikes);
  const maxK = Math.max(...strikes);
  const center = (minK + maxK) / 2;
  const halfWidth = Math.max((maxK - minK) / 2, center * 0.15, 5);
  // Sweep ±150% of half-width around the center. Clamp lower bound to 0.
  const sweepFrom = Math.max(0, center - halfWidth * 3);
  const sweepTo = center + halfWidth * 3;

  const points = sweepPayoff(legs, sweepFrom, sweepTo, 401);

  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  for (const p of points) {
    if (p.payoff > maxProfit) maxProfit = p.payoff;
    if (p.payoff < maxLoss) maxLoss = p.payoff;
  }

  // Detect unbounded P/L by checking the slope at the edges.
  // If the last point is rising and we hit the sweep-end max, it's unbounded.
  const left = points[0]!;
  const leftNext = points[1]!;
  const right = points[points.length - 1]!;
  const rightPrev = points[points.length - 2]!;
  const isFlatRight = Math.abs(right.payoff - rightPrev.payoff) < 1e-3;
  const isFlatLeft = Math.abs(left.payoff - leftNext.payoff) < 1e-3;
  const slopeRight = right.payoff - rightPrev.payoff;
  const slopeLeft = leftNext.payoff - left.payoff;

  if (!isFlatRight && slopeRight > 0 && right.payoff === maxProfit) maxProfit = Infinity;
  if (!isFlatRight && slopeRight < 0 && right.payoff === maxLoss) maxLoss = -Infinity;
  if (!isFlatLeft && slopeLeft < 0 && left.payoff === maxProfit) maxProfit = Infinity;
  if (!isFlatLeft && slopeLeft > 0 && left.payoff === maxLoss) maxLoss = -Infinity;

  return {
    netCashAtEntry: netCashAtEntry(legs),
    maxProfit,
    maxLoss,
    breakevens: findBreakevens(points),
    sweepFrom,
    sweepTo,
  };
}

/** Pre-built strategy templates the user can instantiate. */
export const TEMPLATES: Array<{
  name: string;
  description: string;
  buildLegs: (atm: number) => Omit<Leg, 'id'>[];
}> = [
  {
    name: 'Long Call',
    description: 'Bullish, defined risk. Pays a debit; profits if underlying rises above strike + premium.',
    buildLegs: (atm) => [{ optionType: 'CALL', strike: atm, entryPrice: atm * 0.02, qty: 1 }],
  },
  {
    name: 'Short Put',
    description: 'Mildly bullish/neutral. Collects a credit; profits if underlying stays above strike.',
    buildLegs: (atm) => [
      { optionType: 'PUT', strike: Math.round(atm * 0.95), entryPrice: atm * 0.015, qty: -1 },
    ],
  },
  {
    name: 'Bull Put Credit Spread',
    description: 'Defined-risk neutral-to-bullish. Sell ATM put, buy lower put for protection.',
    buildLegs: (atm) => [
      { optionType: 'PUT', strike: Math.round(atm * 0.97), entryPrice: atm * 0.018, qty: -1 },
      { optionType: 'PUT', strike: Math.round(atm * 0.92), entryPrice: atm * 0.008, qty: 1 },
    ],
  },
  {
    name: 'Iron Condor',
    description: 'Range-bound. Sells OTM call + put, buys further OTM wings. Profits if price stays in middle.',
    buildLegs: (atm) => [
      { optionType: 'PUT', strike: Math.round(atm * 0.95), entryPrice: atm * 0.012, qty: -1 },
      { optionType: 'PUT', strike: Math.round(atm * 0.92), entryPrice: atm * 0.006, qty: 1 },
      { optionType: 'CALL', strike: Math.round(atm * 1.05), entryPrice: atm * 0.012, qty: -1 },
      { optionType: 'CALL', strike: Math.round(atm * 1.08), entryPrice: atm * 0.006, qty: 1 },
    ],
  },
  {
    name: 'Long Straddle',
    description: 'Volatility play. Buy ATM call + put. Profits on a big move either way.',
    buildLegs: (atm) => [
      { optionType: 'CALL', strike: atm, entryPrice: atm * 0.02, qty: 1 },
      { optionType: 'PUT', strike: atm, entryPrice: atm * 0.02, qty: 1 },
    ],
  },
  {
    name: 'Covered Call',
    description: 'Income on long shares. (For payoff math, modeled as -1 short OTM call; you provide the share component.)',
    buildLegs: (atm) => [
      { optionType: 'CALL', strike: Math.round(atm * 1.05), entryPrice: atm * 0.012, qty: -1 },
    ],
  },
];
