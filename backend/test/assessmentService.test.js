import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SessionManager } from '../src/session/sessionManager.js';
import { WallService } from '../src/session/wallService.js';
import { RemixService } from '../src/session/remixService.js';
import { QuizService } from '../src/session/quizService.js';
import { AssessmentService, CRITERIA } from '../src/session/assessmentService.js';

function setup({ fetchImpl, apiKey = 'test-key', attempts = 2 } = {}) {
  const manager = new SessionManager();
  const { sessionId } = manager.createSession();
  const first = manager.joinParticipant({ sessionId, displayName: 'Amina', requestId: randomUUID() }).participant;
  const second = manager.joinParticipant({ sessionId, displayName: 'Rafi', requestId: randomUUID() }).participant;
  const wall = new WallService(manager);
  const remix = new RemixService(manager, wall);
  const quiz = new QuizService(manager);
  manager.startWorkshop(sessionId);
  manager.startLearning(sessionId);
  remix.selectSource(sessionId);
  remix.setGate(sessionId, 'message-remix', true);
  remix.submit(sessionId, first.id, { exercise: 'message-remix', text: 'Kindness helps our class feel welcoming.', idempotencyKey: randomUUID() });
  remix.setGate(sessionId, 'message-remix', false);
  remix.setGate(sessionId, 'academic-transfer', true);
  remix.submit(sessionId, first.id, { exercise: 'academic-transfer', text: 'Extracurricular activities support students social growth.', idempotencyKey: randomUUID() });
  remix.setGate(sessionId, 'academic-transfer', false);
  const assessment = new AssessmentService(manager, remix, quiz, { fetchImpl, apiKey, attempts });
  return { manager, sessionId, first, second, remix, quiz, assessment };
}

function validResponse(batch) {
  return { results: batch.map((item) => ({ participantId: item.participantId, submissionId: item.submissionId,
    exercise: item.exercise, criteria: { meaningPreservation: 4, vocabularyVariation: 2,
      sentenceRestructuring: 1, completenessAndTone: 2 }, total: 9, feedback: 'Meaning is preserved; vary the structure further.', flag: null })) };
}

test('assessment evaluates only submitted work, records closed-window zeros, computes weighted score and publishes', async () => {
  let calls = 0;
  const { sessionId, first, second, quiz, assessment } = setup({ fetchImpl: async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'openai/gpt-oss-20b');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(validResponse(JSON.parse(body.messages[1].content).submissions)) } }] }) };
  } });
  const answer = (questionId, option) => quiz.submitAnswer(sessionId, first.id, { questionId, option, idempotencyKey: randomUUID() });
  quiz.setState(sessionId, { open: true });
  answer('meaning-keeper', 'B'); answer('synonym-trap', 'A'); answer('structure-switch', 'C');
  const snapshot = await assessment.evaluateAll(sessionId);
  assert.equal(calls, 1);
  assert.equal(snapshot.status, 'complete');
  assert.equal(snapshot.completed, 4);
  assert.equal(snapshot.total, 4);
  assert.equal(snapshot.results.find((item) => item.participantId === second.id && item.exercise === 'message-remix').total, 0);
  assert.equal(snapshot.results.find((item) => item.participantId === second.id && item.exercise === 'message-remix').submissionId, null);
  assert.equal(assessment.getLeaderboard(sessionId).length, 0);
  assert.equal(assessment.getStudentPublication(sessionId, first.id), null);
  const rank = assessment.publish(sessionId);
  assert.equal(rank.leaderboard[0].participantId, first.id);
  assert.equal(rank.leaderboard[0].finalScore, 93);
  const secondPublication = assessment.getStudentPublication(sessionId, second.id);
  assert.equal(secondPublication.results.length, 2);
  assert.ok(secondPublication.results.every((result) => result.participantId === second.id));
  assert.ok(!rank.leaderboard.some((entry) => 'feedback' in entry || 'responseText' in entry));
});

test('invalid model batch is retried, remains flagged, blocks publication, then correction resolves marks only', async () => {
  let calls = 0;
  const { sessionId, first, assessment } = setup({ fetchImpl: async () => {
    calls += 1;
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"results":[]}' } }] }) };
  }, attempts: 3 });
  const snapshot = await assessment.evaluateAll(sessionId);
  assert.equal(calls, 3);
  assert.equal(snapshot.flagged, 2);
  const priorFeedback = snapshot.results.find((item) => item.participantId === first.id).feedback;
  assert.throws(() => assessment.publish(sessionId), { code: 'ASSESSMENT_UNRESOLVED' });
  const updated = assessment.correct(sessionId, first.id, 'message-remix', {
    meaningPreservation: 3, vocabularyVariation: 2, sentenceRestructuring: 1, completenessAndTone: 2,
  });
  const corrected = updated.results.find((item) => item.participantId === first.id && item.exercise === 'message-remix');
  assert.equal(corrected.total, 8);
  assert.equal(corrected.feedback, priorFeedback);
  assert.equal(corrected.status, 'complete');
  assert.equal(updated.flagged, 1);
  assert.throws(() => assessment.correct(sessionId, first.id, 'message-remix', { ...CRITERIA, meaningPreservation: 5 }), { code: 'INVALID_MARKS' });
});

test('batch identity, bounds, totals, and feedback are validated before accepting a response', () => {
  const { assessment } = setup({ fetchImpl: async () => null });
  const batch = [{ sessionId: 'session', participantId: 'participant', submissionId: 'submission', exercise: 'message-remix', sourceText: 's', responseText: 'r' }];
  const valid = validResponse(batch);
  assert.equal(assessment.validateBatch(batch, valid).length, 1);
  for (const mutate of [
    (item) => { item.results[0].participantId = 'wrong'; },
    (item) => { item.results[0].criteria.meaningPreservation = 5; },
    (item) => { item.results[0].total = 8; },
    (item) => { item.results[0].feedback = ''; },
    (item) => { item.results.push({ ...item.results[0] }); },
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => assessment.validateBatch(batch, invalid));
  }
});

test('missing Groq credentials make no outbound request and leave submitted work flagged', async () => {
  let requests = 0;
  const { sessionId, assessment } = setup({ apiKey: null, fetchImpl: async () => { requests += 1; throw new Error('should not be called'); } });
  const result = await assessment.evaluateAll(sessionId);
  assert.equal(requests, 0);
  assert.equal(result.status, 'needs-review');
  assert.equal(result.flagged, 2);
});

test('Groq HTTP errors are retried and recorded as a safe assessment error code', async () => {
  let requests = 0;
  const { sessionId, assessment } = setup({ fetchImpl: async () => {
    requests += 1;
    return { ok: false, status: 429, text: async () => { throw new Error('response body must not be read or logged'); } };
  }, attempts: 2 });
  const result = await assessment.evaluateAll(sessionId);
  assert.equal(requests, 2);
  assert.equal(result.status, 'needs-review');
  assert.equal(result.flagged, 2);
  assert.ok(result.results.filter((item) => item.submissionId).every((item) => item.flag === 'GROQ_REQUEST_FAILED'));
});
