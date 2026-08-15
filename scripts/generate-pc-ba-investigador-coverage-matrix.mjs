import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  contestId: 'pc_ba_2026',
  positionId: 'pc_ba_2026_investigador_policia_civil',
  offeringId: 'pc_ba_2026_investigador',
  idConvention: 'pc_ba_2026_ids_v2.0.0',
  disciplines: 14,
  topics: 161,
  subtopics: 296,
  fragments: 420,
  microknowledges: 2545,
  editorial: 1945,
  normative: 576,
  dynamic: 24,
});

const VALIDATION_STATUS = Object.freeze({
  editorial_validation_required: {
    sourceRequirement: 'provided_map_and_course_sources',
    editorialStatus: 'review_required',
    normativeStatus: 'not_required',
    dynamicStatus: 'not_dynamic',
  },
  requires_official_normative_validation: {
    sourceRequirement: 'official_normative_source',
    editorialStatus: 'pending_official_source',
    normativeStatus: 'validation_required',
    dynamicStatus: 'not_dynamic',
  },
  requires_current_affairs_source_snapshot: {
    sourceRequirement: 'dynamic_verified_source',
    editorialStatus: 'pending_dynamic_source',
    normativeStatus: 'not_required',
    dynamicStatus: 'verification_required',
  },
});

const ASSESSMENT_DIMENSIONS = new Set([
  'recognition',
  'conceptual_understanding',
  'application',
  'discrimination',
  'exception_handling',
  'case_analysis',
  'calculation',
  'interpretation',
]);

const QUESTION_ROLES = new Set([
  'diagnostic',
  'teaching',
  'reinforcement',
  'retention',
  'discrimination',
  'integration',
]);

const COMPLEXITY_COVERAGE = Object.freeze({
  atomic: { exposures: 2, diversity: 2 },
  simple: { exposures: 3, diversity: 3 },
  moderate: { exposures: 4, diversity: 4 },
  complex: { exposures: 5, diversity: 5 },
});

function invariant(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = 'PC_BA_COVERAGE_MATRIX_INVALID';
    throw error;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function countBy(values) {
  const counts = {};
  for (const value of values) increment(counts, String(value));
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function unique(values) {
  return [...new Set(values)];
}

function hasSignal(name, expressions) {
  return expressions.some((expression) => expression.test(name));
}

function flatten(boundMap) {
  const records = [];
  const fragments = [];
  for (const discipline of boundMap.disciplines || []) {
    for (const fragment of discipline.fragments || []) {
      fragments.push({ discipline, fragment });
      for (const microknowledge of fragment.microknowledges || []) {
        records.push({ discipline, fragment, microknowledge });
      }
    }
  }
  return { records, fragments };
}

function validateSource(boundMap, bundle) {
  const identity = boundMap.identity || {};
  invariant(identity.contest_id === EXPECTED.contestId, 'contest_id divergente.');
  invariant(identity.position_id === EXPECTED.positionId, 'position_id divergente.');
  invariant(identity.offering_id === EXPECTED.offeringId, 'offering_id divergente.');
  invariant(identity.canonical_id_convention === EXPECTED.idConvention, 'Convenção canônica divergente.');
  invariant(boundMap.status === 'draft_editorial_and_normative_validation_required',
    'Mapa de origem deve permanecer no estado pendente validado na Fase 2.');
  invariant(boundMap.operational_safety?.publication_authorized === false, 'Publicação está autorizada na origem.');
  invariant(boundMap.operational_safety?.import_authorized === false, 'Importação está autorizada na origem.');
  invariant(boundMap.operational_safety?.question_generation_authorized_from_this_map === false,
    'Geração de questões está autorizada na origem.');
  invariant(boundMap.operational_safety?.production_changes_authorized === false,
    'Alterações de produção estão autorizadas na origem.');
  invariant(bundle.status === 'draft', 'Bundle deve permanecer draft.');
  invariant(Object.values(bundle.authorization || {}).every((value) => value === false),
    'Bundle contém autorização operacional ativa.');
  invariant(Array.isArray(bundle.questions) && bundle.questions.length === 0,
    'Bundle contém questões; Fase 3 exige zero questões.');
}

function classifyKnowledge(microknowledge) {
  const name = normalize(microknowledge.name);
  if (microknowledge.validation_status === 'requires_current_affairs_source_snapshot') return 'dynamic_context';
  if (hasSignal(name, [/distincao/, /diferenca/, /comparacao/, / versus /])) {
    return 'distinction';
  }
  if (hasSignal(name, [/classificacao/, /categorias?/, /tipos? de/, /especies? de/, /classes? de/])) {
    return 'classification';
  }
  if (hasSignal(name, [
    /calculo/, /calcular/, /resolucao numerica/, /operacoes? (?:com|entre)/, /equacoes?/,
    /sistemas? de equacoes?/, /porcentagem/, /juros/, /regra de tres/, /probabilidade/,
    /combinacoes?/, /arranjos?/, /permutacoes?/, /media aritmetica/, /mediana/, /moda/,
    /area e volume/, /perimetro/, /conversao de unidades/, /validacao do resultado/,
  ])) return 'calculation';
  if (hasSignal(name, [
    /procedimento/, /passo a passo/, /configuracao/, /instalacao/, /execucao/, /insercao/,
    /criacao/, /edicao/, /formatacao/, /utilizacao/, /uso de/, /comandos?/, /atalhos?/,
    /navegacao/, /registro contabil/, /lancamento contabil/, /localizacao de recurso/,
  ])) return 'procedure';
  if (hasSignal(name, [/caso concreto/, /situacao pratica/, /aplicacao/, /enquadramento/, /subsun/])) {
    return 'case_application';
  }
  if (hasSignal(name, [/interpretacao/, /leitura/, /compreensao/, /inferencia/, /sentido (?:do|da|em)/])) {
    return 'interpretation';
  }
  if (hasSignal(name, [
    /regras?/, /requisitos?/, /condicoes?/, /hipoteses?/, /excecoes?/, /limites?/, /prazos?/,
    /vedacao/, /proibicao/, /cabimento/, /admissibilidade/, /efeitos?/, /consequencias?/,
  ])) return 'rule_condition';
  return 'concept';
}

const ABILITY_PREFERENCES = Object.freeze({
  concept: ['conceituar', 'reconhecer', 'identificar', 'julgar_assertiva'],
  distinction: ['distinguir', 'distinguir_institutos', 'identificar', 'julgar_assertiva'],
  classification: ['classificar', 'identificar', 'reconhecer', 'aplicar'],
  interpretation: ['interpretar', 'interpretar_norma', 'interpretar_pericialmente', 'interpretar_cenario', 'julgar_assertiva'],
  case_application: ['aplicar', 'aplicar_em_caso', 'resolver_situacao_pratica', 'reconhecer_direito_ou_conduta', 'julgar_assertiva'],
  calculation: ['calcular', 'resolver_problema', 'validar_resultado', 'interpretar'],
  procedure: ['executar_procedimento', 'localizar_recurso', 'registrar', 'resolver_situacao_contabil', 'resolver_situacao_pratica'],
  rule_condition: ['identificar_requisitos', 'identificar_norma', 'interpretar_norma', 'aplicar_em_caso', 'julgar_assertiva'],
  dynamic_context: ['identificar_fato', 'contextualizar', 'interpretar_cenario', 'avaliar_implicacoes', 'relacionar_escalas'],
});

function selectAbilities(microknowledge, knowledgeType) {
  const available = microknowledge.competencies || [];
  const preferred = ABILITY_PREFERENCES[knowledgeType] || [];
  const selected = preferred.filter((ability) => available.includes(ability)).slice(0, 4);
  const minimum = ['concept', 'distinction', 'classification'].includes(knowledgeType) ? 2 : 3;
  for (const ability of available) {
    if (selected.length >= minimum) break;
    if (!selected.includes(ability)) selected.push(ability);
  }
  return selected.slice(0, 4);
}

function makeStudentMustKnow(name, fragmentName, knowledgeType, sourceRequirement) {
  const quotedName = `“${name}”`;
  const statements = [`O significado e o alcance de ${quotedName} no contexto do fragmento “${fragmentName}”.`];
  const byType = {
    concept: `Os elementos e critérios que caracterizam ${quotedName}, conforme as fontes fornecidas.`,
    distinction: `Os critérios necessários para distinguir ${quotedName} de conhecimentos próximos.`,
    classification: `Os critérios de classificação aplicáveis a ${quotedName}.`,
    interpretation: `Os elementos de contexto necessários para interpretar ${quotedName}.`,
    case_application: `As condições necessárias para aplicar ${quotedName} a uma situação apresentada.`,
    calculation: `As relações, operações e critérios de validação associados a ${quotedName}.`,
    procedure: `A finalidade, a sequência e as condições do procedimento relacionado a ${quotedName}.`,
    rule_condition: `As condições, os limites e as exceções de ${quotedName} sustentados pelas fontes.`,
    dynamic_context: `O recorte temporal, geográfico e documental necessário para analisar ${quotedName}.`,
  };
  statements.push(byType[knowledgeType]);
  if (sourceRequirement === 'official_normative_source') {
    statements.push('O conteúdo factual permanece pendente de confirmação em fonte normativa oficial.');
  } else if (sourceRequirement === 'dynamic_verified_source') {
    statements.push('O conteúdo factual permanece pendente de recorte e verificação em fonte dinâmica datada.');
  }
  return statements;
}

function makeMisconceptions(name, knowledgeType, sourceRequirement) {
  const byType = {
    concept: [`Confundir “${name}” com um conceito próximo sem observar o contexto.`],
    distinction: [`Tratar como equivalentes categorias ou institutos que o material diferencia em “${name}”.`],
    classification: [`Classificar uma ocorrência de “${name}” sem aplicar todos os critérios pertinentes.`],
    interpretation: [`Interpretar “${name}” de forma isolada, desconsiderando o contexto apresentado.`],
    case_application: [`Aplicar “${name}” a um caso sem verificar as condições relevantes.`],
    calculation: [`Selecionar uma operação ou premissa inadequada ao resolver “${name}”.`, 'Aceitar um resultado sem verificar sua coerência.'],
    procedure: [`Confundir finalidade, sequência ou contexto de uso no procedimento relacionado a “${name}”.`],
    rule_condition: [`Aplicar “${name}” sem verificar condições, limites ou possíveis exceções.`],
    dynamic_context: [`Tratar informação antiga ou sem fonte datada como estado atual de “${name}”.`],
  };
  const misconceptions = [...byType[knowledgeType]];
  if (sourceRequirement === 'official_normative_source') {
    misconceptions.push('Tratar conteúdo normativo ainda não validado como regra vigente confirmada.');
  }
  return misconceptions;
}

function deriveDimensions(knowledgeType, abilities, normalizedName) {
  const dimensions = ['recognition', 'conceptual_understanding'];
  const add = (...values) => values.forEach((value) => dimensions.push(value));
  if (knowledgeType === 'calculation') add('calculation', 'application');
  if (knowledgeType === 'procedure') add('application', 'case_analysis');
  if (knowledgeType === 'case_application') add('application', 'case_analysis');
  if (knowledgeType === 'interpretation' || knowledgeType === 'dynamic_context') add('interpretation');
  if (knowledgeType === 'distinction' || knowledgeType === 'classification') add('discrimination');
  if (knowledgeType === 'rule_condition') add('application');
  if (hasSignal(normalizedName, [/excecoes?/, /exceto/, /ressalv/, /vedacao/, /proibicao/, /limites?/, /hipoteses?/])) {
    add('exception_handling');
  }
  const result = unique(dimensions);
  invariant(result.every((value) => ASSESSMENT_DIMENSIONS.has(value)), 'Dimensão avaliativa inválida.');
  return result;
}

function deriveComplexity(knowledgeType, dimensions, normalizedName) {
  const relational = hasSignal(normalizedName, [
    /relacao entre/, /integracao/, /implicacoes?/, /reflexos?/, /articulacao/, /comparacao entre/,
  ]);
  const multiRule = hasSignal(normalizedName, [
    /regras e excecoes/, /requisitos e efeitos/, /condicoes e limites/, /hipoteses e consequencias/,
  ]);
  if (relational || multiRule || dimensions.length >= 6) return 'complex';
  if (['calculation', 'procedure', 'case_application', 'rule_condition', 'dynamic_context'].includes(knowledgeType)
    || dimensions.length >= 4) return 'moderate';
  if (knowledgeType === 'concept' && dimensions.length === 2 && normalizedName.split(' ').length <= 3) return 'atomic';
  return 'simple';
}

function makeEntry(record) {
  const { discipline, fragment, microknowledge } = record;
  const validation = VALIDATION_STATUS[microknowledge.validation_status];
  invariant(validation, `validation_status desconhecido: ${microknowledge.validation_status}.`);
  const normalizedName = normalize(microknowledge.name);
  const knowledgeType = classifyKnowledge(microknowledge);
  const abilities = selectAbilities(microknowledge, knowledgeType);
  invariant(abilities.length > 0, `Microconhecimento sem competência avaliável: ${microknowledge.microknowledge_id}.`);
  const dimensions = deriveDimensions(knowledgeType, abilities, normalizedName);
  const complexity = deriveComplexity(knowledgeType, dimensions, normalizedName);
  const requiresCase = dimensions.includes('case_analysis');
  const requiresException = dimensions.includes('exception_handling');
  const requiresIntegration = knowledgeType === 'dynamic_context'
    || complexity === 'complex'
    || hasSignal(normalizedName, [/relacao entre/, /implicacoes?/, /reflexos?/, /integracao/]);
  const roles = ['diagnostic', 'teaching', 'reinforcement', 'retention'];
  if (dimensions.includes('discrimination') || requiresException) roles.push('discrimination');
  if (requiresIntegration || requiresCase) roles.push('integration');
  const baseCoverage = COMPLEXITY_COVERAGE[complexity];
  const sourceAdjustment = validation.sourceRequirement === 'provided_map_and_course_sources' ? 0 : 1;

  return {
    knowledge_name: microknowledge.name,
    knowledge_type: knowledgeType,
    canonical_scope: microknowledge.canonical_scope,
    discipline_id: microknowledge.discipline_id,
    topic_id: microknowledge.topic_id,
    subtopic_id: microknowledge.subtopic_id,
    fragment_id: microknowledge.fragment_id,
    microknowledge_id: microknowledge.microknowledge_id,
    student_must_know: makeStudentMustKnow(
      microknowledge.name,
      fragment.source_fragment_name || fragment.qualified_name,
      knowledgeType,
      validation.sourceRequirement,
    ),
    student_must_be_able_to: abilities,
    prerequisites: [],
    common_misconceptions: makeMisconceptions(
      microknowledge.name,
      knowledgeType,
      validation.sourceRequirement,
    ),
    assessment_dimensions: dimensions,
    question_roles: unique(roles),
    complexity,
    source_requirement: validation.sourceRequirement,
    editorial_status: validation.editorialStatus,
    normative_status: validation.normativeStatus,
    dynamic_status: validation.dynamicStatus,
    question_generation_status: 'blocked',
    recommended_minimum_exposures: baseCoverage.exposures + sourceAdjustment,
    recommended_question_diversity: baseCoverage.diversity,
    requires_case_question: requiresCase,
    requires_exception_question: requiresException,
    requires_integration_question: requiresIntegration,
    provenance: {
      discipline_name: discipline.name,
      fragment_name: fragment.source_fragment_name || fragment.qualified_name,
      microknowledge_order: microknowledge.microknowledge_order,
      origin: microknowledge.origin,
      validation_status: microknowledge.validation_status,
      source_competencies: [...microknowledge.competencies],
      source_question_generation_allowed: microknowledge.question_generation_allowed,
      canonical_binding_method: microknowledge.canonical_binding_method,
      canonical_binding_confidence: microknowledge.canonical_binding_confidence,
    },
  };
}

function makeStats(entries) {
  const dimensionCounts = {};
  const byDiscipline = {};
  for (const entry of entries) {
    increment(byDiscipline, entry.discipline_id);
    for (const dimension of entry.assessment_dimensions) increment(dimensionCounts, dimension);
  }
  return {
    schema_version: 'detona_knowledge_coverage_stats_v1',
    status: 'draft',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    totals: {
      disciplines: new Set(entries.map(({ discipline_id }) => discipline_id)).size,
      topics: new Set(entries.map(({ topic_id }) => topic_id)).size,
      subtopics: new Set(entries.map(({ subtopic_id }) => subtopic_id).filter(Boolean)).size,
      fragments: new Set(entries.map(({ fragment_id }) => fragment_id)).size,
      microknowledges: entries.length,
      question_generation_blocked: entries.filter(({ question_generation_status }) => question_generation_status === 'blocked').length,
      questions_generated: 0,
    },
    by_discipline: Object.fromEntries(Object.entries(byDiscipline).sort(([left], [right]) => left.localeCompare(right))),
    by_knowledge_type: countBy(entries.map(({ knowledge_type }) => knowledge_type)),
    by_complexity: countBy(entries.map(({ complexity }) => complexity)),
    by_editorial_status: countBy(entries.map(({ editorial_status }) => editorial_status)),
    by_source_requirement: countBy(entries.map(({ source_requirement }) => source_requirement)),
    by_assessment_dimension: Object.fromEntries(Object.entries(dimensionCounts).sort(([left], [right]) => left.localeCompare(right))),
    future_coverage_plan: {
      recommended_minimum_exposures_total: entries.reduce((sum, entry) => sum + entry.recommended_minimum_exposures, 0),
      recommended_question_diversity_total: entries.reduce((sum, entry) => sum + entry.recommended_question_diversity, 0),
      requires_case_question: entries.filter(({ requires_case_question }) => requires_case_question).length,
      requires_exception_question: entries.filter(({ requires_exception_question }) => requires_exception_question).length,
      requires_integration_question: entries.filter(({ requires_integration_question }) => requires_integration_question).length,
    },
  };
}

function queueItem(entry) {
  return {
    microknowledge_id: entry.microknowledge_id,
    knowledge_name: entry.knowledge_name,
    discipline_id: entry.discipline_id,
    topic_id: entry.topic_id,
    subtopic_id: entry.subtopic_id,
    fragment_id: entry.fragment_id,
    source_requirement: entry.source_requirement,
    editorial_status: entry.editorial_status,
  };
}

function makeReviewQueue(entries) {
  const editorial = entries.filter(({ source_requirement }) => source_requirement === 'provided_map_and_course_sources');
  const normative = entries.filter(({ source_requirement }) => source_requirement === 'official_normative_source');
  const dynamic = entries.filter(({ source_requirement }) => source_requirement === 'dynamic_verified_source');
  return {
    schema_version: 'detona_knowledge_review_queue_v1',
    status: 'draft',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    summary: {
      editorial_review: editorial.length,
      official_normative_validation: normative.length,
      dynamic_source_verification: dynamic.length,
      total: entries.length,
    },
    queues: {
      editorial_review: editorial.map(queueItem),
      official_normative_validation: normative.map(queueItem),
      dynamic_source_verification: dynamic.map(queueItem),
    },
  };
}

function makeExceptions(entries) {
  const byNormalizedName = new Map();
  for (const entry of entries) {
    const key = normalize(entry.knowledge_name);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, []);
    byNormalizedName.get(key).push(entry);
  }
  const apparentRedundancies = [...byNormalizedName.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([normalizedName, matches]) => ({
      normalized_name: normalizedName,
      status: 'human_context_review_required_no_merge_authorized',
      occurrences: matches.map((entry) => ({
        microknowledge_id: entry.microknowledge_id,
        fragment_id: entry.fragment_id,
        topic_id: entry.topic_id,
        subtopic_id: entry.subtopic_id,
      })),
    }));

  const broadScopeReview = entries.filter((entry) => {
    const name = normalize(entry.knowledge_name);
    const wordCount = name.split(' ').filter(Boolean).length;
    return /relacionad[oa]s? aos topicos da disciplina/.test(name)
      || (entry.source_requirement === 'dynamic_verified_source' && wordCount <= 2)
      || name.length > 180;
  }).map((entry) => ({
    microknowledge_id: entry.microknowledge_id,
    knowledge_name: entry.knowledge_name,
    fragment_id: entry.fragment_id,
    review_reason: entry.source_requirement === 'dynamic_verified_source'
      ? 'Escopo dinâmico amplo; exige recorte temporal, geográfico e documental humano.'
      : 'Formulação ampla ou dependente do contexto do fragmento; revisar antes de gerar questões.',
  }));

  const dynamicNonAssessable = entries
    .filter(({ source_requirement }) => source_requirement === 'dynamic_verified_source')
    .map((entry) => ({
      microknowledge_id: entry.microknowledge_id,
      knowledge_name: entry.knowledge_name,
      fragment_id: entry.fragment_id,
      status: 'blocked_until_verified_dated_source_snapshot',
    }));

  const topicScoped = entries.filter(({ canonical_scope }) => canonical_scope === 'topic');
  return {
    schema_version: 'detona_knowledge_coverage_exceptions_v1',
    status: 'draft',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    summary: {
      accepted_topic_scoped_microknowledges: topicScoped.length,
      apparent_redundancy_groups: apparentRedundancies.length,
      broad_scope_review: broadScopeReview.length,
      non_assessable_without_human_review: dynamicNonAssessable.length,
      missing_evaluable_competencies: 0,
    },
    accepted_structural_exceptions: [{
      code: 'PENAL_TOPIC_SCOPE_WITHOUT_CANONICAL_SUBTOPIC',
      status: 'accepted_not_orphan',
      affected_microknowledges: topicScoped.map(({ microknowledge_id }) => microknowledge_id),
      affected_fragments: unique(topicScoped.map(({ fragment_id }) => fragment_id)),
      resolution: 'Mantidos no topic_id canônico com subtopic_id null; nenhum ID foi criado ou inferido.',
    }],
    planning_constraints: [{
      code: 'PREREQUISITE_GRAPH_NOT_INFERRED',
      affected_microknowledges: entries.length,
      resolution: 'prerequisites permanece vazio até existir uma relação de dependência validada por revisão humana.',
    }],
    apparent_redundancies: apparentRedundancies,
    broad_scope_review: broadScopeReview,
    non_assessable_without_human_review: dynamicNonAssessable,
    missing_evaluable_competencies: [],
  };
}

export function buildCoverageMatrix({ boundMap, bundle, boundMapBytes }) {
  validateSource(boundMap, bundle);
  const { records, fragments } = flatten(boundMap);
  invariant(records.length === EXPECTED.microknowledges, 'Quantidade de microconhecimentos divergente.');
  invariant(fragments.length === EXPECTED.fragments, 'Quantidade de fragmentos divergente.');
  invariant(new Set(records.map(({ microknowledge }) => microknowledge.microknowledge_id)).size === EXPECTED.microknowledges,
    'microknowledge_id duplicado.');

  const entries = records.map(makeEntry);
  const stats = makeStats(entries);
  const reviewQueue = makeReviewQueue(entries);
  const exceptions = makeExceptions(entries);
  const originalById = new Map(records.map(({ microknowledge }) => [microknowledge.microknowledge_id, microknowledge]));

  invariant(stats.totals.disciplines === EXPECTED.disciplines, 'Cobertura de disciplinas divergente.');
  invariant(stats.totals.topics === EXPECTED.topics, 'Cobertura de tópicos divergente.');
  invariant(stats.totals.subtopics === EXPECTED.subtopics, 'Cobertura de subtópicos divergente.');
  invariant(stats.totals.fragments === EXPECTED.fragments, 'Cobertura de fragmentos divergente.');
  invariant(reviewQueue.summary.editorial_review === EXPECTED.editorial, 'Fila editorial divergente.');
  invariant(reviewQueue.summary.official_normative_validation === EXPECTED.normative, 'Fila normativa divergente.');
  invariant(reviewQueue.summary.dynamic_source_verification === EXPECTED.dynamic, 'Fila dinâmica divergente.');
  invariant(entries.every((entry) => {
    const original = originalById.get(entry.microknowledge_id);
    return original
      && entry.discipline_id === original.discipline_id
      && entry.topic_id === original.topic_id
      && entry.subtopic_id === original.subtopic_id
      && entry.fragment_id === original.fragment_id
      && entry.canonical_scope === original.canonical_scope;
  }), 'Um ou mais bindings canônicos foram alterados.');
  invariant(entries.every((entry) => (
    entry.question_generation_status === 'blocked'
      && entry.provenance.source_question_generation_allowed === false
  )), 'Bloqueio de geração de questões foi alterado.');
  invariant(entries.every((entry) => entry.student_must_be_able_to.every(
    (ability) => entry.provenance.source_competencies.includes(ability),
  )), 'Competência não sustentada pela fonte foi adicionada.');

  const matrix = {
    schema_version: 'detona_knowledge_coverage_matrix_v1',
    artifact_type: 'learning_and_assessment_planning_contract',
    status: 'draft',
    identity: { ...boundMap.identity },
    source: {
      artifact: 'knowledge-map.bound.v2.json',
      sha256: sha256(boundMapBytes),
    },
    methodology: {
      purpose: 'Planejamento de aprendizagem, avaliação e cobertura futura; não contém questões.',
      ability_selection: 'Subconjunto de até quatro competências já presentes no microconhecimento de origem.',
      prerequisites: 'Não inferidos sem uma relação de dependência validada.',
      factual_content: 'Nenhum fato normativo ou dinâmico adicional foi declarado.',
      apparent_redundancy_policy: 'Nomes iguais em contextos canônicos distintos são sinalizados e não mesclados.',
    },
    operational_safety: {
      import_authorized: false,
      publication_authorized: false,
      question_generation_authorized: false,
      production_changes_authorized: false,
    },
    totals: { ...stats.totals },
    entries,
  };

  return { matrix, stats, reviewQueue, exceptions };
}

function parseArguments(argv) {
  const options = { source: '', bundle: '', output: '' };
  const flags = { '--source': 'source', '--bundle': 'bundle', '--output': 'output' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`Argumento desconhecido: ${argv[index]}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argv[index]} exige um caminho.`);
    options[key] = value;
    index += 1;
  }
  invariant(Object.values(options).every(Boolean), 'Use --source, --bundle e --output.');
  return options;
}

export async function generateCoverageMatrix(options) {
  const [boundMapBytes, bundleBytes] = await Promise.all([
    readFile(path.resolve(options.source)),
    readFile(path.resolve(options.bundle)),
  ]);
  const artifacts = buildCoverageMatrix({
    boundMap: JSON.parse(boundMapBytes.toString('utf8')),
    bundle: JSON.parse(bundleBytes.toString('utf8')),
    boundMapBytes,
  });
  const output = path.resolve(options.output);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(path.join(output, 'knowledge-coverage-matrix.v1.json'), `${JSON.stringify(artifacts.matrix, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'knowledge-coverage-stats.json'), `${JSON.stringify(artifacts.stats, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'knowledge-review-queue.json'), `${JSON.stringify(artifacts.reviewQueue, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'knowledge-coverage-exceptions.json'), `${JSON.stringify(artifacts.exceptions, null, 2)}\n`, 'utf8'),
  ]);
  return artifacts;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const artifacts = await generateCoverageMatrix(options);
  process.stdout.write(`${JSON.stringify({
    result: 'PC_BA_INVESTIGADOR_COVERAGE_MATRIX_GENERATED',
    output: path.resolve(options.output),
    status: 'draft',
    totals: artifacts.stats.totals,
    queues: artifacts.reviewQueue.summary,
    exceptions: artifacts.exceptions.summary,
    import_authorized: false,
    publication_authorized: false,
    question_generation_authorized: false,
  }, null, 2)}\n`);
}
