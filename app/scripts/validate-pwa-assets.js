import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const swPath = join(appRoot, 'sw.js');
const source = readFileSync(swPath, 'utf8');
const listMatch = source.match(/const ASSETS = \[([\s\S]*?)\n\];/);

if (!listMatch) {
  console.error('PWA inválida: não foi possível localizar a lista ASSETS em sw.js.');
  process.exitCode = 1;
} else {
  const assets = [...listMatch[1].matchAll(/['"]\.\/([^'"]+)['"]/g)]
    .map((match) => match[1].split('?')[0]);
  const missing = assets.filter((asset) => !existsSync(normalize(join(appRoot, asset))));

  if (!assets.length) {
    console.error('PWA inválida: a lista de pré-cache está vazia.');
    process.exitCode = 1;
  } else if (missing.length) {
    console.error(`PWA inválida: ${missing.length} asset(s) obrigatório(s) ausente(s):`);
    for (const asset of missing) console.error(`- ${asset}`);
    process.exitCode = 1;
  } else {
    console.log(`PWA válida: ${assets.length} assets obrigatórios existem.`);
  }
}
