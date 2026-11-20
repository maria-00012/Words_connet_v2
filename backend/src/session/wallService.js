import { randomUUID } from 'node:crypto';
import { SessionError } from './sessionManager.js';

export const WALL_FALLBACK_TEXT = 'Your kindness makes our class a more welcoming place, and your positive attitude encourages everyone.';

function requireWallStage(session) {
  if (session.lifecycle !== 'ACTIVE' || session.currentStage !== 'wall') throw new SessionError('WALL_NOT_ACTIVE', 409);
}

function normalizedMessage(text) {
  if (typeof text !== 'string') throw new SessionError('INVALID_MESSAGE');
  const value = text.trim();
  const characters = [...value];
  if (characters.length > 200) throw new SessionError('MESSAGE_TOO_LONG');
  if (characters.filter((character) => !/\s/u.test(character)).length < 10) throw new SessionError('MESSAGE_TOO_SHORT');
  return value;
}

function publicMessage(message) {
  return { id: message.id, text: message.text, status: message.status, accepted: message.accepted, createdAt: message.createdAt };
}

function teacherMessage(message) {
  return { ...publicMessage(message), authorType: message.authorType, moderatedAt: message.moderatedAt };
}

export class WallService {
  constructor(sessionManager, { now = () => new Date().toISOString() } = {}) {
    this.sessionManager = sessionManager;
    this.now = now;
  }

  getPublicSnapshot(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    return {
      submissionsOpen: session.wall.submissionsOpen,
      messages: [...session.wall.messages.values()].filter((message) => message.status === 'visible')
        .map(publicMessage).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }

  getTeacherSnapshot(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    const messages = [...session.wall.messages.values()].map(teacherMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      submissionsOpen: session.wall.submissionsOpen,
      messages,
      acceptedStudentCount: messages.filter((message) => message.authorType === 'student' && message.accepted).length,
    };
  }

  getParticipantStatuses(sessionId, participantId) {
    const session = this.sessionManager.getSession(sessionId);
    return [...session.wall.messages.values()]
      .filter((message) => message.authorType === 'student' && message.authorParticipantId === participantId)
      .map((message) => ({ id: message.id, status: message.status, accepted: message.accepted }));
  }

  setSubmissionsOpen(sessionId, open) {
    const session = this.sessionManager.getSession(sessionId);
    requireWallStage(session);
    session.wall.submissionsOpen = open;
    return this.getTeacherSnapshot(sessionId);
  }

  submitStudent(sessionId, participantId, { text, idempotencyKey }) {
    const session = this.sessionManager.getSession(sessionId);
    requireWallStage(session);
    if (!session.wall.submissionsOpen) throw new SessionError('WALL_CLOSED', 403);
    if (!session.participants.has(participantId)) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    const value = normalizedMessage(text);
    const key = `student:${participantId}:${idempotencyKey}`;
    const priorId = session.wall.idempotency.get(key);
    if (priorId) {
      const prior = session.wall.messages.get(priorId);
      if (prior.text !== value) throw new SessionError('IDEMPOTENCY_CONFLICT', 409);
      return { message: teacherMessage(prior), created: false };
    }
    if ([...session.wall.messages.values()].some((message) => message.authorType === 'student' && message.authorParticipantId === participantId)) {
      throw new SessionError('MESSAGE_ALREADY_ACCEPTED', 409);
    }
    const message = {
      id: randomUUID(), sessionId, authorParticipantId: participantId, authorType: 'student', text: value,
      status: 'visible', accepted: true, createdAt: this.now(), moderatedAt: null,
    };
    session.wall.messages.set(message.id, message);
    session.wall.idempotency.set(key, message.id);
    return { message: teacherMessage(message), created: true };
  }

  submitTeacher(sessionId, { text, idempotencyKey }) {
    const session = this.sessionManager.getSession(sessionId);
    requireWallStage(session);
    if (!session.wall.submissionsOpen) throw new SessionError('WALL_CLOSED', 403);
    const value = normalizedMessage(text);
    const key = `teacher:${idempotencyKey}`;
    const priorId = session.wall.idempotency.get(key);
    if (priorId) {
      const prior = session.wall.messages.get(priorId);
      if (prior.text !== value) throw new SessionError('IDEMPOTENCY_CONFLICT', 409);
      return { message: publicMessage(prior), created: false };
    }
    const message = {
      id: randomUUID(), sessionId, authorParticipantId: null, authorType: 'teacher', text: value,
      status: 'visible', accepted: true, createdAt: this.now(), moderatedAt: null,
    };
    session.wall.messages.set(message.id, message);
    session.wall.idempotency.set(key, message.id);
    return { message: publicMessage(message), created: true };
  }

  deleteMessage(sessionId, messageId) {
    const session = this.sessionManager.getSession(sessionId);
    requireWallStage(session);
    const message = session.wall.messages.get(messageId);
    if (!message) throw new SessionError('MESSAGE_NOT_FOUND', 404);
    if (message.authorType !== 'student' || message.status === 'deleted') throw new SessionError('INVALID_DELETE', 409);
    message.status = 'deleted';
    message.moderatedAt = this.now();
    return teacherMessage(message);
  }

  identifyAuthor(sessionId, messageId) {
    const session = this.sessionManager.getSession(sessionId);
    requireWallStage(session);
    const message = session.wall.messages.get(messageId);
    if (!message) throw new SessionError('MESSAGE_NOT_FOUND', 404);
    if (message.authorType === 'teacher') return { messageId, authorType: 'teacher' };
    const participant = session.participants.get(message.authorParticipantId);
    if (!participant) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    return { messageId, authorType: 'student', displayNumber: participant.displayNumber, displayName: participant.displayName };
  }
}
