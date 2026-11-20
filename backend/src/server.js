import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { z } from 'zod';
import { SessionError, SessionManager } from './session/sessionManager.js';
import { WallService } from './session/wallService.js';
import { QuizService } from './session/quizService.js';
import { RemixService } from './session/remixService.js';
import { AssessmentService } from './session/assessmentService.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDist = resolve(currentDirectory, '../../frontend/dist');
const sessionIdSchema = z.string().uuid();
const emptyBodySchema = z.object({}).strict();
const joinBodySchema = z.object({
  sessionId: sessionIdSchema,
  displayName: z.string().trim().min(1).max(256)
    .refine((name) => [...name].length <= 80, 'Name is too long'),
  requestId: z.string().uuid(),
}).strict();
const resumeBodySchema = z.object({
  sessionId: sessionIdSchema,
  reconnectToken: z.string().min(20).max(128),
}).strict();
const teacherAttachSchema = z.object({ teacherToken: z.string().min(20).max(128) }).strict();
const joiningSchema = z.object({ open: z.boolean() }).strict();
const wallSubmitSchema = z.object({ text: z.string().max(5000), idempotencyKey: z.string().uuid() }).strict();
const wallDeleteSchema = z.object({
  messageId: z.string().uuid(),
}).strict();
const wallIdentifySchema = z.object({ messageId: z.string().uuid() }).strict();
const quizSubmitSchema = z.object({
  questionId: z.enum(['meaning-keeper', 'synonym-trap', 'structure-switch']),
  option: z.enum(['A', 'B', 'C']),
  idempotencyKey: z.string().uuid(),
}).strict();
const quizStateSchema = z.object({ open: z.boolean(), reveal: z.boolean().optional() }).strict();
const remixSourceSchema = z.object({ messageId: z.string().uuid().optional() }).strict();
const remixGateSchema = z.object({ exercise: z.enum(['message-remix', 'academic-transfer']), open: z.boolean() }).strict();
const remixSubmitSchema = z.object({ exercise: z.enum(['message-remix', 'academic-transfer']), text: z.string().max(5000), idempotencyKey: z.string().uuid() }).strict();
const assessmentCorrectionSchema = z.object({ participantId: z.string().uuid(), exercise: z.enum(['message-remix', 'academic-transfer']), criteria: z.object({ meaningPreservation: z.number().int().min(0).max(4), vocabularyVariation: z.number().int().min(0).max(2), sentenceRestructuring: z.number().int().min(0).max(2), completenessAndTone: z.number().int().min(0).max(2) }).strict() }).strict();

const studentRoom = (sessionId) => `students:${sessionId}`;
const teacherRoom = (sessionId) => `teachers:${sessionId}`;
const participantRoom = (participantId) => `participants:${participantId}`;

function safeErrorCode(error) {
  if (error instanceof SessionError) return error.code;
  return 'INVALID_REQUEST';
}

function sendAck(acknowledgement, response) {
  if (typeof acknowledgement === 'function') acknowledgement(response);
}

function parseSocketPayload(schema, payload) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new SessionError('INVALID_REQUEST');
  return parsed.data;
}

export function createApplication({
  sessionManager = new SessionManager(),
  wallService = new WallService(sessionManager),
  quizService = new QuizService(sessionManager),
  remixService = new RemixService(sessionManager, wallService),
  assessmentService = new AssessmentService(sessionManager, remixService, quizService),
} = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);

  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post('/api/sessions/teacher-entry', (_request, response, next) => {
    try {
      emptyBodySchema.parse(_request.body ?? {});
      const result = sessionManager.enterTeacher();
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/sessions/:sessionId', (request, response, next) => {
    try {
      const sessionId = sessionIdSchema.parse(request.params.sessionId);
      response.json(sessionManager.getPublicSnapshot(sessionId));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/sessions/:sessionId/teacher', (request, response, next) => {
    try {
      const sessionId = sessionIdSchema.parse(request.params.sessionId);
      const authorization = request.get('authorization') ?? '';
      const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{20,128})$/);
      if (!match) throw new SessionError('INVALID_TEACHER_CREDENTIAL', 401);
      sessionManager.authenticateTeacherToken(sessionId, match[1]);
      response.json(sessionManager.getTeacherSnapshot(sessionId));
    } catch (error) {
      next(error);
    }
  });

  // Socket connections are session-scoped guests until they prove a join,
  // reconnect, or teacher capability. They cannot subscribe to private rooms.
  io.use((socket, next) => {
    const parsed = z.object({ sessionId: sessionIdSchema }).strict().safeParse(socket.handshake.auth ?? {});
    if (!parsed.success) return next(new Error('Session authorization failed'));
    try {
      sessionManager.getSession(parsed.data.sessionId);
      socket.data.sessionId = parsed.data.sessionId;
      socket.data.role = 'guest';
      return next();
    } catch {
      return next(new Error('Session authorization failed'));
    }
  });

  const publishTeacherParticipants = (sessionId) => {
    const snapshot = sessionManager.getTeacherSnapshot(sessionId);
    io.to(teacherRoom(sessionId)).emit('session:participant-count', { count: snapshot.participantCount });
    io.to(teacherRoom(sessionId)).emit('session:participant-list', { participants: snapshot.participants });
  };

  const publishSessionSnapshot = (sessionId) => {
    io.to(studentRoom(sessionId)).emit('session:snapshot', sessionManager.getPublicSnapshot(sessionId));
    io.to(teacherRoom(sessionId)).emit('session:snapshot', sessionManager.getTeacherSnapshot(sessionId));
  };

  const publishWallSnapshot = (sessionId, addedMessageId = null) => {
    const publicSnapshot = wallService.getPublicSnapshot(sessionId);
    io.to(studentRoom(sessionId)).emit('wall:snapshot', publicSnapshot);
    io.to(teacherRoom(sessionId)).emit('wall:snapshot', publicSnapshot);
    if (addedMessageId) {
      const addedMessage = publicSnapshot.messages.find((message) => message.id === addedMessageId);
      if (addedMessage) {
        io.to(studentRoom(sessionId)).emit('wall:message-added', addedMessage);
        io.to(teacherRoom(sessionId)).emit('wall:message-added', addedMessage);
        publishRemixState(sessionId);
      }
    }
    io.to(teacherRoom(sessionId)).emit('wall:moderation-queue', wallService.getTeacherSnapshot(sessionId));
  };

  const publishQuizState = (sessionId) => {
    const state = quizService.getState(sessionId);
    io.to(studentRoom(sessionId)).emit('quiz:state', state);
    io.to(teacherRoom(sessionId)).emit('quiz:state', state);
    io.to(teacherRoom(sessionId)).emit('quiz:submission-status', quizService.getTeacherSubmissionStatus(sessionId));
    if (state.revealed) {
      io.to(studentRoom(sessionId)).emit('quiz:reveal', quizService.getRevealData(sessionId));
      io.to(teacherRoom(sessionId)).emit('quiz:reveal', quizService.getRevealData(sessionId));
      const session = sessionManager.getSession(sessionId);
      for (const participantId of session.participants.keys()) {
        io.to(participantRoom(participantId)).emit('quiz:answer-statuses', quizService.getStudentSnapshot(sessionId, participantId));
      }
    }
  };

  const publishRemixState = (sessionId) => {
    io.to(studentRoom(sessionId)).emit('remix:snapshot', remixService.getSnapshot(sessionId));
    io.to(teacherRoom(sessionId)).emit('remix:snapshot', remixService.getSnapshot(sessionId, { teacher: true }));
  };

  const publishAssessmentState = (sessionId) => {
    io.to(teacherRoom(sessionId)).emit('assessment:snapshot', assessmentService.getTeacherSnapshot(sessionId));
    const session = sessionManager.getSession(sessionId);
    if (session.assessment.published) {
      const leaderboard = publicLeaderboard(sessionId);
      io.to(studentRoom(sessionId)).emit('results:leaderboard', leaderboard);
      for (const participantId of session.participants.keys()) {
        io.to(participantRoom(participantId)).emit('results:own', assessmentService.getStudentPublication(sessionId, participantId));
      }
    }
  };

  const publicLeaderboard = (sessionId) => assessmentService.getLeaderboard(sessionId).map(({ displayNumber, displayName, quizScore, messageRemix, academicTransfer, finalScore, rank }) => ({ displayNumber, displayName, quizScore, messageRemix, academicTransfer, finalScore, rank }));

  const publishParticipantConnection = (sessionId, participant, isConnected) => {
    io.to(teacherRoom(sessionId)).emit('session:participant-connection', {
      participantId: participant.id,
      displayNumber: participant.displayNumber,
      isConnected,
      lastSeenAt: participant.lastSeenAt,
    });
    publishTeacherParticipants(sessionId);
  };

  io.on('connection', (socket) => {
    socket.emit('connection:ready');

    socket.on('session:join', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'guest') throw new SessionError('NOT_AUTHORIZED', 403);
        const input = parseSocketPayload(joinBodySchema, payload);
        if (input.sessionId !== socket.data.sessionId) throw new SessionError('SESSION_NOT_FOUND', 404);
        const joined = sessionManager.joinParticipant(input);
        const attached = sessionManager.attachParticipantSocket(input.sessionId, joined.participant.id, socket.id);
        socket.data.role = 'student';
        socket.data.participantId = joined.participant.id;
        socket.data.joinRequestId = input.requestId;
        socket.data.reconnectToken = joined.reconnectToken;
        socket.join(studentRoom(input.sessionId));
        socket.join(participantRoom(joined.participant.id));
        sendAck(acknowledgement, {
          ok: true,
          participant: attached.participant,
          reconnectToken: joined.reconnectToken,
          session: sessionManager.getPublicSnapshot(input.sessionId),
          wall: wallService.getPublicSnapshot(input.sessionId),
          wallStatuses: wallService.getParticipantStatuses(input.sessionId, joined.participant.id),
          quiz: quizService.getStudentSnapshot(input.sessionId, joined.participant.id),
          remix: remixService.getSnapshot(input.sessionId, { participantId: joined.participant.id }),
          assessment: assessmentService.getStudentPublication(input.sessionId, joined.participant.id),
          leaderboard: sessionManager.getSession(input.sessionId).assessment.published ? publicLeaderboard(input.sessionId) : null,
        });
        if (joined.created) io.to(teacherRoom(input.sessionId)).emit('session:participant-joined', attached.participant);
        if (attached.connectionChanged) publishParticipantConnection(input.sessionId, attached.participant, true);
        else if (joined.created) publishTeacherParticipants(input.sessionId);
        if (joined.created) io.to(teacherRoom(input.sessionId)).emit('quiz:submission-status', quizService.getTeacherSubmissionStatus(input.sessionId));
        if (joined.created) publishRemixState(input.sessionId);
        publishSessionSnapshot(input.sessionId);
        socket.emit('wall:snapshot', wallService.getPublicSnapshot(input.sessionId));
        socket.emit('wall:submission-statuses', wallService.getParticipantStatuses(input.sessionId, joined.participant.id));
        socket.emit('quiz:state', quizService.getState(input.sessionId));
        socket.emit('quiz:answer-statuses', quizService.getStudentSnapshot(input.sessionId, joined.participant.id));
        if (quizService.getState(input.sessionId).revealed) socket.emit('quiz:reveal', quizService.getRevealData(input.sessionId));
        socket.emit('remix:snapshot', remixService.getSnapshot(input.sessionId, { participantId: joined.participant.id }));
        if (sessionManager.getSession(input.sessionId).assessment.published) {
          socket.emit('results:own', assessmentService.getStudentPublication(input.sessionId, joined.participant.id));
          socket.emit('results:leaderboard', publicLeaderboard(input.sessionId));
        }
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('session:resume', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'guest' && socket.data.role !== 'student') {
          throw new SessionError('NOT_AUTHORIZED', 403);
        }
        const input = parseSocketPayload(resumeBodySchema, payload);
        if (input.sessionId !== socket.data.sessionId) throw new SessionError('SESSION_NOT_FOUND', 404);
        const participant = sessionManager.resumeParticipant(input.sessionId, input.reconnectToken);
        if (socket.data.role === 'student' && socket.data.participantId !== participant.id) {
          throw new SessionError('NOT_AUTHORIZED', 403);
        }
        const attached = sessionManager.attachParticipantSocket(input.sessionId, participant.id, socket.id);
        socket.data.role = 'student';
        socket.data.participantId = participant.id;
        socket.data.reconnectToken = input.reconnectToken;
        socket.join(studentRoom(input.sessionId));
        socket.join(participantRoom(participant.id));
        sendAck(acknowledgement, {
          ok: true,
          participant: attached.participant,
          session: sessionManager.getPublicSnapshot(input.sessionId),
          wall: wallService.getPublicSnapshot(input.sessionId),
          wallStatuses: wallService.getParticipantStatuses(input.sessionId, participant.id),
          quiz: quizService.getStudentSnapshot(input.sessionId, participant.id),
          remix: remixService.getSnapshot(input.sessionId, { participantId: participant.id }),
          assessment: assessmentService.getStudentPublication(input.sessionId, participant.id),
          leaderboard: sessionManager.getSession(input.sessionId).assessment.published ? publicLeaderboard(input.sessionId) : null,
        });
        socket.emit('session:participant-identity', attached.participant);
        if (attached.connectionChanged) publishParticipantConnection(input.sessionId, attached.participant, true);
        publishSessionSnapshot(input.sessionId);
        socket.emit('wall:snapshot', wallService.getPublicSnapshot(input.sessionId));
        socket.emit('wall:submission-statuses', wallService.getParticipantStatuses(input.sessionId, participant.id));
        socket.emit('quiz:state', quizService.getState(input.sessionId));
        socket.emit('quiz:answer-statuses', quizService.getStudentSnapshot(input.sessionId, participant.id));
        if (quizService.getState(input.sessionId).revealed) socket.emit('quiz:reveal', quizService.getRevealData(input.sessionId));
        socket.emit('remix:snapshot', remixService.getSnapshot(input.sessionId, { participantId: participant.id }));
        if (sessionManager.getSession(input.sessionId).assessment.published) {
          socket.emit('results:own', assessmentService.getStudentPublication(input.sessionId, participant.id));
          socket.emit('results:leaderboard', publicLeaderboard(input.sessionId));
        }
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('session:teacher-attach', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'guest' && socket.data.role !== 'teacher') {
          throw new SessionError('NOT_AUTHORIZED', 403);
        }
        const input = parseSocketPayload(teacherAttachSchema, payload);
        sessionManager.authenticateTeacherToken(socket.data.sessionId, input.teacherToken);
        socket.data.role = 'teacher';
        socket.join(teacherRoom(socket.data.sessionId));
        const snapshot = sessionManager.getTeacherSnapshot(socket.data.sessionId);
        sendAck(acknowledgement, {
          ok: true,
          snapshot,
          wall: wallService.getPublicSnapshot(socket.data.sessionId),
          wallModeration: wallService.getTeacherSnapshot(socket.data.sessionId),
          quiz: quizService.getState(socket.data.sessionId),
          quizSubmissionStatus: quizService.getTeacherSubmissionStatus(socket.data.sessionId),
          quizReveal: quizService.getRevealData(socket.data.sessionId),
          remix: remixService.getSnapshot(socket.data.sessionId, { teacher: true }),
          assessment: assessmentService.getTeacherSnapshot(socket.data.sessionId),
        });
        socket.emit('session:snapshot', snapshot);
        publishTeacherParticipants(socket.data.sessionId);
        socket.emit('wall:snapshot', wallService.getPublicSnapshot(socket.data.sessionId));
        socket.emit('wall:moderation-queue', wallService.getTeacherSnapshot(socket.data.sessionId));
        socket.emit('quiz:state', quizService.getState(socket.data.sessionId));
        socket.emit('quiz:submission-status', quizService.getTeacherSubmissionStatus(socket.data.sessionId));
        if (quizService.getState(socket.data.sessionId).revealed) socket.emit('quiz:reveal', quizService.getRevealData(socket.data.sessionId));
        socket.emit('remix:snapshot', remixService.getSnapshot(socket.data.sessionId, { teacher: true }));
        socket.emit('assessment:snapshot', assessmentService.getTeacherSnapshot(socket.data.sessionId));
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('session:start', (_payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        emptyBodySchema.parse(_payload ?? {});
        const snapshot = sessionManager.startWorkshop(socket.data.sessionId);
        sendAck(acknowledgement, { ok: true, snapshot });
        publishSessionSnapshot(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('session:student-start', (_payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'student') throw new SessionError('NOT_AUTHORIZED', 403);
        emptyBodySchema.parse(_payload ?? {});
        const snapshot = sessionManager.startLearning(socket.data.sessionId);
        sendAck(acknowledgement, { ok: true, snapshot, wall: wallService.getPublicSnapshot(socket.data.sessionId) });
        publishSessionSnapshot(socket.data.sessionId);
        publishWallSnapshot(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('wall:submit', (payload, acknowledgement) => {
      try {
        const input = parseSocketPayload(wallSubmitSchema, payload);
        if (socket.data.role === 'student') {
          const result = wallService.submitStudent(socket.data.sessionId, socket.data.participantId, input);
          sendAck(acknowledgement, {
            ok: true,
            message: { id: result.message.id, status: result.message.status, accepted: result.message.accepted },
          });
          io.to(participantRoom(socket.data.participantId)).emit('wall:submission-status', {
            id: result.message.id,
            status: result.message.status,
            accepted: result.message.accepted,
          });
          publishWallSnapshot(socket.data.sessionId, result.created ? result.message.id : null);
          return;
        }
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const result = wallService.submitTeacher(socket.data.sessionId, input);
        sendAck(acknowledgement, { ok: true, message: result.message });
        publishWallSnapshot(socket.data.sessionId, result.created ? result.message.id : null);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('wall:submission-state', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const { open } = parseSocketPayload(joiningSchema, payload);
        const snapshot = wallService.setSubmissionsOpen(socket.data.sessionId, open);
        sendAck(acknowledgement, { ok: true, snapshot });
        publishWallSnapshot(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('wall:delete', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const { messageId } = parseSocketPayload(wallDeleteSchema, payload);
        const message = wallService.deleteMessage(socket.data.sessionId, messageId);
        remixService.clearDeletedSource(socket.data.sessionId, messageId);
        sendAck(acknowledgement, { ok: true, message });
        io.to(participantRoom(sessionManager.getSession(socket.data.sessionId).wall.messages.get(messageId).authorParticipantId))
          .emit('wall:submission-status', { id: message.id, status: message.status, accepted: message.accepted });
        publishWallSnapshot(socket.data.sessionId);
        publishRemixState(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('wall:identify-author', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const { messageId } = parseSocketPayload(wallIdentifySchema, payload);
        const author = wallService.identifyAuthor(socket.data.sessionId, messageId);
        sendAck(acknowledgement, { ok: true, author });
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('remix:source-select', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const { messageId } = parseSocketPayload(remixSourceSchema, payload);
        const source = remixService.selectSource(socket.data.sessionId, messageId);
        sendAck(acknowledgement, { ok: true, source });
        publishRemixState(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('remix:gate', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const { exercise, open } = parseSocketPayload(remixGateSchema, payload);
        const snapshot = remixService.setGate(socket.data.sessionId, exercise, open);
        sendAck(acknowledgement, { ok: true, snapshot });
        publishRemixState(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('remix:submit', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'student') throw new SessionError('NOT_AUTHORIZED', 403);
        const input = parseSocketPayload(remixSubmitSchema, payload);
        const result = remixService.submit(socket.data.sessionId, socket.data.participantId, input);
        sendAck(acknowledgement, { ok: true, ...result });
        io.to(participantRoom(socket.data.participantId)).emit('remix:snapshot', remixService.getSnapshot(socket.data.sessionId, { participantId: socket.data.participantId }));
        io.to(teacherRoom(socket.data.sessionId)).emit('remix:snapshot', remixService.getSnapshot(socket.data.sessionId, { teacher: true }));
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('assessment:evaluate', (_payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        emptyBodySchema.parse(_payload ?? {});
        const sessionId = socket.data.sessionId;
        const started = assessmentService.evaluateAll(sessionId, () => publishAssessmentState(sessionId));
        sendAck(acknowledgement, { ok: true, accepted: true });
        void started.then(() => publishAssessmentState(sessionId)).catch((error) => {
          io.to(teacherRoom(sessionId)).emit('assessment:error', { error: safeErrorCode(error) });
        });
      } catch (error) { sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) }); }
    });

    socket.on('assessment:correct', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const input = parseSocketPayload(assessmentCorrectionSchema, payload);
        const snapshot = assessmentService.correct(socket.data.sessionId, input.participantId, input.exercise, input.criteria);
        sendAck(acknowledgement, { ok: true, snapshot });
        publishAssessmentState(socket.data.sessionId);
      } catch (error) { sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) }); }
    });

    socket.on('results:publish', (_payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        emptyBodySchema.parse(_payload ?? {});
        const snapshot = assessmentService.publish(socket.data.sessionId);
        sendAck(acknowledgement, { ok: true, snapshot });
        publishAssessmentState(socket.data.sessionId);
      } catch (error) { sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) }); }
    });

    socket.on('quiz:submit', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'student') throw new SessionError('NOT_AUTHORIZED', 403);
        const input = parseSocketPayload(quizSubmitSchema, payload);
        const result = quizService.submitAnswer(socket.data.sessionId, socket.data.participantId, input);
        sendAck(acknowledgement, { ok: true, answer: result.answer, duplicate: result.duplicate });
        io.to(participantRoom(socket.data.participantId)).emit('quiz:answer-status', result.answer);
        io.to(teacherRoom(socket.data.sessionId)).emit('quiz:submission-status', quizService.getTeacherSubmissionStatus(socket.data.sessionId));
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('quiz:state', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const input = parseSocketPayload(quizStateSchema, payload);
        const state = quizService.setState(socket.data.sessionId, input);
        sendAck(acknowledgement, {
          ok: true,
          state,
          submissionStatus: quizService.getTeacherSubmissionStatus(socket.data.sessionId),
          reveal: state.revealed ? quizService.getRevealData(socket.data.sessionId) : null,
        });
        publishQuizState(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('session:joining-set', (payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        const { open } = parseSocketPayload(joiningSchema, payload);
        const snapshot = sessionManager.setJoiningOpen(socket.data.sessionId, open);
        sendAck(acknowledgement, { ok: true, snapshot });
        publishSessionSnapshot(socket.data.sessionId);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('session:end', (_payload, acknowledgement) => {
      try {
        if (socket.data.role !== 'teacher') throw new SessionError('NOT_AUTHORIZED', 403);
        emptyBodySchema.parse(_payload ?? {});
        const snapshot = sessionManager.endSession(socket.data.sessionId);
        sendAck(acknowledgement, { ok: true, snapshot });
        io.to(studentRoom(snapshot.sessionId)).emit('session:ended');
        io.to(teacherRoom(snapshot.sessionId)).emit('session:ended');
        io.in(studentRoom(snapshot.sessionId)).disconnectSockets(true);
        io.in(teacherRoom(snapshot.sessionId)).except(socket.id).disconnectSockets(true);
      } catch (error) {
        sendAck(acknowledgement, { ok: false, error: safeErrorCode(error) });
      }
    });

    socket.on('disconnect', () => {
      if (socket.data.role !== 'student') return;
      const result = sessionManager.detachParticipantSocket(
        socket.data.sessionId,
        socket.data.participantId,
        socket.id,
      );
      if (result?.connectionChanged) {
        publishParticipantConnection(socket.data.sessionId, result.participant, false);
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(frontendDist));
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
      return response.sendFile(resolve(frontendDist, 'index.html'));
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SessionError) {
      return response.status(error.status).json({ error: error.code });
    }
    if (error instanceof z.ZodError) {
      return response.status(400).json({ error: 'INVALID_REQUEST' });
    }
    if (error?.type === 'entity.parse.failed') {
      return response.status(400).json({ error: 'INVALID_JSON' });
    }
    console.error('Request failed');
    return response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  });

  return { app, httpServer, io, sessionManager, wallService, remixService, quizService, assessmentService };
}

export function startServer() {
  const { httpServer } = createApplication();
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  httpServer.listen(port, host, () => {
    console.log(`Words Connect server listening on port ${port}`);
  });
  return httpServer;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer();
}
