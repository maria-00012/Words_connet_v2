import { randomUUID } from 'node:crypto';
import { SessionError } from './sessionManager.js';

const QUESTIONS = [
  {
    id: 'meaning-keeper',
    correctOption: 'B',
    explanation: 'Meaning secured! Both communication skills and social connections remain.',
  },
  {
    id: 'synonym-trap',
    correctOption: 'A',
    explanation: "Trap spotted! Only words changed ('enables' → 'allows', 'develop' → 'improve'); the sentence pattern is the same.",
  },
  {
    id: 'structure-switch',
    correctOption: 'C',
    explanation: "Excellent transformation! The 'By getting involved...' opening changes the structure while keeping both ideas.",
  },
];

const QUESTION_IDS = new Set(QUESTIONS.map(({ id }) => id));

function answerKey(participantId, questionId) {
  return `${participantId}:${questionId}`;
}

function publicAnswer(answer) {
  return { id: answer.id, questionId: answer.questionId, option: answer.option, submittedAt: answer.submittedAt };
}

export class QuizService {
  constructor(sessionManager, { now = () => new Date().toISOString() } = {}) {
    this.sessionManager = sessionManager;
    this.now = now;
  }

  getState(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    return { open: session.quiz.open, hasBeenOpened: session.quiz.hasBeenOpened, revealed: session.quiz.revealed };
  }

  getRevealData(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session.quiz.revealed) return null;
    return QUESTIONS.map(({ id, correctOption, explanation }) => ({ questionId: id, correctOption, explanation }));
  }

  getStudentSnapshot(sessionId, participantId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session.participants.has(participantId)) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    const answers = QUESTIONS
      .map(({ id }) => session.quiz.answers.get(answerKey(participantId, id)))
      .filter(Boolean)
      .map(publicAnswer);
    const snapshot = { ...this.getState(sessionId), answers };
    if (session.quiz.revealed) {
      const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.option]));
      snapshot.reveal = this.getRevealData(sessionId);
      snapshot.score = QUESTIONS.reduce((score, question) => score + Number(answerMap.get(question.id) === question.correctOption), 0);
    }
    return snapshot;
  }

  getScore(sessionId, participantId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session.participants.has(participantId)) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    return QUESTIONS.reduce((score, question) => score + Number(
      session.quiz.answers.get(answerKey(participantId, question.id))?.option === question.correctOption,
    ), 0);
  }

  getTeacherSubmissionStatus(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    const participants = [...session.participants.values()]
      .sort((left, right) => left.displayNumber - right.displayNumber)
      .map((participant) => {
        const questionIds = QUESTIONS
          .filter(({ id }) => session.quiz.answers.has(answerKey(participant.id, id)))
          .map(({ id }) => id);
        return {
          participantId: participant.id,
          displayNumber: participant.displayNumber,
          displayName: participant.displayName,
          questionIds,
          submittedCount: questionIds.length,
        };
      });
    const questionCounts = Object.fromEntries(QUESTIONS.map(({ id }) => [
      id,
      participants.filter((participant) => participant.questionIds.includes(id)).length,
    ]));
    return {
      participants,
      participantCount: participants.length,
      submittedParticipants: participants.filter((participant) => participant.submittedCount > 0).length,
      totalAnswers: participants.reduce((total, participant) => total + participant.submittedCount, 0),
      questionCounts,
    };
  }

  setState(sessionId, { open, reveal = false }) {
    const session = this.sessionManager.getSession(sessionId);
    if (session.lifecycle !== 'ACTIVE') throw new SessionError('WORKSHOP_NOT_ACTIVE', 409);
    if (reveal && (open || session.quiz.open)) throw new SessionError('QUIZ_MUST_BE_CLOSED', 409);
    if (reveal && !session.quiz.hasBeenOpened) throw new SessionError('QUIZ_NOT_OPENED', 409);
    if (session.quiz.revealed && open) throw new SessionError('QUIZ_ALREADY_REVEALED', 409);
    if (typeof open === 'boolean') {
      if (reveal && open) throw new SessionError('QUIZ_MUST_BE_CLOSED', 409);
      session.quiz.open = open;
      if (open) session.quiz.hasBeenOpened = true;
    }
    if (reveal) {
      if (session.quiz.open) throw new SessionError('QUIZ_MUST_BE_CLOSED', 409);
      session.quiz.revealed = true;
    }
    return this.getState(sessionId);
  }

  submitAnswer(sessionId, participantId, { questionId, option, idempotencyKey }) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session.participants.has(participantId)) throw new SessionError('PARTICIPANT_NOT_FOUND', 404);
    if (!QUESTION_IDS.has(questionId) || !['A', 'B', 'C'].includes(option)) {
      throw new SessionError('INVALID_QUIZ_ANSWER');
    }

    const requestKey = `${participantId}:${idempotencyKey}`;
    const priorAnswerKey = session.quiz.idempotency.get(requestKey);
    if (priorAnswerKey) {
      const prior = session.quiz.answers.get(priorAnswerKey);
      if (prior.questionId !== questionId) throw new SessionError('IDEMPOTENCY_CONFLICT', 409);
      return { answer: publicAnswer(prior), duplicate: true };
    }

    const answerId = answerKey(participantId, questionId);
    const existing = session.quiz.answers.get(answerId);
    if (existing) {
      session.quiz.idempotency.set(requestKey, answerId);
      return { answer: publicAnswer(existing), duplicate: true };
    }

    if (session.lifecycle !== 'ACTIVE') throw new SessionError('WORKSHOP_NOT_ACTIVE', 409);
    if (!session.quiz.open || session.quiz.revealed) throw new SessionError('QUIZ_CLOSED', 403);

    const answer = { id: randomUUID(), sessionId, participantId, questionId, option, idempotencyKey, submittedAt: this.now() };
    session.quiz.answers.set(answerId, answer);
    session.quiz.idempotency.set(requestKey, answerId);
    return { answer: publicAnswer(answer), duplicate: false };
  }
}
