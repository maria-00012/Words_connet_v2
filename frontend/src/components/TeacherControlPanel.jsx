import { useState } from 'react';
import { teacherControlDefinitions } from '../data/stages.js';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import { useSession } from '../context/SessionContext.jsx';

export default function TeacherControlPanel({ stage, mode, session, wall, wallActions, quiz, quizActions, remix, remixActions, assessment, assessmentActions }) {
  const { error, setError } = useSession();
  const controls = teacherControlDefinitions[stage.id] ?? [];
  const preview = mode === 'preview';
  const welcomeStage = stage.id === 'welcome';
  const wallStage = stage.id === 'wall';
  const learnStage = stage.id === 'learn';
  const quizStage = stage.id === 'pit-stop';
  const remixStage = stage.id === 'remix';
  const assessmentStage = stage.id === 'assessment';
  const insightsStage = stage.id === 'insights';
  const homeworkStage = stage.id === 'homework';
  const [editedMarks, setEditedMarks] = useState({});
  const joinUrl = session?.sessionId ? `${window.location.origin}/?join=${encodeURIComponent(session.sessionId)}` : '';

  async function control(event, payload = {}) {
    try {
      const socket = io({ auth: { sessionId: session.sessionId } });
      socket.once('connect', () => {
        const stored = JSON.parse(sessionStorage.getItem('wc.teacher') || 'null');
        socket.emit('session:teacher-attach', { teacherToken: stored?.token }, (attached) => {
          if (!attached?.ok) { setError('Teacher authorization expired. Open the main application link again.'); socket.disconnect(); return; }
          socket.emit(event, payload, (ack) => {
            if (!ack?.ok) setError('This session action could not be completed.');
            socket.disconnect();
          });
        });
      });
    } catch { setError('This session action could not be completed.'); }
  }

  async function changeQuizGate(open) {
    const result = await quizActions?.onSetOpen?.(open);
    if (!result?.ok) setError(result?.error === 'QUIZ_ALREADY_REVEALED' ? 'Answers have already been revealed.' : 'The quiz gate could not be changed.');
    else setError('');
  }

  async function revealQuizAnswers() {
    const result = await quizActions?.onReveal?.();
    if (!result?.ok) setError(result?.error === 'QUIZ_MUST_BE_CLOSED' ? 'Close the quiz before revealing answers.' : 'Answers could not be revealed.');
    else setError('');
  }

  async function updateRemixGate(exercise, open) {
    const result = await remixActions?.onSetGate?.(exercise, open);
    if (!result?.ok) setError(result?.error === 'REMIX_SOURCE_REQUIRED' ? 'Select a source message before opening Message Remix.' : 'The writing submission window could not be changed.');
    else setError('');
  }

  async function selectSource(messageId) {
    const result = await remixActions?.onSelectSource?.(messageId);
    if (!result?.ok) setError(result?.error === 'SOURCE_FROZEN' ? 'The source cannot change after submissions open.' : 'That source is no longer available.');
    else setError('');
  }

  async function evaluateAll() {
    const result = await assessmentActions?.onEvaluate?.();
    if (!result?.ok) setError(result?.error === 'SUBMISSIONS_MUST_BE_CLOSED' ? 'Close both writing windows before evaluation.' : 'Assessment could not be started.');
    else setError('');
  }

  async function publishAssessment() {
    const result = await assessmentActions?.onPublish?.();
    if (!result?.ok) setError(result?.error === 'ASSESSMENT_UNRESOLVED' ? 'Resolve every flagged assessment before publication.' : 'Results could not be published.');
    else setError('');
  }

  async function saveMarks(result) {
    const key = `${result.participantId}:${result.exercise}`;
    const criteria = editedMarks[key] ?? result.criteria;
    const response = await assessmentActions?.onCorrect?.({ participantId: result.participantId, exercise: result.exercise, criteria });
    if (!response?.ok) setError('Criterion marks could not be saved. Check each mark against its maximum.');
    else setError('');
  }

  function exportResults() {
    assessmentActions?.onExport?.();
  }

  function updateMark(result, criterion, value) {
    const key = `${result.participantId}:${result.exercise}`;
    setEditedMarks((current) => ({ ...current, [key]: { ...(current[key] ?? result.criteria), [criterion]: Number(value) } }));
  }

  return (
    <section className="teacher-panel" aria-labelledby="teacher-panel-title">
      <div className="teacher-panel-heading">
        <div>
          <p className="section-kicker">{preview ? 'Preview controls' : 'Teacher controls'}</p>
          <h2 id="teacher-panel-title">{preview ? remixStage ? 'Remix Studio controls' : quizStage ? 'Pit Stop controls' : assessmentStage ? 'Assessment controls' : insightsStage ? 'Insights controls' : homeworkStage ? 'Homework' : 'Demonstration panel' : remixStage ? 'Remix Studio controls' : wallStage ? 'Wall controls' : welcomeStage ? 'Welcome controls' : learnStage ? 'Paraphrase Lab' : quizStage ? 'Pit Stop controls' : assessmentStage ? 'Assessment controls' : insightsStage ? 'Insights controls' : homeworkStage ? 'Homework' : 'Workshop session'}</h2>
        </div>
        {!welcomeStage && !wallStage && !learnStage && !quizStage && !remixStage && !assessmentStage && !insightsStage && !homeworkStage && <span className="placeholder-tag">Not active yet</span>}
      </div>
      {!preview && session?.sessionId && <div className="session-ops">
        <p className="session-state">{session.lifecycle === 'LOBBY' ? 'Waiting room' : session.lifecycle === 'ACTIVE' ? 'Workshop in progress' : 'Workshop ended'} · {session.participantCount ?? session.participants?.length ?? 0} participants</p>
        <div className="session-ops-actions">
          <button className="teacher-action" type="button" disabled={session.lifecycle === 'ENDED'} onClick={() => void control('session:joining-set', { open: !session.joiningOpen })}>{session.joiningOpen ? 'Close student joining' : 'Open student joining'}</button>
          <button className="teacher-action teacher-start-button" type="button" disabled={session.lifecycle !== 'LOBBY'} onClick={() => void control('session:start')}>Start workshop</button>
          <button className="teacher-action" type="button" disabled={session.lifecycle === 'ENDED'} onClick={() => { if (window.confirm('End this workshop and clear its session data? A fresh workshop will be ready afterward.')) void control('session:end'); }}>End workshop</button>
        </div>
        <div className="join-share">
          <div><h3>Student join link</h3><a href={joinUrl}>{joinUrl}</a><p>Joining {session.joiningOpen ? 'is open' : 'is closed'}. Existing students can reconnect.</p></div>
          <QRCodeSVG value={joinUrl} size={112} aria-label="QR code for student workshop link" />
        </div>
        <h3 className="participant-heading">Participants</h3>
        {session.participants?.length ? <ul className="participant-list">{session.participants.map((participant) => <li key={participant.id}><span>{participant.displayNumber}. {participant.displayName}</span><span>{participant.isConnected ? 'Connected' : 'Away'}</span></li>)}</ul> : <p className="session-help">No students have joined yet.</p>}
        {error && <p className="session-error" role="alert">{error}</p>}
      </div>}
      {wallStage && <div className="wall-teacher-controls">
        <div className="wall-teacher-summary">
          <div><span className="wall-eyebrow">SUBMISSION WINDOW</span><strong>{wall?.submissionsOpen ? 'Open' : 'Closed'}</strong></div>
          <p>{wall?.acceptedStudentCount ?? 0} student messages submitted</p>
          <button className="teacher-action wall-gate-button" type="button" disabled={!preview && (session?.lifecycle !== 'ACTIVE' || session?.currentStage !== 'wall')} onClick={() => void wallActions.onSetWallOpen?.(!wall?.submissionsOpen)}>{wall?.submissionsOpen ? 'Close Wall submissions' : 'Reopen Wall submissions'}</button>
        </div>

        <div className="wall-moderation-list">
          {(wall?.moderationQueue ?? []).map((message) => {
            const identified = wallActions.identifiedAuthors?.[message.id];
            return <article className="wall-moderation-card" key={message.id}>
              <div className="wall-moderation-topline"><span className={`wall-moderation-status status-${message.status}`}>{message.status}</span><span>{message.authorType === 'teacher' ? 'Teacher contribution' : identified ?? 'Author private'}</span></div>
              <p>{message.text}</p>
              <div className="wall-moderation-actions">
                {!identified && message.authorType === 'student' && <button type="button" onClick={() => void wallActions.onIdentifyWallAuthor?.(message.id)}>Identify author</button>}
                {message.status === 'visible' && message.authorType === 'student' && <button type="button" className="moderate-reject" onClick={() => void wallActions.onDeleteWallMessage?.(message.id)}>Delete message</button>}
              </div>
              {message.status === 'deleted' && <small>Deleted from public view and unavailable as a Remix source.</small>}
            </article>;
          })}
          {!wall?.moderationQueue?.length && <p className="session-help">Student messages appear here as soon as they are submitted. Public posts remain anonymous.</p>}
        </div>
      </div>}
      {remixStage && <div className="remix-teacher-controls">
        <section className="remix-source-picker"><div className="remix-control-heading"><div><span className="remix-step-label">MESSAGE REMIX</span><h3>Choose the class source</h3></div><span className="remix-control-help">{remix?.sourceFrozen ? 'Fixed after submissions first open' : 'You can change this before opening submissions'}</span></div>
          {(remix?.wallMessages ?? []).length ? <div className="remix-source-list">{remix.wallMessages.map((message) => <div className={`remix-source-option ${remix.source?.sourceMessageId === message.id ? 'is-selected' : ''}`} key={message.id}><p>{message.text}</p><button className="teacher-action" type="button" disabled={remix?.sourceFrozen || (!preview && session?.lifecycle !== 'ACTIVE')} onClick={() => void selectSource(message.id)}>{remix.source?.sourceMessageId === message.id ? 'Selected' : 'Select source'}</button></div>)}</div> : <p className="session-help">No available student Wall messages. You can use the fallback sentence.</p>}
          <div className="remix-fallback-option"><p>Your kindness makes our class a more welcoming place, and your positive attitude encourages everyone.</p><button className="teacher-action" type="button" disabled={remix?.sourceFrozen || (!preview && session?.lifecycle !== 'ACTIVE')} onClick={() => void selectSource()}>{remix?.source?.isFallback ? 'Fallback selected' : 'Use fallback sentence'}</button></div>
        </section>
        <div className="remix-gate-controls">
          {[['message-remix', 'Message Remix', remix?.messageRemix], ['academic-transfer', 'Academic Transfer', remix?.academicTransfer]].map(([exercise, label, state]) => <article className="remix-gate-card" key={exercise}><div><span className="remix-step-label">{label.toUpperCase()}</span><strong>{state?.open ? 'Open' : 'Closed'}</strong><p>{state?.submitted ?? 0} of {state?.eligible ?? session?.participantCount ?? 0} students submitted</p></div><button className="teacher-action" type="button" disabled={!preview && session?.lifecycle !== 'ACTIVE'} onClick={() => void updateRemixGate(exercise, !state?.open)}>{state?.open ? 'Close submissions' : 'Open submissions'}</button></article>)}
        </div>
        {error && <p className="session-error" role="alert">{error}</p>}
        {preview && <p className="teacher-panel-note">Preview selections, gates, and response counts stay local.</p>}
      </div>}
      {quizStage && <div className="pit-stop-teacher-controls">
        <div className="quiz-control-summary">
          <div><span className="quiz-control-label">QUIZ WINDOW</span><strong>{quiz?.open ? 'Open' : quiz?.revealed ? 'Revealed' : 'Closed'}</strong></div>
          <p>{quiz?.submissionStatus?.submittedParticipants ?? 0} of {quiz?.submissionStatus?.participantCount ?? session?.participantCount ?? 0} students submitted · {quiz?.submissionStatus?.totalAnswers ?? 0} answers</p>
          <div className="quiz-control-actions">
            <button className="teacher-action" type="button" disabled={preview ? Boolean(quiz?.revealed) : session?.lifecycle !== 'ACTIVE' || Boolean(quiz?.revealed)} onClick={() => void changeQuizGate(!quiz?.open)}>{quiz?.open ? 'Close quiz' : 'Open quiz'}</button>
            <button className="teacher-action quiz-reveal-button" type="button" disabled={preview ? Boolean(quiz?.open || quiz?.revealed || !quiz?.hasBeenOpened) : session?.lifecycle !== 'ACTIVE' || Boolean(quiz?.open || quiz?.revealed || !quiz?.hasBeenOpened)} onClick={() => void revealQuizAnswers()}>Reveal answers and explanations</button>
          </div>
        </div>
        <div className="quiz-submission-status" aria-live="polite">
          <div className="quiz-status-heading"><h3>Student submissions</h3><span>{quiz?.submissionStatus?.totalAnswers ?? 0} / {(quiz?.submissionStatus?.participantCount ?? session?.participantCount ?? 0) * 3} answers</span></div>
          {quiz?.submissionStatus?.participants?.length ? <ul>{quiz.submissionStatus.participants.map((participant) => <li key={participant.participantId}>
            <span className="quiz-status-student"><strong>{String(participant.displayNumber).padStart(2, '0')}</strong>{participant.displayName}</span>
            <span className="quiz-status-questions">{['meaning-keeper', 'synonym-trap', 'structure-switch'].map((questionId, index) => <span className={participant.questionIds.includes(questionId) ? 'is-submitted' : ''} key={questionId} title={`Question ${index + 1}`} aria-label={`Question ${index + 1} ${participant.questionIds.includes(questionId) ? 'submitted' : 'not submitted'}`}>Q{index + 1} {participant.questionIds.includes(questionId) ? '✓' : '·'}</span>)}</span>
          </li>)}</ul> : <p className="session-help">Student answer status will appear here.</p>}
          {error && <p className="session-error" role="alert">{error}</p>}
          {quiz?.revealed && <p className="quiz-reveal-confirmation" role="status">Correct answers and explanations are now visible to students.</p>}
          {preview && <p className="teacher-panel-note">These controls and sample submission statuses stay in Preview.</p>}
        </div>
      </div>}
      {assessmentStage && <div className="assessment-teacher-controls">
        <div className="assessment-control-summary"><div><span className="quiz-control-label">ASSESSMENT</span><strong>{assessment?.status ?? 'idle'}</strong></div>
          <p>Writing windows {assessment?.gatesClosed ? 'closed' : 'open'} · {assessment?.completed ?? 0} / {assessment?.total ?? 0} outcomes processed · {assessment?.flagged ?? 0} need teacher review</p>
          <div className="quiz-control-actions">
            <button className="teacher-action" type="button" disabled={!assessment?.gatesClosed || (!preview && session?.lifecycle !== 'ACTIVE') || assessment?.status === 'running' || assessment?.published} onClick={() => void evaluateAll()}>{assessment?.status === 'needs-review' ? 'Retry unresolved assessments' : 'Evaluate All'}</button>
            <button className="teacher-action quiz-reveal-button" type="button" disabled={!assessment?.gatesClosed || !assessment?.results?.length || assessment?.status !== 'complete' || assessment?.published} onClick={() => void publishAssessment()}>{assessment?.published ? 'Results published' : 'Publish Results'}</button>
          </div>
        </div>
        {assessment?.results?.length ? <div className="assessment-review-list">{assessment.results.map((result) => {
          const key = `${result.participantId}:${result.exercise}`;
          const criteria = editedMarks[key] ?? result.criteria;
          return <article className="assessment-review-card" key={`${key}:${result.submissionId ?? 'none'}`}>
            <div className="assessment-review-heading"><h3>{result.displayNumber}. {result.displayName} · {result.exercise === 'message-remix' ? 'Message Remix' : 'Academic Transfer'}</h3><span className={`assessment-status status-${result.status}`}>{result.status}</span></div>
            {result.sourceText && <p><strong>Source:</strong> {result.sourceText}</p>}
            {result.responseText ? <p><strong>Student response:</strong> {result.responseText}</p> : <p>No submission before closure; zero recorded.</p>}
            <div className="assessment-mark-grid">{[['meaningPreservation','Meaning',4],['vocabularyVariation','Vocabulary',2],['sentenceRestructuring','Restructuring',2],['completenessAndTone','Completeness and tone',2]].map(([name,label,max]) => <label key={name}>{label}<span><input type="number" min="0" max={max} step="1" value={criteria?.[name] ?? 0} disabled={!result.submissionId} onChange={(event) => updateMark(result,name,event.target.value)} /> / {max}</span></label>)}</div>
            <p className="assessment-total">Calculated total: <strong>{Object.values(criteria ?? {}).reduce((sum,mark) => sum + Number(mark),0)} / 10</strong></p>
            <p className="assessment-feedback"><strong>Feedback (read-only):</strong> {result.feedback}</p>
            {result.submissionId && <button className="teacher-action" type="button" onClick={() => void saveMarks(result)}>Save criterion marks</button>}
          </article>;
        })}</div> : <p className="session-help">Close both Remix Studio submission windows, then select Evaluate All. Unsubmitted exercises receive a recorded zero.</p>}
        {assessment?.published && assessment?.leaderboard?.length > 0 && <div className="assessment-ranking"><h3>Published ranking</h3>{assessment.leaderboard.map((entry) => <p key={entry.participantId}><span>#{entry.rank} · {entry.displayName}<small>Quiz {entry.quizScore}/3 · Remix {entry.messageRemix}/10 · Transfer {entry.academicTransfer}/10</small></span><strong>{entry.finalScore.toFixed(1)}</strong></p>)}</div>}
        {error && <p className="session-error" role="alert">{error}</p>}
        {preview && <p className="teacher-panel-note">All assessment actions and sample marks remain local in Preview.</p>}
      </div>}
      {insightsStage && <div className="insights-teacher-controls">
        <p>Download the published class scores, criterion breakdowns, and feedback as a spreadsheet-ready CSV.</p>
        <button className="teacher-action" type="button" disabled={!assessment?.published || !(assessment?.results?.length)} onClick={exportResults}>
          <span aria-hidden="true">↓</span> Download results CSV
        </button>
        {!assessment?.published && <small>Publish results before downloading the class report.</small>}
        {preview && <p className="teacher-panel-note">Preview downloads use sample results stored only in this browser.</p>}
      </div>}
      {!wallStage && !quizStage && !remixStage && !assessmentStage && !insightsStage && !homeworkStage && (!welcomeStage || preview) && <div className="teacher-control-list">
        {controls.map((control) => (
          <button className="teacher-action" type="button" disabled key={control}>
            <span>{control}</span>
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>}
      {!wallStage && !quizStage && !remixStage && !assessmentStage && !insightsStage && !homeworkStage && (!welcomeStage || preview) && <p className="teacher-panel-note">{learnStage ? 'Explore the bubbles just like your students. Bubble choices stay on your screen.' : 'These controls are visual placeholders and do not change a workshop.'}</p>}
    </section>
  );
}
