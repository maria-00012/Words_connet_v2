import { useEffect, useMemo, useState } from 'react';
import { stages } from '../data/stages.js';
import { hasTeacherControls } from '../context/ModeContext.jsx';
import AppHeader from './AppHeader.jsx';
import PreviewIndicator from './PreviewIndicator.jsx';
import StageNavigation from './StageNavigation.jsx';
import StageRenderer from './StageRenderer.jsx';
import TeacherControlPanel from './TeacherControlPanel.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { ACADEMIC_TRANSFER_SOURCE, REMIX_FALLBACK_SOURCE } from '../data/remixSources.js';
import { previewInsights } from '../data/previewInsights.js';
import { createResultsCsv } from '../utils/resultsCsv.js';

const initialPreviewMessages = [
  { id: 'demo-visible-1', text: 'Your encouragement helps me keep trying.', status: 'visible', accepted: true, authorType: 'student', demoAuthor: 'Demo learner 01', displayNumber: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'demo-visible-2', text: 'You make our class a kinder place.', status: 'visible', accepted: true, authorType: 'student', demoAuthor: 'Demo learner 02', displayNumber: 2, createdAt: '2026-01-01T00:01:00.000Z' },
];

const initialPreviewRemix = {
  source: null,
  messageRemix: { open: false, submitted: 0, eligible: 2, ownSubmission: null },
  academicTransfer: { open: false, sourceText: ACADEMIC_TRANSFER_SOURCE, submitted: 0, eligible: 2, ownSubmission: null },
};

const initialPreviewQuiz = {
  open: true,
  hasBeenOpened: true,
  revealed: false,
  answers: [],
  reveal: null,
  score: null,
  submissionStatus: {
    participantCount: 2,
    submittedParticipants: 1,
    totalAnswers: 2,
    questionCounts: { 'meaning-keeper': 1, 'synonym-trap': 1, 'structure-switch': 0 },
    participants: [
      { participantId: 'demo-learner-1', displayNumber: 1, displayName: 'Demo learner 01', questionIds: ['meaning-keeper', 'synonym-trap'], submittedCount: 2 },
      { participantId: 'demo-learner-2', displayNumber: 2, displayName: 'Demo learner 02', questionIds: [], submittedCount: 0 },
    ],
  },
};

function makePreviewWall(messages, submissionsOpen) {
  const publicMessages = messages.filter((message) => message.status === 'visible')
    .map(({ id, text, status, accepted, createdAt }) => ({ id, text, status, accepted, createdAt }));
  return {
    submissionsOpen,
    messages: publicMessages,
    moderationQueue: messages,
    acceptedStudentCount: messages.filter((message) => message.authorType === 'student' && message.accepted).length,
  };
}

function previewRanking(results) {
  const participantIds = [...new Set(results.map((result) => result.participantId))];
  return participantIds.map((participantId) => {
    const participantResults = results.filter((result) => result.participantId === participantId);
    const quizScore = participantId === 'demo-learner-1' ? 2 : 0;
    const messageRemix = participantResults.find((result) => result.exercise === 'message-remix')?.total ?? 0;
    const academicTransfer = participantResults.find((result) => result.exercise === 'academic-transfer')?.total ?? 0;
    return {
      participantId,
      displayName: participantResults[0]?.displayName ?? 'Demo learner',
      quizScore,
      messageRemix,
      academicTransfer,
      finalScore: 30 * (quizScore / 3) + 35 * (messageRemix / 10) + 35 * (academicTransfer / 10),
      displayNumber: participantResults[0]?.displayNumber ?? 0,
    };
  }).sort((a, b) => b.finalScore - a.finalScore || a.displayNumber - b.displayNumber)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export default function AppLayout({ mode, apiStatus, socketStatus, session, identity, sessionError }) {
  const {
    enterTeacher, startLearning, wall: liveWall, ownWallStatuses, submitWallMessage, submitTeacherWallMessage,
    setWallSubmissionsOpen, deleteWallMessage, identifyWallAuthor,
    quiz: liveQuiz, submitQuizAnswer, setQuizOpen, revealQuiz,
    remix: liveRemix, selectRemixSource, setRemixGate, submitRemix,
    assessment: liveAssessment, studentResults, publicLeaderboard, evaluateAssessment, correctAssessment, publishResults,
  } = useSession();
  const [previewStageId, setPreviewStageId] = useState(stages[0].id);
  const [liveStageViewId, setLiveStageViewId] = useState(null);
  const [previewMessages, setPreviewMessages] = useState(initialPreviewMessages);
  const [previewWallOpen, setPreviewWallOpen] = useState(true);
  const [previewOwnStatuses, setPreviewOwnStatuses] = useState([]);
  const [previewIdentifiedAuthors, setPreviewIdentifiedAuthors] = useState({});
  const [previewQuiz, setPreviewQuiz] = useState(initialPreviewQuiz);
  const [previewRemix, setPreviewRemix] = useState(initialPreviewRemix);
  const [previewAssessment, setPreviewAssessment] = useState({ status: 'idle', completed: 0, total: 0, failed: 0, flagged: 0, published: false, gatesClosed: true, results: [], leaderboard: [], previewOwn: null });
  const [teacherAccessOpen, setTeacherAccessOpen] = useState(false);
  const [teacherPasscode, setTeacherPasscode] = useState('');
  const [teacherAccessError, setTeacherAccessError] = useState('');
  useEffect(() => setLiveStageViewId(null), [session?.sessionId]);
  const previewWall = useMemo(() => makePreviewWall(previewMessages, previewWallOpen), [previewMessages, previewWallOpen]);
  const liveStageId = session?.currentStage ?? 'welcome';
  const localActivityView = liveStageId === 'wall' && ['wall', 'learn', 'pit-stop', 'remix', 'assessment', 'insights', 'homework'].includes(liveStageViewId);
  const activeStageId = mode === 'preview' ? previewStageId : localActivityView ? liveStageViewId : liveStageId;
  const activeStage = stages.find((stage) => stage.id === activeStageId) ?? stages[0];
  const unlockedStageIds = mode === 'preview' ? stages.map((stage) => stage.id) : liveStageId === 'wall' ? ['wall', 'learn', 'pit-stop', 'remix', 'assessment', 'insights', 'homework'] : [];
  const selectStage = (stageId) => {
    if (mode === 'preview') setPreviewStageId(stageId);
    else if (liveStageId === 'wall' && ['wall', 'learn', 'pit-stop', 'remix', 'assessment', 'insights', 'homework'].includes(stageId)) setLiveStageViewId(stageId);
  };

  const submitTeacherAccess = async (event) => {
    event.preventDefault();
    if (teacherPasscode !== '2420') {
      setTeacherPasscode('');
      setTeacherAccessError('Incorrect passcode. Please try again.');
      return;
    }
    sessionStorage.setItem('wc.teacher-access', 'granted');
    const entered = await enterTeacher();
    if (!entered) {
      sessionStorage.removeItem('wc.teacher-access');
      setTeacherAccessError('Teacher access could not be opened. Please try again.');
      return;
    }
    setTeacherPasscode('');
    setTeacherAccessError('');
    setTeacherAccessOpen(false);
  };

  const downloadResults = () => {
    const exportAssessment = mode === 'preview'
      ? (previewAssessment.results.length ? previewAssessment : previewInsights)
      : liveAssessment;
    const csv = createResultsCsv(exportAssessment);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `words-connect-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const previewEvaluate = () => {
    const results = [
      { participantId: 'demo-learner-1', displayNumber: 1, displayName: 'Demo learner 01', exercise: 'message-remix', status: 'complete', criteria: { meaningPreservation: 4, vocabularyVariation: 2, sentenceRestructuring: 1, completenessAndTone: 2 }, total: 9, feedback: 'Clear meaning and varied wording. Consider restructuring the sentence further.' },
      { participantId: 'demo-learner-1', displayNumber: 1, displayName: 'Demo learner 01', exercise: 'academic-transfer', status: 'complete', criteria: { meaningPreservation: 4, vocabularyVariation: 1, sentenceRestructuring: 2, completenessAndTone: 2 }, total: 9, feedback: 'The idea is preserved with a suitable academic tone.' },
      { participantId: 'demo-learner-2', displayNumber: 2, displayName: 'Demo learner 02', exercise: 'message-remix', status: 'complete', criteria: { meaningPreservation: 0, vocabularyVariation: 0, sentenceRestructuring: 0, completenessAndTone: 0 }, total: 0, feedback: 'No submission received before the submission window closed.' },
      { participantId: 'demo-learner-2', displayNumber: 2, displayName: 'Demo learner 02', exercise: 'academic-transfer', status: 'complete', criteria: { meaningPreservation: 0, vocabularyVariation: 0, sentenceRestructuring: 0, completenessAndTone: 0 }, total: 0, feedback: 'No submission received before the submission window closed.' },
    ];
    const leaderboard = previewRanking(results);
    setPreviewAssessment({ status: 'complete', completed: 4, total: 4, failed: 0, flagged: 0, published: false, gatesClosed: true, results, leaderboard,
      previewOwn: { results: results.slice(0, 2), quizScore: 2, finalScore: leaderboard[0]?.finalScore ?? 0, rank: leaderboard[0]?.rank ?? null } });
    return Promise.resolve({ ok: true });
  };
  const previewCorrect = ({ participantId, exercise, criteria }) => {
    setPreviewAssessment((current) => {
      const results = current.results.map((result) => result.participantId === participantId && result.exercise === exercise
        ? { ...result, criteria, total: Object.values(criteria).reduce((sum, mark) => sum + mark, 0), status: 'complete' } : result);
      const leaderboard = previewRanking(results);
      const own = leaderboard.find((entry) => entry.participantId === 'demo-learner-1');
      return { ...current, results, leaderboard, previewOwn: {
        results: results.filter((result) => result.participantId === 'demo-learner-1'),
        quizScore: own?.quizScore ?? 0,
        finalScore: own?.finalScore ?? 0,
        rank: own?.rank ?? null,
      } };
    });
    return Promise.resolve({ ok: true });
  };
  const previewPublish = () => { setPreviewAssessment((current) => ({ ...current, published: true })); return Promise.resolve({ ok: true }); };

  const previewSubmit = (text) => {
    const id = `demo-${crypto.randomUUID()}`;
    const authorIndex = 2 + previewMessages.filter((message) => message.demoAuthor?.startsWith('Demo learner ')).length;
    setPreviewMessages((current) => [...current, {
      id, text, status: 'visible', accepted: true, authorType: 'student',
      demoAuthor: `Demo learner ${String(authorIndex + 1).padStart(2, '0')}`,
      displayNumber: authorIndex + 1, createdAt: new Date().toISOString(),
    }]);
    setPreviewOwnStatuses((current) => [...current, { id, status: 'visible', accepted: true }]);
    return Promise.resolve({ ok: true, message: { id, status: 'visible', accepted: true } });
  };

  const previewModerate = (messageId, status) => {
    setPreviewMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message;
      return { ...message, status: 'deleted', accepted: message.accepted, moderatedAt: new Date().toISOString() };
    }));
    setPreviewOwnStatuses((current) => current.map((item) => item.id === messageId ? { ...item, status: 'deleted' } : item));
    setPreviewRemix((current) => !current.sourceFrozen && current.source?.sourceMessageId === messageId ? { ...current, source: null } : current);
  };

  const previewIdentify = (messageId) => {
    const message = previewMessages.find((item) => item.id === messageId);
    if (message) setPreviewIdentifiedAuthors((current) => ({
      ...current,
      [messageId]: message.authorType === 'teacher' ? 'Teacher contribution' : `${message.demoAuthor} · ${String(message.displayNumber ?? 1).padStart(2, '0')}`,
    }));
  };

  const previewSelectSource = (messageId) => {
    if (messageId) {
      const message = previewMessages.find((item) => item.id === messageId);
      if (previewRemix.sourceFrozen || !message || message.authorType !== 'student' || !message.accepted || message.status !== 'visible') return { ok: false };
      const source = { sourceText: message.text, sourceMessageId: message.id, isFallback: false };
      setPreviewRemix((current) => ({ ...current, source }));
      return { ok: true };
    }
    if (previewRemix.sourceFrozen) return { ok: false };
    setPreviewRemix((current) => ({ ...current,
      source: {
      sourceText: REMIX_FALLBACK_SOURCE,
      sourceMessageId: null,
      isFallback: true,
      },
    }));
    return { ok: true };
  };

  const previewSetRemixGate = (exercise, open) => {
    const key = exercise === 'message-remix' ? 'messageRemix' : 'academicTransfer';
    if (open && exercise === 'message-remix' && !previewRemix.source) return Promise.resolve({ ok: false, error: 'REMIX_SOURCE_REQUIRED' });
    setPreviewRemix((current) => ({ ...current, sourceFrozen: current.sourceFrozen || (exercise === 'message-remix' && open), [key]: { ...current[key], open } }));
    return Promise.resolve({ ok: true });
  };

  const previewSubmitRemix = (exercise, text) => {
    const key = exercise === 'message-remix' ? 'messageRemix' : 'academicTransfer';
    const state = previewRemix[key];
    if (!state.open) return Promise.resolve({ ok: false, error: 'SUBMISSIONS_CLOSED' });
    if (state.ownSubmission) return Promise.resolve({ ok: false, error: 'SUBMISSION_ALREADY_EXISTS' });
    const submission = { id: `demo-remix-${crypto.randomUUID()}`, responseText: text, sourceText: exercise === 'message-remix' ? previewRemix.source?.sourceText : ACADEMIC_TRANSFER_SOURCE, submittedAt: new Date().toISOString() };
    setPreviewRemix((current) => ({ ...current, [key]: { ...current[key], ownSubmission: submission, submitted: current[key].submitted + 1 } }));
    return Promise.resolve({ ok: true, submission });
  };

  const previewSubmitQuizAnswer = (questionId, option) => {
    const existing = previewQuiz.answers.find((answer) => answer.questionId === questionId);
    if (existing) return Promise.resolve({ ok: true, answer: existing, duplicate: true });
    if (!previewQuiz.open) return Promise.resolve({ ok: false, error: 'QUIZ_CLOSED' });
    const answer = { id: `demo-answer-${crypto.randomUUID()}`, questionId, option, submittedAt: new Date().toISOString() };
    setPreviewQuiz((current) => {
      if (current.answers.some((item) => item.questionId === questionId)) return current;
      const answers = [...current.answers, answer];
      const prior = current.submissionStatus.participants.find((participant) => participant.participantId === 'demo-you');
      const yourStatus = prior
        ? { ...prior, questionIds: [...prior.questionIds, questionId], submittedCount: prior.submittedCount + 1 }
        : { participantId: 'demo-you', displayNumber: 3, displayName: 'You · Preview learner', questionIds: [questionId], submittedCount: 1 };
      const participants = prior
        ? current.submissionStatus.participants.map((participant) => participant.participantId === 'demo-you' ? yourStatus : participant)
        : [...current.submissionStatus.participants, yourStatus];
      return {
        ...current,
        answers,
        submissionStatus: {
          ...current.submissionStatus,
          participants,
          participantCount: participants.length,
          submittedParticipants: participants.filter((participant) => participant.submittedCount > 0).length,
          totalAnswers: current.submissionStatus.totalAnswers + 1,
          questionCounts: { ...current.submissionStatus.questionCounts, [questionId]: current.submissionStatus.questionCounts[questionId] + 1 },
        },
      };
    });
    return Promise.resolve({ ok: true, answer, duplicate: false });
  };

  const previewSetQuizOpen = (open) => {
    if (previewQuiz.revealed && open) return Promise.resolve({ ok: false, error: 'QUIZ_ALREADY_REVEALED' });
    const state = { ...previewQuiz, open, hasBeenOpened: previewQuiz.hasBeenOpened || open };
    setPreviewQuiz(state);
    return Promise.resolve({ ok: true, state });
  };

  const previewRevealQuiz = async () => {
    if (previewQuiz.open) return { ok: false, error: 'QUIZ_MUST_BE_CLOSED' };
    if (!previewQuiz.hasBeenOpened) return { ok: false, error: 'QUIZ_NOT_OPENED' };
    const { previewPitStopReveal } = await import('../data/pitStopPreviewReveal.js');
    const revealByQuestion = new Map(previewPitStopReveal.map((item) => [item.questionId, item.correctOption]));
    const score = previewQuiz.answers.reduce((total, answer) => total + Number(revealByQuestion.get(answer.questionId) === answer.option), 0);
    const next = { ...previewQuiz, revealed: true, reveal: previewPitStopReveal, score };
    setPreviewQuiz(next);
    return { ok: true, state: next, reveal: previewPitStopReveal, submissionStatus: next.submissionStatus };
  };

  const quizActions = mode === 'preview' ? {
    onSubmit: previewSubmitQuizAnswer,
    onSetOpen: previewSetQuizOpen,
    onReveal: previewRevealQuiz,
  } : {
    onSubmit: submitQuizAnswer,
    onSetOpen: setQuizOpen,
    onReveal: revealQuiz,
  };

  const wallActions = mode === 'preview' ? {
    onSubmitWall: previewSubmit,
    onSubmitTeacherWall: previewSubmit,
    onSetWallOpen: setPreviewWallOpen,
    onDeleteWallMessage: previewModerate,
    onIdentifyWallAuthor: previewIdentify,
    identifiedAuthors: previewIdentifiedAuthors,
  } : {
    onSubmitWall: mode === 'teacher' ? submitTeacherWallMessage : submitWallMessage,
    onSubmitTeacherWall: submitTeacherWallMessage,
    onSetWallOpen: setWallSubmissionsOpen,
    onDeleteWallMessage: deleteWallMessage,
    onIdentifyWallAuthor: async (messageId) => {
      const result = await identifyWallAuthor(messageId);
      if (result.ok) setPreviewIdentifiedAuthors((current) => ({
        ...current,
        [messageId]: result.author.authorType === 'teacher' ? 'Teacher contribution' : `${result.author.displayName} · ${String(result.author.displayNumber).padStart(2, '0')}`,
      }));
      return result;
    },
    identifiedAuthors: previewIdentifiedAuthors,
  };

  const remixActions = mode === 'preview' ? {
    onSelectSource: previewSelectSource,
    onSetGate: previewSetRemixGate,
    onSubmit: previewSubmitRemix,
  } : {
    onSelectSource: selectRemixSource,
    onSetGate: setRemixGate,
    onSubmit: submitRemix,
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
          <AppHeader mode={mode} apiStatus={apiStatus} socketStatus={socketStatus} identity={identity} />

        {mode === 'preview' && <PreviewIndicator />}

        <StageNavigation
          stages={stages}
          activeStageId={activeStage.id}
          onSelect={selectStage}
          locked={mode !== 'preview'}
          unlockedStageIds={unlockedStageIds}
        />

        <main className="stage-column" aria-live="polite">
          <StageRenderer
            stage={activeStage}
            mode={mode}
            session={session}
            identity={identity}
            sessionError={sessionError}
            onStartLearning={mode === 'preview' ? () => setPreviewStageId('wall') : startLearning}
            wall={mode === 'preview' ? previewWall : liveWall}
            ownWallStatuses={mode === 'preview' ? previewOwnStatuses : ownWallStatuses}
            onSubmitWall={wallActions.onSubmitWall}
            quiz={mode === 'preview' ? previewQuiz : liveQuiz}
            onSubmitQuiz={quizActions.onSubmit}
            remix={mode === 'preview' ? previewRemix : liveRemix}
            onSubmitRemix={remixActions.onSubmit}
            assessment={mode === 'preview' ? previewAssessment : liveAssessment}
            studentResults={mode === 'preview' ? previewAssessment.previewOwn : studentResults}
            publicLeaderboard={mode === 'preview' ? previewAssessment.leaderboard : publicLeaderboard}
          />
          {mode === 'student' && !identity && activeStage.id === 'welcome' && <aside className="teacher-access-entry">
            {!teacherAccessOpen ? <button className="teacher-access-link" type="button" onClick={() => { setTeacherAccessOpen(true); setTeacherAccessError(''); }}>Teacher Access</button> : <form className="teacher-access-form" onSubmit={submitTeacherAccess}>
              <label htmlFor="teacher-access-passcode">Teacher passcode</label>
              <input id="teacher-access-passcode" type="password" inputMode="numeric" autoComplete="current-password" value={teacherPasscode} onChange={(event) => setTeacherPasscode(event.target.value)} required />
              <div className="teacher-access-actions"><button type="submit" className="teacher-access-submit">Continue</button><button type="button" className="teacher-access-cancel" onClick={() => { setTeacherAccessOpen(false); setTeacherPasscode(''); setTeacherAccessError(''); }}>Cancel</button></div>
              {teacherAccessError && <p role="alert">{teacherAccessError}</p>}
            </form>}
          </aside>}
          {hasTeacherControls(mode) && <TeacherControlPanel
            stage={activeStage}
            mode={mode}
            session={session}
            wall={mode === 'preview' ? previewWall : liveWall}
            wallActions={wallActions}
            quiz={mode === 'preview' ? previewQuiz : liveQuiz}
            quizActions={quizActions}
            remix={mode === 'preview' ? previewRemix : liveRemix}
            remixActions={remixActions}
            assessment={mode === 'preview' && activeStage.id === 'insights' && !previewAssessment.results.length ? previewInsights : mode === 'preview' ? previewAssessment : liveAssessment}
            assessmentActions={mode === 'preview' ? { onEvaluate: previewEvaluate, onCorrect: previewCorrect, onPublish: previewPublish, onExport: downloadResults } : { onEvaluate: evaluateAssessment, onCorrect: correctAssessment, onPublish: publishResults, onExport: downloadResults }}
          />}
        </main>

        <footer className="app-footer">
          <span>Words Connect</span>
          <span>{activeStage.id === 'learn' ? 'Bubble Pop Activity · Ungraded' : activeStage.id === 'remix' ? 'Two independent writing activities' : activeStage.id === 'insights' ? 'Published class results · Private student feedback' : activeStage.id === 'homework' ? 'Independent paraphrasing practice' : 'Words Connect · Classroom activities'}</span>
        </footer>
      </div>
    </div>
  );
}
