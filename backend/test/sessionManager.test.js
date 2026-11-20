import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SessionError, SessionManager } from '../src/session/sessionManager.js';

function createManagerWithSession() {
  const manager = new SessionManager();
  const created = manager.createSession();
  return { manager, ...created };
}

function join(manager, sessionId, displayName, requestId = randomUUID()) {
  return manager.joinParticipant({ sessionId, displayName, requestId });
}

test('creates one session with an open lobby and no teacher access code', () => {
  const { manager, sessionId } = createManagerWithSession();
  assert.match(sessionId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(manager.getPublicSnapshot(sessionId), {
    sessionId,
    lifecycle: 'LOBBY',
    currentStage: 'welcome',
    joiningOpen: true,
    paused: false,
    createdAt: manager.getPublicSnapshot(sessionId).createdAt,
    startedAt: null,
    endedAt: null,
  });
  assert.equal('teacherAccessCode' in manager.getTeacherSnapshot(sessionId), false);
  assert.throws(() => manager.createSession(), (error) => error.code === 'SESSION_ALREADY_EXISTS');
});

test('teacher entry issues a scoped capability without an access code and reuses the active session', () => {
  const { manager, sessionId } = createManagerWithSession();
  const auth = manager.enterTeacher();
  assert.equal(auth.sessionId, sessionId);
  assert.deepEqual(manager.getTeacherSnapshot(sessionId), auth.snapshot);
  assert.equal(manager.authenticateTeacherToken(sessionId, auth.token).id, sessionId);
  assert.equal(manager.enterTeacher().sessionId, sessionId);
});

test('validates names, assigns stable IDs and sequential display numbers, and makes join retries idempotent', () => {
  const { manager, sessionId } = createManagerWithSession();
  const firstRequest = randomUUID();
  assert.throws(() => join(manager, sessionId, '  ', firstRequest), (error) => error.code === 'INVALID_STUDENT_NAME');
  assert.throws(() => join(manager, sessionId, 'x'.repeat(81), firstRequest), (error) => error.code === 'INVALID_STUDENT_NAME');

  const first = join(manager, sessionId, '  Maria  ', firstRequest);
  const retry = join(manager, sessionId, 'Maria', firstRequest);
  const second = join(manager, sessionId, 'Student Two');
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(first.participant.id, retry.participant.id);
  assert.equal(first.participant.displayNumber, 1);
  assert.equal(second.participant.displayNumber, 2);
  assert.notEqual(first.participant.id, second.participant.id);
  assert.equal(manager.getTeacherSnapshot(sessionId).participantCount, 2);
});

test('joining gate allows late joins while open, blocks new joins when closed, and permits reconnects', () => {
  const { manager, sessionId } = createManagerWithSession();
  const first = join(manager, sessionId, 'First');
  manager.startWorkshop(sessionId);
  assert.equal(manager.getPublicSnapshot(sessionId).lifecycle, 'ACTIVE');
  const late = join(manager, sessionId, 'Late student');
  assert.equal(late.participant.displayNumber, 2);

  manager.setJoiningOpen(sessionId, false);
  assert.throws(() => join(manager, sessionId, 'Blocked'), (error) => error.code === 'JOINING_CLOSED');
  assert.equal(manager.resumeParticipant(sessionId, first.reconnectToken).id, first.participant.id);
  manager.setJoiningOpen(sessionId, true);
  assert.equal(join(manager, sessionId, 'Reopened').participant.displayNumber, 3);
});

test('invalid reconnect credentials fail and duplicate reconnects preserve one participant identity', () => {
  const { manager, sessionId } = createManagerWithSession();
  const joined = join(manager, sessionId, 'Student');
  manager.attachParticipantSocket(sessionId, joined.participant.id, 'socket-a');
  const resumed = manager.resumeParticipant(sessionId, joined.reconnectToken);
  manager.attachParticipantSocket(sessionId, resumed.id, 'socket-b');
  assert.equal(manager.getTeacherSnapshot(sessionId).participantCount, 1);
  assert.equal(manager.getTeacherSnapshot(sessionId).participants[0].isConnected, true);
  assert.throws(() => manager.resumeParticipant(sessionId, 'invalid-reconnect-token'), (error) => error.code === 'INVALID_RECONNECT_CREDENTIAL');
  manager.detachParticipantSocket(sessionId, resumed.id, 'socket-a');
  assert.equal(manager.getTeacherSnapshot(sessionId).participants[0].isConnected, true);
  manager.detachParticipantSocket(sessionId, resumed.id, 'socket-b');
  assert.equal(manager.getTeacherSnapshot(sessionId).participants[0].isConnected, false);
});

test('ending clears all session data and allows a fresh session with a new ID', () => {
  const { manager, sessionId } = createManagerWithSession();
  const joined = join(manager, sessionId, 'Existing student');
  const session = manager.getSession(sessionId);
  session.wall.messages.set('wall-message', { id: 'wall-message' });
  session.quiz.answers.set('quiz-answer', { id: 'quiz-answer' });
  session.remix.submissions['message-remix'].set(joined.participant.id, { id: 'remix-submission' });
  session.assessment.results.set('result', { id: 'result', total: 10 });
  manager.endSession(sessionId);
  assert.equal(manager.session, null);
  assert.throws(() => manager.getPublicSnapshot(sessionId), (error) => error.code === 'SESSION_NOT_FOUND');
  assert.throws(() => manager.resumeParticipant(sessionId, joined.reconnectToken), (error) => error.code === 'SESSION_NOT_FOUND');

  const fresh = manager.enterTeacher();
  assert.notEqual(fresh.sessionId, sessionId);
  assert.equal(fresh.snapshot.lifecycle, 'LOBBY');
  assert.equal(fresh.snapshot.currentStage, 'welcome');
  assert.equal(fresh.snapshot.participantCount, 0);
  const freshSession = manager.getSession(fresh.sessionId);
  assert.equal(freshSession.wall.messages.size, 0);
  assert.equal(freshSession.quiz.answers.size, 0);
  assert.equal(freshSession.remix.submissions['message-remix'].size, 0);
  assert.equal(freshSession.assessment.results.size, 0);
});

test('session ID is required for lookup and an invalid ID cannot access session state', () => {
  const { manager } = createManagerWithSession();
  assert.throws(() => manager.getPublicSnapshot('bad-id'), (error) => error.code === 'SESSION_NOT_FOUND');
  assert.throws(() => manager.getPublicSnapshot(randomUUID()), (error) => error.code === 'SESSION_NOT_FOUND');
  assert.ok(SessionError);
});

test('students can advance only from an active workshop welcome to the first stage', () => {
  const { manager, sessionId } = createManagerWithSession();
  assert.throws(() => manager.startLearning(sessionId), (error) => error.code === 'WORKSHOP_NOT_ACTIVE');
  manager.startWorkshop(sessionId);
  assert.equal(manager.startLearning(sessionId).currentStage, 'wall');
  assert.equal(manager.startLearning(sessionId).currentStage, 'wall');
});
