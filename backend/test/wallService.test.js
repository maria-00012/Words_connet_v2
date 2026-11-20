import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SessionManager } from '../src/session/sessionManager.js';
import { WallService } from '../src/session/wallService.js';
import { ACADEMIC_TRANSFER_SOURCE, RemixService } from '../src/session/remixService.js';

function setup() {
  const manager = new SessionManager();
  const { sessionId } = manager.createSession();
  const participant = manager.joinParticipant({ sessionId, displayName: 'Amina Student', requestId: randomUUID() }).participant;
  const wall = new WallService(manager);
  const remix = new RemixService(manager, wall);
  manager.startWorkshop(sessionId);
  manager.startLearning(sessionId);
  wall.setSubmissionsOpen(sessionId, true);
  return { manager, wall, remix, sessionId, participant };
}

const submitWall = (wall, sessionId, participantId, text, idempotencyKey = randomUUID()) => wall.submitStudent(sessionId, participantId, { text, idempotencyKey });

test('Wall messages are accepted and displayed immediately; public projection remains anonymous', () => {
  const { wall, sessionId, participant } = setup();
  const result = submitWall(wall, sessionId, participant.id, 'Kind words help everyone feel welcome.');
  assert.equal(result.message.status, 'visible');
  assert.equal(result.message.accepted, true);
  const publicMessage = wall.getPublicSnapshot(sessionId).messages[0];
  assert.equal(publicMessage.text, result.message.text);
  assert.equal('authorParticipantId' in publicMessage, false);
  assert.equal('authorType' in publicMessage, false);
  assert.throws(() => submitWall(wall, sessionId, participant.id, 'A second message is not allowed.'), { code: 'MESSAGE_ALREADY_ACCEPTED' });
});

test('Wall validates messages, deletion preserves the one-message limit, and deleted text is private', () => {
  const { wall, sessionId, participant } = setup();
  assert.throws(() => submitWall(wall, sessionId, participant.id, '     '), { code: 'MESSAGE_TOO_SHORT' });
  assert.throws(() => submitWall(wall, sessionId, participant.id, '123456789'), { code: 'MESSAGE_TOO_SHORT' });
  assert.throws(() => submitWall(wall, sessionId, participant.id, 'a'.repeat(201)), { code: 'MESSAGE_TOO_LONG' });
  const message = submitWall(wall, sessionId, participant.id, 'A kind message for everyone.').message;
  wall.deleteMessage(sessionId, message.id);
  assert.equal(wall.getPublicSnapshot(sessionId).messages.length, 0);
  assert.equal(wall.getTeacherSnapshot(sessionId).messages[0].status, 'deleted');
  assert.throws(() => submitWall(wall, sessionId, participant.id, 'A replacement is not allowed.'), { code: 'MESSAGE_ALREADY_ACCEPTED' });
});

test('Remix source can be changed before opening, but deleted messages cannot be selected', () => {
  const { wall, remix, sessionId, participant } = setup();
  const first = submitWall(wall, sessionId, participant.id, 'A first kind message for everyone.').message;
  assert.equal(remix.selectSource(sessionId, first.id).sourceText, first.text);
  const source = remix.selectSource(sessionId);
  assert.equal(source.sourceText, 'Your kindness makes our class a more welcoming place, and your positive attitude encourages everyone.');
  assert.equal(source.isFallback, true);
  wall.deleteMessage(sessionId, first.id);
  assert.throws(() => remix.selectSource(sessionId, first.id), { code: 'INVALID_WALL_SOURCE' });
  assert.equal(remix.getSnapshot(sessionId, { teacher: true }).wallMessages.length, 0);
});

test('Remix activities use independent gates, fixed sources, separate immutable submissions, and counts', () => {
  const { remix, sessionId, participant } = setup();
  remix.selectSource(sessionId);
  remix.setGate(sessionId, 'message-remix', true);
  remix.setGate(sessionId, 'message-remix', false);
  assert.throws(() => remix.selectSource(sessionId, randomUUID()), { code: 'SOURCE_FROZEN' });
  assert.equal(remix.getSnapshot(sessionId).academicTransfer.sourceText, ACADEMIC_TRANSFER_SOURCE);
  assert.throws(() => remix.submit(sessionId, participant.id, { exercise: 'academic-transfer', text: 'A response.', idempotencyKey: randomUUID() }), { code: 'SUBMISSIONS_CLOSED' });
  remix.setGate(sessionId, 'message-remix', true);
  remix.setGate(sessionId, 'academic-transfer', true);
  const messageAnswer = remix.submit(sessionId, participant.id, { exercise: 'message-remix', text: 'A new kind paraphrase.', idempotencyKey: randomUUID() });
  const academicAnswer = remix.submit(sessionId, participant.id, { exercise: 'academic-transfer', text: 'A separate academic rewrite.', idempotencyKey: randomUUID() });
  assert.notEqual(messageAnswer.submission.id, academicAnswer.submission.id);
  assert.notEqual(messageAnswer.submission.responseText, academicAnswer.submission.responseText);
  assert.throws(() => remix.submit(sessionId, participant.id, { exercise: 'message-remix', text: 'An edited response.', idempotencyKey: randomUUID() }), { code: 'SUBMISSION_ALREADY_EXISTS' });
  const snapshot = remix.getSnapshot(sessionId, { teacher: true });
  assert.equal(snapshot.messageRemix.submitted, 1);
  assert.equal(snapshot.academicTransfer.submitted, 1);
});
