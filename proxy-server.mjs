/**
 * US Options Hub — local Schwab API proxy.
 *
 * Sits between the browser frontend and Schwab's REST API. Handles:
 *   1. OAuth 2.0 authorization-code flow (redirects user → Schwab login →
 *      receives ?code= callback → exchanges for access + refresh tokens)
 *   2. Token refresh — access tokens expire after 30 min. We refresh
 *      proactively 5 min before expiry on every request so the browser
 *      never sees a 401.
 *   3. Token storage — `.tokens.json` next to this file, gitignored. The
 *      browser never sees the tokens; they live entirely server-side.
 *   4. Endpoint routing:
 *        GET  /api/health
 *        GET  /api/auth/status           → { connected, expiresAt }
 *        GET  /api/auth/start            → 302 redirect to Schwab login
 *        GET  /api/auth/callback?code=…  → exchanges code, redirects to /
 *        POST /api/auth/disconnect       → wipes tokens
 *        GET  /api/quote/:symbol         → live quote (Market Data scope)
 *        GET  /api/chain/:symbol?fromDate=&toDate=&strikeCount=
 *                                         → option chain
 *   5. CORS — allows the local Vite dev server (5173) to call this.
 *   6. Cache — short-lived (5s default) per (path + querystring). Schwab's
 *      market-data endpoints are 120 req/min/app; caching lets the chain
 *      page poll without hitting the limit.
 *
 * Self-signed TLS cert: looked up at ./cert/cert.pem + ./cert/key.pem.
 * If absent, falls back to plain HTTP — but Schwab requires HTTPS callbacks
 * even for localhost, so OAuth won't complete without TLS. README explains
 * how to mint with mkcert.
 *
 * Original code — written for the Schwab API directly; no third-party
 * options-terminal source code referenced.
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Config ─────────────────────────────────────────────────────────────

const CONFIG = {
  clientId: process.env.SCHWAB_CLIENT_ID ?? '',
  clientSecret: process.env.SCHWAB_CLIENT_SECRET ?? '',
  redirectUri: process.env.SCHWAB_REDIRECT_URI ?? 'https://127.0.0.1:8443/api/auth/callback',
  port: Number(process.env.PROXY_PORT ?? 8443),
  cacheTtlSec: Number(process.env.CACHE_TTL_SECONDS ?? 5),
  tokenPath: resolve(__dirname, '.tokens.json'),
  certPath: resolve(__dirname, 'cert/cert.pem'),
  keyPath: resolve(__dirname, 'cert/key.pem'),
};

const SCHWAB = {
  authBase: 'https://api.schwabapi.com/v1/oauth/authorize',
  tokenBase: 'https://api.schwabapi.com/v1/oauth/token',
  marketDataBase: 'https://api.schwabapi.com/marketdata/v1',
};

// CORS allow-list. Add prod domains here if you ever deploy.
const CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

// ── Token store ────────────────────────────────────────────────────────

let tokenCache = null; // { accessToken, refreshToken, expiresAt }

async function loadTokens() {
  try {
    const raw = await readFile(CONFIG.tokenPath, 'utf8');
    tokenCache = JSON.parse(raw);
    return tokenCache;
  } catch {
    tokenCache = null;
    return null;
  }
}

async function saveTokens(tokens) {
  tokenCache = tokens;
  await writeFile(CONFIG.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
}

async function clearTokens() {
  tokenCache = null;
  try {
    await writeFile(CONFIG.tokenPath, '{}', 'utf8');
  } catch {
    // ignore
  }
}

/**
 * Returns a valid access token, refreshing if it's within 5 minutes of
 * expiry. Throws when no refresh token is available or refresh fails.
 */
async function getAccessToken() {
  if (!tokenCache?.accessToken || !tokenCache?.expiresAt) {
    throw Object.assign(new Error('not authorized — visit /api/auth/start'), { status: 401 });
  }
  const now = Date.now();
  const safeWindow = 5 * 60 * 1000; // refresh 5 min before expiry
  if (now < tokenCache.expiresAt - safeWindow) return tokenCache.accessToken;
  // Refresh
  if (!tokenCache.refreshToken) {
    throw Object.assign(new Error('refresh token missing — re-authorize'), { status: 401 });
  }
  const refreshed = await refreshAccessToken(tokenCache.refreshToken);
  return refreshed.accessToken;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(SCHWAB.tokenBase, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64'),
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`Schwab refresh failed: ${res.status} ${text.slice(0, 200)}`), { status: 401 });
  }
  const json = JSON.parse(text);
  const tokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (Number(json.expires_in) || 1800) * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

async function exchangeAuthCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CONFIG.redirectUri,
  });
  const res = await fetch(SCHWAB.tokenBase, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64'),
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`Schwab token exchange failed: ${res.status} ${text.slice(0, 200)}`), { status: 401 });
  }
  const json = JSON.parse(text);
  const tokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 1800) * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

// ── Tiny in-memory cache ───────────────────────────────────────────────

const cache = new Map(); // key → { value, expiresAt }

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttlSec = CONFIG.cacheTtlSec) {
  cache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

// ── Schwab API helpers ─────────────────────────────────────────────────

async function schwabGet(path, init = {}) {
  const accessToken = await getAccessToken();
  const url = path.startsWith('http') ? path : `${SCHWAB.marketDataBase}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`Schwab ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchQuote(symbol) {
  const cacheKey = `quote:${symbol}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;
  const json = await schwabGet(`/${encodeURIComponent(symbol)}/quotes`);
  const entry = json[symbol] ?? Object.values(json)[0];
  if (!entry) {
    throw Object.assign(new Error(`no quote data for ${symbol}`), { status: 404 });
  }
  // Normalize a flat shape the frontend expects.
  const q = entry.quote ?? entry.regular ?? {};
  const out = {
    symbol: entry.symbol ?? symbol,
    last: q.lastPrice ?? null,
    bid: q.bidPrice ?? null,
    ask: q.askPrice ?? null,
    open: q.openPrice ?? null,
    high: q.highPrice ?? null,
    low: q.lowPrice ?? null,
    close: q.closePrice ?? null,
    volume: q.totalVolume ?? null,
    change: q.netChange ?? null,
    changePercent: q.netPercentChange ?? null,
    weekHigh52: q['52WeekHigh'] ?? null,
    weekLow52: q['52WeekLow'] ?? null,
    asOf: new Date().toISOString(),
  };
  cacheSet(cacheKey, out);
  return out;
}

async function fetchChain(symbol, opts = {}) {
  const params = new URLSearchParams();
  params.set('symbol', symbol);
  if (opts.fromDate) params.set('fromDate', opts.fromDate);
  if (opts.toDate) params.set('toDate', opts.toDate);
  params.set('strikeCount', String(opts.strikeCount ?? 25));
  params.set('contractType', opts.contractType ?? 'ALL');
  params.set('includeUnderlyingQuote', 'true');
  const cacheKey = `chain:${params.toString()}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;
  const json = await schwabGet(`/chains?${params.toString()}`);
  const out = normalizeChain(json);
  cacheSet(cacheKey, out);
  return out;
}

/**
 * Schwab's chain response is a deeply-nested map keyed by expiry-and-DTE,
 * then strike, then [contract]. Flatten to two clean arrays the frontend
 * can render directly.
 */
function normalizeChain(raw) {
  const flatten = (mapByExp, contractType) => {
    const out = [];
    if (!mapByExp || typeof mapByExp !== 'object') return out;
    for (const [expiryKey, byStrike] of Object.entries(mapByExp)) {
      const expirationDate = expiryKey.split(':')[0]; // "2026-05-15:30"
      if (!byStrike || typeof byStrike !== 'object') continue;
      for (const [strikeKey, contracts] of Object.entries(byStrike)) {
        if (!Array.isArray(contracts)) continue;
        for (const c of contracts) {
          out.push({
            symbol: c.symbol,
            type: contractType,
            strike: Number(strikeKey),
            expiration: expirationDate,
            daysToExpiration: c.daysToExpiration ?? null,
            bid: c.bid ?? null,
            ask: c.ask ?? null,
            mark: c.mark ?? null,
            last: c.last ?? null,
            delta: c.delta ?? null,
            gamma: c.gamma ?? null,
            theta: c.theta ?? null,
            vega: c.vega ?? null,
            rho: c.rho ?? null,
            iv: c.volatility != null ? c.volatility / 100 : null, // Schwab returns %
            openInterest: c.openInterest ?? null,
            volume: c.totalVolume ?? null,
          });
        }
      }
    }
    return out;
  };
  return {
    symbol: raw.symbol ?? null,
    underlyingPrice: raw.underlying?.last ?? raw.underlyingPrice ?? null,
    fetchedAt: new Date().toISOString(),
    calls: flatten(raw.callExpDateMap, 'CALL'),
    puts: flatten(raw.putExpDateMap, 'PUT'),
  };
}

// ── HTTP request handler ───────────────────────────────────────────────

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function sendError(res, err) {
  const status = err?.status ?? 500;
  sendJson(res, status, { ok: false, error: err?.message ?? 'unknown error' });
}

function handle302(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

async function handleRequest(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = url;

  try {
    if (pathname === '/api/health') {
      sendJson(res, 200, { ok: true, ts: new Date().toISOString() });
      return;
    }

    if (pathname === '/api/auth/status') {
      const tokens = tokenCache ?? (await loadTokens());
      const connected = !!tokens?.accessToken && !!tokens?.expiresAt && Date.now() < tokens.expiresAt + 60_000;
      sendJson(res, 200, {
        ok: true,
        connected,
        expiresAt: tokens?.expiresAt ?? null,
      });
      return;
    }

    if (pathname === '/api/auth/start') {
      if (!CONFIG.clientId) {
        sendError(res, Object.assign(new Error('SCHWAB_CLIENT_ID not set in .env'), { status: 500 }));
        return;
      }
      const authUrl = new URL(SCHWAB.authBase);
      authUrl.searchParams.set('client_id', CONFIG.clientId);
      authUrl.searchParams.set('redirect_uri', CONFIG.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      handle302(res, authUrl.toString());
      return;
    }

    if (pathname === '/api/auth/callback') {
      const code = searchParams.get('code');
      if (!code) {
        sendError(res, Object.assign(new Error('missing ?code'), { status: 400 }));
        return;
      }
      try {
        await exchangeAuthCode(code);
        // After successful exchange, redirect back to the frontend root.
        // Vite dev server is on a different port — read FRONTEND_URL or default.
        const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
        handle302(res, frontend);
      } catch (err) {
        sendError(res, err);
      }
      return;
    }

    if (pathname === '/api/auth/disconnect' && req.method === 'POST') {
      await clearTokens();
      sendJson(res, 200, { ok: true });
      return;
    }

    // /api/quote/:symbol
    const quoteMatch = pathname.match(/^\/api\/quote\/([^/]+)$/);
    if (quoteMatch) {
      const symbol = decodeURIComponent(quoteMatch[1]).toUpperCase();
      try {
        const quote = await fetchQuote(symbol);
        sendJson(res, 200, { ok: true, quote });
      } catch (err) {
        sendError(res, err);
      }
      return;
    }

    // /api/chain/:symbol
    const chainMatch = pathname.match(/^\/api\/chain\/([^/]+)$/);
    if (chainMatch) {
      const symbol = decodeURIComponent(chainMatch[1]).toUpperCase();
      try {
        const chain = await fetchChain(symbol, {
          fromDate: searchParams.get('fromDate') ?? undefined,
          toDate: searchParams.get('toDate') ?? undefined,
          strikeCount: Number(searchParams.get('strikeCount') ?? 25),
          contractType: searchParams.get('contractType') ?? 'ALL',
        });
        sendJson(res, 200, { ok: true, chain });
      } catch (err) {
        sendError(res, err);
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    sendError(res, err);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────

async function main() {
  await loadTokens();

  // Try TLS, fall back to HTTP if no cert exists.
  let server;
  let scheme = 'https';
  try {
    await access(CONFIG.certPath);
    await access(CONFIG.keyPath);
    const [cert, key] = await Promise.all([
      readFile(CONFIG.certPath),
      readFile(CONFIG.keyPath),
    ]);
    server = createHttpsServer({ cert, key }, handleRequest);
  } catch {
    scheme = 'http';
    server = createHttpServer(handleRequest);
    console.warn('⚠️  No TLS cert at ./cert/. Using plain HTTP.');
    console.warn('   Schwab OAuth REQUIRES https — generate certs with mkcert:');
    console.warn('     brew install mkcert nss');
    console.warn('     mkcert -install && mkcert 127.0.0.1 localhost');
    console.warn('     mkdir -p cert && mv 127.0.0.1+1.pem cert/cert.pem && mv 127.0.0.1+1-key.pem cert/key.pem');
    console.warn();
  }

  server.listen(CONFIG.port, () => {
    console.log(`✓ US Options Hub proxy running at ${scheme}://127.0.0.1:${CONFIG.port}`);
    console.log(`  Schwab callback URL: ${CONFIG.redirectUri}`);
    console.log(`  ${tokenCache ? '✓ tokens loaded' : '✗ no tokens — visit /api/auth/start to connect'}`);
  });
}

main().catch((err) => {
  console.error('proxy crashed:', err);
  process.exit(1);
});
