import { useState } from 'react';
import WallBoard from './WallBoard.jsx';
import ParaphraseLab from './ParaphraseLab.jsx';
import PitStop from './PitStop.jsx';
import RemixStudio from './RemixStudio.jsx';
import Assessment from './Assessment.jsx';
import Insights from './Insights.jsx';
import { previewInsights } from '../data/previewInsights.js';

const universeWords = [
  { word: 'Understand', tone: 'coral', position: 'one' },
  { word: 'Meaning', tone: 'blue', position: 'two' },
  { word: 'Reword', tone: 'gold', position: 'three' },
  { word: 'Restructure', tone: 'violet', position: 'four' },
  { word: 'Communicate', tone: 'mint', position: 'five' },
  { word: 'Connect', tone: 'pink', position: 'six' },
  { word: 'Express', tone: 'sky', position: 'seven' },
  { word: 'Transform', tone: 'lime', position: 'eight' },
];

function WordUniverse({ mode, identity, session, sessionError, onStartLearning }) {
  const [previewStarted, setPreviewStarted] = useState(false);
  const preview = mode === 'preview';
  const isStudent = mode === 'student';
  const active = session?.lifecycle === 'ACTIVE';
  const onWelcome = !session?.currentStage || session.currentStage === 'welcome';
  const canStart = preview || (isStudent && active && onWelcome);

  const start = async () => {
    if (preview) { setPreviewStarted(true); onStartLearning?.(); return; }
    await onStartLearning?.();
  };

  return (
    <div className="universe-scene">
      <div className="universe-orbit orbit-one" aria-hidden="true" />
      <div className="universe-orbit orbit-two" aria-hidden="true" />
      <div className="universe-bubbles" aria-hidden="true">
        {universeWords.map(({ word, tone, position }) => <span key={word} className={`word-bubble bubble-${tone} bubble-${position}`}>{word}</span>)}
      </div>
      <div className="universe-welcome-card">
        <div className="universe-kicker"><span aria-hidden="true">✦</span> YOUR WORKSHOP STARTS HERE</div>
        <h1 id="stage-title">Word Universe</h1>
        <p className="universe-intro">Explore paraphrasing through interactive activities, new vocabulary, and sentence transformation. Keep the meaning, find another way to say it, and connect your ideas.</p>
        {preview ? <div className="universe-participant preview-participant"><span>DEMO</span><strong>Sample learner · 01</strong></div> : identity?.role === 'student' ? (
          <div className="universe-participant"><span>YOUR PARTICIPANT NUMBER</span><strong>{String(identity.participant?.displayNumber ?? 0).padStart(2, '0')}</strong></div>
        ) : identity?.role === 'teacher' ? <div className="universe-participant teacher-welcome"><span>TEACHER VIEW</span><strong>Ready to welcome your learners</strong></div> : null}

        {preview ? (
          <button type="button" className="universe-start-button" onClick={() => void start()}>{previewStarted ? 'Preview the Wall' : 'Start Learning'}<span aria-hidden="true">→</span></button>
        ) : isStudent ? (
          <>
            <button type="button" className="universe-start-button" onClick={() => void start()} disabled={!canStart || sessionError}>{active ? 'Start Learning' : 'Waiting for your teacher'}<span aria-hidden="true">→</span></button>
            <p className="universe-status" role="status">{session?.lifecycle === 'ENDED' ? 'This workshop has ended.' : active ? 'Your teacher has started the workshop. Begin when you are ready.' : 'Your teacher will start the workshop soon.'}</p>
          </>
        ) : (
          <div className="universe-status teacher-status" role="status">{active ? 'Students can start learning when they are ready.' : 'Start the workshop from the teacher controls below.'}</div>
        )}
        {sessionError && <p className="session-error universe-error" role="alert">{sessionError}</p>}
      </div>
      <div className="universe-footer"><span>WORDS CONNECT</span><span>Understand · Reword · Restructure</span></div>
    </div>
  );
}

export default function StageRenderer({ stage, mode, session, identity, sessionError, onStartLearning, wall, ownWallStatuses, onSubmitWall, quiz, onSubmitQuiz, remix, onSubmitRemix, assessment, studentResults, publicLeaderboard }) {
  const isWelcome = stage.kind === 'welcome';
  if (stage.id === 'wall') {
    return <section className="activity-card wall-stage" aria-labelledby="stage-title">
      <WallBoard mode={mode} wall={wall} ownStatuses={ownWallStatuses} error={sessionError} onSubmit={onSubmitWall} />
    </section>;
  }
  if (stage.id === 'learn') {
    return <section className="activity-card paraphrase-stage" aria-labelledby="stage-title">
      <ParaphraseLab mode={mode} />
    </section>;
  }
  if (stage.id === 'pit-stop') {
    return <section className="activity-card pit-stop-stage" aria-labelledby="stage-title">
      <PitStop mode={mode} quiz={quiz} onSubmit={onSubmitQuiz} />
    </section>;
  }
  if (stage.id === 'remix') {
    return <section className="activity-card remix-stage" aria-labelledby="stage-title">
      <RemixStudio mode={mode} remix={remix} onSubmit={onSubmitRemix} />
    </section>;
  }
  if (stage.id === 'assessment') return <section className="activity-card assessment-stage" aria-labelledby="stage-title">
    <Assessment mode={mode} results={mode === 'preview' ? assessment?.previewOwn : studentResults} published={mode === 'preview' ? assessment?.published : mode === 'student' ? Boolean(studentResults) : assessment?.published} quizScore={quiz?.score} leaderboard={mode === 'preview' ? assessment?.leaderboard : publicLeaderboard} />
  </section>;
  if (stage.id === 'insights') return <section className="activity-card insights-stage" aria-labelledby="stage-title">
    <Insights
      mode={mode}
      session={session}
      assessment={mode === 'preview' && !assessment?.results?.length ? previewInsights : assessment}
      studentResults={mode === 'preview' ? (assessment?.previewOwn ?? previewInsights.studentResults) : studentResults}
      publicLeaderboard={mode === 'preview' ? (assessment?.leaderboard?.length ? assessment.leaderboard : previewInsights.leaderboard) : publicLeaderboard}
      identity={identity}
    />
  </section>;
  if (stage.id === 'homework') return <section className="activity-card homework-stage" aria-labelledby="stage-title">
    <div className="homework-content">
      <span className="stage-eyebrow">Continue learning</span>
      <h1 id="stage-title">Your paraphrasing homework</h1>
      <p>Continue practicing paraphrasing with the provided activity. Try rewriting sentences while keeping their meaning.</p>
      <a className="homework-start-button" href="https://paraphrasing-lovat.vercel.app/" target="_blank" rel="noopener noreferrer">Start Homework<span aria-hidden="true">↗</span></a>
    </div>
  </section>;
  return (
    <section className={`activity-card ${isWelcome ? 'welcome-stage' : ''}`} aria-labelledby="stage-title">
      {isWelcome ? <WordUniverse mode={mode} identity={identity} session={session} sessionError={sessionError} onStartLearning={onStartLearning} /> : <>
        <div className="activity-topline">
          <span className="stage-eyebrow">{stage.subtitle}</span>
          <span className="activity-mode-label">{mode === 'teacher' ? 'Shared activity · Teacher view' : 'Shared activity'}</span>
        </div>
        <div className="activity-content">
          <p className="section-kicker">Activity preview</p>
          <h1 id="stage-title">{stage.title}</h1>
          <p className="activity-description">{stage.description}</p>
          <div className="placeholder-note"><span className="placeholder-icon" aria-hidden="true">◌</span><span>This stage is a placeholder. Its activity will be added in a later task.</span></div>
        </div>
        <div className="activity-card-footer"><span className="footer-marker" aria-hidden="true" /><span>{stage.navDetail}</span><span className="footer-separator" aria-hidden="true">·</span><span>Interface preview</span></div>
      </>}
    </section>
  );
}
