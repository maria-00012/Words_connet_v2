import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_TRANSFER_SOURCE, REMIX_FALLBACK_SOURCE } from '../src/data/remixSources.js';

test('Remix Studio uses the exact fixed fallback and Academic Transfer sentences', () => {
  assert.equal(REMIX_FALLBACK_SOURCE, 'Your kindness makes our class a more welcoming place, and your positive attitude encourages everyone.');
  assert.equal(ACADEMIC_TRANSFER_SOURCE, "Regular participation in extracurricular activities can improve university students' social skills and contribute to their personal development.");
});
