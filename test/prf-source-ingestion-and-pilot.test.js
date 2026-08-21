import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { validateAssistedCoursePackage } from '../supabase/functions/course-factory-assisted/core.js';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('ingestão cataloga integralmente o pacote local da PRF sem autorizar publicação', async () => {
  const report = await readJson('sources/source-ingestion-report.v1.json');
  assert.equal(report.contest_id, 'prf_2026');
  assert.equal(report.summary.pdf_count, 183);
  assert.equal(report.summary.page_count, 19676);
  assert.equal(report.summary.canonical_disciplines_represented, 13);
  assert.deepEqual(report.summary.missing_canonical_disciplines, ['Língua Estrangeira']);
  assert.equal(report.summary.blocked_count, 1);
  assert.equal(report.summary.duplicate_file_groups, 1);
  assert.equal(report.question_generation_authorized, true);
  assert.equal(report.publication_authorized, false);
  assert.equal(report.sources.length, report.summary.pdf_count);
  assert.equal(report.sources.filter(({ status }) => status.startsWith('blocked_')).length, 1);
  assert.equal(report.sources.some(({ relative_path, status }) => relative_path.endsWith('/,.pdf') && status === 'blocked_invalid_filename'), true);
});

test('piloto de Português fecha microconhecimento, três modos de questão e rastreabilidade', async () => {
  const file = 'production/portuguese-regency-crase-pilot.v1.json';
  const raw = await readFile(path.join(root, file), 'utf8');
  const pilot = JSON.parse(raw);
  const questions = pilot.question_batches.flatMap(({ questions: items }) => items);
  const known = new Set(pilot.microknowledges.map(({ id }) => id));
  assert.equal(pilot.microknowledges.length, 8);
  assert.equal(questions.length, 24);
  assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, questions.length);
  assert.equal(pilot.metadata.source_questions_copied, false);
  assert.equal(pilot.metadata.authorial_questions, true);
  assert.equal(pilot.metadata.publication_blocked, true);
  assert.equal(pilot.metadata.import_blocked, true);
  assert.doesNotMatch(raw, /09880248457|thallysson/i);

  for (const microknowledge of pilot.microknowledges) {
    const linked = questions.filter(({ microknowledge_ids: ids }) => ids.includes(microknowledge.id));
    assert.equal(linked.length, 3, microknowledge.id);
    assert.deepEqual(new Set(linked.map(({ difficulty }) => difficulty)), new Set(['facil', 'media', 'dificil']));
    assert.equal(linked.filter(({ is_trick: isTrick }) => isTrick).length, 1);
    assert.ok(microknowledge.traces.some(({ source_id: sourceId }) => sourceId === 'prf_2021_edital_abertura'));
    assert.ok(microknowledge.traces.some(({ source_id: sourceId }) => sourceId === 'prf_pdf_bf5410c46bd3'));
  }
  assert.ok(questions.every(({ correct_answer: answer }) => answer === 'C' || answer === 'E'));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 40));
  assert.ok(questions.every(({ microknowledge_ids: ids }) => ids.length === 1 && known.has(ids[0])));

  const uploadedSources = pilot.sources
    .filter(({ file_name: fileName }) => fileName)
    .map(({ file_name: fileName }) => ({ file_name: fileName, status: 'uploaded' }));
  const validation = await validateAssistedCoursePackage(pilot, { uploadedSources });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.counts.microknowledges, 8);
  assert.equal(validation.counts.questions, 24);
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
  assert.equal(validation.coverage.subtopic_question_pct, 100);
});

test('primeira onda de Português cobre os 22 subtópicos sem declarar decomposição final', async () => {
  const wave = await readJson('production/portuguese-22-subtopics-wave1.v1.json');
  const subtopics = wave.curriculum.nodes.filter(({ type }) => type === 'subtopic');
  const questions = wave.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(subtopics.length, 22);
  assert.equal(wave.edital_map.length, 22);
  assert.equal(wave.microknowledges.length, 28);
  assert.equal(questions.length, 84);
  assert.equal(wave.metadata.canonical_subtopics_covered, 22);
  assert.equal(wave.metadata.coverage_status, 'initial_anchor_coverage_not_full_atomic_decomposition');
  for (const subtopic of subtopics) {
    const microIds = wave.microknowledges.filter(({ subtopic_id: id }) => id === subtopic.id).map(({ id }) => id);
    assert.ok(microIds.length >= 1, subtopic.title);
    assert.ok(questions.filter(({ microknowledge_ids: ids }) => ids.some((id) => microIds.includes(id))).length >= 3, subtopic.title);
  }
  assert.ok(wave.sources.some(({ id }) => id === 'mrpr_3ed_oficial'));
  const validation = await validateAssistedCoursePackage(wave, {
    uploadedSources: wave.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.subtopic_question_pct, 100);
});

test('lote editorial 01 de Português contém 20 questões contextualizadas e comentários didáticos', async () => {
  const file = 'production/portuguese-editorial-batch-01.v1.json';
  const raw = await readFile(path.join(root, file), 'utf8');
  const course = JSON.parse(raw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  const microIds = new Set(course.microknowledges.map(({ id }) => id));

  assert.equal(course.edital_map.length, 1);
  assert.equal(course.microknowledges.length, 8);
  assert.equal(questions.length, 20);
  assert.equal(course.metadata.coverage_status, 'incremental_editorial_batches_of_20');
  assert.equal(course.metadata.editorial_status, 'batch_01_pending_human_review');
  assert.equal(course.metadata.publication_blocked, true);
  assert.equal(course.metadata.import_blocked, true);
  assert.equal(course.metadata.source_questions_copied, false);
  assert.doesNotMatch(raw, /09880248457|thallysson/i);
  assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, questions.length);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.deepEqual(new Set(questions.map(({ difficulty }) => difficulty)), new Set(['facil', 'media', 'dificil']));
  assert.ok(questions.every(({ statement }) => statement.startsWith('TEXTO ') && statement.includes('\n\nJulgue o item:')));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 140));
  assert.ok(questions.every(({ microknowledge_ids }) => microknowledge_ids.length === 1 && microIds.has(microknowledge_ids[0])));
  assert.ok(course.microknowledges.every(({ id }) => questions.some(({ microknowledge_ids }) => microknowledge_ids.includes(id))));

  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.counts.microknowledges, 8);
  assert.equal(validation.counts.questions, 20);
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('matriz editorial da Aula 13 analisa 20 questões sem armazenar conteúdo protegido', async () => {
  const raw = await readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-01.v1.json'), 'utf8');
  const matrix = JSON.parse(raw);
  assert.deepEqual(matrix.source_pages, [128, 140]);
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.ok(matrix.items.every(({ page, skill, cognitive_operation, trap }) => page >= 128 && page <= 140 && skill && cognitive_operation && trap));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.doesNotMatch(raw, /09880248457|thallysson/i);
});

test('lote editorial 01 possui preview humano completo antes de qualquer publicação', async () => {
  const preview = await readFile(path.join(root, 'previews/portuguese-editorial-batch-01.preview.md'), 'utf8');
  assert.match(preview, /Nada deste lote está importado ou publicado/);
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Gabarito:\*\* (CERTO|ERRADO)/g) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(preview, /09880248457|thallysson/i);
});

test('lote editorial 02 reproduz os padrões cognitivos das questões 21-40 com conteúdo autoral', async () => {
  const raw = await readFile(path.join(root, 'production/portuguese-editorial-batch-02.v1.json'), 'utf8');
  const course = JSON.parse(raw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(course.metadata.editorial_status, 'batch_02_pending_human_review');
  assert.equal(course.metadata.source_questions_copied, false);
  assert.equal(new Set(questions.map(({ id }) => id)).size, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['E', 'C']));
  assert.deepEqual(new Set(questions.map(({ difficulty }) => difficulty)), new Set(['facil', 'media', 'dificil']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 160));
  assert.doesNotMatch(raw, /09880248457|thallysson/i);

  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 02 possui matriz segura e preview obrigatório com 20 questões', async () => {
  const matrixRaw = await readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-02.v1.json'), 'utf8');
  const matrix = JSON.parse(matrixRaw);
  const preview = await readFile(path.join(root, 'previews/portuguese-editorial-batch-02.preview.md'), 'utf8');
  assert.deepEqual(matrix.source_question_range, [21, 40]);
  assert.deepEqual(matrix.source_pages, [140, 155]);
  assert.equal(matrix.items.length, 20);
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
});

test('lote editorial 03 fecha matriz, pacote e preview das questões 41-60', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-03.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-03.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-03.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.deepEqual(matrix.source_question_range, [41, 60]);
  assert.deepEqual(matrix.source_pages, [155, 174]);
  assert.equal(matrix.items.length, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 04 fecha matriz, pacote e preview das questões 61-80', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-04.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-04.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-04.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.deepEqual(matrix.source_question_range, [61, 80]);
  assert.deepEqual(matrix.source_pages, [174, 188]);
  assert.equal(matrix.items.length, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['E', 'C']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 05 fecha matriz, pacote e preview das questões 81-100', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-05.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-05.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-05.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.deepEqual(matrix.source_question_range, [81, 100]);
  assert.deepEqual(matrix.source_pages, [189, 201]);
  assert.equal(matrix.items.length, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['E', 'C']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 06 fecha matriz, pacote e preview das questões 101-120', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-06.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-06.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-06.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.deepEqual(matrix.source_question_range, [101, 120]);
  assert.deepEqual(matrix.source_pages, [202, 213]);
  assert.equal(matrix.items.length, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 07 fecha matriz, pacote e preview das questões 121-140', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-07.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-07.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-07.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.deepEqual(matrix.source_question_range, [121, 140]);
  assert.deepEqual(matrix.source_pages, [213, 228]);
  assert.equal(matrix.items.length, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['E', 'C']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 08 fecha a Aula 13 sem duplicar a lista de questões', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-08.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-08.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-08.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.deepEqual(matrix.source_question_range, [141, 146]);
  assert.deepEqual(matrix.source_pages, [228, 231]);
  assert.equal(matrix.items.length, 20);
  assert.deepEqual([...new Set(matrix.items.map(({ source_question_number }) => source_question_number))], [141, 142, 143, 144, 145, 146]);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 09 inicia Tipos e gêneros textuais com 20 matrizes únicas', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-09.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-09.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-09.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t02_s01_tipos_e_gen');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [51, 73]);
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ exam }) => exam)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['E', 'C']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 10 fecha Tipos e gêneros sem repetir a lista da apostila', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-10.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula13-editorial-matrix-batch-10.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-10.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t02_s01_tipos_e_gen');
  assert.deepEqual(matrix.source_question_range, [21, 27]);
  assert.deepEqual(matrix.source_pages, [73, 79]);
  assert.equal(matrix.items.length, 20);
  assert.deepEqual([...new Set(matrix.items.map(({ source_question_number }) => source_question_number))], [21, 22, 23, 24, 25, 26, 27]);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 11 inicia Ortografia com matriz própria da Aula 00', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-11.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula00-editorial-matrix-batch-11.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-11.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t03_s01_ortografia_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula00-editorial-matrix-batch-11.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [67, 74]);
  assert.equal(matrix.source_id, 'prf_pdf_9da938cda32a');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 12 aprofunda acentuação aplicada sem copiar a fonte', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-12.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula00-editorial-matrix-batch-12.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-12.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t03_s01_ortografia_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula00-editorial-matrix-batch-12.v1.json');
  assert.deepEqual(matrix.source_question_range, [21, 40]);
  assert.deepEqual(matrix.source_pages, [76, 82]);
  assert.equal(matrix.source_id, 'prf_pdf_9da938cda32a');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 13 cobre hiato, diferenciais e hífen sem duplicatas', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-13.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula00-editorial-matrix-batch-13.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-13.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula00-editorial-matrix-batch-13.v1.json');
  assert.deepEqual(matrix.source_question_range, [41, 60]);
  assert.deepEqual(matrix.source_pages, [83, 91]);
  assert.equal(matrix.source_id, 'prf_pdf_9da938cda32a');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(matrix.items.filter(({ source_label }) => /PGE-PE 2019|Hífen 5/.test(source_label)).length, 0);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 14 aplica expressões problemáticas em contextos autorais', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-14.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula00-editorial-matrix-batch-14.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-14.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula00-editorial-matrix-batch-14.v1.json');
  assert.deepEqual(matrix.source_question_range, [61, 80]);
  assert.deepEqual(matrix.source_pages, [93, 101]);
  assert.equal(matrix.source_id, 'prf_pdf_9da938cda32a');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 15 inicia coesão referencial com matriz da Aula 11', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-15.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula11-editorial-matrix-batch-15.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-15.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s01_referenciac');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula11-editorial-matrix-batch-15.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [24, 37]);
  assert.equal(matrix.source_id, 'prf_pdf_50f8727aed54');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 16 aprofunda cadeias referenciais e reserva conectores', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-16.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula11-editorial-matrix-batch-16.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-16.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s01_referenciac');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula11-editorial-matrix-batch-16.v1.json');
  assert.deepEqual(matrix.source_question_range, [21, 41]);
  assert.deepEqual(matrix.source_pages, [38, 53]);
  assert.equal(matrix.source_id, 'prf_pdf_50f8727aed54');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(matrix.items.some(({ source_question_number }) => source_question_number === 39), false);
  assert.equal(matrix.items.some(({ source_question_number }) => source_question_number === 41), true);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 17 fecha referenciação decompondo 11 fontes em 20 matrizes', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-17.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula11-editorial-matrix-batch-17.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-17.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s01_referenciac');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula11-editorial-matrix-batch-17.v1.json');
  assert.deepEqual(matrix.source_question_range, [42, 52]);
  assert.deepEqual(matrix.source_pages, [54, 58]);
  assert.equal(matrix.source_id, 'prf_pdf_50f8727aed54');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 11);
  assert.equal(matrix.items.some(({ source_question_number }) => source_question_number === 53), false);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 18 inicia conectores com matriz da Aula 02', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-18.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula02-editorial-matrix-batch-18.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-18.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s02_conectores_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula02-editorial-matrix-batch-18.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [49, 59]);
  assert.equal(matrix.source_id, 'prf_pdf_2e7edd5477b7');
  assert.ok(course.sources.some(({ id }) => id === 'prf_pdf_2e7edd5477b7'));
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 19 aprofunda conectores polissêmicos e corrige a matriz temporal', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-19.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula02-editorial-matrix-batch-19.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-19.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s02_conectores_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula02-editorial-matrix-batch-19.v1.json');
  assert.deepEqual(matrix.source_question_range, [21, 40]);
  assert.deepEqual(matrix.source_pages, [59, 72]);
  assert.equal(matrix.source_id, 'prf_pdf_2e7edd5477b7');
  assert.ok(course.sources.some(({ id }) => id === 'prf_pdf_2e7edd5477b7'));
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.match(matrix.items.find(({ source_question_number }) => source_question_number === 25).skill, /temporal/);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 20 aplica conectores entre períodos e parágrafos', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-20.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula02-editorial-matrix-batch-20.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-20.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s02_conectores_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula02-editorial-matrix-batch-20.v1.json');
  assert.deepEqual(matrix.source_question_range, [41, 60]);
  assert.deepEqual(matrix.source_pages, [73, 86]);
  assert.equal(matrix.source_id, 'prf_pdf_2e7edd5477b7');
  assert.ok(course.sources.some(({ id }) => id === 'prf_pdf_2e7edd5477b7'));
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 21 resolve polissemia e correlações sem herdar ambiguidades', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-21.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula02-editorial-matrix-batch-21.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-21.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s02_conectores_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula02-editorial-matrix-batch-21.v1.json');
  assert.deepEqual(matrix.source_question_range, [61, 80]);
  assert.deepEqual(matrix.source_pages, [87, 95]);
  assert.equal(matrix.source_id, 'prf_pdf_2e7edd5477b7');
  assert.ok(course.sources.some(({ id }) => id === 'prf_pdf_2e7edd5477b7'));
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 22 fecha conectores decompondo 15 fontes em 20 operações', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-22.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula02-editorial-matrix-batch-22.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-22.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s02_conectores_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula02-editorial-matrix-batch-22.v1.json');
  assert.deepEqual(matrix.source_question_range, [81, 95]);
  assert.deepEqual(matrix.source_pages, [95, 101]);
  assert.equal(matrix.source_id, 'prf_pdf_2e7edd5477b7');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 15);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 23 inicia tempos e modos com matriz da Aula 04', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-23.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula04-editorial-matrix-batch-23.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-23.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s03_tempos_e_mo');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula04-editorial-matrix-batch-23.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [69, 79]);
  assert.equal(matrix.source_id, 'prf_pdf_8283a4d35d2b');
  assert.ok(course.sources.some(({ id }) => id === 'prf_pdf_8283a4d35d2b'));
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 24 fecha emprego dos tempos antes de iniciar modo indicativo', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-24.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula04-editorial-matrix-batch-24.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-24.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s03_tempos_e_mo');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula04-editorial-matrix-batch-24.v1.json');
  assert.deepEqual(matrix.source_question_range, [21, 37]);
  assert.deepEqual(matrix.source_pages, [80, 89]);
  assert.equal(matrix.source_id, 'prf_pdf_8283a4d35d2b');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 17);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 25 cobre modo indicativo sem misturar a seção seguinte', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-25.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula04-indicative-editorial-matrix-batch-25.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-25.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s03_tempos_e_mo');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula04-indicative-editorial-matrix-batch-25.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 18]);
  assert.deepEqual(matrix.source_pages, [90, 102]);
  assert.equal(matrix.source_id, 'prf_pdf_8283a4d35d2b');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 18);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 26 fecha tempos e modos com vinte matrizes verbais', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-26.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula04-final-verbal-editorial-matrix-batch-26.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-26.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t04_s03_tempos_e_mo');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula04-final-verbal-editorial-matrix-batch-26.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [103, 113]);
  assert.equal(matrix.source_id, 'prf_pdf_8283a4d35d2b');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 27 inicia classes de palavras com vinte matrizes de pronomes', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-27.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula03-pronouns-editorial-matrix-batch-27.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-27.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t05_s01_classes_de_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula03-pronouns-editorial-matrix-batch-27.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [37, 49]);
  assert.equal(matrix.source_id, 'prf_pdf_4027ab525b8d');
  assert.ok(course.sources.some(({ id }) => id === 'prf_pdf_4027ab525b8d'));
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 28 fecha pronomes sem misturar colocação pronominal', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-28.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula03-final-pronouns-editorial-matrix-batch-28.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-28.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t05_s01_classes_de_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula03-final-pronouns-editorial-matrix-batch-28.v1.json');
  assert.deepEqual(matrix.source_question_range, [21, 37]);
  assert.deepEqual(matrix.source_pages, [49, 57]);
  assert.equal(matrix.source_id, 'prf_pdf_4027ab525b8d');
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 17);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.deepEqual(new Set(questions.map(({ correct_answer }) => correct_answer)), new Set(['C', 'E']));
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});

test('lote editorial 29 cobre substantivo adjetivo e advérbio com vinte fontes distintas', async () => {
  const [raw, matrixRaw, preview] = await Promise.all([
    readFile(path.join(root, 'production/portuguese-editorial-batch-29.v1.json'), 'utf8'),
    readFile(path.join(root, 'sources/portuguese-aula01-nouns-adjectives-adverbs-editorial-matrix-batch-29.v1.json'), 'utf8'),
    readFile(path.join(root, 'previews/portuguese-editorial-batch-29.preview.md'), 'utf8'),
  ]);
  const course = JSON.parse(raw);
  const matrix = JSON.parse(matrixRaw);
  const questions = course.question_batches.flatMap(({ questions: items }) => items);
  assert.equal(course.edital_map[0].subtopic_id, 'prf_2026_policial_rodoviario_federal_d01_t05_s01_classes_de_');
  assert.equal(course.metadata.editorial_source_matrix, 'sources/portuguese-aula01-nouns-adjectives-adverbs-editorial-matrix-batch-29.v1.json');
  assert.deepEqual(matrix.source_question_range, [1, 20]);
  assert.deepEqual(matrix.source_pages, [80, 105]);
  assert.equal(matrix.source_id, 'prf_pdf_6676bb9418a2');
  assert.ok(course.sources.some(({ id }) => id === 'prf_pdf_6676bb9418a2'));
  assert.equal(matrix.items.length, 20);
  assert.equal(new Set(matrix.items.map(({ source_question_number }) => source_question_number)).size, 20);
  assert.equal(course.microknowledges.length, 10);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ statement }) => statement)).size, 20);
  assert.equal(questions.filter(({ correct_answer }) => correct_answer === 'C').length, 10);
  assert.equal(questions.filter(({ correct_answer }) => correct_answer === 'E').length, 10);
  assert.ok(questions.every(({ explanation }) => explanation.length >= 150));
  assert.ok(matrix.items.every(({ source_text_stored, source_statement_stored, commercial_copy_authorized }) =>
    source_text_stored === false && source_statement_stored === false && commercial_copy_authorized === false));
  assert.equal((preview.match(/^## Texto [A-Z]$/gm) || []).length, 5);
  assert.equal((preview.match(/^### Questão \d{2}$/gm) || []).length, 20);
  assert.equal((preview.match(/\*\*Comentário didático:\*\*/g) || []).length, 20);
  assert.doesNotMatch(`${raw}\n${matrixRaw}\n${preview}`, /09880248457|thallysson/i);
  const validation = await validateAssistedCoursePackage(course, {
    uploadedSources: course.sources.filter(({ file_name: name }) => name).map(({ file_name: name }) => ({ file_name: name, status: 'uploaded' })),
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.coverage.microknowledge_question_pct, 100);
});
