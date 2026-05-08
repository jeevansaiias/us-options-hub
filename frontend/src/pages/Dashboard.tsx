import { IndexCard } from '../components/IndexCard';

/**
 * Dashboard — at-a-glance view of the major US indices + VIX.
 * SPX uses Schwab's `$SPX` ticker; the others are tradable ETFs / cash
 * indices. Add or rearrange via the INDICES array.
 */
const INDICES = [
  { symbol: '$SPX', label: 'S&P 500' },
  { symbol: '$NDX', label: 'Nasdaq 100' },
  { symbol: '$RUT', label: 'Russell 2000' },
  { symbol: '$VIX', label: 'VIX' },
  { symbol: 'SPY', label: 'SPY ETF' },
  { symbol: 'QQQ', label: 'QQQ ETF' },
  { symbol: 'IWM', label: 'IWM ETF' },
  { symbol: 'DIA', label: 'DIA ETF' },
];

export function Dashboard({ authConnected }: { authConnected: boolean }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-primary mb-1">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          Live US index quotes + ETF proxies, polled every 5s from Schwab Market Data.
        </p>
      </header>

      {!authConnected && (
        <div className="card border-brand-amber/30">
          <p className="text-sm text-brand-amber">
            Not connected to Schwab. Click <strong>Connect Schwab</strong> in the header to
            authorize and start streaming live data. Your tokens stay on your machine.
          </p>
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {INDICES.map((i) => (
          <IndexCard key={i.symbol} symbol={i.symbol} label={i.label} authConnected={authConnected} />
        ))}
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold text-text-primary mb-2">What to do here</h2>
        <ol className="text-sm text-text-secondary space-y-1.5 list-decimal list-inside">
          <li>
            Connect Schwab via the header (one-time OAuth — the proxy holds tokens locally and
            refreshes every 30 minutes).
          </li>
          <li>
            Watch the index cards update live during market hours.
          </li>
          <li>
            Open the <strong>Option Chain</strong> tab to drill into any optionable US symbol —
            full chain with bid/ask/mark/IV/Greeks per strike, by expiry.
          </li>
        </ol>
      </section>
    </div>
  );
}
