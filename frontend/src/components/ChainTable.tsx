import type { ChainSnapshot, OptionContract } from '../lib/api';
import { fmtPrice, fmtIv, fmtGreek, fmtInt } from '../lib/api';

/**
 * ChainTable — strike-by-strike view of a single expiry. Calls on the
 * left, strike in the middle, puts on the right. ATM strike highlighted.
 *
 * Schwab's chain response is keyed by expiry-and-DTE, then strike, then
 * an array of one contract per strike. The proxy normalizes both sides
 * into flat arrays; this component pairs them by strike (calls.strike ===
 * puts.strike) and renders a row per unique strike.
 *
 * Purposefully minimal: no IV smile chart, no greeks-vs-strike chart,
 * no payoff overlay. Those go in v0+ once we know what's actually
 * useful day-to-day.
 */
export function ChainTable({ chain, expiry }: { chain: ChainSnapshot; expiry: string }) {
  const callsForExpiry = chain.calls.filter((c) => c.expiration === expiry);
  const putsForExpiry = chain.puts.filter((p) => p.expiration === expiry);

  // Pair calls and puts by strike.
  const strikes = Array.from(
    new Set([...callsForExpiry.map((c) => c.strike), ...putsForExpiry.map((p) => p.strike)]),
  ).sort((a, b) => a - b);

  const callByStrike = new Map(callsForExpiry.map((c) => [c.strike, c]));
  const putByStrike = new Map(putsForExpiry.map((p) => [p.strike, p]));

  const underlying = chain.underlyingPrice ?? null;
  // Find ATM strike — the one closest to underlying.
  const atmStrike =
    underlying != null
      ? strikes.reduce(
          (best, s) => (Math.abs(s - underlying) < Math.abs(best - underlying) ? s : best),
          strikes[0] ?? 0,
        )
      : null;

  if (strikes.length === 0) {
    return (
      <div className="card text-text-dim text-sm">
        No contracts in the chain for {expiry}. Try a different expiry or pull a wider strikeCount.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-[12px] tabular">
        <thead className="text-2xs uppercase tracking-hairline text-text-muted bg-bg-subtle">
          <tr>
            <th className="px-2 py-2 text-right" colSpan={6}>
              CALLS ←
            </th>
            <th className="px-3 py-2 text-center bg-bg-elev font-medium text-text-secondary">
              Strike
            </th>
            <th className="px-2 py-2 text-left" colSpan={6}>
              → PUTS
            </th>
          </tr>
          <tr>
            <th className="px-2 py-1.5 text-right font-medium">OI</th>
            <th className="px-2 py-1.5 text-right font-medium">IV</th>
            <th className="px-2 py-1.5 text-right font-medium">Δ</th>
            <th className="px-2 py-1.5 text-right font-medium">Bid</th>
            <th className="px-2 py-1.5 text-right font-medium">Ask</th>
            <th className="px-2 py-1.5 text-right font-medium">Mark</th>
            <th className="px-3 py-1.5 text-center font-medium bg-bg-elev"></th>
            <th className="px-2 py-1.5 text-left font-medium">Mark</th>
            <th className="px-2 py-1.5 text-left font-medium">Bid</th>
            <th className="px-2 py-1.5 text-left font-medium">Ask</th>
            <th className="px-2 py-1.5 text-left font-medium">Δ</th>
            <th className="px-2 py-1.5 text-left font-medium">IV</th>
            <th className="px-2 py-1.5 text-left font-medium">OI</th>
          </tr>
        </thead>
        <tbody>
          {strikes.map((strike) => {
            const call = callByStrike.get(strike);
            const put = putByStrike.get(strike);
            const isAtm = strike === atmStrike;
            const callItm = underlying != null && strike < underlying;
            const putItm = underlying != null && strike > underlying;
            return (
              <tr
                key={strike}
                className={`border-t border-border-subtle hover:bg-bg-subtle ${
                  isAtm ? 'bg-brand-blue/5' : ''
                }`}
              >
                <ContractCell c={call} field="openInterest" align="right" itm={callItm} />
                <ContractCell c={call} field="iv" align="right" itm={callItm} />
                <ContractCell c={call} field="delta" align="right" itm={callItm} />
                <ContractCell c={call} field="bid" align="right" itm={callItm} />
                <ContractCell c={call} field="ask" align="right" itm={callItm} />
                <ContractCell c={call} field="mark" align="right" itm={callItm} bold />
                <td
                  className={`px-3 py-1.5 text-center font-mono font-semibold tabular bg-bg-elev ${
                    isAtm ? 'text-brand-blue' : 'text-text-primary'
                  }`}
                >
                  {strike}
                  {isAtm && <span className="ml-1 text-2xs text-brand-blue">ATM</span>}
                </td>
                <ContractCell c={put} field="mark" align="left" itm={putItm} bold />
                <ContractCell c={put} field="bid" align="left" itm={putItm} />
                <ContractCell c={put} field="ask" align="left" itm={putItm} />
                <ContractCell c={put} field="delta" align="left" itm={putItm} />
                <ContractCell c={put} field="iv" align="left" itm={putItm} />
                <ContractCell c={put} field="openInterest" align="left" itm={putItm} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContractCell({
  c,
  field,
  align,
  itm,
  bold,
}: {
  c: OptionContract | undefined;
  field: keyof OptionContract;
  align: 'left' | 'right';
  itm: boolean;
  bold?: boolean;
}) {
  const value = c ? c[field] : null;
  const text =
    field === 'iv'
      ? fmtIv(value as number | null)
      : field === 'delta'
        ? fmtGreek(value as number | null, 3)
        : field === 'openInterest'
          ? fmtInt(value as number | null)
          : fmtPrice(value as number | null);
  return (
    <td
      className={`px-2 py-1.5 font-mono tabular text-${align} ${
        itm ? 'text-text-primary' : 'text-text-secondary'
      } ${bold ? 'font-semibold' : ''}`}
    >
      {text}
    </td>
  );
}
