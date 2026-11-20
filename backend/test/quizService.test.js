import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SessionManager } from '../src/session/sessionManager.js';
import { QuizService } from '../src/session/quizService.js';

function createQuiz() {
  const sessionManager = new SessionManager();
  const { sessionId } = sessionManager.createSession();
  const participant = sessionManager.joinParticipant({
    sessionId,
    displayName: 'Quiz Student',
    requestId: randomUUID(),
  }).participant;
  const quizService = new QuizService(sessionManager);
  return { sessionManager, sessionId, participant, quizService };
}

test('quiz starts closed and never sends answer keys before reveal', () => {
  const { sessionManager, sessionId, participant, quizService } = createQuiz();
  sessionManager.startWorkshop(sessionId);
  const snapshot = quizService.getStudentSnapshot(sessionId, participant.id);
  assert.deepEqual(snapshot, { open: false, hasBeenOpened: false, revealed: false, answers: [] });
  assert.throws(() => quizService.setState(sessionId, { open: false, reveal: true }), { code: 'QUIZ_NOT_OPENED' });
  assert.equal(quizService.getRevealData(sessionId), null);
  assert.deepEqual(quizService.getTeacherSubmissionStatus(sessionId).questionCounts, {
    'meaning-keeper': 0, 'synonym-trap': 0, 'structure-switch': 0,
  });
});

test('quiz preserves the first accepted answer for each question and reports status without correctness', () => {
  const { sessionManager, sessionId, participant, quizService } = createQuiz();
  sessionManager.startWorkshop(sessionId);
  quizService.setState(sessionId, { open: true });
  const idempotencyKey = randomUUID();
  const first = quizService.submitAnswer(sessionId, participant.id, {
    questionId: 'meaning-keeper', option: 'B', idempotencyKey,
  });
  const retry = quizService.submitAnswer(sessionId, participant.id, {
    questionId: 'meaning-keeper', option: 'A', idempotencyKey,
  });
  const changedKeyRetry = quizService.submitAnswer(sessionId, participant.id, {
    questionId: 'meaning-keeper', option: 'C', idempotencyKey: randomUUID(),
  });
  assert.equal(first.answer.option, 'B');
  assert.equal(retry.answer.option, 'B');
  assert.equal(retry.duplicate, true);
  assert.equal(changedKeyRetry.answer.option, 'B');
  assert.equal(quizService.getStudentSnapshot(sessionId, participant.id).answers.length, 1);
  const teacherStatus = quizService.getTeacherSubmissionStatus(sessionId);
  assert.deepEqual(teacherStatus.participants[0].questionIds, ['meaning-keeper']);
  assert.equal(JSON.stringify(teacherStatus).includes('correctOption'), false);
});

test('quiz closes before reveal, reveals exact key and explanations, and cannot reopen afterward', () => {
  const { sessionManager, sessionId, participant, quizService } = createQuiz();
  sessionManager.startWorkshop(sessionId);
  assert.throws(() => quizService.submitAnswer(sessionId, participant.id, {
    questionId: 'meaning-keeper', option: 'B', idempotencyKey: randomUUID(),
  }), { code: 'QUIZ_CLOSED' });
  quizService.setState(sessionId, { open: true });
  quizService.submitAnswer(sessionId, participant.id, {
    questionId: 'meaning-keeper', option: 'B', idempotencyKey: randomUUID(),
  });
  assert.throws(() => quizService.setState(sessionId, { open: true, reveal: true }), { code: 'QUIZ_MUST_BE_CLOSED' });
  assert.throws(() => quizService.setState(sessionId, { open: false, reveal: true }), { code: 'QUIZ_MUST_BE_CLOSED' });
  quizService.setState(sessionId, { open: false });
  assert.throws(() => quizService.submitAnswer(sessionId, participant.id, {
    questionId: 'synonym-trap', option: 'A', idempotencyKey: randomUUID(),
  }), { code: 'QUIZ_CLOSED' });
  quizService.setState(sessionId, { open: false, reveal: true });
  const snapshot = quizService.getStudentSnapshot(sessionId, participant.id);
  assert.equal(snapshot.revealed, true);
  assert.equal(snapshot.score, 1);
  assert.deepEqual(snapshot.reveal.map(({ questionId, correctOption }) => [questionId, correctOption]), [
    ['meaning-keeper', 'B'], ['synonym-trap', 'A'], ['structure-switch', 'C'],
  ]);
  assert.equal(snapshot.reveal[0].explanation, 'Meaning secured! Both communication skills and social connections remain.');
  assert.throws(() => quizService.setState(sessionId, { open: true }), { code: 'QUIZ_ALREADY_REVEALED' });
});

test('quiz score awards one point per correct answer up to three', () => {
  const { sessionManager, sessionId, participant, quizService } = createQuiz();
  sessionManager.startWorkshop(sessionId);
  quizService.setState(sessionId, { open: true });
  for (const [questionId, option] of [
    ['meaning-keeper', 'B'],
    ['synonym-trap', 'A'],
    ['structure-switch', 'C'],
  ]) {
    quizService.submitAnswer(sessionId, participant.id, { questionId, option, idempotencyKey: randomUUID() });
  }
  quizService.setState(sessionId, { open: false });
  quizService.setState(sessionId, { open: false, reveal: true });
  assert.equal(quizService.getStudentSnapshot(sessionId, participant.id).score, 3);
});
