import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  contestId: 'pc_ba_2026',
  positionId: 'pc_ba_2026_investigador_policia_civil',
  entries: 2545,
  complex: 19,
  broad: 48,
  duplicateGroups: 96,
  normative: 576,
  dynamic: 24,
  moderate: 444,
});

const RECOMMENDATIONS = new Set([
  'keep',
  'merge_candidate',
  'split_candidate',
  'rename_candidate',
  'source_required',
  'human_decision_required',
]);

const PRIORITIES = Object.freeze([
  { rank: 1, code: 'complex_knowledge', label: 'Microconhecimentos complexos' },
  { rank: 2, code: 'broad_scope', label: 'Unidades de escopo amplo' },
  { rank: 3, code: 'apparent_duplicate_name', label: 'Nomes aparentemente repetidos' },
  { rank: 4, code: 'official_normative_validation', label: 'Validação normativa oficial' },
  { rank: 5, code: 'dynamic_verified_source', label: 'Fonte dinâmica verificada' },
  { rank: 6, code: 'moderate_knowledge', label: 'Microconhecimentos moderados' },
  { rank: 7, code: 'simple_atomic_discipline_sample', label: 'Amostragem por disciplina de simples e atômicos' },
]);

function invariant(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = 'PC_BA_HUMAN_REVIEW_INVALID';
    throw error;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function unique(values) {
  return [...new Set(values)];
}

function intersectCount(left, right) {
  return [...left].filter((value) => right.has(value)).length;
}

function fragmentContext(boundMap) {
  const contexts = new Map();
  for (const discipline of boundMap.disciplines || []) {
    for (const fragment of discipline.fragments || []) {
      contexts.set(fragment.fragment_id, {
        discipline_name: discipline.name,
        topic_name: fragment.official_context?.topic_official_text || null,
        subtopic_name: fragment.official_context?.subtopic_official_text || null,
        fragment_name: fragment.source_fragment_name || fragment.qualified_name,
      });
    }
  }
  return contexts;
}

function reviewDetail(entry, context, reviewReasons, recommendation, primaryPriority) {
  invariant(RECOMMENDATIONS.has(recommendation), `Recomendação inválida: ${recommendation}.`);
  return {
    review_priority: primaryPriority,
    microknowledge_id: entry.microknowledge_id,
    discipline: { id: entry.discipline_id, name: context.discipline_name },
    topic: { id: entry.topic_id, name: context.topic_name },
    subtopic: entry.subtopic_id ? { id: entry.subtopic_id, name: context.subtopic_name } : null,
    fragment: { id: entry.fragment_id, name: context.fragment_name },
    knowledge_name: entry.knowledge_name,
    student_must_know: [...entry.student_must_know],
    student_must_be_able_to: [...entry.student_must_be_able_to],
    common_misconceptions: [...entry.common_misconceptions],
    assessment_dimensions: [...entry.assessment_dimensions],
    complexity: entry.complexity,
    review_reasons: [...reviewReasons],
    recommendation,
    decision_status: 'pending_human_review',
  };
}

function systematicSample(entries) {
  const selected = [];
  const audit = [];
  const byDisciplineAndComplexity = new Map();
  for (const entry of entries) {
    const key = `${entry.discipline_id}:${entry.complexity}`;
    if (!byDisciplineAndComplexity.has(key)) byDisciplineAndComplexity.set(key, []);
    byDisciplineAndComplexity.get(key).push(entry);
  }
  for (const [key, candidates] of byDisciplineAndComplexity) {
    const [disciplineId, complexity] = key.split(':');
    if (!['simple', 'atomic'].includes(complexity)) continue;
    const target = Math.min(candidates.length, Math.max(5, Math.ceil(candidates.length * 0.1)));
    const indexes = unique(Array.from({ length: target }, (_, index) => (
      target === 1 ? 0 : Math.round(index * (candidates.length - 1) / (target - 1))
    )));
    const sample = indexes.map((index) => candidates[index]);
    selected.push(...sample);
    audit.push({
      discipline_id: disciplineId,
      complexity,
      population: candidates.length,
      target,
      selected: sample.length,
      method: 'systematic_even_spacing_in_source_order',
    });
  }
  return { selected, audit };
}

function recommendationFor(primaryReason) {
  if (primaryReason === 'apparent_duplicate_name') return 'merge_candidate';
  if (['official_normative_validation', 'dynamic_verified_source'].includes(primaryReason)) return 'source_required';
  return 'human_decision_required';
}

function addReason(reasonMap, microknowledgeId, reason) {
  if (!reasonMap.has(microknowledgeId)) reasonMap.set(microknowledgeId, []);
  const reasons = reasonMap.get(microknowledgeId);
  if (!reasons.includes(reason)) reasons.push(reason);
}

function makeBaselineReport() {
  return {
    schema_version: 'detona_test_baseline_report_v1',
    status: 'documented_preexisting_baseline_failure',
    observed_on: '2026-08-15',
    repository_head: '4951e9dc3451b9cd8ac5a53bfd81301e110ec164',
    branch_observed: 'fix/p0-foundation',
    classification: 'preexisting_at_clean_head',
    scope: 'app/tests/study-plan-hardening.test.js',
    evidence: {
      workspace_run: {
        command: 'node --test app/tests/study-plan-hardening.test.js',
        result: { tests: 12, passed: 10, failed: 2 },
      },
      clean_head_snapshot_run: {
        preparation: 'git archive do HEAD contendo package.json, app/js e somente o teste; extração em diretório temporário fora do workspace',
        command: 'node --test <clean-head-snapshot>/app/tests/study-plan-hardening.test.js',
        result: { tests: 12, passed: 10, failed: 2 },
        pc_ba_phase_files_present: false,
      },
      tracked_diff_for_test_and_runtime: 'empty',
      pc_ba_relationship: 'O snapshot limpo não contém course-drafts nem scripts/testes PC BA e reproduz as mesmas falhas.',
    },
    failures: [
      {
        test_name: 'geração usa conteúdo elegível, respeita capacidade e é idempotente',
        location: 'app/tests/study-plan-hardening.test.js:210',
        assertion_location: 'app/tests/study-plan-hardening.test.js:217',
        error_type: 'AssertionError',
        error_message: 'Expected values to be strictly equal: false !== true',
        observed_field: 'first.created',
        expected: true,
        actual: false,
        classification: 'preexisting_at_clean_head',
      },
      {
        test_name: 'falha de persistência mantém journal recuperável e retry cria um único plano',
        location: 'app/tests/study-plan-hardening.test.js:238',
        assertion_location: 'app/tests/study-plan-hardening.test.js:243',
        error_type: 'AssertionError',
        error_message: 'Missing expected rejection.',
        expected_error_pattern: 'SIMULATED_LOCAL_WRITE_FAILURE',
        actual: 'promise_resolved_without_expected_rejection',
        classification: 'preexisting_at_clean_head',
      },
    ],
    conclusion: {
      introduced_by_pc_ba_phase_3: false,
      fix_included_in_phase_3_5: false,
      rationale: 'Falhas idênticas foram reproduzidas no código versionado do HEAD sem os artefatos PC BA.',
      follow_up: 'Diagnosticar em tarefa própria; não alterar o runtime durante a preparação editorial PC BA.',
    },
  };
}

export function buildHumanReview({ matrix, exceptions, boundMap, matrixBytes, exceptionsBytes }) {
  invariant(matrix.identity?.contest_id === EXPECTED.contestId, 'contest_id divergente.');
  invariant(matrix.identity?.position_id === EXPECTED.positionId, 'position_id divergente.');
  invariant(matrix.entries?.length === EXPECTED.entries, 'Matriz não contém 2.545 entradas.');
  invariant(matrix.operational_safety?.question_generation_authorized === false, 'Geração de questões autorizada.');
  invariant(matrix.entries.every(({ question_generation_status }) => question_generation_status === 'blocked'),
    'Existe contrato liberado para geração.');
  const entryById = new Map(matrix.entries.map((entry) => [entry.microknowledge_id, entry]));
  invariant(entryById.size === EXPECTED.entries, 'microknowledge_id duplicado na matriz.');
  const contexts = fragmentContext(boundMap);
  invariant(contexts.size === 420, 'Contexto de fragmentos incompleto.');

  const complex = matrix.entries.filter(({ complexity }) => complexity === 'complex');
  const broadIds = new Set(exceptions.broad_scope_review.map(({ microknowledge_id }) => microknowledge_id));
  const broad = matrix.entries.filter(({ microknowledge_id }) => broadIds.has(microknowledge_id));
  const normative = matrix.entries.filter(({ source_requirement }) => source_requirement === 'official_normative_source');
  const dynamic = matrix.entries.filter(({ source_requirement }) => source_requirement === 'dynamic_verified_source');
  const moderate = matrix.entries.filter(({ complexity }) => complexity === 'moderate');
  const duplicateGroups = exceptions.apparent_redundancies;
  const duplicateMemberIds = new Set(duplicateGroups.flatMap(({ occurrences }) => (
    occurrences.map(({ microknowledge_id }) => microknowledge_id)
  )));
  const sample = systematicSample(matrix.entries);

  invariant(complex.length === EXPECTED.complex, 'Quantidade de complexos divergente.');
  invariant(broad.length === EXPECTED.broad, 'Quantidade de escopo amplo divergente.');
  invariant(duplicateGroups.length === EXPECTED.duplicateGroups, 'Quantidade de grupos repetidos divergente.');
  invariant(normative.length === EXPECTED.normative, 'Quantidade normativa divergente.');
  invariant(dynamic.length === EXPECTED.dynamic, 'Quantidade dinâmica divergente.');
  invariant(moderate.length === EXPECTED.moderate, 'Quantidade moderada divergente.');

  const reasonMap = new Map();
  for (const entry of complex) addReason(reasonMap, entry.microknowledge_id, 'complex_knowledge');
  for (const entry of broad) addReason(reasonMap, entry.microknowledge_id, 'broad_scope');
  for (const microknowledgeId of duplicateMemberIds) addReason(reasonMap, microknowledgeId, 'apparent_duplicate_name');
  for (const entry of normative) addReason(reasonMap, entry.microknowledge_id, 'official_normative_validation');
  for (const entry of dynamic) addReason(reasonMap, entry.microknowledge_id, 'dynamic_verified_source');
  for (const entry of moderate) addReason(reasonMap, entry.microknowledge_id, 'moderate_knowledge');
  for (const entry of sample.selected) addReason(reasonMap, entry.microknowledge_id, 'simple_atomic_discipline_sample');

  const detailFor = (entry, reasons = reasonMap.get(entry.microknowledge_id)) => {
    const primaryReason = PRIORITIES.find(({ code }) => reasons.includes(code));
    invariant(primaryReason, `Prioridade ausente: ${entry.microknowledge_id}.`);
    const context = contexts.get(entry.fragment_id);
    invariant(context, `Contexto ausente: ${entry.fragment_id}.`);
    return reviewDetail(
      entry,
      context,
      reasons,
      recommendationFor(primaryReason.code),
      { rank: primaryReason.rank, code: primaryReason.code, label: primaryReason.label },
    );
  };

  const deduplicatedQueue = [...reasonMap.keys()]
    .map((microknowledgeId) => detailFor(entryById.get(microknowledgeId)))
    .sort((left, right) => (
      left.review_priority.rank - right.review_priority.rank
      || matrix.entries.findIndex(({ microknowledge_id }) => microknowledge_id === left.microknowledge_id)
        - matrix.entries.findIndex(({ microknowledge_id }) => microknowledge_id === right.microknowledge_id)
    ));

  const duplicateGroupReviews = duplicateGroups.map((group, index) => ({
    review_unit_id: `apparent_duplicate_group_${String(index + 1).padStart(3, '0')}`,
    review_priority: { rank: 3, code: 'apparent_duplicate_name', label: PRIORITIES[2].label },
    normalized_name: group.normalized_name,
    review_reason: 'Mesmo nome normalizado aparece em contextos canônicos distintos; confirmar se a separação é pedagógica.',
    recommendation: 'merge_candidate',
    action_authorized: false,
    members: group.occurrences.map(({ microknowledge_id }) => detailFor(
      entryById.get(microknowledge_id),
      reasonMap.get(microknowledge_id),
    )),
  }));

  const inventories = {
    complex: complex.map((entry) => detailFor(entry)),
    broad_scope: broad.map((entry) => detailFor(entry)),
    apparent_duplicate_groups: duplicateGroupReviews,
    official_normative_validation: normative.map((entry) => detailFor(entry)),
    dynamic_verified_source: dynamic.map((entry) => detailFor(entry)),
    moderate: moderate.map((entry) => detailFor(entry)),
    simple_atomic_discipline_sample: sample.selected.map((entry) => detailFor(entry)),
  };

  const sets = {
    complex: new Set(complex.map(({ microknowledge_id }) => microknowledge_id)),
    broad_scope: broadIds,
    apparent_duplicate_members: duplicateMemberIds,
    official_normative_validation: new Set(normative.map(({ microknowledge_id }) => microknowledge_id)),
    dynamic_verified_source: new Set(dynamic.map(({ microknowledge_id }) => microknowledge_id)),
    moderate: new Set(moderate.map(({ microknowledge_id }) => microknowledge_id)),
    simple_atomic_sample: new Set(sample.selected.map(({ microknowledge_id }) => microknowledge_id)),
  };
  const overlapCounts = {};
  const setNames = Object.keys(sets);
  for (let left = 0; left < setNames.length; left += 1) {
    for (let right = left + 1; right < setNames.length; right += 1) {
      const count = intersectCount(sets[setNames[left]], sets[setNames[right]]);
      if (count) overlapCounts[`${setNames[left]}__${setNames[right]}`] = count;
    }
  }

  const stats = {
    schema_version: 'detona_human_review_stats_v1',
    status: 'draft_review_preparation',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    source_counts: {
      complex_microknowledges: complex.length,
      broad_scope_microknowledges: broad.length,
      apparent_duplicate_groups: duplicateGroups.length,
      apparent_duplicate_members: duplicateMemberIds.size,
      normative_microknowledges: normative.length,
      dynamic_microknowledges: dynamic.length,
      moderate_microknowledges: moderate.length,
      simple_atomic_sample: sample.selected.length,
    },
    deduplicated_queue_microknowledges: deduplicatedQueue.length,
    overlap_counts: overlapCounts,
    sampling: {
      policy: '10_percent_rounded_up_with_minimum_5_per_available_discipline_and_complexity',
      source_order_preserved: true,
      strata: sample.audit,
    },
    decisions_applied: 0,
    contracts_changed: 0,
    questions_generated: 0,
  };

  const queue = {
    schema_version: 'detona_human_review_queue_v1',
    artifact_type: 'editorial_human_review_preparation',
    status: 'draft_review_preparation',
    identity: { ...matrix.identity },
    sources: {
      coverage_matrix: { artifact: 'knowledge-coverage-matrix.v1.json', sha256: sha256(matrixBytes) },
      coverage_exceptions: { artifact: 'knowledge-coverage-exceptions.json', sha256: sha256(exceptionsBytes) },
      canonical_context: 'knowledge-map.bound.v2.json',
    },
    review_policy: {
      order: PRIORITIES,
      overlap_handling: 'Inventários preservam todas as categorias; deduplicated_microknowledge_queue usa a primeira prioridade e registra todos os motivos.',
      automated_actions: 'Nenhum merge, split, rename ou alteração contratual é autorizado.',
      review_question: 'Se o aluno souber esta unidade e errar outra parte do mesmo fragmento, o DETONA deve distinguir as duas evidências?',
    },
    operational_safety: {
      contracts_changed: false,
      merge_authorized: false,
      split_authorized: false,
      rename_authorized: false,
      question_generation_authorized: false,
      import_authorized: false,
      publication_authorized: false,
      production_changes_authorized: false,
    },
    summary: stats.source_counts,
    priority_inventories: inventories,
    deduplicated_microknowledge_queue: deduplicatedQueue,
  };

  invariant(queue.deduplicated_microknowledge_queue.every(({ decision_status }) => decision_status === 'pending_human_review'),
    'A fila contém decisão automática.');
  invariant(queue.deduplicated_microknowledge_queue.every(({ recommendation }) => RECOMMENDATIONS.has(recommendation)),
    'A fila contém recomendação inválida.');

  return { queue, stats, baselineReport: makeBaselineReport() };
}

function parseArguments(argv) {
  const options = { matrix: '', exceptions: '', boundMap: '', output: '' };
  const flags = {
    '--matrix': 'matrix',
    '--exceptions': 'exceptions',
    '--bound-map': 'boundMap',
    '--output': 'output',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`Argumento desconhecido: ${argv[index]}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argv[index]} exige um caminho.`);
    options[key] = value;
    index += 1;
  }
  invariant(Object.values(options).every(Boolean), 'Use --matrix, --exceptions, --bound-map e --output.');
  return options;
}

export async function generateHumanReview(options) {
  const [matrixBytes, exceptionsBytes, boundMapBytes] = await Promise.all([
    readFile(path.resolve(options.matrix)),
    readFile(path.resolve(options.exceptions)),
    readFile(path.resolve(options.boundMap)),
  ]);
  const artifacts = buildHumanReview({
    matrix: JSON.parse(matrixBytes.toString('utf8')),
    exceptions: JSON.parse(exceptionsBytes.toString('utf8')),
    boundMap: JSON.parse(boundMapBytes.toString('utf8')),
    matrixBytes,
    exceptionsBytes,
  });
  const output = path.resolve(options.output);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(path.join(output, 'human-review-queue.v1.json'), `${JSON.stringify(artifacts.queue, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'human-review-stats.json'), `${JSON.stringify(artifacts.stats, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'study-plan-hardening-baseline-report.json'), `${JSON.stringify(artifacts.baselineReport, null, 2)}\n`, 'utf8'),
  ]);
  return artifacts;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const artifacts = await generateHumanReview(options);
  process.stdout.write(`${JSON.stringify({
    result: 'PC_BA_INVESTIGADOR_HUMAN_REVIEW_PREPARED',
    output: path.resolve(options.output),
    summary: artifacts.stats.source_counts,
    deduplicated_queue_microknowledges: artifacts.stats.deduplicated_queue_microknowledges,
    contracts_changed: 0,
    questions_generated: 0,
    test_baseline_classification: artifacts.baselineReport.classification,
  }, null, 2)}\n`);
}
