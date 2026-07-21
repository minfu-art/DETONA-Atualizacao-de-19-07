import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoQuestions, buildSeedEntities } from '../js/data/editalSeed.js';
import { normalizeQuestionCollection } from '../js/core/questionImport.js';
import { analyzeQuestionCollection, isDemoQuestion, isQuestionEligible } from '../js/core/questionSchema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { subtopics } = buildSeedEntities();
const imported = ['questions_pc_al_port.json', 'questions_pc_al_lote.json']
  .flatMap((file) => JSON.parse(fs.readFileSync(path.join(root, 'js/data', file), 'utf8')));
// Banco real: apenas importadas — sem questões DEMO no total utilizável
const raw = [...imported];
const normalized = normalizeQuestionCollection(raw, subtopics);
const report = analyzeQuestionCollection(normalized.questions);
const demos = buildDemoQuestions(subtopics);

test('banco real não inclui questões DEMO no seed de contagem', () => {
  assert.equal(normalized.errors.length, 0);
  assert.equal(normalized.questions.length, 842);
  assert.deepEqual(report.duplicateIds, []);
  assert.equal(report.invalidOptions, 0);
  assert.equal(report.missingTopic, 0);
  assert.ok(normalized.questions.every((q) => !isDemoQuestion(q)));
});

test('buildDemoQuestions gera só itens marcados como demo e inelegíveis', () => {
  assert.equal(demos.length, 320);
  assert.ok(demos.every((q) => isDemoQuestion(q)));
  const asNormalized = normalizeQuestionCollection(demos, subtopics).questions;
  assert.ok(asNormalized.every((q) => isDemoQuestion(q)));
  assert.ok(asNormalized.every((q) => !isQuestionEligible(q)));
});

test('duplicidades e gabaritos incompatíveis ficam em revisão', () => {
  assert.equal(report.duplicateStatements, 2);
  assert.equal(report.invalidAnswers, 2);
  assert.equal(report.review, 6);
  const invalid = normalized.questions.filter((question) =>
    question.correct_answer == null
    || (question.format === 'multipla_escolha' && !question.options.some((option) => String(option).startsWith(`${question.correct_answer})`))));
  assert.ok(invalid.every((question) => question.situacao === 'revisao'));
});

test('normalização remove identificador pessoal da versão utilizável', () => {
  const serialized = JSON.stringify(normalized.questions);
  assert.doesNotMatch(serialized, /09880248457|thallysson\s+gabriel/i);
  assert.equal(report.sanitizedSources, 318);
});
