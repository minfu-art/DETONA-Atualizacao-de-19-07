import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeSensitiveText } from '../js/core/questionSchema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['js/data/questions_pc_al_port.json', 'js/data/questions_pc_al_lote.json'];

function sanitizeValue(value, state) {
  if (typeof value === 'string') {
    const result = sanitizeSensitiveText(value);
    if (result.changed) state.changed = true;
    return result.value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, state));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, state)]));
  }
  return value;
}

let sanitizedQuestions = 0;
for (const relative of files) {
  const filename = path.join(root, relative);
  const questions = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const sanitized = questions.map((question) => {
    const state = { changed: false };
    const next = sanitizeValue(question, state);
    if (state.changed) {
      sanitizedQuestions += 1;
      next.metadata = { ...(next.metadata || {}), sanitizedSource: true };
    }
    return next;
  });
  fs.writeFileSync(filename, JSON.stringify(sanitized), 'utf8');
}

console.log(JSON.stringify({ sanitizedQuestions, files: files.length }));
