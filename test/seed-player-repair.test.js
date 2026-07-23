import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ensureSeed preserva player existente e repara o catálogo mesmo quando o seed já está marcado', async () => {
  const source = await readFile(new URL('../app/js/core/seed.js', import.meta.url), 'utf8');

  assert.match(source, /const players = await getAll\(STORES\.player\)/);
  assert.match(source, /if \(!players\[0\]\) await put\(STORES\.player, defaultPlayer\(\)\)/);
  assert.match(source, /await ensureStaticCatalog\(\)/);
  assert.match(source, /missingSeedRows\(disciplines, storedDisciplines\)/);
  assert.doesNotMatch(source, /if \(players\[0\]\) return players\[0\]/);
});
