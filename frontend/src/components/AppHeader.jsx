import { useAppMode } from '../context/ModeContext.jsx';

function ConnectionBadge({ label, status }) {
  const connected = status === 'Connected';
  return (
    <span className={`connection-badge ${connected ? 'is-connected' : 'is-waiting'}`}>
      <span className="connection-dot" aria-hidden="true" />
      {label}: {status}
    </span>
  );
}

export default function AppHeader({ mode, apiStatus, socketStatus, identity }) {
  const { setMode } = useAppMode();

  return (
    <header className="app-header">
      <a className="brand-lockup" href="/" aria-label="Words Connect home">
        <span className="brand-mark" aria-hidden="true">W</span>
        <span className="brand-copy">
          <strong>Words Connect</strong>
          <span>Paraphrasing workshop</span>
        </span>
      </a>

      <div className="header-tools">
        <div className="connection-list" aria-label="Service connection status">
          <ConnectionBadge label="API" status={apiStatus} />
          <ConnectionBadge label="Live" status={socketStatus} />
        </div>
        {identity && <span className="identity-badge">{identity.role === 'teacher' ? 'Teacher' : `Student ${identity.participant?.displayNumber ?? ''}`}</span>}
        {import.meta.env.DEV && !identity && (
          <label className="mode-switcher">
            <span>Development mode</span>
            <select disabled={mode === 'teacher'} value={mode === 'preview' ? 'preview' : mode === 'teacher' ? 'teacher' : 'student'} onChange={(event) => {
              if (event.target.value === 'preview' && mode !== 'teacher') setMode('preview');
              if (event.target.value === 'student' && mode === 'preview') { window.location.assign('/'); }
            }}>
              <option value="student" disabled={mode === 'teacher'}>Student</option>
              <option value="teacher" disabled>Teacher</option>
              <option value="preview">Preview</option>
            </select>
          </label>
        )}
      </div>
    </header>
  );
}
