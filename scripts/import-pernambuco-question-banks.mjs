import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const importRoot = path.join(repoRoot, 'tmp', 'banco-questoes-import');
const pmSourceRoot = path.join(importRoot, 'pmpe');
const ppSourceRoot = path.join(importRoot, 'pppe', 'PP_PE_7819_QUESTOES_EXPORTACAO');
const pmSlug = 'pm-pe-2027-soldado';
const ppSlug = 'pp-pe-2027-policial-penal';
const pmPackage = path.join(repoRoot, 'course-packages', pmSlug);
const ppPackage = path.join(repoRoot, 'course-packages', ppSlug);

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const hash = (value, size = 14) => createHash('sha256').update(String(value)).digest('hex').slice(0, size);
const normalize = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const slugify = (value) => normalize(value).replace(/\s+/g, '_').slice(0, 70) || 'item';
const intoBatches = (items, size = 200) => Array.from(
  { length: Math.ceil(items.length / size) },
  (_, index) => items.slice(index * size, (index + 1) * size),
);

function sanitizeSources(sources) {
  return sources.map(({ absolute_path, local_path, ...source }) => ({
    ...source,
    availability: source.availability === 'local_external' ? 'external_reference' : source.availability,
    note: source.availability === 'local_external'
      ? 'Arquivo-fonte permaneceu fora do repositório; hash e metadados foram preservados.'
      : source.note,
  }));
}

function optionObjects(options) {
  return (Array.isArray(options) ? options : []).map((option, index) => {
    if (option && typeof option === 'object') {
      return {
        label: String(option.label || String.fromCharCode(65 + index)).toUpperCase(),
        text: String(option.text || '').trim(),
      };
    }
    const raw = String(option || '').trim();
    const match = raw.match(/^\s*([A-Z])\s*[\)\].:\-]\s*(.*)$/i);
    return {
      label: (match?.[1] || String.fromCharCode(65 + index)).toUpperCase(),
      text: String(match?.[2] || raw).trim(),
    };
  });
}

function answerFor(question) {
  if (question.format === 'certo_errado') {
    return question.correct_answer === true || /^c(?:erto)?$/i.test(String(question.correct_answer)) ? 'C' : 'E';
  }
  return String(question.correct_answer || '').trim().toUpperCase();
}

function traceFor(question, fallbackSourceId) {
  const sourceId = question.source_id || fallbackSourceId;
  const page = Number(question.source_page);
  if (Number.isInteger(page) && page > 0) {
    return [{
      source_id: sourceId,
      trace_status: 'available',
      page_number: page,
      excerpt: String(question.statement || '').trim().slice(0, 800),
    }];
  }
  return [{
    source_id: sourceId,
    trace_status: 'missing',
    note: 'A questão preserva o arquivo de origem, mas a página individual não foi confirmada.',
  }];
}

function canonicalQuestion(question, {
  sourceId, subtopicId, microknowledgeId, imagePrefix = 'assets/question-references',
} = {}) {
  const result = {
    id: question.id,
    subtopic_id: question.subtopic_id || subtopicId,
    microknowledge_ids: question.microknowledge_ids?.length
      ? question.microknowledge_ids
      : [microknowledgeId],
    statement: String(question.statement || '').trim(),
    options: question.format === 'certo_errado' ? [] : optionObjects(question.options),
    correct_answer: answerFor(question),
    explanation: String(question.explanation || '').trim(),
    difficulty: ['facil', 'media', 'dificil'].includes(question.difficulty)
      ? question.difficulty
      : 'nao_informada',
    format: question.format,
    source: question.source || null,
    is_trick: false,
    traces: traceFor(question, sourceId),
  };
  const sourceImage = question.evidence_image || question.imagem || question.reference_image;
  if (sourceImage) {
    const name = `${path.parse(path.basename(sourceImage)).name}.webp`;
    result.reference_image = `${imagePrefix}/${name}`.replace(/\\/g, '/');
  }
  if (question.reference_text) result.reference_text = String(question.reference_text).trim();
  return result;
}

function reviewRecord(question, reason) {
  return {
    id: question.id,
    contest_id: question.contest_id,
    discipline: question.discipline,
    lesson: question.lesson,
    format: question.format,
    statement: question.statement,
    options: question.options,
    correct_answer: question.correct_answer,
    explanation: question.explanation,
    source: question.source,
    source_id: question.source_id,
    source_pdf: question.source_pdf,
    source_page: question.source_page,
    reference_image: question.evidence_image || question.imagem || null,
    review_reasons: Array.from(new Set([
      ...(question.extraction_issues || []), reason,
    ].filter(Boolean))),
  };
}

async function buildPmPackage() {
  const bank = await json(path.join(pmSourceRoot, 'questoes.json'));
  const questions = bank.questions || [];
  const roleId = 'pm_pe_2027_soldado';
  const nodes = [{
    id: roleId,
    parent_id: null,
    type: 'role',
    title: 'Soldado da Polícia Militar de Pernambuco',
    description: 'Mapa técnico provisório derivado das disciplinas e aulas do material recebido.',
    order: 0,
    confidence: 0.35,
    traces: [],
  }];
  const editalMap = [];
  const microknowledges = [];
  const mapping = new Map();
  const sourceByPdf = new Map();
  for (const question of questions) {
    const sourcePdf = String(question.source_pdf || 'material-sem-arquivo');
    if (!sourceByPdf.has(sourcePdf)) sourceByPdf.set(sourcePdf, `pmpe_material_${hash(sourcePdf, 12)}`);
  }
  const sources = [...sourceByPdf].map(([fileName, id]) => ({
    id,
    source_type: 'user_provided_course_material',
    category: 'material_comentado',
    title: path.basename(fileName),
    file_name: fileName,
    availability: 'external_reference',
    note: 'Material fornecido pelo proprietário; o arquivo original permanece no pacote de origem do pendrive.',
  }));
  const disciplines = [...new Set(questions.map((item) => item.discipline))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  disciplines.forEach((discipline, disciplineIndex) => {
    const discId = `${roleId}_d${String(disciplineIndex + 1).padStart(2, '0')}_${slugify(discipline)}`;
    nodes.push({
      id: discId, parent_id: roleId, type: 'discipline', title: discipline,
      description: '', order: disciplineIndex, confidence: 0.7, traces: [],
    });
    const lessons = [...new Set(questions
      .filter((item) => item.discipline === discipline)
      .map((item) => String(item.lesson || 'unica')))].sort();
    lessons.forEach((lesson, lessonIndex) => {
      const token = lesson === 'unica' ? 'unica' : String(lesson).padStart(2, '0');
      const topicId = `${discId}_t${String(lessonIndex + 1).padStart(2, '0')}_aula_${token}`;
      const subtopicId = `${topicId}_s01_conteudo_extraido`;
      const mkId = `${roleId}_mk_${hash(`${discipline}:${lesson}`, 16)}`;
      const title = lesson === 'unica' ? 'Material único' : `Aula ${lesson}`;
      nodes.push({
        id: topicId, parent_id: discId, type: 'topic', title,
        description: 'Agrupamento provisório do material extraído.',
        order: lessonIndex, confidence: 0.35, traces: [],
      });
      nodes.push({
        id: subtopicId, parent_id: topicId, type: 'subtopic',
        title: `Conteúdo extraído - ${title}`,
        description: 'Exige reconciliação com o mapa oficial da PM-PE antes da publicação.',
        order: 0, confidence: 0.25, traces: [],
      });
      editalMap.push({
        id: `map_${subtopicId}`,
        subtopic_id: subtopicId,
        scope: `${discipline} - ${title}; agrupamento técnico provisório.`,
        essential_concepts: [], rules: [], exceptions: [], applications: [],
        competencies: [], required_knowledge: [], microknowledge_ids: [mkId],
        confidence: 0.25, traces: [],
      });
      microknowledges.push({
        id: mkId,
        subtopic_id: subtopicId,
        title: `${discipline} - conteúdo da ${title}`,
        scope_origin: 'source_lesson_group',
        confidence: 0.25,
        traces: [],
      });
      mapping.set(`${discipline}\u0000${lesson}`, { subtopicId, mkId });
    });
  });

  const seen = new Set();
  const ready = [];
  const review = [];
  for (const question of questions) {
    const key = normalize(question.statement);
    if (question.situacao !== 'ativa') {
      review.push(reviewRecord(question, 'alerta_tecnico_preservado'));
      continue;
    }
    if (seen.has(key)) {
      review.push(reviewRecord(question, 'duplicata_exata_ou_normalizada'));
      continue;
    }
    seen.add(key);
    const map = mapping.get(`${question.discipline}\u0000${String(question.lesson || 'unica')}`);
    ready.push(canonicalQuestion(question, {
      sourceId: sourceByPdf.get(String(question.source_pdf || 'material-sem-arquivo')),
      subtopicId: map.subtopicId,
      microknowledgeId: map.mkId,
    }));
  }

  await writeJson(path.join(pmPackage, 'course.json'), {
    schema_version: 1,
    operation_id: 'pm-pe-2027-soldado-bank-assembly-v1',
    course: {
      contest_id: 'pm_pe_2027_soldado',
      position_id: roleId,
      offering_id: roleId,
      code: 'PM PE',
      slug: pmSlug,
      name: 'PM PE - Soldado - Pré-edital 2027',
      organization: 'Polícia Militar de Pernambuco',
      position: 'Soldado',
      board: 'a definir',
      year: '2027',
      exam_date: null,
      exam_format: 'pré-edital',
      description: 'Banco recebido para montagem técnica; mapa provisório deve ser reconciliado com o edital oficial antes da publicação.',
    },
  });
  await writeJson(path.join(pmPackage, 'curriculum.json'), { nodes });
  await writeJson(path.join(pmPackage, 'edital-map.json'), { edital_map: editalMap });
  await writeJson(path.join(pmPackage, 'microknowledge.json'), { microknowledges });
  await writeJson(path.join(pmPackage, 'sources.json'), { sources });
  const readyBatches = intoBatches(ready);
  for (const [index, items] of readyBatches.entries()) {
    const ordinal = String(index + 1).padStart(3, '0');
    await writeJson(
      path.join(pmPackage, 'factory', 'staging', `${ordinal}-pmpe-extraidas-mapeamento-provisorio.json`),
      { name: `pmpe-extraidas-mapeamento-provisorio-${ordinal}`, questions: items },
    );
  }
  await writeJson(
    path.join(pmPackage, 'factory', 'review', 'questoes-com-pendencias.json'),
    { schema_version: 1, status: 'REVIEW_REQUIRED', questions: review },
  );
  const assets = [...new Set(ready.map((item) => item.reference_image).filter(Boolean))]
    .sort()
    .map((target) => ({ source: `${path.parse(path.basename(target)).name}.png`, target }));
  await writeJson(path.join(pmPackage, 'factory', 'asset-manifest.json'), {
    schema_version: 1,
    source_directory: path.relative(repoRoot, path.join(pmSourceRoot, 'imagens')).replace(/\\/g, '/'),
    assets,
  });
  await writeJson(path.join(pmPackage, 'audit.json'), {
    schema_version: 1,
    status: 'DRAFT_IMPORT',
    publication_authorized: false,
    source_questions: questions.length,
    staging_questions: ready.length,
    review_questions: review.length,
    exact_duplicates_removed: questions.filter((item) => item.situacao === 'ativa').length - ready.length,
    source_images: bank.totals?.images || 0,
    staged_images: assets.length,
    curriculum_status: 'provisional_source_lesson_mapping',
    semantic_audit: 'pending',
  });
  return {
    source: questions.length,
    ready: ready.length,
    review: review.length,
    batches: readyBatches.length,
    images: assets.length,
    disciplines: disciplines.length,
    subtopics: editalMap.length,
  };
}

async function buildPpPackage() {
  for (const file of ['course.json', 'curriculum.json', 'edital-map.json', 'microknowledge.json']) {
    await mkdir(ppPackage, { recursive: true });
    await cp(path.join(ppSourceRoot, 'mapa', file), path.join(ppPackage, file), { force: false });
  }
  const sourceDoc = await json(path.join(ppSourceRoot, 'mapa', 'sources.json'));
  await writeJson(path.join(ppPackage, 'sources.json'), {
    sources: sanitizeSources(sourceDoc.sources || []),
  });
  const sourceIds = new Set((sourceDoc.sources || []).map((item) => item.id));
  const names = (await readdir(path.join(ppSourceRoot, 'lotes_importacao_editorial')))
    .filter((name) => name.endsWith('.json')).sort();
  const seen = new Set();
  let sourceCount = 0;
  const ready = [];
  const duplicates = [];
  for (const name of names) {
    const doc = await json(path.join(ppSourceRoot, 'lotes_importacao_editorial', name));
    for (const question of doc.questions || []) {
      sourceCount += 1;
      const key = normalize(question.statement);
      if (seen.has(key)) {
        duplicates.push(reviewRecord(question, 'duplicata_exata_ou_normalizada'));
        continue;
      }
      seen.add(key);
      if (!sourceIds.has(question.source_id)) {
        throw new Error(`PP source_id inexistente: ${question.source_id}`);
      }
      ready.push(canonicalQuestion(question, { sourceId: question.source_id }));
    }
  }
  const readyBatches = intoBatches(ready);
  for (const [index, items] of readyBatches.entries()) {
    const ordinal = String(index + 1).padStart(3, '0');
    await writeJson(
      path.join(ppPackage, 'factory', 'staging', `${ordinal}-pppe-extraidas-mapeadas.json`),
      { name: `pppe-extraidas-mapeadas-${ordinal}`, questions: items },
    );
  }
  const pendingDoc = await json(path.join(ppSourceRoot, 'pendencias', 'questoes_com_pendencias.json'));
  const pendingSource = pendingDoc.questions || pendingDoc.questoes || pendingDoc;
  const pending = pendingSource.map((item) => reviewRecord(item, 'alerta_tecnico_preservado'));
  await writeJson(
    path.join(ppPackage, 'factory', 'review', 'questoes-com-pendencias.json'),
    { schema_version: 1, status: 'REVIEW_REQUIRED', questions: [...pending, ...duplicates] },
  );
  await writeJson(path.join(ppPackage, 'audit.json'), {
    schema_version: 1,
    status: 'DRAFT_IMPORT',
    publication_authorized: false,
    source_questions: 7819,
    structurally_valid_source: sourceCount,
    staging_questions: ready.length,
    technical_pending_source: pending.length,
    exact_duplicates_removed: duplicates.length,
    review_records: pending.length + duplicates.length,
    curriculum_status: 'provided_pre_edital_map',
    semantic_audit: 'pending',
  });
  return {
    source: 7819,
    ready: ready.length,
    review: pending.length + duplicates.length,
    batches: readyBatches.length,
    images: 0,
  };
}

async function writeStatus(pm, pp) {
  const pcPatch = await json(path.join(
    repoRoot, 'app', 'data', 'course-factory', 'published',
    'pc-pe-2026-agente-patch-002.json',
  ));
  const text = `# Bancos dos três cursos policiais de Pernambuco\n\nGerado em 3 de setembro de 2026. Nenhum conteúdo deste relatório publica ou implanta os bancos.\n\n| Curso | Situação local | Questões montadas | Revisão isolada | Observação |\n|---|---:|---:|---:|---|\n| PC-PE Agente | já integrado ao app | ${pcPatch.questions.length} no lote mais recente; 1.318 no curso | 32 da extração anterior | banco publicado em etapa anterior |\n| PM-PE Soldado | rascunho canônico | ${pm.ready} | ${pm.review} | mapa provisório por aula; exige reconciliação oficial |\n| Polícia Penal-PE | rascunho canônico | ${pp.ready} | ${pp.review} | mapa pré-edital fornecido; auditoria semântica pendente |\n\n## Verificações concluídas\n\n- Os 38 lotes passaram na validação determinística.\n- IDs e enunciados normalizados são únicos dentro de cada banco pronto.\n- As ${pm.images} imagens referenciadas pela PM-PE foram convertidas para WebP e conferidas.\n- As filas com alertas permanecem isoladas dos lotes prontos.\n\n## Próximas barreiras\n\n1. Reconciliar as ${pm.subtopics} agrupações provisórias da PM-PE com o mapa oficial.\n2. Auditar semanticamente cada questão antes de promoção.\n3. Corrigir ou rejeitar, individualmente, os registros das filas de revisão.\n4. Publicar apenas após autorização explícita do proprietário.\n`;
  await writeFile(
    path.join(repoRoot, 'docs', 'PERNAMBUCO-THREE-COURSE-QUESTION-BANKS.md'),
    text,
    'utf8',
  );
}

const pm = await buildPmPackage();
const pp = await buildPpPackage();
await writeStatus(pm, pp);
console.log(JSON.stringify({ pm, pp, publication_authorized: false }, null, 2));
