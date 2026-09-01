#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from './question-factory/core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repoRoot, 'course-packages/pc-pe-2026-agente');
const outputPath = path.join(repoRoot, 'app/data/course-factory/pc-pe-2026-agente-runtime.json');
const manifestPath = path.join(repoRoot, 'app/data/course-factory/pc-pe-2026-agente-manifest.json');
const version = '2026.09.01.1';
const bundle = await loadBundle(packageRoot);
if (bundle.course.contest_id !== 'pc_pe_2026') throw new Error('contest_identity_invalid');
if (bundle.questions.length !== 100) throw new Error(`question_count_invalid:${bundle.questions.length}`);

const nodeById = new Map(bundle.curriculum.map((node) => [node.id, node]));
function ancestors(subtopicId) {
  const result = { topicId: null, disciplineId: null };
  let node = nodeById.get(subtopicId);
  while (node?.parent_id) {
    node = nodeById.get(node.parent_id);
    if (!node) break;
    if (node.type === 'topic') result.topicId = node.id;
    if (node.type === 'discipline') { result.disciplineId = node.id; break; }
  }
  return result;
}

const curriculum = bundle.curriculum.map((node) => ({
  id: node.id,
  source_id: node.id,
  parent_id: node.parent_id,
  parent_source_id: node.parent_id,
  type: node.type,
  name: node.title,
  description: node.description || '',
  order_index: Number(node.order || 0),
  status: 'active',
}));
const questions = bundle.questions.map((question) => {
  const { topicId, disciplineId } = ancestors(question.subtopic_id);
  const [primaryMicroknowledgeId = null, ...secondaryMicroknowledgeIds] = question.microknowledge_ids || [];
  if (!disciplineId || !topicId || !primaryMicroknowledgeId) throw new Error(`question_link_invalid:${question.id}`);
  return {
    ...question,
    contest_id: bundle.course.contest_id,
    discipline_id: disciplineId,
    topic_id: topicId,
    primary_microknowledge_id: primaryMicroknowledgeId,
    secondary_microknowledge_ids: secondaryMicroknowledgeIds,
    source_batch: 'pcpe-inicial-autoral-001',
    concursoId: bundle.course.contest_id,
    disciplina: disciplineId,
    topicoEditalId: question.subtopic_id,
    assunto: topicId,
    enunciado: question.statement,
    alternativas: question.options,
    respostaCorreta: question.correct_answer,
    explicacao: question.explanation,
    tipo: question.format,
    situacao: 'ativa',
  };
});
const contentHash = createHash('sha256').update(JSON.stringify({ curriculum, questions })).digest('hex');
const runtime = {
  id: `pc_pe_2026_agente_${version.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
  contestId: bundle.course.contest_id,
  version,
  contentHash,
  metadata: {
    id: bundle.course.contest_id,
    code: bundle.course.code,
    slug: bundle.course.slug,
    name: bundle.course.name,
    role: bundle.course.position,
    description: bundle.course.description,
    content_status: 'ready',
    sales_status: 'coming_soon',
    price_cents: 0,
    currency: 'BRL',
    exam_date: null,
    color: '#13233f',
    accent: '#2dd4bf',
    icon: 'PCPE',
    contest_id: bundle.course.contest_id,
    position_id: bundle.course.position_id,
    offering_id: bundle.course.offering_id,
    status_label: 'CONTEÚDO PUBLICADO',
    question_count: questions.length,
    subtopic_count: curriculum.filter(({ type }) => type === 'subtopic').length,
  },
  curriculum,
  questions,
  previewOnly: false,
  publicationBlocked: false,
  salesBlocked: true,
};
const manifest = {
  schema_version: 1,
  contest_id: runtime.contestId,
  version,
  content_hash: contentHash,
  question_count: questions.length,
  curriculum_count: curriculum.length,
  subtopic_count: runtime.metadata.subtopic_count,
  sales_blocked: true,
  generated_at: '2026-09-01T00:00:00.000Z',
};

await mkdir(path.dirname(outputPath), { recursive: true });
await Promise.all([
  writeFile(outputPath, `${JSON.stringify(runtime)}\n`, 'utf8'),
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify({ outputPath, manifestPath, ...manifest }, null, 2));
