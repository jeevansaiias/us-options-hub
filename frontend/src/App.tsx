import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { OptionChain } from './pages/OptionChain';
import { api, type AuthStatus } from './lib/api';

export type Route = 'dashboard' | 'option-chain';

/**
 * Tiny hash-based router. Swap for react-router when the app grows past
 * 3 routes — for v0 this is plenty.
 */
function readRoute(): Route {
  const h = (typeof window === 'undefined' ? '' : window.location.hash).replace(/^#\/?/, '');
  if (h.startsWith('option-chain')) return 'option-chain';
  return 'dashboard';
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    refreshAuth();
  }, []);

  async function refreshAuth() {
    setAuthLoading(true);
    const res = await api.authStatus();
    setAuth(res.ok ? res.data : { connected: false, expiresAt: null });
    setAuthLoading(false);
  }

  function navigate(next: Route) {
    window.location.hash = `#/${next}`;
  }

  return (
    <Layout
      route={route}
      onNavigate={navigate}
      auth={auth}
      authLoading={authLoading}
      onAuthRefresh={refreshAuth}
    >
      {route === 'dashboard' && <Dashboard authConnected={!!auth?.connected} />}
      {route === 'option-chain' && <OptionChain authConnected={!!auth?.connected} />}
    </Layout>
  );
}
