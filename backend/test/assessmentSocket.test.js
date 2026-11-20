import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io as connectSocket } from 'socket.io-client';
import { createApplication } from '../src/server.js';
import { SessionManager } from '../src/session/sessionManager.js';
import { WallService } from '../src/session/wallService.js';
import { RemixService } from '../src/session/remixService.js';
import { QuizService } from '../src/session/quizService.js';
import { AssessmentService } from '../src/session/assessmentService.js';

async function openSocket(url, sessionId) {
  const socket = connectSocket(url, { auth: { sessionId }, autoConnect: false, forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  return socket;
}

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
}

function waitMatch(socket, event, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, 5000);
    const listener = (value) => { if (!predicate(value)) return; clearTimeout(timeout); socket.off(event, listener); resolve(value); };
    socket.on(event, listener);
  });
}

test('teacher evaluates, corrects, and publishes; student receives only own results and public ranking', async (t) => {
  const sessionManager = new SessionManager();
  const { sessionId } = sessionManager.createSession();
  const wallService = new WallService(sessionManager);
  const remixService = new RemixService(sessionManager, wallService);
  const quizService = new QuizService(sessionManager);
  const assessmentService = new AssessmentService(sessionManager, remixService, quizService, {
    apiKey: 'test-only', fetchImpl: async (_url, request) => {
      const input = JSON.parse(JSON.parse(request.body).messages[1].content).submissions;
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: input.map((item) => ({
        participantId: item.participantId, submissionId: item.submissionId, exercise: item.exercise,
        criteria: { meaningPreservation: 4, vocabularyVariation: 2, sentenceRestructuring: 2, completenessAndTone: 2 },
        total: 10, feedback: 'Meaning and structure are clear.', flag: null,
      })) }) } }] }) };
    },
  });
  const application = createApplication({ sessionManager, wallService, remixService, quizService, assessmentService });
  await new Promise((resolve) => application.httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${application.httpServer.address().port}`;
  t.after(async () => { await new Promise((resolve) => application.io.close(resolve)); });
  const teacherAuth = sessionManager.enterTeacher();
  const teacher = await openSocket(url, sessionId);
  const student = await openSocket(url, sessionId);
  const otherStudent = await openSocket(url, sessionId);
  t.after(() => { teacher.close(); student.close(); otherStudent.close(); });
  assert.equal((await emitAck(teacher, 'session:teacher-attach', { teacherToken: teacherAuth.token })).ok, true);
  assert.deepEqual(await emitAck(student, 'assessment:evaluate'), { ok: false, error: 'NOT_AUTHORIZED' });
  const joined = await emitAck(student, 'session:join', { sessionId, displayName: 'Amina', requestId: randomUUID() });
  const otherJoined = await emitAck(otherStudent, 'session:join', { sessionId, displayName: 'Rafi', requestId: randomUUID() });
  assert.equal(joined.ok, true);
  assert.equal(otherJoined.ok, true);
  await emitAck(teacher, 'session:start');
  await emitAck(student, 'session:student-start');
  await emitAck(teacher, 'remix:source-select', {});
  await emitAck(teacher, 'remix:gate', { exercise: 'message-remix', open: true });
  await emitAck(student, 'remix:submit', { exercise: 'message-remix', text: 'Kindness makes the classroom more welcoming.', idempotencyKey: randomUUID() });
  await emitAck(teacher, 'remix:gate', { exercise: 'message-remix', open: false });
  await emitAck(teacher, 'remix:gate', { exercise: 'academic-transfer', open: true });
  await emitAck(teacher, 'remix:gate', { exercise: 'academic-transfer', open: false });
  await emitAck(teacher, 'quiz:state', { open: true });
  await emitAck(student, 'quiz:submit', { questionId: 'meaning-keeper', option: 'B', idempotencyKey: randomUUID() });
  await emitAck(teacher, 'quiz:state', { open: false });

  const completed = waitMatch(teacher, 'assessment:snapshot', (snapshot) => snapshot.status === 'complete');
  assert.equal((await emitAck(teacher, 'assessment:evaluate')).accepted, true);
  const evaluated = await completed;
  assert.equal(evaluated.results.length, 4);
  assert.equal(evaluated.results.find((result) => result.participantId === joined.participant.id && result.exercise === 'academic-transfer').total, 0);
  assert.equal(joined.assessment, null);
  assert.equal(joined.leaderboard, null);
  assert.equal(otherJoined.assessment, null);
  assert.equal(otherJoined.leaderboard, null);
  assert.equal((await emitAck(student, 'results:publish')).error, 'NOT_AUTHORIZED');

  const ownResult = waitMatch(student, 'results:own', (result) => result.finalScore === 45);
  const otherOwnResult = waitMatch(otherStudent, 'results:own', (result) => result.finalScore === 0);
  const leaderboardEvent = waitMatch(student, 'results:leaderboard', (entries) => entries.length === 2);
  const otherLeaderboardEvent = waitMatch(otherStudent, 'results:leaderboard', (entries) => entries.length === 2);
  const publish = await emitAck(teacher, 'results:publish');
  assert.equal(publish.ok, true);
  const firstPublished = await ownResult;
  assert.equal(firstPublished.results.length, 2);
  assert.ok(firstPublished.results.every((result) => result.participantId === joined.participant.id));
  const secondPublished = await otherOwnResult;
  assert.equal(secondPublished.results.length, 2);
  assert.ok(secondPublished.results.every((result) => result.participantId === otherJoined.participant.id));
  const publicResults = await leaderboardEvent;
  const otherPublicResults = await otherLeaderboardEvent;
  assert.equal(otherPublicResults.length, 2);
  assert.equal('participantId' in publicResults[0], false);
  assert.equal('feedback' in publicResults[0], false);
  assert.equal(publicResults[0].quizScore, 1);
  assert.equal(publish.snapshot.leaderboard.find((entry) => entry.participantId === joined.participant.id).finalScore, 45);

  const correctedResult = waitMatch(student, 'results:own', (result) => result.finalScore === 38);
  const reviewed = evaluated.results.find((result) => result.participantId === joined.participant.id && result.exercise === 'message-remix');
  const correction = await emitAck(teacher, 'assessment:correct', { participantId: joined.participant.id, exercise: 'message-remix',
    criteria: { meaningPreservation: 2, vocabularyVariation: 2, sentenceRestructuring: 2, completenessAndTone: 2 } });
  assert.equal(correction.ok, true);
  assert.equal((await correctedResult).results.find((result) => result.exercise === 'message-remix').feedback, reviewed.feedback);
  assert.equal(correction.snapshot.leaderboard[0].finalScore, 38);
});
