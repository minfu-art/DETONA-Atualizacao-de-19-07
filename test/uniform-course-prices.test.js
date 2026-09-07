import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEST_CATALOG } from '../app/js/contest/contestCatalog.js';
test('all catalog courses cost BRL 24.90', () => {
  for (const course of CONTEST_CATALOG) {
    assert.equal(course.priceCents, 2490, course.id);
    assert.equal(course.currency, 'BRL', course.id);
  }
});
