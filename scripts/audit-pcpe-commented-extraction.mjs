#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repo = path.resolve(process.argv[2] || process.cwd());
const draftRoot = path.join(repo, 'course-drafts', 'pc-pe-2027-agente');
const extractionRoot = path.join(draftRoot, 'material-question-extraction');
const batchRoot = path.join(extractionRoot, 'publication-ready-batches');
const reviewPath = path.join(extractionRoot, 'review', 'needs-review.json');
const curriculumPath = path.join(draftRoot, 'course-bundle', 'curriculum.json');
const assetRoot = path.join(draftRoot, 'course-bundle', 'assets', 'question-references');
const reportPath = path.join(extractionRoot, 'audit-report.json');

const json = async (filename) => JSON.parse(await readFile(filename, 'utf8'));
const compact = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
const editorialNoise = /formatado\s*:\s*portugu[eê]s|allan\s+maux\s+santana|t[uú]lio\s+lages|marcella\s+mendes|diego\s+carvalho|lucas\s+rocha|gustavo\s+augusto|eduardo\s+alberi/i;

function curriculumIds(curriculum) {
  const ids = new Set();
  for (const role of curriculum.roles || []) {
    for (const discipline of role.disciplines || []) {
      for (const topic of discipline.topics || []) {
        for (const subtopic of topic.subtopics || []) ids.add(subtopic.id);
      }
    }
  }
  return ids;
}

const curriculum = await json(curriculumPath);
const validSubtopics = curriculumIds(curriculum);
const batchFiles = (await readdir(batchRoot)).filter((name) => name.endsWith('.json')).sort();
const ready = [];
for (const filename of batchFiles) ready.push(...(await json(path.join(batchRoot, filename))).questions);
const review = (await json(reviewPath)).questions || [];
const all = [...ready, ...review];
const errors = [];
const warnings = [];
const seenIds = new Set();
const seenStatements = new Set();
const referencedAssets = new Set();
const byFolder = {};
const reasons = {};

for (const question of all) {
  const where = question.id || '<sem-id>';
  if (seenIds.has(where)) errors.push(`${where}: ID duplicado`);
  seenIds.add(where);
  const statementKey = compact(question.statement);
  if (seenStatements.has(statementKey)) errors.push(`${where}: enunciado duplicado`);
  seenStatements.add(statementKey);
  if (!question.statement || question.statement.length < 25) {
    (question.metadata?.technical_ready ? errors : warnings).push(`${where}: enunciado incompleto`);
  }
  if (!question.explanation || question.explanation.length < 20) {
    (question.metadata?.technical_ready ? errors : warnings).push(`${where}: comentário incompleto`);
  }
  if (!validSubtopics.has(question.subtopic_id)) errors.push(`${where}: subtópico inválido`);
  if (question.contest_id !== 'pc_pe_2027') errors.push(`${where}: concurso incorreto`);
  if (question.publication_authorized === true || question.metadata?.publication_authorized === true) {
    errors.push(`${where}: autorização de publicação não pode ser automática`);
  }
  if (question.status !== 'draft' || question.editorial_review !== 'pending') {
    errors.push(`${where}: fluxo editorial de rascunho foi alterado`);
  }
  if (question.metadata?.copyright_review_required !== true) {
    errors.push(`${where}: revisão de direitos precisa permanecer obrigatória`);
  }
  if (/09880248457|thallysson\s+gabriel|estrategiaconcursos\.com\.br/i.test(JSON.stringify(question))) {
    errors.push(`${where}: marca d'água ou identificador pessoal presente`);
  }
  if (editorialNoise.test(JSON.stringify(question))) {
    errors.push(`${where}: nome de professor ou marca editorial residual presente`);
  }
  if (question.reference_text && question.reference_text.length < 80) {
    errors.push(`${where}: texto-base curto demais para ser uma referência confiável`);
  }
  if (/\bpasso estrat[eé]gico\b|\baula\s+\d+\b/i.test(question.statement)) {
    warnings.push(`${where}: possível cabeçalho no enunciado`);
  }
  if (question.format === 'certo_errado') {
    if (typeof question.correct_answer !== 'boolean') errors.push(`${where}: gabarito C/E inválido`);
  } else {
    if (!Array.isArray(question.options) || question.options.length < 2) warnings.push(`${where}: alternativas ausentes`);
    const maxLetter = String.fromCharCode(64 + (question.options?.length || 0));
    if (!/^[A-E]$/.test(question.correct_answer || '') || question.correct_answer > maxLetter) {
      warnings.push(`${where}: gabarito de múltipla escolha incompatível`);
    }
  }
  if (question.reference_image) referencedAssets.add(path.basename(question.reference_image));
  if (question.metadata?.requires_visual && !question.reference_image) warnings.push(`${where}: mídia indicada, mas sem recorte seguro`);
  const folder = String(question.metadata?.source_file || '').split('/')[0] || 'sem-pasta';
  byFolder[folder] = (byFolder[folder] || 0) + 1;
  for (const reason of question.metadata?.review_reasons || []) reasons[reason] = (reasons[reason] || 0) + 1;
}

for (const question of ready) {
  if (question.metadata?.technical_ready !== true) errors.push(`${question.id}: lote pronto contém item não pronto`);
  if ((question.metadata?.review_reasons || []).length) errors.push(`${question.id}: lote pronto ainda possui motivo de revisão`);
}
for (const question of review) {
  if (question.metadata?.technical_ready !== false) errors.push(`${question.id}: revisão contém item marcado como pronto`);
  if (!(question.metadata?.review_reasons || []).length) errors.push(`${question.id}: revisão sem motivo registrado`);
}

let assetFiles = [];
try {
  assetFiles = (await readdir(assetRoot)).filter((name) => name.endsWith('.webp')).sort();
} catch {
  // Diretório opcional quando não há questões visuais.
}
for (const name of referencedAssets) {
  if (!assetFiles.includes(name)) errors.push(`${name}: mídia referenciada ausente`);
  else if ((await stat(path.join(assetRoot, name))).size < 1_000) errors.push(`${name}: mídia vazia ou corrompida`);
}
for (const name of assetFiles) {
  if (!referencedAssets.has(name)) errors.push(`${name}: mídia órfã`);
}

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  status: errors.length ? 'failed' : 'passed',
  counts: {
    questions: all.length,
    technically_ready: ready.length,
    needs_review: review.length,
    reference_texts: all.filter((item) => item.reference_text).length,
    reference_images: referencedAssets.size,
    batches: batchFiles.length,
  },
  by_source_folder: Object.fromEntries(Object.entries(byFolder).sort()),
  review_reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
  errors,
  warnings,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
