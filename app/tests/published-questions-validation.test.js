import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublishedQuestions } from '../scripts/validatePublishedQuestions.mjs';

test('índice publicado completo é estruturalmente válido', () => {
  const result = validatePublishedQuestions();
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.total, 6480);
  assert.equal(result.files, 12);
  assert.equal(result.inReview, 396);
  assert.equal(result.errors.length, 0);
});
