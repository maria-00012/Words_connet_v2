import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultsCsv } from '../src/utils/resultsCsv.js';

test('CSV includes published score, criterion, feedback, source, response, and ranking data', () => {
  const csv = createResultsCsv({
    leaderboard: [{ participantId: 'p1', displayNumber: 7, displayName: 'Amina', rank: 1, quizScore: 2, messageRemix: 8, academicTransfer: 9, finalScore: 82.5 }],
    results: [
      { participantId: 'p1', exercise: 'message-remix', total: 8, criteria: { meaningPreservation: 4, vocabularyVariation: 1, sentenceRestructuring: 1, completenessAndTone: 2 }, feedback: 'Good work.', sourceText: 'Source text', responseText: 'Student response' },
      { participantId: 'p1', exercise: 'academic-transfer', total: 9, criteria: { meaningPreservation: 4, vocabularyVariation: 1, sentenceRestructuring: 2, completenessAndTone: 2 }, feedback: 'Academic tone is suitable.', sourceText: 'Academic source', responseText: 'Academic response' },
    ],
  });

  assert.match(csv, /"Participant number","Student name","Rank","Pit Stop score"/);
  assert.match(csv, /"7","Amina","1","2"/);
  assert.match(csv, /"Message Remix score","Message Remix · Meaning preservation"/);
  assert.match(csv, /"Good work\."/);
  assert.match(csv, /"Academic source","Academic response"/);
  assert.match(csv, /"82\.5"/);
});

test('CSV quotes cells and neutralizes spreadsheet formulas in student supplied fields', () => {
  const csv = createResultsCsv({
    leaderboard: [{ participantId: 'p1', displayNumber: 1, displayName: '=HYPERLINK("https://bad")', rank: 1, quizScore: 0, finalScore: 0 }],
    results: [{ participantId: 'p1', exercise: 'message-remix', total: 0, criteria: {}, feedback: '+CMD|x', sourceText: '@SUM(1,1)', responseText: '  =2+2' }],
  });

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad""\)"/);
  assert.match(csv, /"'\+CMD\|x"/);
  assert.match(csv, /"'@SUM\(1,1\)"/);
  assert.match(csv, /"'  =2\+2"/);
});
