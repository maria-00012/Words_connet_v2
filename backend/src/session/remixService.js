import { randomUUID } from 'node:crypto';
import { SessionError } from './sessionManager.js';
import { WALL_FALLBACK_TEXT } from './wallService.js';

export const ACADEMIC_TRANSFER_SOURCE = "Regular participation in extracurricular activities can improve university students' social skills and contribute to their personal development.";
export const REMIX_EXERCISES = ['message-remix', 'academic-transfer'];

function requireActive(session) {
  if (session.lifecycle !== 'ACTIVE') throw new SessionError('WORKSHOP_NOT_ACTIVE', 409);
}

export class RemixService {
  constructor(sessionManager, wallService, { now = () => new Date().toISOString() } = {}) {
    this.sessionManager = sessionManager;
    this.wallService = wallService;
    this.now = now;
  }

  getSnapshot(sessionId, { teacher = false, participantId = null } = {}) {
    const session = this.sessionManager.getSession(sessionId);
    const submissions = session.remix.submissions;
    const snapshot = {
      source: session.remix.source ? { ...session.remix.source } : null,
      sourceFrozen: session.remix.messageRemixFrozen,
      messageRemix: {
        open: session.remix.messageRemixOpen,
        submitted: submissions['message-remix'].size,
        eligible: session.participants.size,
        ownSubmission: participantId ? submissions['message-remix'].get(participantId) ?? null : null,
      },
      academicTransfer: {
        open: session.remix.academicTransferOpen,
        sourceText: ACADEMIC_TRANSFER_SOURCE,
        submitted: submissions['academic-transfer'].size,
        eligible: session.participants.size,
        ownSubmission: participantId ? submissions['academic-transfer'].get(participantId) ?? null : null,
      },
    };
    if (teacher) snapshot.wallMessages = this.wallService.getTeacherSnapshot(sessionId).messages
      .filter((message) => message.authorType === 'student' && message.status === 'visible');
    return snapshot;
  }

  selectSource(sessionId, messageId) {
    const session = this.sessionManager.getSession(sessionId);
    requireActive(session);
    if (session.remix.messageRemixFrozen) throw new SessionError('SOURCE_FROZEN', 409);
    if (messageId === undefined) {
      session.remix.source = { sourceText: WALL_FALLBACK_TEXT, sourceMessageId: null, isFallback: true, selectedAt: this.now() };
      return { ...session.remix.source };
    }
    const message = session.wall.messages.get(messageId);
    if (!message || message.authorType !== 'student' || !message.accepted || message.status !== 'visible') {
      throw new SessionError('INVALID_WALL_SOURCE', 400);
    }
    session.remix.source = { sourceText: message.text, sourceMessageId: message.id, isFallback: false, selectedAt: this.now() };
    return { ...session.remix.source };
  }

  clearDeletedSource(sessionId, messageId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session.remix.messageRemixFrozen && session.remix.source?.sourceMessageId === messageId) session.remix.source = null;
  }

  setGate(sessionId, exercise, open) {
    const session = this.sessionManager.getSession(sessionId);
    requireActive(session);
    if (!REMIX_EXERCISES.includes(exercise)) throw new SessionError('INVALID_EXERCISE');
    if (open && (session.assessment.status !== 'idle' || session.assessment.published)) {
      throw new SessionError('ASSESSMENT_ALREADY_STARTED', 409);
    }
    if (exercise === 'message-remix') {
      if (open && !session.remix.source) throw new SessionError('REMIX_SOURCE_REQUIRED', 409);
      session.remix.messageRemixOpen = open;
      if (open) session.remix.messageRemixFrozen = true;
    } else session.remix.academicTransferOpen = open;
    return this.getSnapshot(sessionId, { teacher: true });
  }

  submit(sessionId, participantId, { exercise, text, idempotencyKey }) {
    const session = this.sessionManager.getSession(sessionId);
    requireActive(session);
    if (!REMIX_EXERCISES.includes(exercise)) throw new SessionError('INVALID_EXERCISE');
    const open = exercise === 'message-remix' ? session.remix.messageRemixOpen : session.remix.academicTransferOpen;
    if (!open) throw new SessionError('SUBMISSIONS_CLOSED', 403);
    if (!session.participants.has(participantId)) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    const responseText = typeof text === 'string' ? text.trim() : '';
    if (!responseText) throw new SessionError('RESPONSE_REQUIRED');
    if ([...responseText].length > 2000) throw new SessionError('RESPONSE_TOO_LONG');
    const key = `${participantId}:${exercise}:${idempotencyKey}`;
    const priorId = session.remix.idempotency.get(key);
    const submissions = session.remix.submissions[exercise];
    if (priorId) {
      const prior = submissions.get(participantId);
      if (prior?.id === priorId) return { submission: { ...prior }, duplicate: true };
      throw new SessionError('IDEMPOTENCY_CONFLICT', 409);
    }
    if (submissions.has(participantId)) throw new SessionError('SUBMISSION_ALREADY_EXISTS', 409);
    const sourceText = exercise === 'message-remix' ? session.remix.source?.sourceText : ACADEMIC_TRANSFER_SOURCE;
    if (!sourceText) throw new SessionError('REMIX_SOURCE_REQUIRED', 409);
    const submission = {
      id: randomUUID(), exercise, sourceText, sourceMessageId: exercise === 'message-remix' ? session.remix.source.sourceMessageId : null,
      responseText, submittedAt: this.now(),
    };
    submissions.set(participantId, submission);
    session.remix.idempotency.set(key, submission.id);
    return { submission: { ...submission }, duplicate: false };
  }
}
