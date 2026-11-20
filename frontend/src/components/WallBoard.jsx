import { useState } from 'react';

export default function WallBoard({ mode, wall, ownStatuses = [], error = '', onSubmit }) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const teacher = mode === 'teacher';
  const preview = mode === 'preview';
  const accepted = !teacher && ownStatuses.some((status) => status.accepted);
  const deletedOwn = !teacher && ownStatuses.some((status) => status.status === 'deleted');
  const open = Boolean(wall?.submissionsOpen);
  const characters = [...text].length;
  const meaningfulCharacters = [...text.trim()].filter((character) => !/\s/u.test(character)).length;
  const publicMessages = wall?.messages ?? [];

  const submit = async (event) => {
    event.preventDefault();
    if (meaningfulCharacters < 10) { setFeedback('Please write at least 10 meaningful characters.'); return; }
    if (characters > 200) { setFeedback('Keep your message to 200 characters or fewer.'); return; }
    setSending(true);
    setFeedback('');
    const result = await onSubmit?.(text.trim());
    if (result?.ok) {
      setText('');
      setFeedback(teacher ? 'Your teacher message is on the Wall.' : preview ? 'Demo message added to the Wall.' : 'Your message is now on the Wall.');
    } else if (result?.error) {
      setFeedback(result.error === 'MESSAGE_ALREADY_ACCEPTED' ? 'You have already posted your one Wall message.' : 'Your message could not be sent. Check that the Wall is open and try again.');
    }
    setSending(false);
  };

  return (
    <div className="wall-board">
      <header className="wall-heading">
        <div className="wall-heading-copy">
          <span className="wall-eyebrow">STAGE 1 · KINDNESS BOARD</span>
          <h1 id="stage-title">The Wall</h1>
          <p>Share a kind message that could make someone in your class feel welcome.</p>
        </div>
        <span className={`wall-open-badge ${open ? 'is-open' : 'is-closed'}`}><i aria-hidden="true" />{open ? 'Accepting messages' : 'Submissions closed'}</span>
      </header>

      <div className="wall-main-grid">
        <section className="wall-composer-card" aria-labelledby="wall-composer-title">
          <div className="wall-card-topline"><span className="wall-card-icon" aria-hidden="true">✎</span><div><h2 id="wall-composer-title">{teacher ? 'Add a teacher message' : preview ? 'Try a sample message' : 'Add your kind message'}</h2><p>{teacher ? 'Your message is marked as teacher-authored and is not counted as a student submission.' : 'Your message appears on the Wall as soon as you submit it.'}</p></div></div>
          {accepted ? <div className="wall-submission-accepted" role="status"><span aria-hidden="true">✓</span><div><strong>{deletedOwn ? 'Your one message was deleted by the teacher.' : 'Your message is on the Wall.'}</strong><p>Each student can submit one message. It cannot be edited or replaced.</p></div></div> : null}
          <form onSubmit={submit}>
            <label className="wall-message-label" htmlFor="wall-message-input">A message for your classmates</label>
            <textarea id="wall-message-input" value={text} onChange={(event) => setText(event.target.value)} maxLength={240} rows={4} placeholder="Write something kind and encouraging…" disabled={!open || accepted || sending} aria-describedby="wall-message-help wall-character-count" />
            <div className="wall-form-meta"><span id="wall-message-help">At least 10 meaningful characters · 200 characters max</span><span id="wall-character-count" aria-live="polite">{characters}/200</span></div>
            <button className="wall-submit-button" type="submit" disabled={!open || accepted || sending || !text.trim()}>{sending ? 'Sending…' : teacher ? 'Post teacher message' : preview ? 'Add demo message' : 'Post message'}<span aria-hidden="true">→</span></button>
          </form>
          {feedback && <p className="wall-form-feedback" role="status">{feedback}</p>}
          {error && <p className="session-error" role="alert">{error}</p>}
          {!open && <p className="wall-closed-help">The teacher has paused new messages. You can still read the Wall.</p>}
        </section>

        <section className="wall-feed-section" aria-labelledby="wall-feed-title" aria-live="polite">
          <div className="wall-feed-heading"><div><span className="wall-eyebrow">CLASS COMMUNITY</span><h2 id="wall-feed-title">Kind words from the class</h2></div><span className="wall-message-count">{publicMessages.length} {publicMessages.length === 1 ? 'message' : 'messages'}</span></div>
          {publicMessages.length ? <div className="wall-message-grid">
            {publicMessages.map((message, index) => <article className={`wall-message-card wall-tone-${index % 5}`} key={message.id}>
              <span className="wall-card-spark" aria-hidden="true">✦</span>
              <p>{message.text}</p>
            </article>)}
          </div> : <div className="wall-empty-state"><span aria-hidden="true">☼</span><h3>The Wall is getting ready</h3><p>Student messages will appear here as soon as they are posted.</p></div>}
        </section>
      </div>
    </div>
  );
}
