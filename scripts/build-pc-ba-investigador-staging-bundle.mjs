import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function renderExplanation(explanation) {
  return [
    explanation.summary,
    `Análise da resposta: ${explanation.correct_option_analysis}`,
    ...['A', 'B', 'C', 'D', 'E'].map((label) => `${label}: ${explanation.option_analysis[label]}`),
    `Armadilha: ${explanation.trap}`,
    `Conhecimento adicional: ${explanation.added_knowledge}`,
    `Aprendizado essencial: ${explanation.learning_takeaway}`,
  ].join('\n\n');
}

export function buildStagingArtifacts({ canonical, authoringBatch }) {
  const contest = {
    schema_version: 1,
    operation_id: 'pc-ba-investigador-foundation-20260815-001',
    contest: {
      id: 'pc_ba_2026',
      code: 'PCBA-INV',
      slug: 'pc-ba-2026-investigador',
      name: canonical.curriculum.contest_name,
      role: canonical.position_name,
      description: 'Preparação para Investigador de Polícia Civil da Bahia, estruturada pelo edital SAEB nº 02/2026 e pelo mapa DETONA de microconhecimentos.',
      content_status: 'preparing',
      sales_status: 'unavailable',
      price_cents: 0,
      currency: 'BRL',
      exam_date: '2026-12-06',
      color: '#24104f',
      accent: '#37d6ff',
      icon: 'PCBA',
      cover_asset: 'cover.png',
    },
  };

  const curriculum = {
    schema_version: 1,
    contest_id: canonical.contest_id,
    roles: [{
      id: canonical.position_id,
      name: canonical.position_name,
      description: `Cargo ${canonical.position_code} do edital SAEB nº 02/2026.`,
      order: 0,
      disciplines: canonical.curriculum.disciplines.map((discipline, disciplineIndex) => ({
        id: discipline.discipline_id,
        name: discipline.name,
        order: discipline.order_index ?? disciplineIndex,
        topics: discipline.topics.map((topic, topicIndex) => ({
          id: topic.topic_id,
          name: topic.name,
          order: topic.order_index ?? topicIndex,
          subtopics: topic.subtopics.map((subtopic, subtopicIndex) => ({
            id: subtopic.subtopic_id,
            name: subtopic.name,
            order: subtopic.order_index ?? subtopicIndex,
          })),
        })),
      })),
    }],
  };

  const questions = {
    name: authoringBatch.batch_id,
    questions: authoringBatch.questions.map((question) => ({
      id: question.question_id,
      contest_id: authoringBatch.contest_id,
      subtopic_id: authoringBatch.subtopic_id,
      discipline_id: authoringBatch.discipline_id,
      topic_id: authoringBatch.topic_id,
      primary_microknowledge_id: question.primary_microknowledge_id,
      secondary_microknowledge_ids: question.secondary_microknowledge_ids,
      pedagogical_role: question.pedagogical_role,
      competence: question.competence,
      reasoning_type: question.reasoning_type,
      format: 'multiple_choice_a_e',
      statement: `${question.statement}\n\n${question.command}`,
      options: question.options,
      correct_answer: question.correct_option,
      explanation: renderExplanation(question.explanation),
      explanation_structured: question.explanation,
      difficulty: question.difficulty,
      source: question.source_references,
      is_trick: Boolean(question.explanation.trap),
      authoring_status: question.status,
      status: 'draft',
    })),
  };

  const learningEngine = {
    schema_version: 'detona_learning_engine_binding_v1',
    offering_id: 'pc_ba_2026_investigador',
    contest_id: canonical.contest_id,
    position_id: canonical.position_id,
    learning_engine_version: 'legacy_dynamic_compat_v1',
    target_learning_engine_version: 'knowledge_engine_v2',
    knowledge_map_version: 'knowledge-map.bound.v2',
    question_schema_version: 'detona_question_batch_v2',
    runtime_ready: true,
    staging_import_allowed: true,
    production_publication_allowed: false,
    questions_scope: 'pilot_validation_only',
    question_bank_status: 'awaiting_owner_bank',
    blockers: [
      'learning_engine_v2_runtime_not_implemented',
      'microknowledge_progress_tracking_not_implemented',
      'full_question_bank_not_imported'
    ]
  };
  return { contest, curriculum, questions, learningEngine };
}

export async function buildStagingBundle({ canonicalPath, authoringBatchPath, outputDir }) {
  const [canonical, authoringBatch] = await Promise.all([canonicalPath, authoringBatchPath]
    .map(async (file) => JSON.parse(await readFile(path.resolve(file), 'utf8'))));
  const artifacts = buildStagingArtifacts({ canonical, authoringBatch });
  const output = path.resolve(outputDir);
  await mkdir(path.join(output, 'questions'), { recursive: true });
  await mkdir(path.join(output, 'assets'), { recursive: true });
  await writeFile(path.join(output, 'contest.json'), `${JSON.stringify(artifacts.contest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'curriculum.json'), `${JSON.stringify(artifacts.curriculum, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'questions', 'lote_001.json'), `${JSON.stringify(artifacts.questions, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'learning-engine.json'), `${JSON.stringify(artifacts.learningEngine, null, 2)}\n`, 'utf8');
  return artifacts;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [canonicalPath, authoringBatchPath, outputDir] = process.argv.slice(2);
  if (!canonicalPath || !authoringBatchPath || !outputDir) throw new Error('Informe currículo, lote e saída.');
  const artifacts = await buildStagingBundle({ canonicalPath, authoringBatchPath, outputDir });
  process.stdout.write(`${JSON.stringify({
    contest_id: artifacts.contest.contest.id,
    disciplines: artifacts.curriculum.roles[0].disciplines.length,
    questions: artifacts.questions.questions.length,
    runtime_ready: artifacts.learningEngine.runtime_ready,
  })}\n`);
}
