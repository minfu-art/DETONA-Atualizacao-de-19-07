import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const cssDirectory = new URL('../app/css/', import.meta.url);

test('folhas de estilo não permitem quebra de palavras letra por letra', async () => {
  const files = (await readdir(cssDirectory)).filter((name) => name.endsWith('.css'));
  const violations = [];

  for (const file of files) {
    const css = await readFile(new URL(file, cssDirectory), 'utf8');
    if (/word-break\s*:\s*break-all/i.test(css)) violations.push(`${file}: word-break: break-all`);
    if (/overflow-wrap\s*:\s*anywhere/i.test(css)) violations.push(`${file}: overflow-wrap: anywhere`);
  }

  assert.deepEqual(violations, []);
});
