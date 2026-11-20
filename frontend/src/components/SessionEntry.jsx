import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext.jsx';

export default function SessionEntry({ joinSessionId }) {
  const { joinSession, error, loading } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [joinStatus, setJoinStatus] = useState(null);
  const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');

  useEffect(() => {
    if (!joinSessionId) return;
    fetch(`/api/sessions/${joinSessionId}`).then((response) => response.ok ? response.json() : null).then(setJoinStatus).catch(() => setJoinStatus(null));
  }, [joinSessionId]);

  return (
    <main className="session-entry">
      <section className="session-entry-card">
        <p className="section-kicker">Words Connect</p>
        <h1>{joinSessionId ? 'Join the workshop' : 'Local preview'}</h1>
        {joinSessionId ? (
          <>
          {joinStatus && <p className="session-state">{joinStatus.lifecycle === 'ENDED' ? 'This workshop has ended.' : joinStatus.joiningOpen ? 'Joining is open.' : 'Joining is closed.'}</p>}
          <form onSubmit={(event) => { event.preventDefault(); void joinSession(joinSessionId, displayName); }}>
            <label className="session-field">Your name<input autoComplete="name" maxLength="80" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
            <button className="session-primary" disabled={loading || (joinStatus && (!joinStatus.joiningOpen || joinStatus.lifecycle === 'ENDED'))}>{loading ? 'Joining…' : 'Join workshop'}</button>
          </form>
          </>
        ) : isPreview ? <p className="session-help">Open the local preview without creating a workshop session.</p> : null}
        {error && <p className="session-error" role="alert">{error}</p>}
        {import.meta.env.DEV && !joinSessionId && !isPreview && <button className="session-preview" onClick={() => { window.history.replaceState({}, '', '/?preview=1'); window.dispatchEvent(new Event('wc-preview')); }}>Open local preview</button>}
      </section>
    </main>
  );
}
