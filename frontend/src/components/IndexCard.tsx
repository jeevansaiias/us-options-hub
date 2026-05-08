import { useEffect, useState } from 'react';
import { api, fmtPrice, fmtPct, fmtSignedPrice } from '../lib/api';
import type { Quote } from '../lib/api';

/**
 * IndexCard — a compact KPI tile showing one symbol's last/change/%.
 * Polls the proxy every 5s when authConnected; degrades to a static
 * placeholder when not connected. The proxy caches quotes for 5s, so
 * polling cadence + cache cadence are aligned.
 */
export function IndexCard({
  symbol,
  label,
  authConnected,
}: {
  symbol: string;
  label: string;
  authConnected: boolean;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authConnected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function pull() {
      const res = await api.quote(symbol);
      if (cancelled) return;
      if (res.ok) {
        setQuote(res.data.quote);
        setErr(null);
      } else {
        setErr(res.error);
      }
    }

    void pull();
    timer = setInterval(pull, 5_000);
    return () => {
      cancelled = true;
      if (timer != null) clearInterval(timer);
    };
  }, [symbol, authConnected]);

  if (!authConnected) {
    return (
      <div className="card opacity-60">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-2xs uppercase tracking-hairline text-text-muted">{label}</span>
          <span className="font-mono text-text-dim text-sm">{symbol}</span>
        </div>
        <div className="text-2xl font-mono tabular text-text-dim">—</div>
        <div className="text-2xs text-text-dim mt-1">connect Schwab to load</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="card border-brand-red/30">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-2xs uppercase tracking-hairline text-text-muted">{label}</span>
          <span className="font-mono text-text-dim text-sm">{symbol}</span>
        </div>
        <div className="text-base text-brand-red truncate" title={err}>
          {err}
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="card">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-2xs uppercase tracking-hairline text-text-muted">{label}</span>
          <span className="font-mono text-text-dim text-sm">{symbol}</span>
        </div>
        <div className="h-7 bg-bg-subtle rounded animate-pulse" />
      </div>
    );
  }

  const tone =
    quote.change == null
      ? 'text-text-secondary'
      : quote.change > 0
        ? 'text-brand-green'
        : quote.change < 0
          ? 'text-brand-red'
          : 'text-text-secondary';

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-2xs uppercase tracking-hairline text-text-muted">{label}</span>
        <span className="font-mono text-text-dim text-sm">{symbol}</span>
      </div>
      <div className={`text-2xl font-mono tabular ${tone}`}>{fmtPrice(quote.last)}</div>
      <div className={`text-xs font-mono tabular mt-1 ${tone}`}>
        {fmtSignedPrice(quote.change)} ({fmtPct(quote.changePercent)})
      </div>
      <div className="text-2xs text-text-dim mt-1.5 flex justify-between">
        <span>L {fmtPrice(quote.low)}</span>
        <span>H {fmtPrice(quote.high)}</span>
      </div>
    </div>
  );
}
