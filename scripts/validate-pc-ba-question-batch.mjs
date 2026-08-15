import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LABELS = ['A', 'B', 'C', 'D', 'E'];
const DIFFICULTY_TARGET = Object.freeze({ facil: 6, intermediaria: 10, dificil: 4 });

function error(errors, code, questionId = null) {
  errors.push({ code, question_id: questionId });
}

export function validateQuestionBatchV2({ batch, catalog, readiness }) {
  const errors = [];
  const warnings = [];
  if (batch.schema_version !== 'detona_question_batch_v2') error(errors, 'schema_version_invalid');
  if (batch.contest_id !== 'pc_ba_2026') error(errors, 'contest_id_invalid');
  if (batch.position_id !== 'pc_ba_2026_investigador_policia_civil') error(errors, 'position_id_invalid');
  if (batch.exam_board !== 'instituto_aocp' || batch.question_type !== 'multiple_choice') error(errors, 'exam_format_invalid');
  if (!Array.isArray(batch.questions) || batch.questions.length !== 20 || batch.question_count !== 20) error(errors, 'question_count_invalid');

  const sourceIds = new Set((catalog.sources || []).map(({ source_id }) => source_id));
  const readinessById = new Map((readiness.entries || []).map((entry) => [entry.microknowledge_id, entry]));
  const ids = new Set();
  const statements = new Set();
  const sequences = new Set();
  const difficulty = { facil: 0, intermediaria: 0, dificil: 0 };

  for (const question of batch.questions || []) {
    const id = question?.question_id || null;
    if (!id || ids.has(id)) error(errors, 'question_id_missing_or_duplicate', id);
    ids.add(id);
    if (!Number.isInteger(question?.sequence) || sequences.has(question.sequence)) error(errors, 'sequence_invalid_or_duplicate', id);
    sequences.add(question.sequence);
    const normalizedStatement = String(question?.statement || '').trim().toLocaleLowerCase('pt-BR');
    if (normalizedStatement.length < 20 || statements.has(normalizedStatement)) error(errors, 'statement_invalid_or_duplicate', id);
    statements.add(normalizedStatement);
    const options = Array.isArray(question?.options) ? question.options : [];
    if (options.length !== 5 || options.map(({ label }) => label).join('') !== LABELS.join('')) error(errors, 'options_invalid', id);
    if (!LABELS.includes(question?.correct_option)) error(errors, 'correct_option_invalid', id);
    if (!Object.hasOwn(difficulty, question?.difficulty)) error(errors, 'difficulty_invalid', id);
    else difficulty[question.difficulty] += 1;
    const analyses = question?.explanation?.option_analysis || {};
    if (LABELS.some((label) => String(analyses[label] || '').trim().length < 5)) error(errors, 'option_analysis_incomplete', id);
    const readinessEntry = readinessById.get(question?.primary_microknowledge_id);
    if (!readinessEntry || readinessEntry.authoring_allowed !== true) error(errors, 'primary_microknowledge_not_authorized', id);
    else {
      if (readinessEntry.topic_id !== batch.topic_id) error(errors, 'microknowledge_topic_mismatch', id);
      if (readinessEntry.subtopic_id !== batch.subtopic_id) error(errors, 'microknowledge_subtopic_mismatch', id);
    }
    for (const secondaryId of question?.secondary_microknowledge_ids || []) {
      const secondary = readinessById.get(secondaryId);
      if (!secondary || secondary.authoring_allowed !== true) error(errors, 'secondary_microknowledge_not_authorized', id);
    }
    if (!Array.isArray(question?.source_references) || !question.source_references.length) error(errors, 'source_reference_missing', id);
    for (const reference of question?.source_references || []) {
      if (!sourceIds.has(reference.source_id)) error(errors, 'source_reference_unknown', id);
    }
  }

  for (const [level, expected] of Object.entries(DIFFICULTY_TARGET)) {
    if (difficulty[level] !== expected) error(errors, `difficulty_distribution_${level}_invalid`);
  }
  if ((batch.questions || []).some(({ status }) => !['rascunho_revisar', 'revisado_com_pendencias'].includes(status))) {
    warnings.push('Lote piloto deve permanecer em revisão até aprovação editorial humana.');
  }
  return { valid: errors.length === 0, count: batch.questions?.length || 0, difficulty, errors, warnings };
}

export async function validateQuestionBatchFiles({ batchPath, catalogPath, readinessPath }) {
  const [batch, catalog, readiness] = await Promise.all([batchPath, catalogPath, readinessPath]
    .map(async (file) => JSON.parse(await readFile(path.resolve(file), 'utf8'))));
  return validateQuestionBatchV2({ batch, catalog, readiness });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [batchPath, catalogPath, readinessPath] = process.argv.slice(2);
  if (!batchPath || !catalogPath || !readinessPath) throw new Error('Informe batch, catálogo e readiness.');
  const report = await validateQuestionBatchFiles({ batchPath, catalogPath, readinessPath });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}
