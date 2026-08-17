import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve(process.argv[2] || 'course-drafts/pc-ba-2026-investigador');
const outputRoot = path.resolve(process.argv[3] || 'app/data/course-factory');
const bundleRoot = path.join(sourceRoot, 'question-bank-import-bundle');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const cleanText = (value) => String(value || '').trim();
const comparable = (value) => cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

function flattenCurriculum(curriculum) {
  const nodes = [];
  const visit = (items, type, parentId = null) => {
    for (const [index, item] of (items || []).entries()) {
      nodes.push({
        id: item.id,
        source_id: item.id,
        parent_id: parentId,
        parent_source_id: parentId,
        type,
        name: item.name,
        description: item.description || null,
        order_index: Number(item.order ?? index),
        status: 'draft',
      });
      if (type === 'role') visit(item.disciplines, 'discipline', item.id);
      if (type === 'discipline') visit(item.topics, 'topic', item.id);
      if (type === 'topic') visit(item.subtopics, 'subtopic', item.id);
    }
  };
  visit(curriculum.roles, 'role');
  return nodes;
}

function questionErrors(question, nodeIndex) {
  const errors = [];
  if (!cleanText(question.id)) errors.push('id');
  if (question.contest_id !== 'pc_ba_2026') errors.push('contest_id');
  if (nodeIndex.get(question.discipline_id)?.type !== 'discipline') errors.push('discipline_id');
  if (nodeIndex.get(question.topic_id)?.type !== 'topic') errors.push('topic_id');
  if (nodeIndex.get(question.subtopic_id)?.type !== 'subtopic') errors.push('subtopic_id');
  if (!cleanText(question.statement)) errors.push('statement');
  if (!Array.isArray(question.options) || question.options.length < 2) errors.push('options');
  const labels = new Set((question.options || []).map((option, index) => cleanText(option.label || option.letter || option.id || String.fromCharCode(65 + index)).toUpperCase()));
  if (!labels.has(cleanText(question.correct_answer).toUpperCase())) errors.push('correct_answer');
  if (!cleanText(question.explanation)) errors.push('explanation');
  return errors;
}

function runtimeQuestion(question) {
  return {
    ...question,
    concursoId: question.contest_id,
    disciplina: question.discipline_id,
    topicoEditalId: question.subtopic_id,
    assunto: question.topic_id,
    enunciado: question.statement,
    alternativas: question.options,
    respostaCorreta: question.correct_answer,
    explicacao: question.explanation,
    format: 'multipla_escolha',
    tipo: 'multipla_escolha',
    situacao: 'ativa',
  };
}

function buildKnowledgeCounts(knowledgeMap) {
  const bySubtopic = new Map();
  for (const discipline of knowledgeMap.disciplines || []) {
    for (const fragment of discipline.fragments || []) {
      const subtopicId = fragment.subtopic_id;
      if (!subtopicId) continue;
      const ids = bySubtopic.get(subtopicId) || new Set();
      for (const item of fragment.microknowledges || []) {
        const id = cleanText(item.id || item.microknowledge_id);
        if (id) ids.add(id);
      }
      bySubtopic.set(subtopicId, ids);
    }
  }
  return bySubtopic;
}

async function main() {
  const [contestEnvelope, curriculum, knowledgeMap] = await Promise.all([
    readJson(path.join(bundleRoot, 'contest.json')),
    readJson(path.join(bundleRoot, 'curriculum.json')),
    readJson(path.join(sourceRoot, 'knowledge-map.bound.v2.json')),
  ]);
  const contest = contestEnvelope.contest;
  const nodes = flattenCurriculum(curriculum);
  const nodeIndex = new Map(nodes.map((node) => [node.id, node]));
  const questionDir = path.join(bundleRoot, 'questions');
  const files = (await readdir(questionDir)).filter((file) => file.endsWith('.json')).sort();
  const questions = [];
  for (const file of files) {
    const batch = await readJson(path.join(questionDir, file));
    for (const question of batch.questions || []) questions.push({ ...question, source_batch: batch.name || file });
  }

  const idCounts = new Map();
  const statementCounts = new Map();
  for (const question of questions) {
    idCounts.set(question.id, (idCounts.get(question.id) || 0) + 1);
    const statement = comparable(question.statement);
    if (statement) statementCounts.set(statement, (statementCounts.get(statement) || 0) + 1);
  }
  const duplicateIds = new Set([...idCounts].filter(([, count]) => count > 1).map(([id]) => id));
  const duplicateStatements = new Set([...statementCounts].filter(([, count]) => count > 1).map(([statement]) => statement));
  const audits = questions.map((question) => {
    const errors = questionErrors(question, nodeIndex);
    if (duplicateIds.has(question.id) || duplicateStatements.has(comparable(question.statement))) errors.push('duplicate');
    return { id: question.id, errors };
  });
  const invalid = audits.filter(({ errors }) => errors.length);
  const knowledgeBySubtopic = buildKnowledgeCounts(knowledgeMap);
  const questionsBySubtopic = new Map();
  const coveredKnowledgeBySubtopic = new Map();
  for (const question of questions) {
    questionsBySubtopic.set(question.subtopic_id, (questionsBySubtopic.get(question.subtopic_id) || 0) + 1);
    const covered = coveredKnowledgeBySubtopic.get(question.subtopic_id) || new Set();
    if (question.primary_microknowledge_id) covered.add(question.primary_microknowledge_id);
    for (const id of question.secondary_microknowledge_ids || []) covered.add(id);
    coveredKnowledgeBySubtopic.set(question.subtopic_id, covered);
  }
  const coverage = Object.fromEntries(nodes.filter(({ type }) => type === 'subtopic').map((node) => {
    const knownIds = knowledgeBySubtopic.get(node.id) || new Set();
    const coveredIds = coveredKnowledgeBySubtopic.get(node.id) || new Set();
    const coveredKnown = [...coveredIds].filter((id) => knownIds.has(id)).length;
    const known = knownIds.size;
    const questionCount = questionsBySubtopic.get(node.id) || 0;
    const coveragePct = known ? Math.round((coveredKnown / known) * 100) : 0;
    return [node.id, {
      question_count: questionCount,
      microknowledge_count: known,
      covered_microknowledge_count: coveredKnown,
      coverage_pct: coveragePct,
      insufficient: questionCount < 3 || coveragePct < 60,
    }];
  }));
  const counts = Object.fromEntries(['role', 'discipline', 'topic', 'subtopic']
    .map((type) => [type, nodes.filter((node) => node.type === type).length]));
  const stats = {
    questions_found: questions.length,
    questions_valid: questions.length - invalid.length,
    questions_invalid: invalid.length,
    questions_duplicated: [...new Set([
      ...duplicateIds,
      ...questions.filter((question) => duplicateStatements.has(comparable(question.statement))).map(({ id }) => id),
    ])].length,
    questions_unlinked: audits.filter(({ errors }) => errors.some((error) => ['discipline_id', 'topic_id', 'subtopic_id'].includes(error))).length,
    batches: files.length,
  };
  const sourceHash = createHash('sha256').update(JSON.stringify({ contest, nodes, questions })).digest('hex');
  const metadata = {
    ...contest,
    name: 'PC BA 2026 — Investigador de Polícia Civil',
    contest_id: 'pc_ba_2026',
    position_id: 'pc_ba_2026_investigador_policia_civil',
    offering_id: 'pc_ba_2026_investigador',
    status_label: 'EM TESTE',
  };
  const manifest = {
    schema_version: 1,
    generated_from: 'question-bank-import-bundle',
    source_hash: sourceHash,
    metadata,
    counts,
    stats,
    coverage,
    curriculum: nodes,
    question_samples: questions.slice(0, 20).map(runtimeQuestion),
    validation_errors: invalid.slice(0, 100),
  };
  const runtime = {
    id: 'pc_ba_2026_investigador_preview_v1',
    contestId: 'pc_ba_2026',
    version: `preview-${sourceHash.slice(0, 12)}`,
    contentHash: sourceHash,
    metadata: {
      ...metadata,
      contentStatus: 'ready',
      salesStatus: 'unavailable',
      exam_date: '2026-12-06',
    },
    curriculum: nodes,
    questions: questions.map(runtimeQuestion),
    previewOnly: true,
    publicationBlocked: true,
  };
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputRoot, 'pc-ba-2026-investigador-manifest.json'), `${JSON.stringify(manifest)}\n`),
    writeFile(path.join(outputRoot, 'pc-ba-2026-investigador-runtime.json'), `${JSON.stringify(runtime)}\n`),
  ]);
  console.log(JSON.stringify({ outputRoot, counts, stats, sourceHash }, null, 2));
}

await main();
