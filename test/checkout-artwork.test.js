import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CONTEST_CATALOG } from '../app/js/contest/contestCatalog.js';
import { CHECKOUT_ARTWORK } from '../app/js/contest/checkoutArtwork.js';
test('each course requires exclusive checkout artwork', async () => {
  const hashes = new Set();
  for (const course of CONTEST_CATALOG) {
    const asset = CHECKOUT_ARTWORK[course.id];
    assert.ok(asset, 'Missing exclusive art: ' + course.id);
    const bytes = await readFile(new URL('../app/' + asset, import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.ok(!hashes.has(hash), 'Repeated art: ' + course.id);
    hashes.add(hash);
  }
});
