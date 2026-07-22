import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSeedEntities } from '../js/data/editalSeed.js';
import { resolveSubtopicAlias } from '../js/config/subtopicAliases.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedStatuses = new Set(['revisada', 'revisao']);
const allowedTypes = new Set(['certo_errado', 'multipla_escolha']);

function text(value) {
  return String(value ?? '').trim();
}

function validAnswer(question) {
  const answer = text(question.respostaCorreta).toUpperCase();
  if (question.tipo === 'certo_errado') return ['C', 'E', 'CERTO', 'ERRADO', 'TRUE', 'FALSE'].includes(answer);
  const alternatives = Array.isArray(question.alternativas) ? question.alternativas : [];
  const letters = new Set(alternatives.map((item, index) => text(item?.letra || String.fromCharCode(65 + index)).toUpperCase()));
  return letters.has(answer);
}

function safePublishedPath(reference) {
  const cleaned = text(reference).replace(/^\.\//, '');
  const absolute = normalize(join(appRoot, cleaned));
  const rel = relative(appRoot, absolute);
  if (isAbsolute(rel) || rel.startsWith('..')) return null;
  return absolute;
}

export function validatePublishedQuestions({ indexPath = join(appRoot, 'data/questions/index.json') } = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Map();
  const reviewIds = [];
  const aliasCounts = new Map();
  const validSubtopics = new Set(buildSeedEntities().subtopics.map((item) => item.id));
  let index;

  if (!existsSync(indexPath)) return { valid: false, total: 0, errors: [`Índice ausente: ${indexPath}`], warnings };
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (error) {
    return { valid: false, total: 0, errors: [`Índice inválido: ${error.message}`], warnings };
  }

  if (!Array.isArray(index.disciplinas)) errors.push('Índice: disciplinas deve ser uma lista.');
  let total = 0;
  for (const entry of index.disciplinas || []) {
    const filePath = safePublishedPath(entry.arquivo);
    if (!filePath || !existsSync(filePath)) {
      errors.push(`Arquivo não encontrado para ${entry.id}: ${entry.arquivo}`);
      continue;
    }
    let questions;
    try {
      const payload = JSON.parse(readFileSync(filePath, 'utf8'));
      questions = Array.isArray(payload) ? payload : (payload.questoes || payload.questions);
    } catch (error) {
      errors.push(`${entry.id}: JSON inválido (${error.message}).`);
      continue;
    }
    if (!Array.isArray(questions)) {
      errors.push(`${entry.id}: arquivo não contém uma lista de questões.`);
      continue;
    }
    if (Number(entry.quantidade) !== questions.length) {
      errors.push(`${entry.id}: índice declara ${entry.quantidade}, arquivo contém ${questions.length}.`);
    }
    total += questions.length;

    questions.forEach((question, offset) => {
      const context = `${entry.id}[${offset}]`;
      const id = text(question.id);
      if (!id) errors.push(`${context}: id obrigatório ausente.`);
      else {
        if (ids.has(id)) errors.push(`${context}: id duplicado ${id} (primeiro em ${ids.get(id)}).`);
        else ids.set(id, context);
      }
      if (!text(question.concursoId)) errors.push(`${context}: concursoId ausente.`);
      if (!text(question.disciplinaId)) errors.push(`${context}: disciplinaId ausente.`);
      else if (text(question.disciplinaId) !== text(entry.id)) errors.push(`${context}: disciplinaId não corresponde ao índice.`);
      const rawTopic = text(question.subtopic_id || question.topicoEditalId);
      if (!rawTopic) errors.push(`${context}: subtópico/tópico ausente.`);
      const resolvedTopic = resolveSubtopicAlias(rawTopic);
      if (rawTopic && resolvedTopic !== rawTopic) aliasCounts.set(rawTopic, (aliasCounts.get(rawTopic) || 0) + 1);
      if (resolvedTopic && !validSubtopics.has(resolvedTopic)) errors.push(`${context}: referência de subtópico quebrada (${rawTopic}).`);
      if (!text(question.enunciado)) errors.push(`${context}: enunciado ausente.`);
      if (!text(question.explicacao)) errors.push(`${context}: explicação ausente.`);
      if (!allowedStatuses.has(text(question.status).toLowerCase())) errors.push(`${context}: status inválido (${question.status}).`);
      if (!allowedTypes.has(text(question.tipo))) errors.push(`${context}: tipo inválido (${question.tipo}).`);
      else if (!validAnswer(question)) errors.push(`${context}: resposta correta incompatível com o tipo/alternativas.`);
      if (text(question.status).toLowerCase() === 'revisao') reviewIds.push(id || context);
    });
  }

  if (Number(index.quantidade) !== total) errors.push(`Índice declara ${index.quantidade}; total real é ${total}.`);
  if (reviewIds.length) warnings.push(`${reviewIds.length} questões estão marcadas para revisão editorial.`);
  const aliased = [...aliasCounts.values()].reduce((sum, count) => sum + count, 0);
  if (aliased) warnings.push(`${aliased} questões usam aliases editoriais legados resolvidos pelo aplicativo.`);

  return {
    valid: errors.length === 0,
    total,
    reviewed: total - reviewIds.length,
    inReview: reviewIds.length,
    aliasesResolved: aliased,
    files: (index.disciplinas || []).length,
    errors,
    warnings,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const result = validatePublishedQuestions();
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}
