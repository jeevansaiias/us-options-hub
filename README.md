# US Options Hub

A browser-based options analytics terminal for **US equities and indices**, powered by the **Charles Schwab API**.

Local-first, no cloud. Runs on your machine. Bring your own Schwab API credentials.

> **Status: v0 — early scaffold.** Dashboard + option chain browser working. Strategy builder, OI analysis, and live tick feed are roadmap.

---

## What this is

A standalone analytics terminal for US options traders. Pick any optionable US symbol (SPY, QQQ, AAPL, MSFT, SPX, etc.), browse the option chain with bid/ask/IV/Greeks per strike, watch live index quotes (SPX, NDX, RUT, VIX), and track your watchlist — all in your browser, with data flowing through a local proxy server to Schwab's Market Data API.

## Why this exists

There are excellent open-source options terminals for the Indian market (notably [MrChartist's india-s-best-option-hub](https://github.com/MrChartist/india-s-best-option-hub), which inspired this project's shape). There aren't many for the US market that are fully open-source, browser-native, and broker-agnostic. This fills that gap for Schwab API users.

**Inspired by but independent from** the india-s-best-option-hub repo. Built fresh against the Schwab API; no NSE-specific code or Dhan integration carried over.

## What's working in v0

- ✅ **Schwab OAuth proxy** — local Node server handles the OAuth handshake + token refresh, exposes a clean REST surface to the browser
- ✅ **Live dashboard** — index cards for SPX, NDX, RUT, VIX with last/change/% change
- ✅ **Option chain browser** — pick a symbol + expiry, see all strikes with bid/ask/mark/IV/delta/theta/vega/OI
- ✅ **Quote endpoint** — single-symbol live quote (uses Schwab Market Data scope)
- ✅ **Tailwind UI** — minimal, fast, no component library overhead

## What's roadmap (v0+ → v1)

- 🟡 **Watchlist** — pin symbols, see live quotes side by side
- 🟡 **Strategy Builder** — visual P/L chart for multi-leg structures (Iron Condor, Straddle, Spreads)
- 🟡 **OI Analysis** — max pain, OI heatmap, IV rank/percentile, PCR
- 🟡 **Position Tracker** — read open positions from Schwab Trader API (requires that scope to be enabled in your Schwab Developer Portal app)
- 🔴 **WebSocket live feed** — Schwab's streaming API, replaces REST polling
- 🔴 **IndexedDB persistence** — local price snapshot history

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS 3 (no component library — pure Tailwind) |
| Data fetching | Native `fetch` with React state (TanStack Query optional later) |
| Backend | Node.js (native `http` + `node:fs`, no Express) |
| Auth | Schwab OAuth 2.0 (Authorization Code flow) |
| Storage | `.tokens.json` for refresh tokens (local file, gitignored) |

## Quick start

### Prerequisites

1. **Node.js 20+** (`brew install node` on macOS)
2. **A Schwab Developer App** with **Market Data Production** scope enabled. Sign up free at [developer.schwab.com](https://developer.schwab.com). For position tracking later you'll also need **Accounts and Trading Production** scope.
3. **A Schwab brokerage account** (the OAuth flow logs in to your real account; data is read-only).

### Setup

```bash
git clone https://github.com/jeevansaiias/us-options-hub.git
cd us-options-hub
npm install
cd frontend && npm install && cd ..

cp .env.example .env
# Edit .env — fill in SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, SCHWAB_REDIRECT_URI
```

The `SCHWAB_REDIRECT_URI` must match your Schwab Developer App's Callback URL exactly. For local dev: `https://127.0.0.1:8443/api/auth/callback`.

### First run

```bash
npm run dev          # starts proxy server on https://127.0.0.1:8443
npm run dev:frontend # starts Vite on http://localhost:5173 (separate terminal)
```

Open https://localhost:5173. Click **"Connect Schwab"** in the header. You'll be redirected to Schwab to log in and authorize, then back to the dashboard. Tokens persist in `.tokens.json` (gitignored).

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────────┐
│   Browser       │  HTTPS  │  Local Proxy     │  HTTPS  │  Schwab API    │
│   (Vite, :5173) │ ──────► │  (:8443)         │ ──────► │  api.schwab... │
│                 │         │                  │         │                │
│  React + TS     │         │  • OAuth flow    │         │  Market Data   │
│  Option Chain   │         │  • Token refresh │         │  Trader API    │
│  Dashboard      │         │  • CORS bypass   │         │                │
│                 │         │  • Cache (5s)    │         │                │
└─────────────────┘         └──────────────────┘         └────────────────┘
```

The proxy server:
- Holds OAuth tokens (never sent to the browser)
- Refreshes access tokens 5 min before expiry
- Caches GET responses for 5s (chain queries are heavy)
- Exposes a small REST surface (`/api/quote/:symbol`, `/api/chain/:symbol`)
- Mints a self-signed cert on first run via `mkcert` (or falls back to plain HTTP if not installed)

## Project layout

```
us-options-hub/
├── README.md
├── LICENSE                           — MIT
├── .env.example
├── package.json                      — root scripts + proxy deps
├── proxy-server.mjs                  — Schwab OAuth + REST proxy
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css                 — Tailwind directives
        ├── lib/
        │   └── api.ts                — typed client to the local proxy
        ├── components/
        │   ├── Layout.tsx
        │   ├── IndexCard.tsx
        │   └── ChainTable.tsx
        └── pages/
            ├── Dashboard.tsx
            └── OptionChain.tsx
```

## Attribution

The feature list (option chain browser, OI analysis, strategy builder, etc.) and the **local-proxy + browser-first** architecture were inspired by [MrChartist/india-s-best-option-hub](https://github.com/MrChartist/india-s-best-option-hub). All code in this repo is original — written for US markets and the Schwab API from scratch. The original repo is MIT licensed; this repo is also MIT.

## License

MIT — see `LICENSE`. Trade at your own risk; this is software, not financial advice.
