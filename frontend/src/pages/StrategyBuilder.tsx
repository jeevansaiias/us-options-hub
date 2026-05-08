import { useEffect, useMemo, useState } from 'react';
import { LegInput, blankLeg } from '../components/LegInput';
import { PayoffChart } from '../components/PayoffChart';
import {
  type Leg,
  TEMPLATES,
  netCashAtEntry,
  summarize,
  sweepPayoff,
} from '../lib/payoff';
import { api } from '../lib/api';

/**
 * Strategy Builder — assemble a multi-leg structure, see the at-expiry
 * payoff diagram + summary stats (max P/L, breakevens, net cash).
 *
 * Pure UX, no Schwab dependency for the core flow — the payoff math is
 * fully client-side. The optional "Use spot price" button pulls a live
 * Schwab quote when authConnected so the chart can show a vertical
 * reference line at the current underlying price.
 */
export function StrategyBuilder({ authConnected }: { authConnected: boolean }) {
  const [symbol, setSymbol] = useState('SPY');
  const [atm, setAtm] = useState(450); // editable; seeds template strikes
  const [legs, setLegs] = useState<Leg[]>(() => {
    // Start with the most-common template: short put.
    const template = TEMPLATES.find((t) => t.name === 'Short Put')!;
    return template.buildLegs(450).map((l, i) => ({ ...l, id: `seed-${i}` }));
  });
  const [currentSpot, setCurrentSpot] = useState<number | null>(null);
  const [spotLoading, setSpotLoading] = useState(false);

  const summary = useMemo(() => summarize(legs), [legs]);
  const points = useMemo(
    () => sweepPayoff(legs, summary.sweepFrom, summary.sweepTo, 401),
    [legs, summary.sweepFrom, summary.sweepTo],
  );
  const cash = netCashAtEntry(legs);

  function applyTemplate(name: string) {
    const t = TEMPLATES.find((x) => x.name === name);
    if (!t) return;
    setLegs(t.buildLegs(atm).map((l, i) => ({ ...l, id: `tpl-${Date.now()}-${i}` })));
  }

  function addLeg() {
    setLegs((prev) => [...prev, blankLeg(prev.length, atm)]);
  }

  function updateLeg(id: string, next: Leg) {
    setLegs((prev) => prev.map((l) => (l.id === id ? next : l)));
  }

  function removeLeg(id: string) {
    setLegs((prev) => prev.filter((l) => l.id !== id));
  }

  async function loadSpot() {
    if (!authConnected || !symbol.trim()) return;
    setSpotLoading(true);
    const res = await api.quote(symbol.trim().toUpperCase());
    setSpotLoading(false);
    if (res.ok && res.data.quote.last != null) {
      setCurrentSpot(res.data.quote.last);
      const rounded = Math.round(res.data.quote.last);
      setAtm(rounded);
    }
  }

  // Re-pull spot whenever the symbol changes (debounced)
  useEffect(() => {
    setCurrentSpot(null);
  }, [symbol]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Strategy Builder</h1>
        <p className="text-sm text-text-secondary">
          Build any multi-leg structure, see the at-expiry payoff diagram, max profit / loss, and
          breakevens. Pure expiry math — no time decay, no IV change. For volatility-aware
          analysis, link out to your broker.
        </p>
      </header>

      <div className="card grid grid-cols-12 gap-3 items-end">
        <label className="col-span-2 flex flex-col">
          <span className="text-2xs uppercase tracking-hairline text-text-muted mb-0.5">
            Symbol (optional)
          </span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="input font-mono uppercase"
            placeholder="SPY"
          />
        </label>
        <label className="col-span-2 flex flex-col">
          <span className="text-2xs uppercase tracking-hairline text-text-muted mb-0.5">
            Reference price (ATM)
          </span>
          <input
            type="number"
            step="0.5"
            value={atm}
            onChange={(e) => setAtm(Math.max(0.01, Number(e.target.value) || 1))}
            className="input font-mono tabular text-right"
          />
        </label>
        <button
          type="button"
          onClick={loadSpot}
          disabled={!authConnected || spotLoading || !symbol.trim()}
          className="btn col-span-2 disabled:opacity-50"
          title={authConnected ? 'Pull current Schwab quote and use it as ATM' : 'Connect Schwab to enable'}
        >
          {spotLoading ? 'Loading…' : authConnected ? 'Use spot price' : 'Connect Schwab'}
        </button>
        <div className="col-span-6 flex flex-wrap gap-1.5 justify-end">
          <span className="text-2xs uppercase tracking-hairline text-text-muted self-center mr-1">
            Templates:
          </span>
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => applyTemplate(t.name)}
              className="btn text-xs"
              title={t.description}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 card">
          <PayoffChart points={points} breakevens={summary.breakevens} currentSpot={currentSpot} />
          <div className="text-2xs text-text-dim mt-3 leading-relaxed">
            Sweep range: ${summary.sweepFrom.toFixed(0)} → ${summary.sweepTo.toFixed(0)} ·
            X-axis = underlying price at expiry · Y-axis = total dollar P/L (per spread, sum across qty).
            Breakevens marked in amber; live spot in blue.
          </div>
        </div>
        <div className="card flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Summary</h2>
          <SummaryRow
            label="Net at entry"
            value={fmtSigned(cash)}
            tone={cash > 0 ? 'text-brand-green' : cash < 0 ? 'text-brand-red' : 'text-text-secondary'}
            hint={cash > 0 ? 'credit collected' : cash < 0 ? 'debit paid' : 'flat'}
          />
          <SummaryRow
            label="Max profit"
            value={summary.maxProfit === Infinity ? '∞ (uncapped)' : fmtSigned(summary.maxProfit)}
            tone="text-brand-green"
          />
          <SummaryRow
            label="Max loss"
            value={summary.maxLoss === -Infinity ? '−∞ (uncapped)' : fmtSigned(summary.maxLoss)}
            tone="text-brand-red"
          />
          <SummaryRow
            label="Breakeven(s)"
            value={
              summary.breakevens.length === 0
                ? '—'
                : summary.breakevens.map((b) => `$${b.toFixed(2)}`).join(', ')
            }
            tone="text-brand-amber"
          />
        </div>
      </div>

      <div className="card space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Legs</h2>
          <button type="button" onClick={addLeg} className="btn btn-primary text-xs">
            + Add leg
          </button>
        </div>
        {legs.length === 0 && (
          <p className="text-text-dim text-sm">
            No legs yet. Pick a template above or click <strong>+ Add leg</strong> to start
            building.
          </p>
        )}
        {legs.map((leg) => (
          <LegInput
            key={leg.id}
            leg={leg}
            onChange={(next) => updateLeg(leg.id, next)}
            onRemove={() => removeLeg(leg.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-2xs uppercase tracking-hairline text-text-muted">{label}</span>
      <span className="text-right">
        <span className={`font-mono tabular text-base ${tone}`}>{value}</span>
        {hint && <span className="text-2xs text-text-dim ml-2">{hint}</span>}
      </span>
    </div>
  );
}

function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '+∞' : '−∞';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
