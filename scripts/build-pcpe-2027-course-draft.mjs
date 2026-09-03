#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const sourceRoot = path.join(repositoryRoot, 'course-drafts', 'pc-pe-2026-agente');
const targetRoot = path.join(repositoryRoot, 'course-drafts', 'pc-pe-2027-agente');
const sourceBundle = path.join(sourceRoot, 'course-bundle');
const targetBundle = path.join(targetRoot, 'course-bundle');
const generatedAt = '2026-09-03';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const migrateIdentity = (value) => {
  if (Array.isArray(value)) return value.map(migrateIdentity);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, migrateIdentity(entry)]));
  }
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('pc_pe_2026', 'pc_pe_2027')
    .replaceAll('pc-pe-2026-agente', 'pc-pe-agente-2027')
    .replaceAll('pc-pe-2026', 'pc-pe-2027');
};

const [sourceContest, sourceCurriculum, sourceQuestions, sourceCatalogDocument, sourcePlan] = await Promise.all([
  readJson(path.join(sourceBundle, 'contest.json')),
  readJson(path.join(sourceBundle, 'curriculum.json')),
  readJson(path.join(sourceBundle, 'questions', '001-pcpe-agente-banco-inicial-autoral.json')),
  readJson(path.join(sourceRoot, 'sources', 'source-catalog.v1.json')),
  readJson(path.join(sourceRoot, 'master-knowledge-map-plan.v1.json')),
]);

const contestDocument = migrateIdentity(sourceContest);
contestDocument.operation_id = 'pc-pe-agente-2027-course-draft-v1';
contestDocument.contest.slug = 'pc-pe-agente-2027';
contestDocument.contest.name = 'PC PE — Agente de Polícia — Jornada 2027';
contestDocument.contest.description = 'Preparação pré-edital 2027 para Agente da Polícia Civil de Pernambuco, estruturada sobre o conteúdo programático oficial de 2023 e sujeita à reconciliação integral quando um novo edital oficial for publicado.';
contestDocument.contest.content_status = 'preparing';
contestDocument.contest.sales_status = 'unavailable';
contestDocument.contest.price_cents = 2490;
contestDocument.contest.currency = 'BRL';
contestDocument.contest.exam_date = null;
contestDocument.contest.color = '#07111f';
contestDocument.contest.accent = '#55c9ff';

const curriculum = migrateIdentity(sourceCurriculum);
const questionBatch = migrateIdentity(sourceQuestions);
questionBatch.name = 'pcpe_agente_2027_banco_inicial_autoral_001';
questionBatch.status = 'draft';
questionBatch.generated_at = generatedAt;
questionBatch.publication_authorized = false;
questionBatch.questions = questionBatch.questions.map((question) => ({
  ...question,
  source: `DETONA — questão inédita autoral; baseline PC PE 2023; revisão editorial e normativa pendente (${generatedAt})`,
  status: 'draft',
  editorial_review: 'pending',
}));

const sourceCatalog = migrateIdentity(sourceCatalogDocument);
sourceCatalog.cohort_label = '2027';
sourceCatalog.reviewed_at = generatedAt;
sourceCatalog.baseline_status = 'pre_edital_2027_using_official_2023_curriculum';
sourceCatalog.notes = [
  'A identificação 2027 representa a jornada comercial e pedagógica do DETONA, não o ano de um novo edital oficial.',
  'Até a revisão de 2026-09-03, o Edital nº 1 — PCPE, de 21 de dezembro de 2023, permanece como baseline curricular oficial adotada.',
  'Todo conteúdo normativo e dinâmico exige nova conferência antes de publicação.',
];

const role = curriculum.roles[0];
const disciplineByName = new Map(role.disciplines.map((discipline) => [discipline.name, discipline]));
const phaseSpecs = [
  {
    id: 'fase_01_base_de_execucao',
    name: 'Base de execução',
    objective: 'Criar ritmo, leitura de prova e raciocínio antes de aumentar a carga normativa.',
    disciplines: ['Língua Portuguesa', 'Raciocínio Lógico'],
  },
  {
    id: 'fase_02_nucleo_juridico',
    name: 'Núcleo jurídico policial',
    objective: 'Construir a base constitucional, administrativa, penal e processual necessária à atividade policial.',
    disciplines: ['Noções de Direito Constitucional', 'Noções de Direito Administrativo', 'Noções de Direito Penal', 'Noções de Direito Processual Penal'],
  },
  {
    id: 'fase_03_bloco_tecnico',
    name: 'Bloco técnico',
    objective: 'Consolidar informática, contabilidade e estatística com prática distribuída.',
    disciplines: ['Informática', 'Contabilidade Geral', 'Estatística'],
  },
  {
    id: 'fase_04_especifica_e_integracao',
    name: 'Legislação específica e integração',
    objective: 'Revisar legislação estadual após validação normativa e integrar o conteúdo em simulados e discursivas.',
    disciplines: ['Legislação Estadual', 'Atualidades'],
  },
];

const phases = phaseSpecs.map((phase, phaseIndex) => ({
  ...phase,
  order: phaseIndex + 1,
  disciplines: phase.disciplines.map((name, disciplineIndex) => {
    const discipline = disciplineByName.get(name);
    if (!discipline) throw new Error(`Disciplina ausente no currículo: ${name}`);
    return {
      order: disciplineIndex + 1,
      discipline_id: discipline.id,
      name,
      topics: discipline.topics.length,
      subtopics: discipline.topics.flatMap((topic) => topic.subtopics).length,
    };
  }),
}));

const questionSubtopics = new Set(questionBatch.questions.map((question) => question.subtopic_id));
const allSubtopics = role.disciplines.flatMap((discipline) => discipline.topics.flatMap((topic) => topic.subtopics));
const subtopicToDiscipline = new Map();
for (const discipline of role.disciplines) {
  for (const topic of discipline.topics) {
    for (const subtopic of topic.subtopics) subtopicToDiscipline.set(subtopic.id, discipline.name);
  }
}

const roadmap = {
  schema_version: 'detona_course_roadmap_v1',
  status: 'draft_ready_for_staging_validation',
  generated_at: generatedAt,
  identity: {
    contest_id: curriculum.contest_id,
    position_id: role.id,
    offering_id: 'pc_pe_2027_agente',
    public_slug: 'pc-pe-agente-2027',
    baseline: 'Edital nº 1 — PCPE, de 21 de dezembro de 2023',
    cohort_label: '2027',
  },
  mission_template: {
    principle: 'reduzir decisões e transformar intenção em próxima ação observável',
    blocks: [
      { order: 1, type: 'estudo_guiado', target: '1 tópico ou fragmento prioritário' },
      { order: 2, type: 'pratica_ativa', target: 'questões vinculadas ao conteúdo estudado' },
      { order: 3, type: 'feedback_e_revisao', target: 'corrigir erros, registrar confiança e agendar retorno' },
    ],
    completion_signal: 'missão concluída, progresso registrado e próxima ação preparada',
  },
  phases,
  progression_rules: [
    'Nenhuma disciplina é removida do mapa por estimativa de incidência.',
    'Questões erradas e acertos com baixa confiança retornam à revisão.',
    'Conteúdo normativo dinâmico permanece bloqueado até conferência oficial.',
    'Atualidades deve ser abastecida por recortes datados e nunca por conteúdo genérico permanente.',
    'O novo edital, quando publicado, dispara reconciliação completa antes de qualquer promessa de cobertura.',
  ],
  release_gates: [
    'validar o bundle localmente',
    'importar somente em staging com autorização explícita',
    'revisar editorialmente as questões',
    'revisar legislação e conteúdos dinâmicos',
    'homologar a aparência no app',
    'publicar somente após aprovação humana',
  ],
};

const questionsByDiscipline = Object.fromEntries(role.disciplines.map((discipline) => [discipline.name, 0]));
for (const question of questionBatch.questions) {
  const discipline = subtopicToDiscipline.get(question.subtopic_id);
  if (!discipline) throw new Error(`Questão aponta para subtópico inexistente: ${question.id}`);
  questionsByDiscipline[discipline] += 1;
}

const audit = {
  schema_version: 'detona_pcpe_course_readiness_audit_v1',
  generated_at: generatedAt,
  status: 'draft_ready_for_staging_validation',
  contest_id: curriculum.contest_id,
  baseline: {
    official_edital: 'Edital nº 1 — PCPE, de 21 de dezembro de 2023',
    product_cohort: '2027',
    new_official_edital_available: false,
  },
  curriculum: {
    roles: curriculum.roles.length,
    disciplines: role.disciplines.length,
    topics: role.disciplines.flatMap((discipline) => discipline.topics).length,
    subtopics: allSubtopics.length,
    covered_by_initial_questions: questionSubtopics.size,
    pending_initial_question_coverage: allSubtopics.length - questionSubtopics.size,
  },
  question_bank: {
    questions: questionBatch.questions.length,
    correct_true: questionBatch.questions.filter((question) => question.correct_answer === true).length,
    correct_false: questionBatch.questions.filter((question) => question.correct_answer === false).length,
    questions_by_discipline: questionsByDiscipline,
    excluded_until_dynamic_review: ['Legislação Estadual', 'Atualidades'],
  },
  roadmap: {
    phases: phases.length,
    disciplines_scheduled: phases.flatMap((phase) => phase.disciplines).length,
    mission_blocks: roadmap.mission_template.blocks.length,
  },
  safeguards: {
    import_executed: false,
    publication_executed: false,
    sales_enabled: false,
    entitlement_changed: false,
    requires_human_editorial_review: true,
    requires_normative_review_before_publication: true,
    requires_new_edital_reconciliation: true,
  },
};

const masterPlan = migrateIdentity(sourcePlan);
masterPlan.status = 'roadmap_created_source_ingestion_pending';
masterPlan.identity.offering_id = 'pc_pe_2027_agente';
masterPlan.identity.public_slug = 'pc-pe-agente-2027';
masterPlan.baseline.status = 'pre_edital_2027_using_official_2023_curriculum';
masterPlan.operational_safety.course_roadmap_completed = true;
masterPlan.operational_safety.initial_question_bank_completed = true;
masterPlan.operational_safety.full_map_generation_completed = false;
masterPlan.operational_safety.question_generation_authorized = false;
masterPlan.operational_safety.import_authorized = false;
masterPlan.operational_safety.publication_authorized = false;

await Promise.all([
  writeJson(path.join(targetBundle, 'contest.json'), contestDocument),
  writeJson(path.join(targetBundle, 'curriculum.json'), curriculum),
  writeJson(path.join(targetBundle, 'questions', '001-pcpe-agente-2027-banco-inicial-autoral.json'), questionBatch),
  writeJson(path.join(targetRoot, 'sources', 'source-catalog.v1.json'), sourceCatalog),
  writeJson(path.join(targetRoot, 'master-knowledge-map-plan.v1.json'), masterPlan),
  writeJson(path.join(targetRoot, 'course-roadmap.v1.json'), roadmap),
  writeJson(path.join(targetRoot, 'course-readiness-audit.v1.json'), audit),
]);

await mkdir(path.join(targetBundle, 'assets'), { recursive: true });
await copyFile(
  path.join(sourceBundle, 'assets', 'battle-avatar.png'),
  path.join(targetBundle, 'assets', 'battle-avatar.png'),
);

const statusDocument = `# PC PE — Agente de Polícia — Jornada 2027\n\n## Estado atual\n\nO curso foi estruturado como rascunho operacional pré-edital. A identificação 2027 corresponde à jornada comercial e pedagógica do DETONA; ela não afirma a existência de um novo edital oficial em 2027.\n\n## Base curricular\n\n- Edital nº 1 — PCPE, de 21 de dezembro de 2023;\n- 1 cargo;\n- 11 disciplinas;\n- 95 tópicos;\n- 188 subtópicos;\n- 100 questões autorais iniciais em rascunho;\n- 95 subtópicos já tocados pelo banco inicial.\n\n## Estratégia do curso\n\nA jornada foi organizada em quatro fases: base de execução, núcleo jurídico policial, bloco técnico e integração específica. A missão diária segue três blocos: estudo guiado, prática ativa e feedback com revisão.\n\n## Segurança editorial\n\n- venda e acesso continuam desativados no bundle;\n- nenhuma importação foi executada;\n- nenhuma questão foi publicada;\n- Legislação Estadual e Atualidades permanecem bloqueadas para revisão dinâmica;\n- o novo edital deverá substituir ou reconciliar integralmente a baseline de 2023.\n\n## Próximo passo\n\nValidar este bundle no staging. Depois, revisar o primeiro banco autoral e ampliar a cobertura dos 93 subtópicos ainda sem questão inicial.\n`;

const assetDocument = `# Assets da jornada PC PE 2027\n\n- \`battle-avatar.png\`: avatar provisório para validação técnica do bundle.\n- \`cover.png\`: arte de capa da jornada PC PE já usada na página comercial do DETONA.\n- \`official-crest.png\`: brasão institucional usado como referência visual, separado da arte gerada.\n\nA aparência permanece em rascunho e não deve ser publicada automaticamente.\n`;

await Promise.all([
  writeFile(path.join(targetRoot, 'COURSE_STATUS.md'), statusDocument, 'utf8'),
  writeFile(path.join(targetBundle, 'assets', 'README.md'), assetDocument, 'utf8'),
]);

console.log(JSON.stringify({
  status: audit.status,
  contest_id: audit.contest_id,
  disciplines: audit.curriculum.disciplines,
  topics: audit.curriculum.topics,
  subtopics: audit.curriculum.subtopics,
  questions: audit.question_bank.questions,
  covered_subtopics: audit.curriculum.covered_by_initial_questions,
  pending_subtopics: audit.curriculum.pending_initial_question_coverage,
}, null, 2));
