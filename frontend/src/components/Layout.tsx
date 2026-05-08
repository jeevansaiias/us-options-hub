import type { ReactNode } from 'react';
import type { Route } from '../App';
import type { AuthStatus } from '../lib/api';
import { api } from '../lib/api';

interface Props {
  route: Route;
  onNavigate: (r: Route) => void;
  auth: AuthStatus | null;
  authLoading: boolean;
  onAuthRefresh: () => void;
  children: ReactNode;
}

export function Layout({ route, onNavigate, auth, authLoading, onAuthRefresh, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header
        route={route}
        onNavigate={onNavigate}
        auth={auth}
        authLoading={authLoading}
        onAuthRefresh={onAuthRefresh}
      />
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">{children}</main>
      <footer className="border-t border-border-subtle py-3 text-center text-2xs text-text-dim">
        US Options Hub · v0 · MIT · data via Schwab API · trade at your own risk
      </footer>
    </div>
  );
}

function Header({ route, onNavigate, auth, authLoading, onAuthRefresh }: Omit<Props, 'children'>) {
  return (
    <header className="border-b border-border-subtle bg-bg-elev/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-6">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold tracking-tight text-text-primary">US Options Hub</span>
          <span className="text-2xs uppercase tracking-hairline text-text-dim">v0</span>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink active={route === 'dashboard'} onClick={() => onNavigate('dashboard')}>
            Dashboard
          </NavLink>
          <NavLink active={route === 'option-chain'} onClick={() => onNavigate('option-chain')}>
            Option Chain
          </NavLink>
        </nav>
        <div className="flex-1" />
        <AuthBadge auth={auth} loading={authLoading} onRefresh={onAuthRefresh} />
      </div>
    </header>
  );
}

function NavLink({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? 'bg-brand-blue/10 text-brand-blue'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-subtle'
      }`}
    >
      {children}
    </button>
  );
}

function AuthBadge({
  auth,
  loading,
  onRefresh,
}: {
  auth: AuthStatus | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return <span className="text-2xs text-text-dim">checking…</span>;
  }
  if (!auth?.connected) {
    return (
      <a href={api.authStartUrl()} className="btn btn-primary">
        Connect Schwab
      </a>
    );
  }
  const expiresIn = auth.expiresAt ? Math.max(0, Math.round((auth.expiresAt - Date.now()) / 60_000)) : null;
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-2xs text-brand-green flex items-center gap-1.5"
        title={
          auth.expiresAt
            ? `Access token expires ${new Date(auth.expiresAt).toLocaleString()} (${expiresIn} min)`
            : 'Connected'
        }
      >
        <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
        Schwab connected{expiresIn != null && ` · ${expiresIn}m left`}
      </span>
      <button
        type="button"
        onClick={async () => {
          await api.authDisconnect();
          onRefresh();
        }}
        className="btn text-2xs"
      >
        Disconnect
      </button>
    </div>
  );
}
