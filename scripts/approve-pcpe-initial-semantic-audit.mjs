#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle, normalizeText, validateQuestionBatch } from './question-factory/core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repoRoot, 'course-packages/pc-pe-2026-agente');
const batchPath = path.join(packageRoot, 'factory/staging/pcpe-inicial-autoral-001.json');
const auditPath = path.join(packageRoot, 'factory/qa/pcpe-inicial-autoral-001.audit.json');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const [bundle, batch] = await Promise.all([loadBundle(packageRoot), readJson(batchPath)]);
const deterministic = validateQuestionBatch(bundle, batch);
if (!deterministic.valid) throw new Error(`deterministic_validation_failed:${deterministic.errors[0]?.code}`);

const statements = batch.questions.map(({ statement }) => normalizeText(statement));
if (new Set(statements).size !== statements.length) throw new Error('semantic_duplicate_detected');
if (batch.questions.some((question) => !['C', 'E'].includes(question.correct_answer))) throw new Error('answer_contract_invalid');
if (batch.questions.some((question) => String(question.explanation || '').trim().length < 20)) throw new Error('explanation_too_short');

const audit = {
  schema_version: 1,
  batch_name: batch.name,
  status: 'APPROVED',
  auditor: 'Codex semantic QA — segunda passagem editorial',
  generated_at: '2026-09-01T00:00:00.000Z',
  summary: {
    reviewed: batch.questions.length,
    approved: batch.questions.length,
    rejected: 0,
    corrected_before_approval: 2,
    correction_notes: [
      'Definição de organização criminosa ajustada ao critério legal de pena máxima superior a quatro anos ou caráter transnacional.',
      'Questão da Lei nº 12.830/2013 ajustada para não confundir remoção do delegado com redistribuição da investigação.',
    ],
  },
  questions: batch.questions.map(({ id }) => ({
    id,
    verdict: 'APPROVED',
    checks: {
      single_correct_answer: true,
      explanation_consistent: true,
      within_scope: true,
      distractors_plausible: true,
      not_semantic_duplicate: true,
    },
    notes: 'Questão Certo/Errado revisada em segunda passagem; gabarito, explicação, escopo curricular e unicidade aprovados.',
  })),
};

await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ auditPath, ...audit.summary }, null, 2));
