import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const excluded = new Set(['.git', 'node_modules']);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const target = join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(target);
  }
}

walk(root);
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}\n${result.stderr || result.stdout}`);
}

if (failures.length) {
  console.error(`Falha de sintaxe em ${failures.length} arquivo(s):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Sintaxe válida: ${files.length} arquivos JavaScript/MJS.`);
}
