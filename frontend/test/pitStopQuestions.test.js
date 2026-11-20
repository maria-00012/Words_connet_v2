import test from 'node:test';
import assert from 'node:assert/strict';
import { pitStopMission, pitStopQuestions } from '../src/data/pitStopQuestions.js';
import { previewPitStopReveal } from '../src/data/pitStopPreviewReveal.js';

test('Pit Stop contains the exact mission and three fixed questions/options', () => {
  assert.equal(pitStopMission, 'Participation in university clubs enables first-year students to develop communication skills and establish social connections.');
  assert.deepEqual(pitStopQuestions, [
    {
      id: 'meaning-keeper',
      title: 'Question 1 — The Meaning Keeper',
      prompt: 'Which option keeps the original meaning?',
      options: {
        A: 'University clubs guarantee that first-year students will achieve academic success and become popular.',
        B: 'Through involvement in campus clubs, newcomers can strengthen their communication abilities and build relationships with others.',
        C: 'First-year students join clubs mainly to improve their grades and compete with classmates.',
      },
    },
    {
      id: 'synonym-trap',
      title: 'Question 2 — The Synonym Trap',
      prompt: 'Which version relies mainly on word replacement and keeps almost the same structure?',
      options: {
        A: 'Participation in university clubs allows first-year students to improve communication skills and establish social relationships.',
        B: 'Campus clubs offer newcomers opportunities to connect with peers while developing their communication abilities.',
        C: 'When first-year students take part in clubs, they can develop stronger communication skills and social networks.',
      },
    },
    {
      id: 'structure-switch',
      title: 'Question 3 — The Structure Switch',
      prompt: 'Which option changes the grammatical structure while preserving the idea?',
      options: {
        A: 'Participation in campus clubs enables new students to develop communication skills and establish social connections.',
        B: 'First-year students become successful because university clubs guarantee better grades.',
        C: 'By getting involved in campus clubs, first-year students can strengthen how they communicate and form connections with others.',
      },
    },
  ]);
});

test('answer key and explanations match the fixed reveal content', () => {
  assert.deepEqual(previewPitStopReveal, [
    { questionId: 'meaning-keeper', correctOption: 'B', explanation: 'Meaning secured! Both communication skills and social connections remain.' },
    { questionId: 'synonym-trap', correctOption: 'A', explanation: "Trap spotted! Only words changed ('enables' → 'allows', 'develop' → 'improve'); the sentence pattern is the same." },
    { questionId: 'structure-switch', correctOption: 'C', explanation: "Excellent transformation! The 'By getting involved...' opening changes the structure while keeping both ideas." },
  ]);
});
