import { useState } from 'react';
import { api, fmtPrice } from '../lib/api';
import type { ChainSnapshot } from '../lib/api';
import { ChainTable } from '../components/ChainTable';

/**
 * OptionChain — the headline page. Pick a symbol + expiry, see strikes
 * with bid/ask/IV/Greeks per row.
 *
 * Default symbol: SPY (most liquid US options chain). Default DTE
 * window: 0–60 days. Strike count: 25 around ATM.
 *
 * Future iterations:
 *   • Multi-expiry compare (calendar spread analysis)
 *   • IV smile chart per expiry
 *   • Greeks-vs-strike plot (delta curve, theta decay)
 *   • Click-to-build strategy → payoff chart
 */
export function OptionChain({ authConnected }: { authConnected: boolean }) {
  const [symbolInput, setSymbolInput] = useState('SPY');
  const [strikeCount, setStrikeCount] = useState(25);
  const [chain, setChain] = useState<ChainSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);

  async function loadChain(sym: string) {
    setLoading(true);
    setErr(null);
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    const res = await api.chain(sym.trim().toUpperCase(), {
      fromDate: today,
      toDate: horizon,
      strikeCount,
    });
    setLoading(false);
    if (!res.ok) {
      setErr(res.error);
      setChain(null);
      return;
    }
    setChain(res.data.chain);
    // Pick the nearest expiry as default selection
    const expiries = uniqueExpiries(res.data.chain);
    setSelectedExpiry(expiries[0] ?? null);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Option Chain</h1>
        <p className="text-sm text-text-secondary">
          Strike-by-strike view with bid/ask/mark, IV, Greeks, OI per contract. Sourced from Schwab
          Market Data; cached 5s server-side.
        </p>
      </header>

      {!authConnected && (
        <div className="card border-brand-amber/30">
          <p className="text-sm text-brand-amber">
            Not connected to Schwab. Connect first to load chain data.
          </p>
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-hairline text-text-muted">Symbol</span>
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && authConnected) void loadChain(symbolInput);
            }}
            className="input font-mono uppercase w-32"
            placeholder="SPY"
            maxLength={10}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-hairline text-text-muted">Strike count</span>
          <input
            type="number"
            value={strikeCount}
            onChange={(e) => setStrikeCount(Math.max(5, Math.min(80, Number(e.target.value) || 25)))}
            className="input font-mono tabular w-24"
            min={5}
            max={80}
          />
        </label>
        <button
          type="button"
          onClick={() => loadChain(symbolInput)}
          disabled={loading || !authConnected}
          className="btn btn-primary disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load chain'}
        </button>
        {chain?.underlyingPrice != null && (
          <div className="ml-auto text-sm text-text-secondary">
            <span className="text-2xs uppercase tracking-hairline text-text-muted mr-2">Underlying</span>
            <span className="font-mono tabular text-text-primary">{fmtPrice(chain.underlyingPrice)}</span>
          </div>
        )}
      </div>

      {err && (
        <div className="card border-brand-red/30">
          <p className="text-sm text-brand-red">{err}</p>
        </div>
      )}

      {chain && (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xs uppercase tracking-hairline text-text-muted">Expiry:</span>
            {uniqueExpiries(chain).map((exp) => (
              <button
                key={exp}
                type="button"
                onClick={() => setSelectedExpiry(exp)}
                className={`px-2 py-0.5 text-xs rounded-md font-mono tabular border transition-colors ${
                  selectedExpiry === exp
                    ? 'bg-brand-blue/10 border-brand-blue/40 text-brand-blue'
                    : 'border-border-subtle text-text-secondary hover:bg-bg-subtle'
                }`}
              >
                {exp}
                <span className="ml-1.5 text-text-dim">{daysToExpiry(exp)}d</span>
              </button>
            ))}
          </div>
          {selectedExpiry && <ChainTable chain={chain} expiry={selectedExpiry} />}
        </>
      )}
    </div>
  );
}

function uniqueExpiries(chain: ChainSnapshot): string[] {
  const all = new Set<string>();
  for (const c of chain.calls) all.add(c.expiration);
  for (const p of chain.puts) all.add(p.expiration);
  return Array.from(all).sort();
}

function daysToExpiry(iso: string): number {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((d.getTime() - today.getTime()) / 86400_000));
}
