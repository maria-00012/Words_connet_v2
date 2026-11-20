import { createHash, randomBytes, randomUUID } from 'node:crypto';

export class SessionError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'SessionError';
    this.code = code;
    this.status = status;
  }
}

const hashSecret = (salt, secret) => createHash('sha256').update(salt).update(secret).digest();
const makeSecret = (bytes = 32) => randomBytes(bytes).toString('base64url');

function publicParticipant(participant) {
  return {
    id: participant.id,
    displayNumber: participant.displayNumber,
    displayName: participant.displayName,
    joinedAt: participant.joinedAt,
    lastSeenAt: participant.lastSeenAt,
    isConnected: participant.socketIds.size > 0,
  };
}

export class SessionManager {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    this.session = null;
  }

  createSession() {
    if (this.session) throw new SessionError('SESSION_ALREADY_EXISTS', 409);

    const credentialSalt = randomBytes(16);
    const session = {
      id: randomUUID(),
      lifecycle: 'LOBBY',
      currentStage: 'welcome',
      joiningOpen: true,
      paused: false,
      createdAt: this.now(),
      startedAt: null,
      endedAt: null,
      credentialSalt,
      teacherCapabilities: new Map(),
      participants: new Map(),
      participantCredentials: new Map(),
      joinRequests: new Map(),
      nextDisplayNumber: 1,
      wall: {
        submissionsOpen: false,
        messages: new Map(),
        idempotency: new Map(),
      },
      remix: {
        source: null,
        messageRemixFrozen: false,
        messageRemixOpen: false,
        academicTransferOpen: false,
        submissions: { 'message-remix': new Map(), 'academic-transfer': new Map() },
        idempotency: new Map(),
      },
      quiz: {
        open: false,
        hasBeenOpened: false,
        revealed: false,
        answers: new Map(),
        idempotency: new Map(),
      },
      assessment: {
        status: 'idle',
        published: false,
        publishedAt: null,
        startedAt: null,
        finishedAt: null,
        completed: 0,
        total: 0,
        failed: 0,
        flagged: 0,
        results: new Map(),
      },
    };

    this.session = session;
    return { sessionId: session.id };
  }

  getSession(sessionId) {
    if (!this.session || sessionId !== this.session.id) throw new SessionError('SESSION_NOT_FOUND', 404);
    return this.session;
  }

  getCurrentSession() {
    if (!this.session) throw new SessionError('SESSION_NOT_FOUND', 404);
    return this.session;
  }

  enterTeacher() {
    if (!this.session) this.createSession();
    const session = this.getCurrentSession();
    const token = makeSecret();
    session.teacherCapabilities.set(hashSecret(session.credentialSalt, token).toString('hex'), this.now());
    return { sessionId: session.id, token, snapshot: this.getTeacherSnapshot(session.id) };
  }

  authenticateTeacherToken(sessionId, token) {
    const session = this.getSession(sessionId);
    if (typeof token !== 'string') throw new SessionError('INVALID_TEACHER_CREDENTIAL', 401);
    const tokenHash = hashSecret(session.credentialSalt, token).toString('hex');
    if (!session.teacherCapabilities.has(tokenHash)) throw new SessionError('INVALID_TEACHER_CREDENTIAL', 401);
    return session;
  }

  getPublicSnapshot(sessionId) {
    const session = this.getSession(sessionId);
    return {
      sessionId: session.id,
      lifecycle: session.lifecycle,
      currentStage: session.currentStage,
      joiningOpen: session.joiningOpen,
      paused: session.paused,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }

  getTeacherSnapshot(sessionId) {
    const session = this.getSession(sessionId);
    const participants = [...session.participants.values()]
      .map(publicParticipant)
      .sort((left, right) => left.displayNumber - right.displayNumber);
    return {
      ...this.getPublicSnapshot(sessionId),
      participantCount: participants.length,
      participants,
    };
  }

  joinParticipant({ sessionId, displayName, requestId }) {
    const session = this.getSession(sessionId);
    const normalizedName = displayName.trim();
    if (!normalizedName || [...normalizedName].length > 80) throw new SessionError('INVALID_STUDENT_NAME');

    const priorRequest = session.joinRequests.get(requestId);
    if (priorRequest) {
      if (priorRequest.displayName !== normalizedName) throw new SessionError('INVALID_JOIN_REQUEST', 409);
      return this.issueParticipantCredential(session, session.participants.get(priorRequest.participantId), false);
    }

    if (!session.joiningOpen || session.lifecycle === 'ENDED') {
      throw new SessionError('JOINING_CLOSED', 403);
    }
    if (session.assessment.published) throw new SessionError('JOINING_CLOSED', 403);

    const participant = {
      id: randomUUID(),
      sessionId: session.id,
      displayNumber: session.nextDisplayNumber++,
      displayName: normalizedName,
      joinedAt: this.now(),
      lastSeenAt: this.now(),
      socketIds: new Set(),
    };
    session.participants.set(participant.id, participant);
    session.joinRequests.set(requestId, { displayName: normalizedName, participantId: participant.id });
    return this.issueParticipantCredential(session, participant, true);
  }

  issueParticipantCredential(session, participant, created) {
    if (!participant) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    const reconnectToken = makeSecret();
    const tokenHash = hashSecret(session.credentialSalt, reconnectToken).toString('hex');
    session.participantCredentials.set(tokenHash, participant.id);
    return { participant: publicParticipant(participant), reconnectToken, created };
  }

  resumeParticipant(sessionId, reconnectToken) {
    const session = this.getSession(sessionId);
    if (typeof reconnectToken !== 'string') throw new SessionError('INVALID_RECONNECT_CREDENTIAL', 401);
    const tokenHash = hashSecret(session.credentialSalt, reconnectToken).toString('hex');
    const participantId = session.participantCredentials.get(tokenHash);
    const participant = participantId ? session.participants.get(participantId) : null;
    if (!participant) throw new SessionError('INVALID_RECONNECT_CREDENTIAL', 401);
    return publicParticipant(participant);
  }

  attachParticipantSocket(sessionId, participantId, socketId) {
    const session = this.getSession(sessionId);
    const participant = session.participants.get(participantId);
    if (!participant) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    const wasConnected = participant.socketIds.size > 0;
    participant.socketIds.add(socketId);
    participant.lastSeenAt = this.now();
    return { participant: publicParticipant(participant), connectionChanged: !wasConnected };
  }

  detachParticipantSocket(sessionId, participantId, socketId) {
    if (!this.session || this.session.id !== sessionId) return null;
    const participant = this.session.participants.get(participantId);
    if (!participant) return null;
    const wasConnected = participant.socketIds.size > 0;
    participant.socketIds.delete(socketId);
    if (wasConnected && participant.socketIds.size === 0) participant.lastSeenAt = this.now();
    return {
      participant: publicParticipant(participant),
      connectionChanged: wasConnected && participant.socketIds.size === 0,
    };
  }

  setJoiningOpen(sessionId, open) {
    const session = this.getSession(sessionId);
    if (session.lifecycle === 'ENDED') throw new SessionError('SESSION_ENDED', 409);
    session.joiningOpen = open;
    return this.getPublicSnapshot(sessionId);
  }

  startWorkshop(sessionId) {
    const session = this.getSession(sessionId);
    if (session.lifecycle === 'ENDED') throw new SessionError('SESSION_ENDED', 409);
    if (session.lifecycle === 'LOBBY') {
      session.lifecycle = 'ACTIVE';
      session.startedAt = this.now();
    }
    return this.getPublicSnapshot(sessionId);
  }

  startLearning(sessionId) {
    const session = this.getSession(sessionId);
    if (session.lifecycle !== 'ACTIVE') throw new SessionError('WORKSHOP_NOT_ACTIVE', 409);
    if (session.currentStage === 'welcome') {
      session.currentStage = 'wall';
      session.wall.submissionsOpen = true;
    }
    return this.getPublicSnapshot(sessionId);
  }

  endSession(sessionId) {
    const session = this.getSession(sessionId);
    session.lifecycle = 'ENDED';
    session.joiningOpen = false;
    session.endedAt = this.now();
    const snapshot = this.getPublicSnapshot(sessionId);
    this.session = null;
    return snapshot;
  }
}
