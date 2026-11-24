import { useEffect, useState } from 'react';
import AppLayout from './components/AppLayout.jsx';
import SessionEntry from './components/SessionEntry.jsx';
import { ModeProvider, useAppMode } from './context/ModeContext.jsx';
import { SessionProvider, useSession } from './context/SessionContext.jsx';

function WordsConnectApp() {
  const { mode, setMode } = useAppMode();
  const { session, identity, sessionReady, socketStatus, error } = useSession();
  const [apiStatus, setApiStatus] = useState('Checking');
  const [preview, setPreview] = useState(import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview'));

  useEffect(() => {
    let active = true;
    if (identity && !preview) {
      fetch('/api/health')
        .then((response) => {
          if (!response.ok) throw new Error('Health check failed');
          return response.json();
        })
        .then((health) => {
          if (active) setApiStatus(health.status === 'ok' ? 'Connected' : 'Unavailable');
        })
        .catch(() => {
          if (active) setApiStatus('Unavailable');
        });
    } else {
      setApiStatus(preview ? 'Local preview' : 'Waiting');
    }

    const onPreview = () => {
      setPreview(true);
      setMode('preview');
    };
    const onExitPreview = () => {
      setPreview(false);
      setMode('student');
      const url = new URL(window.location.href);
      url.searchParams.delete('preview');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener('wc-preview', onPreview);
    window.addEventListener('wc-exit-preview', onExitPreview);
    return () => {
      active = false;
      window.removeEventListener('wc-preview', onPreview);
      window.removeEventListener('wc-exit-preview', onExitPreview);
    };
  }, [identity, preview, setMode]);

  useEffect(() => { if (identity && !preview) setMode(identity.role); }, [identity, preview, setMode]);

  const joinSessionId = new URLSearchParams(window.location.search).get('join');
  if (!sessionReady && !preview) return <main className="session-entry"><section className="session-entry-card"><p className="section-kicker">Words Connect</p><h1>Opening your workshop…</h1></section></main>;
  if (!identity && joinSessionId && !preview) return <SessionEntry joinSessionId={joinSessionId} />;
  return <AppLayout mode={identity?.role ?? (preview ? 'preview' : mode)} apiStatus={apiStatus} socketStatus={socketStatus} session={session} identity={identity} sessionError={error} onExitPreview={() => window.dispatchEvent(new Event('wc-exit-preview'))} />;
}

export default function App() {
  return (
    <ModeProvider>
      <SessionProvider><WordsConnectApp /></SessionProvider>
    </ModeProvider>
  );
}
