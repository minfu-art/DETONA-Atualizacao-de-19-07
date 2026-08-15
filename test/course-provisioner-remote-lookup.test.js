import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('busca administrativa encontra o identificador canônico do concurso', () => {
  const edgeSource = readFileSync(new URL('../supabase/functions/admin-contests/index.ts', import.meta.url), 'utf8');
  assert.match(edgeSource, /id\.ilike\.%\$\{body\.search\}%/);
});
