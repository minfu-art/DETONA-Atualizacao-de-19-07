#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extractionRoot = path.join(repo, 'course-drafts', 'pc-pe-2027-agente', 'material-question-extraction');
const batchRoot = path.join(extractionRoot, 'publication-ready-batches');
const appData = path.join(repo, 'app', 'data', 'course-factory');
const output = path.join(appData, 'published', 'pc-pe-2026-agente-patch-002.json');
const version = '2026.09.03.2';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/gu, ' ')
  .trim();

const base = readJson(path.join(appData, 'pc-pe-2026-agente-runtime.json'));
const patch001 = readJson(path.join(appData, 'published', 'pc-pe-2026-agente-patch-001.json'));
const existing = [...(base.questions || []), ...(patch001.questions || [])];
const existingStatements = new Set(existing.map((question) => normalize(question.statement)));
const validSubtopics = new Set((base.curriculum || [])
  .filter((node) => node.type === 'subtopic')
  .map((node) => node.source_id || node.id));

const sourceQuestions = fs.readdirSync(batchRoot)
  .filter((name) => name.endsWith('-pcpe-material-comentado.json'))
  .sort()
  .flatMap((name) => readJson(path.join(batchRoot, name)).questions || [])
  .sort((a, b) => a.id.localeCompare(b.id));

const questions = [];
const skippedExisting = [];
const seen = new Set();
for (const source of sourceQuestions) {
  if (source.metadata?.technical_ready !== true) throw new Error(`${source.id}: lote contém questão não aprovada`);
  const statementKey = normalize(source.statement);
  if (!statementKey) throw new Error(`${source.id}: enunciado vazio`);
  if (existingStatements.has(statementKey) || seen.has(statementKey)) {
    skippedExisting.push(source.id);
    continue;
  }
  const subtopicId = String(source.subtopic_id || '').replaceAll('pc_pe_2027', 'pc_pe_2026');
  if (!validSubtopics.has(subtopicId)) throw new Error(`${source.id}: subtópico publicado inexistente`);
  const isCertainty = source.format === 'certo_errado';
  const answer = isCertainty
    ? (source.correct_answer === true ? 'C' : 'E')
    : String(source.correct_answer || '').toUpperCase();
  const options = isCertainty ? [] : source.options.map((option, index) => {
    const label = String.fromCharCode(65 + index);
    const text = String(option || '').replace(/^[A-E](?:\)|\.|\s|-|:)\s*/iu, '').trim();
    return `${label}) ${text}`;
  });
  if (!isCertainty && (!Array.isArray(options) || options.length < 2 || !/^[A-E]$/u.test(answer))) {
    throw new Error(`${source.id}: múltipla escolha inválida`);
  }
  questions.push({
    id: source.id.replace('pc_pe_2027', 'pc_pe_2026'),
    subtopic_id: subtopicId,
    microknowledge_ids: [],
    statement: source.statement,
    options,
    correct_answer: answer,
    explanation: source.explanation,
    difficulty: 'media',
    format: source.format,
    source: source.source || 'Material autorizado pelo usuário',
    is_trick: false,
    reference_text: source.reference_text || '',
    reference_image: source.reference_image || '',
    metadata: {
      source_file_id: source.metadata?.source_file_id || null,
      source_question_number: source.metadata?.source_question_number || null,
      source_pages: source.metadata?.source_pages || [],
      personal_identifiers_sanitized: source.metadata?.personal_identifiers_sanitized === true,
      technical_ready: true,
      publication_batch: 'pcpe-material-comentado-002',
    },
  });
  seen.add(statementKey);
}

const ids = new Set(questions.map((question) => question.id));
if (ids.size !== questions.length) throw new Error('IDs duplicados no patch');
const payload = {
  name: 'pcpe-material-comentado-002',
  version,
  contest_id: 'pc_pe_2026',
  publication_status: 'published',
  questions,
};
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
const contentHash = crypto.createHash('sha256').update(serialized).digest('hex');
const result = {
  source_ready: sourceQuestions.length,
  skipped_existing: skippedExisting.length,
  published_new: questions.length,
  final_question_count: existing.length + questions.length,
  content_hash: contentHash,
  skipped_existing_ids: skippedExisting,
};

if (process.argv.includes('--write')) {
  fs.writeFileSync(output, serialized);
  console.log(JSON.stringify({ ...result, output }, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
}
