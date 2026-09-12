import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionDir = path.join(repoRoot, 'course-drafts', 'prf-pre-edital', 'production');
const bundleDir = path.join(repoRoot, 'course-drafts', 'prf-pre-edital', 'course-bundle');
const questionsDir = path.join(bundleDir, 'questions');

const filenames = (await readdir(productionDir))
  .map((filename) => {
    const match = filename.match(/^portuguese-editorial-batch-(\d+)\.v1\.json$/);
    return match ? { filename, number: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .sort((left, right) => left.number - right.number);

const expectedNumbers = Array.from({ length: 38 }, (_, index) => index + 1);
if (JSON.stringify(filenames.map(({ number }) => number)) !== JSON.stringify(expectedNumbers)) {
  throw new Error('A sequência editorial PRF deve conter exatamente os lotes 1 a 38.');
}

await mkdir(questionsDir, { recursive: true });

const ids = new Set();
let questionCount = 0;
const distribution = { C: 0, E: 0 };

for (const { filename, number } of filenames) {
  const source = JSON.parse(await readFile(path.join(productionDir, filename), 'utf8'));
  const questions = source.question_batches?.[0]?.questions;
  if (!Array.isArray(questions) || questions.length !== 20) {
    throw new Error(`${filename} deve conter exatamente 20 questões.`);
  }

  for (const question of questions) {
    if (!question.id || ids.has(question.id)) throw new Error(`ID de questão ausente ou duplicado: ${question.id || '(vazio)'}.`);
    if (!['C', 'E'].includes(question.correct_answer)) throw new Error(`Gabarito inválido em ${question.id}.`);
    ids.add(question.id);
    distribution[question.correct_answer] += 1;
    questionCount += 1;
  }

  const outputName = `${String(number).padStart(3, '0')}-portugues-editorial-batch-${String(number).padStart(2, '0')}.json`;
  await writeFile(
    path.join(questionsDir, outputName),
    `${JSON.stringify({ questions }, null, 2)}\n`,
    'utf8',
  );
}

if (questionCount !== 760) throw new Error(`Total inesperado de questões: ${questionCount}.`);

process.stdout.write(`${JSON.stringify({
  batches: filenames.length,
  questions: questionCount,
  unique_question_ids: ids.size,
  answer_distribution: distribution,
  output: path.relative(repoRoot, questionsDir),
}, null, 2)}\n`);
