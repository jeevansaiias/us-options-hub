/**
 * Typed client for the local proxy server. All requests go through
 * `/api/*` (Vite proxies them to the proxy on :8443).
 *
 * Convention: every method returns `{ ok: true, data }` or
 * `{ ok: false, error, status? }`. Never throws on HTTP errors —
 * components render degraded states instead.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function getJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { credentials: 'include', ...init });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (body && typeof body === 'object' && 'error' in body && String(body.error)) ||
          `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Types ──────────────────────────────────────────────────────────────

export interface AuthStatus {
  connected: boolean;
  expiresAt: number | null;
}

export interface Quote {
  symbol: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  change: number | null;
  changePercent: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  asOf: string;
}

export interface OptionContract {
  symbol: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiration: string; // YYYY-MM-DD
  daysToExpiration: number | null;
  bid: number | null;
  ask: number | null;
  mark: number | null;
  last: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  iv: number | null; // 0..1 (Schwab returns % — proxy normalizes)
  openInterest: number | null;
  volume: number | null;
}

export interface ChainSnapshot {
  symbol: string;
  underlyingPrice: number | null;
  fetchedAt: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

// ── API surface ────────────────────────────────────────────────────────

export const api = {
  authStatus: () => getJson<AuthStatus>('/api/auth/status'),
  authStartUrl: () => '/api/auth/start',
  authDisconnect: () =>
    getJson<{ ok: true }>('/api/auth/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
  quote: (symbol: string) =>
    getJson<{ ok: true; quote: Quote }>(`/api/quote/${encodeURIComponent(symbol)}`),
  chain: (symbol: string, opts: { fromDate?: string; toDate?: string; strikeCount?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.fromDate) qs.set('fromDate', opts.fromDate);
    if (opts.toDate) qs.set('toDate', opts.toDate);
    if (opts.strikeCount != null) qs.set('strikeCount', String(opts.strikeCount));
    const tail = qs.toString();
    return getJson<{ ok: true; chain: ChainSnapshot }>(
      `/api/chain/${encodeURIComponent(symbol)}${tail ? `?${tail}` : ''}`,
    );
  },
};

// ── Formatting helpers (used across components) ────────────────────────

export function fmtPrice(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

export function fmtSignedPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${n.toFixed(2)}`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtIv(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtGreek(n: number | null | undefined, decimals = 3): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}
