#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from './question-factory/core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appData = path.join(repoRoot, 'app/data/course-factory');
const version = '2026.09.04.1';

const configs = [
  {
    packageDir: 'pm-pe-2027-soldado',
    runtimeSlug: 'pm-pe-2027-soldado',
    code: 'PM PE',
    name: 'PM PE 2027 — Soldado',
    role: 'Praça/Soldado',
    organization: 'Polícia Militar de Pernambuco',
    board: 'Instituto AOCP (referência: edital 2023)',
    color: '#151229',
    accent: '#ff7a00',
    icon: 'PMPE',
    careerSubarea: 'military_police',
    imagePublicRoot: '/data/course-factory/assets/pm-pe-2027/question-references',
    imageOutputRoot: path.join(appData, 'assets/pm-pe-2027/question-references'),
  },
  {
    packageDir: 'pp-pe-2027-policial-penal',
    runtimeSlug: 'pp-pe-2027-policial-penal',
    code: 'PP PE',
    name: 'Polícia Penal PE 2027 — Policial Penal',
    role: 'Policial Penal',
    organization: 'Secretaria de Administração Penitenciária e Ressocialização de Pernambuco',
    board: 'A definir (referência: edital Cebraspe 2021)',
    color: '#111827',
    accent: '#8b5cf6',
    icon: 'PPPE',
    careerSubarea: 'prison_police',
  },
];

function ancestors(nodeById, subtopicId) {
  const result = { topicId: null, disciplineId: null };
  let node = nodeById.get(subtopicId);
  while (node?.parent_id) {
    node = nodeById.get(node.parent_id);
    if (!node) break;
    if (node.type === 'topic') result.topicId = node.id;
    if (node.type === 'discipline') {
      result.disciplineId = node.id;
      break;
    }
  }
  return result;
}

async function copyQuestionImages(bundle, config) {
  if (!config.imageOutputRoot) return 0;
  const images = [...new Set(bundle.questions.map(({ reference_image: image }) => image).filter(Boolean))];
  await mkdir(config.imageOutputRoot, { recursive: true });
  for (const relative of images) {
    await copyFile(path.join(bundle.bundlePath, relative), path.join(config.imageOutputRoot, path.basename(relative)));
  }
  return images.length;
}

async function build(config) {
  const bundle = await loadBundle(path.join(repoRoot, 'course-packages', config.packageDir));
  const nodeById = new Map(bundle.curriculum.map((node) => [node.id, node]));
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
    const { topicId, disciplineId } = ancestors(nodeById, question.subtopic_id);
    const [primaryMicroknowledgeId = null, ...secondaryMicroknowledgeIds] = question.microknowledge_ids || [];
    if (!disciplineId || !topicId || !primaryMicroknowledgeId) throw new Error(`question_link_invalid:${question.id}`);
    const referenceImage = question.reference_image && config.imagePublicRoot
      ? `${config.imagePublicRoot}/${path.basename(question.reference_image)}`
      : undefined;
    return {
      ...question,
      ...(referenceImage ? { reference_image: referenceImage } : {}),
      contest_id: bundle.course.contest_id,
      discipline_id: disciplineId,
      topic_id: topicId,
      primary_microknowledge_id: primaryMicroknowledgeId,
      secondary_microknowledge_ids: secondaryMicroknowledgeIds,
      source_batch: 'pernambuco-production-initial-conservative-v1',
      concursoId: bundle.course.contest_id,
      enunciado: question.statement,
      alternativas: question.options,
      respostaCorreta: question.correct_answer,
      explicacao: question.explanation,
      tipo: question.format,
      situacao: 'publicada',
    };
  });
  const contentHash = createHash('sha256').update(JSON.stringify({ curriculum, questions })).digest('hex');
  const subtopicCount = curriculum.filter(({ type }) => type === 'subtopic').length;
  const runtime = {
    id: `${bundle.course.contest_id}_${version.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    contestId: bundle.course.contest_id,
    version,
    contentHash,
    metadata: {
      id: bundle.course.contest_id,
      code: config.code,
      slug: config.runtimeSlug,
      name: config.name,
      role: config.role,
      organization: config.organization,
      board: config.board,
      description: bundle.course.description,
      content_status: 'ready',
      sales_status: 'available',
      price_cents: 2490,
      currency: 'BRL',
      exam_date: null,
      color: config.color,
      accent: config.accent,
      icon: config.icon,
      career_area: 'police_security',
      career_subarea: config.careerSubarea,
      contest_id: bundle.course.contest_id,
      position_id: bundle.course.position_id,
      offering_id: bundle.course.offering_id,
      status_label: 'PUBLICADO · BANCO EM EXPANSÃO',
      question_count: questions.length,
      subtopic_count: subtopicCount,
    },
    curriculum,
    questions,
    previewOnly: false,
    publicationBlocked: false,
    salesBlocked: false,
  };
  const manifest = {
    schema_version: 1,
    contest_id: runtime.contestId,
    version,
    content_hash: contentHash,
    question_count: questions.length,
    curriculum_count: curriculum.length,
    subtopic_count: subtopicCount,
    sales_blocked: false,
    generated_at: '2026-09-04T00:00:00.000Z',
  };
  const runtimePath = path.join(appData, `${config.runtimeSlug}-runtime.json`);
  const manifestPath = path.join(appData, `${config.runtimeSlug}-manifest.json`);
  const imageCount = await copyQuestionImages(bundle, config);
  await Promise.all([
    writeFile(runtimePath, `${JSON.stringify(runtime)}\n`, 'utf8'),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  ]);
  return { runtimePath, manifestPath, imageCount, ...manifest };
}

const results = [];
for (const config of configs) results.push(await build(config));
console.log(JSON.stringify(results, null, 2));
