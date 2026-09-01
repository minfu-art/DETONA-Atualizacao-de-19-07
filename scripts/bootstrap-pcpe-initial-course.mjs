#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const workspaceRoot = path.resolve(repoRoot, '..');
const sourceRoot = path.join(workspaceRoot, 'DETONA-PCPE-agent-foundation/course-drafts/pc-pe-2026-agente');
const sourceBundle = path.join(sourceRoot, 'course-bundle');
const targetRoot = path.join(repoRoot, 'course-packages/pc-pe-2026-agente');
const factorySourcePath = path.join(targetRoot, 'factory/source/pcpe-authorial-seed.json');
const officialEditalSourceId = 'pc_pe_2023_edital_abertura';
const shortHash = (value, size = 14) => createHash('sha256').update(String(value)).digest('hex').slice(0, size);
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const [contestDoc, curriculumDoc, seedBatch] = await Promise.all([
  readJson(path.join(sourceBundle, 'contest.json')),
  readJson(path.join(sourceBundle, 'curriculum.json')),
  readJson(path.join(sourceBundle, 'questions/001-pcpe-agente-banco-inicial-autoral.json')),
]);

if (contestDoc.contest?.id !== 'pc_pe_2026' || curriculumDoc.contest_id !== 'pc_pe_2026') {
  throw new Error('pcpe_source_identity_invalid');
}
if (seedBatch.questions?.length !== 100) throw new Error('pcpe_seed_count_invalid');

const editalTrace = {
  source_id: officialEditalSourceId,
  trace_status: 'missing',
  location: 'Conteúdo programático do Edital nº 1 — PCPE, de 21 de dezembro de 2023.',
  note: 'A baseline oficial está identificada, mas página e excerto individualizados ainda não foram catalogados neste pacote.',
};
const legalTrace = (sourceId) => ({
  source_id: sourceId,
  trace_status: 'missing',
  location: 'Texto oficial consolidado indicado na URL da fonte.',
  note: 'A norma oficial foi identificada, mas artigo e excerto individualizados ainda exigem registro editorial antes de nova atualização normativa.',
});

const nodes = [];
const nodeById = new Map();
function addNode(source, parentId, type, title, description = '') {
  const node = {
    id: source.id,
    parent_id: parentId,
    type,
    title,
    description,
    order: Number(source.order || 0),
    confidence: 1,
    traces: [editalTrace],
  };
  nodes.push(node);
  nodeById.set(node.id, node);
}

for (const role of curriculumDoc.roles || []) {
  addNode(role, null, 'role', role.name, 'Cargo estruturado pela baseline oficial pré-edital da PC PE.');
  for (const discipline of role.disciplines || []) {
    addNode(discipline, role.id, 'discipline', discipline.name);
    for (const topic of discipline.topics || []) {
      addNode(topic, discipline.id, 'topic', topic.name);
      for (const subtopic of topic.subtopics || []) addNode(subtopic, topic.id, 'subtopic', subtopic.name);
    }
  }
}

function ancestors(subtopicId) {
  let node = nodeById.get(subtopicId);
  const result = { discipline: null, topic: null };
  while (node?.parent_id) {
    node = nodeById.get(node.parent_id);
    if (node?.type === 'topic') result.topic = node;
    if (node?.type === 'discipline') { result.discipline = node; break; }
  }
  return result;
}

const sources = [
  { id: officialEditalSourceId, source_type: 'official', category: 'edital', title: 'Edital nº 1 — PCPE, de 21 de dezembro de 2023', availability: 'external_reference', url: 'https://cdn.cebraspe.org.br/concursos/PC_PE_23/arquivos/ED_1_2023_PC_PE_ABERTURA.PDF' },
  { id: 'br_constituicao_1988_compilada', source_type: 'complementary', category: 'legislacao', title: 'Constituição da República Federativa do Brasil de 1988 — texto compilado', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm' },
  { id: 'br_codigo_penal_compilado', source_type: 'complementary', category: 'legislacao', title: 'Decreto-Lei nº 2.848/1940 — Código Penal, texto compilado', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm' },
  { id: 'br_codigo_processo_penal_compilado', source_type: 'complementary', category: 'legislacao', title: 'Decreto-Lei nº 3.689/1941 — Código de Processo Penal, texto compilado', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm' },
  { id: 'br_lei_8429_1992_compilada', source_type: 'complementary', category: 'legislacao', title: 'Lei nº 8.429/1992 — Improbidade Administrativa, texto compilado', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8429.htm' },
  { id: 'br_lei_12850_2013_compilada', source_type: 'complementary', category: 'legislacao', title: 'Lei nº 12.850/2013 — Organizações criminosas, texto compilado', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12850.htm' },
  { id: 'br_lei_13869_2019', source_type: 'complementary', category: 'legislacao', title: 'Lei nº 13.869/2019 — Abuso de Autoridade', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13869.htm' },
  { id: 'br_lei_9455_1997', source_type: 'complementary', category: 'legislacao', title: 'Lei nº 9.455/1997 — Crimes de tortura', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/leis/l9455.htm' },
  { id: 'br_lei_7960_1989', source_type: 'complementary', category: 'legislacao', title: 'Lei nº 7.960/1989 — Prisão temporária', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/leis/l7960.htm' },
  { id: 'br_lei_9099_1995', source_type: 'complementary', category: 'legislacao', title: 'Lei nº 9.099/1995 — Juizados Especiais', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/leis/l9099.htm' },
  { id: 'br_lei_12830_2013', source_type: 'complementary', category: 'legislacao', title: 'Lei nº 12.830/2013 — Investigação criminal conduzida pelo delegado de polícia', availability: 'external_reference', url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12830.htm' },
].map((source) => ({ file_name: '', page_count: null, sha256: '', ...source }));

function sourceIdFor(question, disciplineTitle) {
  const text = `${question.statement} ${question.explanation}`;
  if (/12\.850/.test(text)) return 'br_lei_12850_2013_compilada';
  if (/13\.869/.test(text)) return 'br_lei_13869_2019';
  if (/9\.455/.test(text)) return 'br_lei_9455_1997';
  if (/7\.960/.test(text)) return 'br_lei_7960_1989';
  if (/9\.099/.test(text)) return 'br_lei_9099_1995';
  if (/12\.830/.test(text)) return 'br_lei_12830_2013';
  if (/improbidade/i.test(text)) return 'br_lei_8429_1992_compilada';
  if (/Constitucional/.test(disciplineTitle)) return 'br_constituicao_1988_compilada';
  if (/Direito Penal$/.test(disciplineTitle)) return 'br_codigo_penal_compilado';
  if (/Processual Penal/.test(disciplineTitle)) return 'br_codigo_processo_penal_compilado';
  if (/Direito Administrativo/.test(disciplineTitle)) return 'br_constituicao_1988_compilada';
  return officialEditalSourceId;
}

function microknowledgeTitle(question, index) {
  const first = String(question.explanation || '').split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '').trim();
  const title = first.length >= 12 ? first : String(question.statement || '').replace(/[.!?]+$/, '').trim();
  return `${title.slice(0, 150)}${title.length > 150 ? '…' : ''} — item ${String(index + 1).padStart(3, '0')}`;
}

const microknowledges = [];
const seedQuestions = seedBatch.questions.map((question, index) => {
  const { discipline } = ancestors(question.subtopic_id);
  if (!discipline) throw new Error(`seed_subtopic_without_discipline:${question.id}`);
  const sourceId = sourceIdFor(question, discipline.title);
  const microknowledgeId = `pc_pe_2026_agente_mk_${shortHash(`${question.subtopic_id}:${question.statement}`, 16)}`;
  const trace = sourceId === officialEditalSourceId ? editalTrace : legalTrace(sourceId);
  const correctedQuestion = question.statement.startsWith('A organização criminosa pressupõe')
    ? {
        ...question,
        statement: 'A organização criminosa pressupõe associação estruturalmente ordenada de quatro ou mais pessoas, com divisão de tarefas e objetivo de obter vantagem mediante infrações penais cujas penas máximas sejam superiores a quatro anos, ou que tenham caráter transnacional.',
        explanation: 'A afirmação reúne os elementos do conceito legal do art. 1º, § 1º, da Lei nº 12.850/2013.',
      }
    : question.statement.startsWith('A investigação criminal conduzida pelo delegado')
      ? {
          ...question,
          statement: 'O delegado de polícia pode ser removido sem ato fundamentado, pois a investigação criminal por ele conduzida não possui natureza jurídica.',
          explanation: 'A Lei nº 12.830/2013 reconhece natureza jurídica, essencial e exclusiva de Estado às funções de polícia judiciária e à apuração de infrações penais, além de exigir ato fundamentado para a remoção do delegado.',
        }
      : question;
  microknowledges.push({
    id: microknowledgeId,
    subtopic_id: question.subtopic_id,
    title: microknowledgeTitle(correctedQuestion, index),
    scope_origin: sourceId === officialEditalSourceId ? 'official_baseline_editorial' : 'official_normative',
    confidence: sourceId === officialEditalSourceId ? 0.85 : 0.9,
    traces: [trace],
  });
  return {
    seed_id: question.id,
    subtopic_id: question.subtopic_id,
    microknowledge_id: microknowledgeId,
    statement: correctedQuestion.statement,
    correct_answer: question.correct_answer === true ? 'C' : 'E',
    explanation: correctedQuestion.explanation,
    trace,
  };
});

const microknowledgesBySubtopic = Map.groupBy(microknowledges, (item) => item.subtopic_id);
const editalMap = nodes.filter(({ type }) => type === 'subtopic').map((subtopic) => {
  const items = microknowledgesBySubtopic.get(subtopic.id) || [];
  const concepts = items.map(({ title }) => title.replace(/ — item \d+$/, ''));
  return {
    id: `map_${subtopic.id}`,
    subtopic_id: subtopic.id,
    scope: subtopic.title,
    essential_concepts: concepts,
    rules: [],
    exceptions: [],
    applications: [],
    competencies: items.length ? ['reconhecer', 'distinguir', 'aplicar'] : [],
    required_knowledge: concepts,
    microknowledge_ids: items.map(({ id }) => id),
    confidence: items.length ? 0.85 : 0.5,
    traces: [editalTrace],
  };
});

const course = {
  schema_version: 1,
  operation_id: 'pc-pe-2026-agente-initial-static-v1',
  course: {
    contest_id: 'pc_pe_2026',
    position_id: 'pc_pe_2026_agente_policia',
    offering_id: 'pc_pe_2026_agente',
    code: 'PC PE',
    slug: 'pc-pe-2026-agente',
    name: 'PC PE — Agente de Polícia',
    organization: 'Polícia Civil de Pernambuco',
    position: 'Agente de Polícia',
    board: 'CEBRASPE (baseline 2023/2024; novo edital pendente)',
    year: '2026',
    exam_date: null,
    exam_format: 'Pré-edital',
    description: 'Preparação pré-edital para Agente da Polícia Civil de Pernambuco, estruturada pela baseline oficial anterior e sujeita à reconciliação quando o novo edital for publicado.',
  },
};
const audit = {
  generated_at: '2026-09-01T00:00:00.000Z',
  status: 'initial_question_factory_ready',
  curriculum: {
    nodes: nodes.length,
    roles: nodes.filter(({ type }) => type === 'role').length,
    disciplines: nodes.filter(({ type }) => type === 'discipline').length,
    topics: nodes.filter(({ type }) => type === 'topic').length,
    subtopics: nodes.filter(({ type }) => type === 'subtopic').length,
  },
  microknowledges: { total: microknowledges.length, covered_subtopics: microknowledgesBySubtopic.size },
  safeguards: { sales_enabled: false, price_cents: 0, new_edital_reconciliation_required: true },
};

await Promise.all([
  writeJson(path.join(targetRoot, 'course.json'), course),
  writeJson(path.join(targetRoot, 'curriculum.json'), { nodes }),
  writeJson(path.join(targetRoot, 'microknowledge.json'), { microknowledges }),
  writeJson(path.join(targetRoot, 'edital-map.json'), { edital_map: editalMap }),
  writeJson(path.join(targetRoot, 'sources.json'), { sources }),
  writeJson(path.join(targetRoot, 'audit.json'), audit),
  writeJson(factorySourcePath, { name: 'pcpe_authorial_seed_2026_09_01', questions: seedQuestions }),
]);

console.log(JSON.stringify({ targetRoot, sourceQuestions: seedQuestions.length, ...audit }, null, 2));
