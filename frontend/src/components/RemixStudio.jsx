import { useState } from 'react';

function WritingExercise({ exercise, title, instruction, sourceText, state, mode, onSubmit }) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const submitted = state?.ownSubmission;
  const teacher = mode === 'teacher';
  const preview = mode === 'preview';

  async function submit(event) {
    event.preventDefault();
    if (!text.trim()) { setFeedback('Write your paraphrase before submitting.'); return; }
    setSending(true);
    const result = await onSubmit?.(exercise, text.trim());
    setSending(false);
    if (result?.ok) { setFeedback('Your paraphrase has been submitted.'); setText(''); }
    else setFeedback(result?.error === 'SUBMISSION_ALREADY_EXISTS' ? 'A response has already been submitted for this exercise.' : 'This exercise is closed or the response could not be submitted.');
  }

  return <article className={`remix-exercise remix-${exercise}`}>
    <div className="remix-exercise-heading"><div><span className="remix-step-label">{exercise === 'message-remix' ? 'EXERCISE 1' : 'EXERCISE 2'}</span><h2>{title}</h2></div><span className={`remix-gate-badge ${state?.open ? 'is-open' : 'is-closed'}`}>{state?.open ? 'Open' : 'Closed'}</span></div>
    <p className="remix-instruction">{instruction}</p>
    <div className="remix-source-block"><span>ORIGINAL SENTENCE</span><p>{sourceText || 'The teacher will select a Wall message or the class fallback sentence.'}</p></div>
    {submitted ? <div className="remix-submitted" role="status"><strong>Submitted ✓</strong><p>{submitted.responseText}</p><small>Your response is saved and cannot be edited.</small></div>
      : teacher ? <p className="remix-teacher-view">Students will write their own paraphrase here when this exercise opens.</p>
        : <form className="remix-writing-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor={`remix-response-${exercise}`}>Your paraphrase</label>
          <textarea id={`remix-response-${exercise}`} value={text} onChange={(event) => setText(event.target.value)} rows={4} maxLength={2000} placeholder="Write the same idea in your own words…" disabled={!state?.open || sending} />
          <div className="remix-form-footer"><span>{text.length}/2000 characters</span><button type="submit" className="teacher-action" disabled={!state?.open || sending || !text.trim()}>{sending ? 'Submitting…' : preview ? 'Save demo response' : 'Submit paraphrase'}</button></div>
          {feedback && <p className="remix-feedback" role="status">{feedback}</p>}
          {!state?.open && <p className="remix-closed-note">Submissions are closed. Your writing will be saved when the teacher opens this exercise.</p>}
        </form>}
  </article>;
}

export default function RemixStudio({ mode, remix, onSubmit }) {
  const preview = mode === 'preview';
  return <div className="remix-studio">
    <header className="remix-studio-heading"><span className="remix-step-label">STAGE 4 · WRITTEN PRACTICE</span><h1 id="stage-title">The Remix Studio</h1><p>Keep the original meaning as you express each idea in your own words.</p></header>
    <div className="remix-exercise-grid">
      <WritingExercise exercise="message-remix" title="Message Remix" instruction="Paraphrase the selected class message." sourceText={remix?.source?.sourceText} state={remix?.messageRemix} mode={mode} onSubmit={onSubmit} />
      <WritingExercise exercise="academic-transfer" title="Academic Transfer" instruction="Paraphrase this academic idea in your own words." sourceText={remix?.academicTransfer?.sourceText} state={remix?.academicTransfer} mode={mode} onSubmit={onSubmit} />
    </div>
    {preview && <p className="remix-preview-note">Preview responses and controls stay on this device and do not affect a workshop.</p>}
  </div>;
}
