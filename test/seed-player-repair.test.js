import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ensureSeed repara player ausente mesmo quando o seed já está marcado', async () => {
  const source = await readFile(new URL('../app/js/core/seed.js', import.meta.url), 'utf8');

  assert.match(source, /const players = await getAll\(STORES\.player\)/);
  assert.match(source, /if \(players\[0\]\) return players\[0\]/);
  assert.match(source, /const player = defaultPlayer\(\)/);
  assert.match(source, /await put\(STORES\.player, player\)/);
});
