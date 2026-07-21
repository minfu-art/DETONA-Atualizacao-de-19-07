import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ICO } from '../app/js/ui/icons.js';

const names = Object.keys(ICO);
const columns = 5;
const cellWidth = 180;
const cellHeight = 158;
const rows = Math.ceil(names.length / columns);
const width = columns * cellWidth;
const height = rows * cellHeight;

const cards = names.map((name, index) => {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = column * cellWidth;
  const y = row * cellHeight;
  const icon = ICO[name]().replace(
    'width="1em" height="1em"',
    `x="${x + 42}" y="${y + 18}" width="96" height="96"`,
  );
  return `<g><rect x="${x + 8}" y="${y + 8}" width="164" height="142" rx="18" fill="#090b18" stroke="#39265f"/><text x="${x + 90}" y="${y + 132}" text-anchor="middle" fill="#d7c8ff" font-family="Arial, sans-serif" font-size="13">${name}</text>${icon}</g>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#03040b"/><defs><radialGradient id="preview-bg"><stop stop-color="#251245"/><stop offset="1" stop-color="#03040b"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#preview-bg)" opacity=".7"/>${cards}</svg>`;

const target = fileURLToPath(new URL('../docs/ICONES-RPG-PREVIEW.svg', import.meta.url));
await writeFile(target, svg, 'utf8');
console.log(target);
