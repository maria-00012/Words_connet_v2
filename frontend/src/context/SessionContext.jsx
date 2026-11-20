import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const SessionContext = createContext(null);
const teacherStorageKey = 'wc.teacher';
const teacherAccessStorageKey = 'wc.teacher-access';
const participantStorageKey = (sessionId) => `wc.participant.${sessionId}`;

function readStored(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; }
}

function clearStoredSession(sessionId) {
  const teacher = readStored(teacherStorageKey);
  if (teacher?.sessionId === sessionId) sessionStorage.removeItem(teacherStorageKey);
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key && (key === participantStorageKey(sessionId)
      || key === `wc.join-request.${sessionId}`
      || key === `wc.wall-submit.${sessionId}`
      || key.startsWith(`wc.quiz-submit.${sessionId}.`)
      || key.startsWith(`wc.remix-submit.${sessionId}.`))) sessionStorage.removeItem(key);
  }
}

function wallErrorMessage(code) {
  const messages = {
    MESSAGE_TOO_SHORT: 'Please write at least 10 meaningful characters.',
    MESSAGE_TOO_LONG: 'Keep your message to 200 characters or fewer.',
    MESSAGE_ALREADY_ACCEPTED: 'You have already posted your one Wall message.',
    WALL_CLOSED: 'The Wall is not accepting messages right now.',
    WALL_NOT_ACTIVE: 'The Wall is not active yet.',
    NOT_AUTHORIZED: 'Your session does not have permission for that action.',
    INVALID_DELETE: 'That message cannot be deleted.',
  };
  return messages[code] ?? 'The Wall action could not be completed.';
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [wall, setWall] = useState({ submissionsOpen: false, messages: [], moderationQueue: [], acceptedStudentCount: 0 });
  const [ownWallStatuses, setOwnWallStatuses] = useState([]);
  const [quiz, setQuiz] = useState({ open: false, revealed: false, answers: [], reveal: null, score: null, submissionStatus: null });
  const [remix, setRemix] = useState({ source: null, messageRemix: { open: false, submitted: 0, eligible: 0, ownSubmission: null }, academicTransfer: { open: false, submitted: 0, eligible: 0, ownSubmission: null } });
  const [assessment, setAssessment] = useState({ status: 'idle', completed: 0, total: 0, failed: 0, flagged: 0, published: false, results: [], leaderboard: [] });
  const [studentResults, setStudentResults] = useState(null);
  const [publicLeaderboard, setPublicLeaderboard] = useState([]);
  const [socketStatus, setSocketStatus] = useState('Disconnected');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const applySession = useCallback((snapshot) => setSession((current) => ({ ...current, ...snapshot })), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (import.meta.env.DEV && params.has('preview')) return undefined;
    const storedTeacher = readStored(teacherStorageKey);
    const teacherAccessGranted = sessionStorage.getItem(teacherAccessStorageKey) === 'granted';
    const joinSessionId = params.get('join');
    const storedParticipant = joinSessionId ? readStored(participantStorageKey(joinSessionId)) : null;
    const restored = joinSessionId
      ? (storedParticipant && { ...storedParticipant, role: 'student' })
      : teacherAccessGranted && storedTeacher ? { ...storedTeacher, role: 'teacher' } : null;
    if (!joinSessionId && storedTeacher && !teacherAccessGranted) sessionStorage.removeItem(teacherStorageKey);
    if (!restored) {
      if (teacherAccessGranted && !storedTeacher) sessionStorage.removeItem(teacherAccessStorageKey);
      setSessionReady(true);
      return undefined;
    }

    let active = true;
    const sessionId = restored.sessionId;
    const start = async () => {
      try {
        if (restored.role === 'teacher') {
          const response = await fetch(`/api/sessions/${sessionId}/teacher`, { headers: { authorization: `Bearer ${restored.token}` } });
          if (!response.ok) throw new Error('Teacher session could not be restored. Open the main application link again.');
          const snapshot = await response.json();
          if (!active) return;
          setSession(snapshot);
          setIdentity({ role: 'teacher', sessionId });
        } else {
          const response = await fetch(`/api/sessions/${sessionId}`);
          if (!response.ok) throw new Error('This workshop session is no longer available.');
          const snapshot = await response.json();
          if (!active) return;
          setSession(snapshot);
          setIdentity({ role: 'student', sessionId, participant: restored.participant });
        }
      } catch (cause) {
        sessionStorage.removeItem(restored.role === 'teacher' ? teacherStorageKey : participantStorageKey(sessionId));
        if (active) setError(cause.message || 'Could not restore workshop session.');
      } finally {
        if (active) setSessionReady(true);
      }
    };
    void start();
    return () => { active = false; };
  }, []);

  const enterTeacher = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      const response = await fetch('/api/sessions/teacher-entry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) throw new Error('Could not open the teacher interface.');
      const stored = { sessionId: result.sessionId, token: result.token };
      sessionStorage.setItem(teacherStorageKey, JSON.stringify(stored));
      const snapshotResponse = await fetch(`/api/sessions/${result.sessionId}/teacher`, { headers: { authorization: `Bearer ${result.token}` } });
      const snapshot = await snapshotResponse.json();
      setSession(snapshot);
      setIdentity({ role: 'teacher', sessionId: result.sessionId });
      return true;
    } catch (cause) { setError(cause.message || 'Could not enter the workshop.'); return false; }
    finally { setLoading(false); }
  }, []);

  const joinSession = useCallback(async (sessionId, displayName) => {
    setError(''); setLoading(true);
    let socket;
    try {
      const requestIdKey = `wc.join-request.${sessionId}`;
      let requestId = sessionStorage.getItem(requestIdKey);
      if (!requestId) { requestId = crypto.randomUUID(); sessionStorage.setItem(requestIdKey, requestId); }
      socket = io({ auth: { sessionId } });
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      const ack = await new Promise((resolve, reject) => socket.timeout(5000).emit('session:join', { sessionId, displayName, requestId }, (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
      if (!ack.ok) throw new Error(ack.error === 'JOINING_CLOSED' ? 'Joining is closed for this workshop.' : 'Could not join this workshop.');
      const stored = { sessionId, reconnectToken: ack.reconnectToken, participant: ack.participant };
      sessionStorage.setItem(participantStorageKey(sessionId), JSON.stringify(stored));
      socket.disconnect();
      setSession(ack.session);
      setWall((current) => ({ ...current, ...(ack.wall ?? {}) }));
      setOwnWallStatuses(ack.wallStatuses ?? []);
      if (ack.quiz) setQuiz((current) => ({ ...current, ...ack.quiz }));
      if (ack.remix) setRemix(ack.remix);
      if (ack.assessment) setStudentResults(ack.assessment);
      if (ack.leaderboard) setPublicLeaderboard(ack.leaderboard);
      setIdentity({ role: 'student', sessionId, participant: ack.participant });
      return true;
    } catch (cause) { socket?.disconnect(); setError(cause.message || 'Could not join this workshop.'); return false; }
    finally { setLoading(false); }
  }, []);

  const startLearning = useCallback(async () => {
    if (identity?.role !== 'student') return false;
    const stored = readStored(participantStorageKey(identity.sessionId));
    if (!stored?.reconnectToken) { setError('Student reconnection is required before starting.'); return false; }
    const socket = io({ auth: { sessionId: identity.sessionId } });
    try {
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const resumed = await new Promise((resolve, reject) => socket.timeout(5000).emit('session:resume', {
        sessionId: identity.sessionId, reconnectToken: stored.reconnectToken,
      }, (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
      if (!resumed.ok) throw new Error('Student authorization expired. Rejoin the workshop.');
      const result = await new Promise((resolve, reject) => socket.timeout(5000).emit('session:student-start', {},
        (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
      if (!result.ok) throw new Error(result.error === 'WORKSHOP_NOT_ACTIVE' ? 'Your teacher has not started the workshop yet.' : 'Could not start learning.');
      applySession(result.snapshot);
      if (result.wall) setWall((current) => ({ ...current, ...result.wall }));
      return true;
    } catch (cause) {
      setError(cause.message || 'Could not start learning.');
      return false;
    } finally { socket.disconnect(); }
  }, [identity, applySession]);

  const sendWallEvent = useCallback(async (event, payload) => {
    if (!identity) return { ok: false, error: 'NOT_AUTHORIZED' };
    const socket = io({ auth: { sessionId: identity.sessionId } });
    try {
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      let authAck;
      if (identity.role === 'teacher') {
        const stored = readStored(teacherStorageKey);
        authAck = await new Promise((resolve, reject) => socket.timeout(5000).emit('session:teacher-attach', {
          teacherToken: stored?.token,
        }, (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
      } else {
        const stored = readStored(participantStorageKey(identity.sessionId));
        authAck = await new Promise((resolve, reject) => socket.timeout(5000).emit('session:resume', {
          sessionId: identity.sessionId, reconnectToken: stored?.reconnectToken,
        }, (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
      }
      if (!authAck?.ok) throw new Error('Your session authorization could not be verified.');
      return await new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload,
        (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
    } catch (cause) {
      const response = { ok: false, error: cause.message || 'CONNECTION_FAILED' };
      setError(response.error);
      return response;
    } finally { socket.disconnect(); }
  }, [identity]);

  const sendQuizEvent = useCallback(async (event, payload) => {
    if (!identity) return { ok: false, error: 'NOT_AUTHORIZED' };
    const socket = io({ auth: { sessionId: identity.sessionId } });
    try {
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const authAck = identity.role === 'teacher'
        ? await new Promise((resolve, reject) => socket.timeout(5000).emit('session:teacher-attach', {
          teacherToken: readStored(teacherStorageKey)?.token,
        }, (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)))
        : await new Promise((resolve, reject) => socket.timeout(5000).emit('session:resume', {
          sessionId: identity.sessionId,
          reconnectToken: readStored(participantStorageKey(identity.sessionId))?.reconnectToken,
        }, (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
      if (!authAck?.ok) return { ok: false, error: 'NOT_AUTHORIZED' };
      return await new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload,
        (timeoutError, value) => timeoutError ? reject(timeoutError) : resolve(value)));
    } catch (cause) {
      return { ok: false, error: cause.message || 'CONNECTION_FAILED' };
    } finally { socket.disconnect(); }
  }, [identity]);

  const submitQuizAnswer = useCallback(async (questionId, option) => {
    const key = `wc.quiz-submit.${identity?.sessionId}.${questionId}`;
    let idempotencyKey = sessionStorage.getItem(key);
    if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); sessionStorage.setItem(key, idempotencyKey); }
    const result = await sendQuizEvent('quiz:submit', { questionId, option, idempotencyKey });
    if (result.ok) {
      sessionStorage.removeItem(key);
      setQuiz((current) => ({
        ...current,
        answers: [...(current.answers ?? []).filter((answer) => answer.questionId !== questionId), result.answer],
      }));
    }
    return result;
  }, [identity, sendQuizEvent]);

  const setQuizOpen = useCallback(async (open) => {
    const result = await sendQuizEvent('quiz:state', { open, reveal: false });
    if (result.ok) setQuiz((current) => ({ ...current, ...result.state, submissionStatus: result.submissionStatus }));
    return result;
  }, [sendQuizEvent]);

  const revealQuiz = useCallback(async () => {
    const result = await sendQuizEvent('quiz:state', { open: false, reveal: true });
    if (result.ok) setQuiz((current) => ({ ...current, ...result.state, reveal: result.reveal, submissionStatus: result.submissionStatus }));
    return result;
  }, [sendQuizEvent]);

  const sendRemixEvent = useCallback(async (event, payload) => {
    if (!identity) return { ok: false, error: 'NOT_AUTHORIZED' };
    const socket = io({ auth: { sessionId: identity.sessionId } });
    try {
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      const authAck = identity.role === 'teacher'
        ? await new Promise((resolve, reject) => socket.timeout(5000).emit('session:teacher-attach', { teacherToken: readStored(teacherStorageKey)?.token }, (error, value) => error ? reject(error) : resolve(value)))
        : await new Promise((resolve, reject) => socket.timeout(5000).emit('session:resume', { sessionId: identity.sessionId, reconnectToken: readStored(participantStorageKey(identity.sessionId))?.reconnectToken }, (error, value) => error ? reject(error) : resolve(value)));
      if (!authAck?.ok) return { ok: false, error: 'NOT_AUTHORIZED' };
      const result = await new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload, (error, value) => error ? reject(error) : resolve(value)));
      if (result.ok && result.snapshot) setRemix(result.snapshot);
      if (result.ok && result.source) setRemix((current) => ({ ...current, source: result.source }));
      return result;
    } catch (cause) { return { ok: false, error: cause.message || 'CONNECTION_FAILED' }; }
    finally { socket.disconnect(); }
  }, [identity]);

  const sendAssessmentEvent = useCallback(async (event, payload = {}) => {
    if (!identity || identity.role !== 'teacher') return { ok: false, error: 'NOT_AUTHORIZED' };
    const socket = io({ auth: { sessionId: identity.sessionId } });
    try {
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      const attached = await new Promise((resolve, reject) => socket.timeout(5000).emit('session:teacher-attach',
        { teacherToken: readStored(teacherStorageKey)?.token }, (error, value) => error ? reject(error) : resolve(value)));
      if (!attached?.ok) return { ok: false, error: 'NOT_AUTHORIZED' };
      const result = await new Promise((resolve, reject) => socket.timeout(10000).emit(event, payload,
        (error, value) => error ? reject(error) : resolve(value)));
      if (result?.snapshot) setAssessment(result.snapshot);
      return result;
    } catch (cause) { return { ok: false, error: cause.message || 'CONNECTION_FAILED' }; }
    finally { socket.disconnect(); }
  }, [identity]);

  const selectRemixSource = useCallback((messageId) => sendRemixEvent('remix:source-select', messageId ? { messageId } : {}), [sendRemixEvent]);
  const setRemixGate = useCallback((exercise, open) => sendRemixEvent('remix:gate', { exercise, open }), [sendRemixEvent]);
  const submitRemix = useCallback(async (exercise, text) => {
    const key = `wc.remix-submit.${identity?.sessionId}.${exercise}`;
    let idempotencyKey = sessionStorage.getItem(key);
    if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); sessionStorage.setItem(key, idempotencyKey); }
    const result = await sendRemixEvent('remix:submit', { exercise, text, idempotencyKey });
    if (result.ok) {
      sessionStorage.removeItem(key);
      setRemix((current) => ({
        ...current,
        [exercise === 'message-remix' ? 'messageRemix' : 'academicTransfer']: {
          ...current[exercise === 'message-remix' ? 'messageRemix' : 'academicTransfer'],
          ownSubmission: result.submission,
        },
      }));
    }
    return result;
  }, [identity, sendRemixEvent]);

  const submitWallMessage = useCallback(async (text) => {
    const key = `wc.wall-submit.${identity?.sessionId}`;
    let idempotencyKey = sessionStorage.getItem(key);
    if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); sessionStorage.setItem(key, idempotencyKey); }
    const result = await sendWallEvent('wall:submit', { text, idempotencyKey });
    if (result.ok) {
      sessionStorage.removeItem(key);
      if (identity?.role === 'student') setOwnWallStatuses((current) => [
        ...current.filter((item) => item.id !== result.message.id),
        { id: result.message.id, status: result.message.status, accepted: result.message.accepted },
      ]);
      setError('');
    } else setError(wallErrorMessage(result.error));
    return result;
  }, [identity, sendWallEvent]);

  const submitTeacherWallMessage = useCallback(async (text) => {
    const result = await sendWallEvent('wall:submit', { text, idempotencyKey: crypto.randomUUID() });
    if (result.ok) setError('');
    else setError(wallErrorMessage(result.error));
    return result;
  }, [sendWallEvent]);

  const setWallSubmissionsOpen = useCallback(async (open) => {
    const result = await sendWallEvent('wall:submission-state', { open });
    if (result.ok) setError(''); else setError(wallErrorMessage(result.error));
    return result;
  }, [sendWallEvent]);

  const deleteWallMessage = useCallback(async (messageId) => {
    const result = await sendWallEvent('wall:delete', { messageId });
    if (result.ok) setError(''); else setError(wallErrorMessage(result.error));
    return result;
  }, [sendWallEvent]);

  const identifyWallAuthor = useCallback((messageId) => sendWallEvent('wall:identify-author', { messageId }), [sendWallEvent]);

  useEffect(() => {
    if (!identity) { setSocketStatus('Disconnected'); return undefined; }
    const token = identity.role === 'teacher' ? readStored(teacherStorageKey)?.token : null;
    const socket = io({ auth: { sessionId: identity.sessionId } });
    socket.on('connect', () => {
      setSocketStatus('Connected');
      if (identity.role === 'teacher') socket.emit('session:teacher-attach', { teacherToken: token }, (ack) => {
        if (ack?.ok) {
          applySession(ack.snapshot);
          if (ack.wall) setWall((current) => ({ ...current, ...ack.wall }));
          if (ack.wallModeration) setWall((current) => ({ ...current, ...ack.wallModeration, moderationQueue: ack.wallModeration.messages }));
          if (ack.remix) setRemix(ack.remix);
          if (ack.quiz) setQuiz((current) => ({
            ...current,
            ...ack.quiz,
            submissionStatus: ack.quizSubmissionStatus,
            reveal: ack.quizReveal,
          }));
          if (ack.assessment) setAssessment(ack.assessment);
        }
        else setError('Teacher authorization expired. Open the main application link again.');
      });
      else {
        const stored = readStored(participantStorageKey(identity.sessionId));
        if (stored?.reconnectToken) socket.emit('session:resume', { sessionId: identity.sessionId, reconnectToken: stored.reconnectToken }, (ack) => {
          if (ack?.ok) {
            applySession(ack.session);
            if (ack.wall) setWall((current) => ({ ...current, ...ack.wall }));
            if (ack.wallStatuses) setOwnWallStatuses(ack.wallStatuses);
            if (ack.quiz) setQuiz((current) => ({ ...current, ...ack.quiz }));
            if (ack.remix) setRemix(ack.remix);
            if (ack.assessment) setStudentResults(ack.assessment);
            if (ack.leaderboard) setPublicLeaderboard(ack.leaderboard);
            setIdentity((current) => current?.role === 'student' ? { ...current, participant: ack.participant } : current);
          }
          else setError('Student reconnection expired. Join the workshop again.');
        });
      }
    });
    socket.on('disconnect', () => setSocketStatus('Reconnecting'));
    socket.on('connect_error', () => setSocketStatus('Unavailable'));
    socket.on('session:snapshot', applySession);
    socket.on('session:ended', async () => {
      const endedSessionId = identity.sessionId;
      clearStoredSession(endedSessionId);
      setWall({ submissionsOpen: false, messages: [], moderationQueue: [], acceptedStudentCount: 0 });
      setOwnWallStatuses([]);
      setQuiz({ open: false, hasBeenOpened: false, revealed: false, answers: [], reveal: null, score: null, submissionStatus: null });
      setRemix({ source: null, messageRemix: { open: false, submitted: 0, eligible: 0, ownSubmission: null }, academicTransfer: { open: false, submitted: 0, eligible: 0, ownSubmission: null } });
      setAssessment({ status: 'idle', completed: 0, total: 0, failed: 0, flagged: 0, published: false, results: [], leaderboard: [] });
      setStudentResults(null);
      setPublicLeaderboard([]);
      setError('');
      setSession(null);
      socket.disconnect();
      setSocketStatus('Disconnected');
      if (identity.role === 'teacher') {
        const entered = await enterTeacher();
        if (!entered) setIdentity(null);
      } else {
        setSession({ sessionId: endedSessionId, lifecycle: 'ENDED', currentStage: 'welcome', joiningOpen: false, paused: false });
        setIdentity({ role: 'student', sessionId: endedSessionId, participant: null });
      }
    });
    socket.on('session:participant-count', ({ count }) => setSession((current) => ({ ...current, participantCount: count })));
    socket.on('session:participant-list', ({ participants }) => setSession((current) => ({ ...current, participants })));
    socket.on('session:participant-identity', (participant) => setIdentity((current) => current?.role === 'student' ? { ...current, participant } : current));
    socket.on('session:participant-connection', ({ participantId, isConnected }) => setSession((current) => ({
      ...current,
      participants: current?.participants?.map((item) => item.id === participantId ? { ...item, isConnected } : item),
    })));
    socket.on('wall:snapshot', (snapshot) => setWall((current) => ({ ...current, ...snapshot })));
    socket.on('wall:moderation-queue', (snapshot) => setWall((current) => ({
      ...current,
      acceptedStudentCount: snapshot.acceptedStudentCount,
      moderationQueue: snapshot.messages,
    })));
    socket.on('remix:snapshot', (snapshot) => setRemix((current) => ({
      ...snapshot,
      messageRemix: { ...snapshot.messageRemix, ownSubmission: snapshot.messageRemix?.ownSubmission ?? current.messageRemix.ownSubmission },
      academicTransfer: { ...snapshot.academicTransfer, ownSubmission: snapshot.academicTransfer?.ownSubmission ?? current.academicTransfer.ownSubmission },
    })));
    socket.on('wall:submission-statuses', (statuses) => setOwnWallStatuses(statuses));
    socket.on('wall:submission-status', (status) => setOwnWallStatuses((current) => [
      ...current.filter((item) => item.id !== status.id), status,
    ]));
    socket.on('quiz:state', (state) => setQuiz((current) => ({ ...current, ...state })));
    socket.on('quiz:answer-status', (answer) => setQuiz((current) => ({
      ...current,
      answers: [...(current.answers ?? []).filter((item) => item.questionId !== answer.questionId), answer],
    })));
    socket.on('quiz:answer-statuses', (snapshot) => setQuiz((current) => ({ ...current, ...snapshot })));
    socket.on('quiz:submission-status', (submissionStatus) => setQuiz((current) => ({ ...current, submissionStatus })));
    socket.on('quiz:reveal', (reveal) => setQuiz((current) => ({ ...current, open: false, revealed: true, reveal })));
    socket.on('assessment:snapshot', setAssessment);
    socket.on('assessment:error', ({ error: code }) => setError(code === 'SUBMISSIONS_MUST_BE_CLOSED' ? 'Close both writing windows before evaluation.' : 'Assessment could not be completed.'));
    socket.on('results:own', setStudentResults);
    socket.on('results:leaderboard', setPublicLeaderboard);
    return () => socket.disconnect();
  }, [identity?.role, identity?.sessionId, applySession, enterTeacher]);

  const value = useMemo(() => ({
    session, identity, sessionReady, socketStatus, error, loading, setError, enterTeacher,
    joinSession, startLearning, wall, ownWallStatuses, quiz, submitWallMessage,
    submitTeacherWallMessage, setWallSubmissionsOpen, deleteWallMessage, identifyWallAuthor,
    submitQuizAnswer, setQuizOpen, revealQuiz, remix, selectRemixSource, setRemixGate, submitRemix,
    assessment, studentResults, publicLeaderboard, evaluateAssessment: (payload) => sendAssessmentEvent('assessment:evaluate', payload),
    correctAssessment: (payload) => sendAssessmentEvent('assessment:correct', payload),
    publishResults: (payload) => sendAssessmentEvent('results:publish', payload),
  }), [session, identity, sessionReady, socketStatus, error, loading, enterTeacher, joinSession,
    startLearning, wall, ownWallStatuses, quiz, submitWallMessage, submitTeacherWallMessage,
    setWallSubmissionsOpen, deleteWallMessage, identifyWallAuthor, submitQuizAnswer,
    setQuizOpen, revealQuiz, remix, selectRemixSource, setRemixGate, submitRemix,
    assessment, studentResults, publicLeaderboard, sendAssessmentEvent]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
