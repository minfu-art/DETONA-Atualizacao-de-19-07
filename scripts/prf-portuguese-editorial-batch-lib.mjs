import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('course-drafts/prf-pre-edital');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

export async function buildPortugueseEditorialBatch(config) {
  const [base, curriculum, ingestion] = await Promise.all([
    readJson('production/portuguese-editorial-batch-01.v1.json'),
    readJson('course-bundle/curriculum.json'),
    readJson('sources/source-ingestion-report.v1.json'),
  ]);
  const discipline = curriculum.roles[0].disciplines.find(({ name }) => name === 'Língua Portuguesa');
  const subtopic = discipline.topics.flatMap(({ subtopics }) => subtopics).find(({ name }) => name === config.subtopic);
  const topic = discipline.topics.find(({ subtopics }) => subtopics.some(({ id }) => id === subtopic.id));
  const source = ingestion.sources.find(({ source_id }) => source_id === config.sourceId);
  const baseTrace = [...base.curriculum.nodes[0].traces, {
    source_id: source.source_id, trace_status: 'available', page_number: config.pages[0],
    excerpt: `Matriz agregada das questões ${config.range[0]}-${config.range[1]}, páginas ${config.pages[0]}-${config.pages[1]}: padrões cognitivos sem cópia textual`,
  }];
  const matrix = config.matrix.map(([source_question_number,page,exam,skill,cognitive_operation,trap]) => ({
    source_question_number, page, exam, skill, cognitive_operation, trap,
    source_text_stored: false, source_statement_stored: false, commercial_copy_authorized: false,
  }));
  const microByKey = new Map(config.microDefinitions.map(([key,title], index) => [key, {
    id: `prf_d01_${config.slug}_mk_${String(index + 1).padStart(2,'0')}`,
    subtopic_id: subtopic.id, title, scope_origin: 'official', confidence: 0.97, traces: baseTrace,
  }]));
  const questions = config.specs.map(([textKey,microKey,claim,answer,explanation], index) => ({
    id: `prf_port_editorial_${config.slug}_${String(index + 1).padStart(2,'0')}`,
    subtopic_id: subtopic.id, microknowledge_ids: [microByKey.get(microKey).id],
    statement: `TEXTO ${textKey.toUpperCase()}\n${config.texts[textKey]}\n\nJulgue o item: ${claim}`,
    options: [], correct_answer: answer, explanation,
    difficulty: index < 5 ? 'facil' : index < 13 ? 'media' : 'dificil',
    format: 'certo_errado', source: `Autoral DETONA - Lote editorial PRF Português ${String(config.batch).padStart(2,'0')}`,
    is_trick: answer === 'E', traces: baseTrace,
  }));
  if (matrix.length !== 20 || questions.length !== 20) throw new Error('Cada ciclo deve conter exatamente 20 matrizes e 20 questões.');
  const curriculumNodes = [
    { source: curriculum.roles[0], parent_id: null, type: 'role' },
    { source: discipline, parent_id: curriculum.roles[0].id, type: 'discipline' },
    { source: topic, parent_id: discipline.id, type: 'topic' },
    { source: subtopic, parent_id: topic.id, type: 'subtopic' },
  ].map(({ source: node, parent_id, type }) => ({
    id: node.id, parent_id, type, title: node.name, description: node.description ?? '',
    order: node.order, confidence: 1, traces: baseTrace,
  }));
  const payload = {
    ...base, operation_id: `prf-2026-portugues-editorial-batch-${String(config.batch).padStart(2,'0')}-v1`,
    curriculum: { nodes: curriculumNodes },
    microknowledges: [...microByKey.values()],
    edital_map: [{
      id: `map_${subtopic.id}_${config.slug}`, subtopic_id: subtopic.id, scope: config.scope,
      essential_concepts: config.microDefinitions.map(([,title]) => title), rules: config.rules,
      exceptions: ['Sem extrapolar informação ausente'], applications: [`${Object.keys(config.texts).length} textos autorais progressivos`],
      competencies: ['localizar', 'inferir', 'comparar', 'julgar item C/E'], required_knowledge: [],
      microknowledge_ids: [...microByKey.values()].map(({ id }) => id), confidence: 0.97, traces: baseTrace,
    }],
    question_batches: [{ name: `portugues-editorial-${config.slug}`, questions }],
    metadata: {
      ...base.metadata, generated_at: new Date().toISOString(), editorial_status: `batch_${String(config.batch).padStart(2,'0')}_pending_human_review`,
      coverage_status: 'incremental_editorial_batches_of_20', canonical_subtopics_covered: 1,
      microknowledge_count: microByKey.size, question_count: 20,
      editorial_source_matrix: `sources/portuguese-aula13-editorial-matrix-batch-${String(config.batch).padStart(2,'0')}.v1.json`,
      publication_blocked: true, import_blocked: true,
    },
  };
  const batchNumber = String(config.batch).padStart(2,'0');
  await mkdir(path.join(root, 'previews'), { recursive: true });
  await writeFile(path.join(root, 'production', `portuguese-editorial-batch-${batchNumber}.v1.json`), `${JSON.stringify(payload,null,2)}\n`, 'utf8');
  await writeFile(path.join(root, 'sources', `portuguese-aula13-editorial-matrix-batch-${batchNumber}.v1.json`), `${JSON.stringify({
    schema_version: 'detona_editorial_source_matrix_v1', source_id: source.source_id, source_file: source.file_name,
    source_pages: config.pages, source_question_range: config.range, purpose: 'internal_pattern_analysis_for_authorial_question_creation',
    copyright_safety: { source_text_stored: false, source_statements_stored: false, source_answers_stored: false }, items: matrix,
  },null,2)}\n`, 'utf8');
  const preview = [`# Preview editorial - PRF Português - Lote ${batchNumber}`,'',
    '> Documento de revisão humana. Nada deste lote está importado ou publicado.','',
    `**Subtópico:** ${subtopic.name}  `,'**Questões:** 20  ',`**Microconhecimentos:** ${microByKey.size}  `,
    '**Formato:** CEBRASPE - Certo ou Errado',''];
  let seq = 0;
  for (const textKey of Object.keys(config.texts)) {
    preview.push(`## Texto ${textKey.toUpperCase()}`,'',config.texts[textKey],'');
    for (const question of questions.filter(({ statement }) => statement.startsWith(`TEXTO ${textKey.toUpperCase()}\n`))) {
      const micro = [...microByKey.values()].find(({ id }) => id === question.microknowledge_ids[0]);
      preview.push(`### Questão ${String(++seq).padStart(2,'0')}`,'',question.statement.split('\n\nJulgue o item: ')[1],'',
        `- **Gabarito:** ${question.correct_answer === 'C' ? 'CERTO' : 'ERRADO'}`,
        `- **Dificuldade:** ${question.difficulty}`,`- **Microconhecimento:** ${micro.title}`,'',
        `**Comentário didático:** ${question.explanation}`,'');
    }
  }
  await writeFile(path.join(root, 'previews', `portuguese-editorial-batch-${batchNumber}.preview.md`), `${preview.join('\n')}\n`, 'utf8');
  return { batch: config.batch, matrix: config.range.join('-'), microknowledges: microByKey.size, questions: 20 };
}
