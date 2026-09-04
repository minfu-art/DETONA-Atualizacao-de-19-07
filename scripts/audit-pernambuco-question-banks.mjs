import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  loadBundle, normalizeText, readJson, validateQuestionBatch,
} from './question-factory/core.mjs';

const repoRoot = process.cwd();
const output = path.join(repoRoot, 'docs', 'PERNAMBUCO-THREE-COURSE-QUESTION-BANKS.audit.json');

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function frequency(items, selector) {
  return Object.fromEntries([...items.reduce((map, item) => {
    const key = String(selector(item) ?? 'não informado');
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')));
}

async function auditStaging(slug) {
  const packageRoot = path.join(repoRoot, 'course-packages', slug);
  const bundle = await loadBundle(packageRoot);
  const stagingRoot = path.join(packageRoot, 'factory', 'staging');
  const names = (await readdir(stagingRoot)).filter((name) => name.endsWith('.json')).sort();
  const questions = [];
  const deterministicErrors = [];
  for (const name of names) {
    const batch = await readJson(path.join(stagingRoot, name));
    const validation = validateQuestionBatch(bundle, batch);
    if (!validation.valid) deterministicErrors.push({ file: name, errors: validation.errors });
    questions.push(...batch.questions);
  }
  const ids = questions.map((question) => question.id);
  const statements = questions.map((question) => normalizeText(question.statement));
  const imagePaths = [...new Set(questions.map((question) => question.reference_image).filter(Boolean))];
  const missingImages = [];
  for (const relative of imagePaths) {
    if (!await exists(path.join(packageRoot, relative))) missingImages.push(relative);
  }
  const review = await readJson(path.join(packageRoot, 'factory', 'review', 'questoes-com-pendencias.json'));
  const disciplineBySubtopic = new Map();
  const nodeById = new Map(bundle.curriculum.map((node) => [node.id, node]));
  for (const node of bundle.curriculum.filter((item) => item.type === 'subtopic')) {
    let cursor = node;
    while (cursor && cursor.type !== 'discipline') cursor = nodeById.get(cursor.parent_id);
    disciplineBySubtopic.set(node.id, cursor?.title || 'não informada');
  }
  return {
    slug,
    contest_id: bundle.course.contest_id,
    status: deterministicErrors.length || new Set(ids).size !== ids.length
      || new Set(statements).size !== statements.length || missingImages.length
      ? 'INVALID'
      : 'READY_FOR_SEMANTIC_AUDIT',
    publication_authorized: false,
    curriculum: {
      nodes: bundle.curriculum.length,
      disciplines: bundle.curriculum.filter((node) => node.type === 'discipline').length,
      topics: bundle.curriculum.filter((node) => node.type === 'topic').length,
      subtopics: bundle.curriculum.filter((node) => node.type === 'subtopic').length,
      microknowledges: bundle.microknowledges.length,
    },
    staging: {
      batches: names.length,
      questions: questions.length,
      unique_ids: new Set(ids).size,
      unique_normalized_statements: new Set(statements).size,
      formats: frequency(questions, (question) => question.format),
      answers: frequency(questions, (question) => question.correct_answer),
      disciplines: frequency(questions, (question) => disciplineBySubtopic.get(question.subtopic_id)),
      reference_images: imagePaths.length,
      missing_images: missingImages,
    },
    review_questions: review.questions?.length || 0,
    deterministic_invalid_batches: deterministicErrors,
    semantic_audit: 'pending',
  };
}

async function auditPcPublished() {
  const runtime = await readJson(path.join(repoRoot, 'app', 'data', 'course-factory', 'pc-pe-2026-agente-runtime.json'));
  const publishedRoot = path.join(repoRoot, 'app', 'data', 'course-factory', 'published');
  const names = (await readdir(publishedRoot))
    .filter((name) => /^pc-pe-2026-agente-patch-\d+\.json$/.test(name)).sort();
  const patches = await Promise.all(names.map((name) => readJson(path.join(publishedRoot, name))));
  const questions = [...(runtime.questions || []), ...patches.flatMap((patch) => patch.questions || [])];
  const ids = questions.map((question) => question.id);
  const statements = questions.map((question) => normalizeText(question.statement));
  const missingImages = [];
  const images = [...new Set(questions.map((question) => question.reference_image).filter(Boolean))];
  for (const relative of images) {
    if (!await exists(path.join(repoRoot, 'app', relative))) missingImages.push(relative);
  }
  return {
    slug: 'pc-pe-2026-agente',
    contest_id: runtime.contestId,
    status: new Set(ids).size === ids.length
      && new Set(statements).size === statements.length
      && !missingImages.length ? 'PUBLISHED_VALID' : 'INVALID',
    questions: questions.length,
    unique_ids: new Set(ids).size,
    unique_normalized_statements: new Set(statements).size,
    reference_images: images.length,
    missing_images: missingImages,
    patches: names,
  };
}

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  publication_performed: false,
  courses: {
    pc_pe: await auditPcPublished(),
    pm_pe: await auditStaging('pm-pe-2027-soldado'),
    pp_pe: await auditStaging('pp-pe-2027-policial-penal'),
  },
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
