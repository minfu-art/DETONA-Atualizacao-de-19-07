import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  contestId: 'pc_ba_2026',
  positionId: 'pc_ba_2026_investigador_policia_civil',
  entries: 2545,
  proposals: 19,
  renames: 3,
  complexityChanges: 12,
  sourceChanges: 3,
});

const COVERAGE = Object.freeze({
  atomic: { exposures: 2, diversity: 2 },
  simple: { exposures: 3, diversity: 3 },
  moderate: { exposures: 4, diversity: 4 },
  complex: { exposures: 5, diversity: 5 },
});

function invariant(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = 'PC_BA_COMPLEX_REVIEW_APPLICATION_INVALID';
    throw error;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function countBy(values) {
  const result = {};
  for (const value of values) increment(result, String(value));
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function replaceKnowledgeName(values, originalName, proposedName) {
  return values.map((value) => value.replaceAll(originalName, proposedName));
}

function withOfficialSourceRequirement(entry) {
  const officialKnowledgeStatement = 'O conteúdo factual permanece pendente de confirmação em fonte normativa oficial.';
  const officialMisconception = 'Tratar conteúdo normativo ainda não validado como regra vigente confirmada.';
  return {
    ...entry,
    student_must_know: entry.student_must_know.includes(officialKnowledgeStatement)
      ? entry.student_must_know
      : [...entry.student_must_know, officialKnowledgeStatement],
    common_misconceptions: entry.common_misconceptions.includes(officialMisconception)
      ? entry.common_misconceptions
      : [...entry.common_misconceptions, officialMisconception],
    source_requirement: 'official_normative_source',
    editorial_status: 'pending_official_source',
    normative_status: 'validation_required',
    dynamic_status: 'not_dynamic',
  };
}

function recalculateCoverage(entry) {
  const base = COVERAGE[entry.complexity];
  invariant(base, `Complexidade inválida: ${entry.complexity}.`);
  const sourceAdjustment = entry.source_requirement === 'provided_map_and_course_sources' ? 0 : 1;
  return {
    ...entry,
    recommended_minimum_exposures: base.exposures + sourceAdjustment,
    recommended_question_diversity: base.diversity,
  };
}

function applyProposal(entry, proposal) {
  const original = structuredClone(entry);
  let reviewed = structuredClone(entry);
  if (proposal.proposed_name) {
    reviewed.knowledge_name = proposal.proposed_name;
    reviewed.student_must_know = replaceKnowledgeName(
      reviewed.student_must_know,
      original.knowledge_name,
      proposal.proposed_name,
    );
    reviewed.common_misconceptions = replaceKnowledgeName(
      reviewed.common_misconceptions,
      original.knowledge_name,
      proposal.proposed_name,
    );
  }
  reviewed.complexity = proposal.proposed_complexity;
  if (proposal.recommendation === 'source_required'
    && reviewed.source_requirement === 'provided_map_and_course_sources') {
    reviewed = withOfficialSourceRequirement(reviewed);
  }
  reviewed = recalculateCoverage(reviewed);
  reviewed.editorial_review = {
    phase: '3.5',
    round: 1,
    status: 'approved_proposal_applied',
    approved_on: '2026-08-15',
    recommendation: proposal.recommendation,
    separability_assessment: proposal.separability_assessment,
    original_knowledge_name: original.knowledge_name,
    original_complexity: original.complexity,
    contract_revision_status: proposal.contract_assessment,
    review_notes: proposal.review_notes,
    merge_candidate_with: proposal.merge_candidate_with || [],
    source: 'reviews/complex-review-round-1.proposals.json',
  };
  invariant(reviewed.microknowledge_id === original.microknowledge_id, 'microknowledge_id alterado.');
  invariant(reviewed.discipline_id === original.discipline_id, 'discipline_id alterado.');
  invariant(reviewed.topic_id === original.topic_id, 'topic_id alterado.');
  invariant(reviewed.subtopic_id === original.subtopic_id, 'subtopic_id alterado.');
  invariant(reviewed.fragment_id === original.fragment_id, 'fragment_id alterado.');
  invariant(reviewed.canonical_scope === original.canonical_scope, 'canonical_scope alterado.');
  invariant(reviewed.question_generation_status === 'blocked', 'Questão foi liberada.');
  return reviewed;
}

function makeStats(entries) {
  const dimensionCounts = {};
  const byDiscipline = {};
  for (const entry of entries) {
    increment(byDiscipline, entry.discipline_id);
    for (const dimension of entry.assessment_dimensions) increment(dimensionCounts, dimension);
  }
  return {
    schema_version: 'detona_knowledge_coverage_stats_reviewed_v1_1',
    status: 'draft_human_review_in_progress',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    totals: {
      disciplines: new Set(entries.map(({ discipline_id }) => discipline_id)).size,
      topics: new Set(entries.map(({ topic_id }) => topic_id)).size,
      subtopics: new Set(entries.map(({ subtopic_id }) => subtopic_id).filter(Boolean)).size,
      fragments: new Set(entries.map(({ fragment_id }) => fragment_id)).size,
      microknowledges: entries.length,
      human_reviewed: entries.filter(({ editorial_review }) => editorial_review?.status === 'approved_proposal_applied').length,
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
    human_review_status: entry.editorial_review?.status || 'not_reviewed',
  };
}

function makeReviewQueue(entries) {
  const editorial = entries.filter(({ source_requirement }) => source_requirement === 'provided_map_and_course_sources');
  const normative = entries.filter(({ source_requirement }) => source_requirement === 'official_normative_source');
  const dynamic = entries.filter(({ source_requirement }) => source_requirement === 'dynamic_verified_source');
  return {
    schema_version: 'detona_knowledge_review_queue_reviewed_v1_1',
    status: 'draft_human_review_in_progress',
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

export function buildReviewedMatrix({ matrix, proposals, matrixBytes, proposalsBytes }) {
  invariant(matrix.identity?.contest_id === EXPECTED.contestId, 'contest_id divergente.');
  invariant(matrix.identity?.position_id === EXPECTED.positionId, 'position_id divergente.');
  invariant(matrix.entries?.length === EXPECTED.entries, 'Matriz V1 incompleta.');
  invariant(proposals.status === 'proposal_only_pending_human_approval', 'Artefato de propostas inesperado.');
  invariant(proposals.proposals?.length === EXPECTED.proposals, 'Quantidade de propostas divergente.');
  invariant(proposals.proposals.every(({ automatic_action_authorized }) => automatic_action_authorized === false),
    'Proposta original não preserva o bloqueio de aplicação.');
  const proposalById = new Map(proposals.proposals.map((proposal) => [proposal.microknowledge_id, proposal]));
  invariant(proposalById.size === EXPECTED.proposals, 'Proposta duplicada.');
  const complexIds = new Set(matrix.entries.filter(({ complexity }) => complexity === 'complex').map(({ microknowledge_id }) => microknowledge_id));
  invariant(complexIds.size === EXPECTED.proposals, 'Baseline complexo divergente.');
  invariant([...proposalById.keys()].every((id) => complexIds.has(id)), 'Proposta fora dos 19 complexos.');

  const reviewedEntries = matrix.entries.map((entry) => (
    proposalById.has(entry.microknowledge_id) ? applyProposal(entry, proposalById.get(entry.microknowledge_id)) : entry
  ));
  const renamed = reviewedEntries.filter((entry) => entry.editorial_review
    && entry.knowledge_name !== entry.editorial_review.original_knowledge_name);
  const complexityChanged = reviewedEntries.filter((entry) => entry.editorial_review
    && entry.complexity !== entry.editorial_review.original_complexity);
  const originalById = new Map(matrix.entries.map((entry) => [entry.microknowledge_id, entry]));
  const sourceChanged = reviewedEntries.filter((entry) => entry.editorial_review
    && entry.source_requirement !== originalById.get(entry.microknowledge_id).source_requirement);

  invariant(renamed.length === EXPECTED.renames, 'Quantidade de renomes divergente.');
  invariant(complexityChanged.length === EXPECTED.complexityChanges, 'Quantidade de complexidades alteradas divergente.');
  invariant(sourceChanged.length === EXPECTED.sourceChanges, 'Quantidade de fontes alteradas divergente.');
  invariant(new Set(reviewedEntries.map(({ microknowledge_id }) => microknowledge_id)).size === EXPECTED.entries,
    'IDs foram removidos ou duplicados.');
  invariant(reviewedEntries.every(({ question_generation_status }) => question_generation_status === 'blocked'),
    'Existe geração de questões liberada.');

  const stats = makeStats(reviewedEntries);
  const reviewQueue = makeReviewQueue(reviewedEntries);
  invariant(stats.by_complexity.complex === 7 && stats.by_complexity.moderate === 456,
    'Distribuição de complexidade revisada divergente.');
  invariant(reviewQueue.summary.editorial_review === 1942, 'Fila editorial revisada divergente.');
  invariant(reviewQueue.summary.official_normative_validation === 579, 'Fila normativa revisada divergente.');
  invariant(reviewQueue.summary.dynamic_source_verification === 24, 'Fila dinâmica revisada divergente.');

  const reviewedMatrix = {
    ...matrix,
    schema_version: 'detona_knowledge_coverage_matrix_reviewed_v1_1',
    status: 'draft_human_review_in_progress',
    parent_source: {
      artifact: 'knowledge-coverage-matrix.v1.json',
      sha256: sha256(matrixBytes),
    },
    approved_review_sources: [{
      artifact: 'reviews/complex-review-round-1.proposals.json',
      sha256: sha256(proposalsBytes),
      approval: 'approved_by_user_in_thread_on_2026_08_15',
    }],
    operational_safety: {
      import_authorized: false,
      publication_authorized: false,
      question_generation_authorized: false,
      production_changes_authorized: false,
    },
    totals: { ...stats.totals },
    entries: reviewedEntries,
  };

  const applicationReport = {
    schema_version: 'detona_complex_review_application_report_v1',
    status: 'approved_proposals_applied_to_non_destructive_revision',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    output_matrix: 'knowledge-coverage-matrix.reviewed.v1.1.json',
    parent_matrix_preserved: true,
    applied: {
      reviewed_microknowledges: EXPECTED.proposals,
      renamed_microknowledges: renamed.map(({ microknowledge_id }) => microknowledge_id),
      complexity_changes: complexityChanged.map((entry) => ({
        microknowledge_id: entry.microknowledge_id,
        from: entry.editorial_review.original_complexity,
        to: entry.complexity,
      })),
      source_requirement_changes: sourceChanged.map((entry) => ({
        microknowledge_id: entry.microknowledge_id,
        from: originalById.get(entry.microknowledge_id).source_requirement,
        to: entry.source_requirement,
      })),
    },
    deliberately_not_applied: {
      merge_operations: 0,
      split_operations: 0,
      removed_microknowledge_ids: 0,
      created_microknowledge_ids: 0,
      rationale: 'merge_candidate e human_decision_required permanecem pendentes de decisão sobre conteúdo e ID sobrevivente.',
    },
    pending_before_editorial_freeze: {
      source_backed_contract_revisions: 19,
      merge_candidates: 1,
      unresolved_human_decisions: 1,
      official_normative_validations: reviewQueue.summary.official_normative_validation,
      dynamic_source_snapshots: reviewQueue.summary.dynamic_source_verification,
    },
    safety: {
      questions_generated: 0,
      question_generation_authorized: false,
      import_authorized: false,
      publication_authorized: false,
      production_changes_authorized: false,
    },
  };

  return { reviewedMatrix, stats, reviewQueue, applicationReport };
}

function parseArguments(argv) {
  const options = { matrix: '', proposals: '', output: '' };
  const flags = { '--matrix': 'matrix', '--proposals': 'proposals', '--output': 'output' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`Argumento desconhecido: ${argv[index]}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argv[index]} exige um caminho.`);
    options[key] = value;
    index += 1;
  }
  invariant(Object.values(options).every(Boolean), 'Use --matrix, --proposals e --output.');
  return options;
}

export async function applyComplexReview(options) {
  const [matrixBytes, proposalsBytes] = await Promise.all([
    readFile(path.resolve(options.matrix)),
    readFile(path.resolve(options.proposals)),
  ]);
  const artifacts = buildReviewedMatrix({
    matrix: JSON.parse(matrixBytes.toString('utf8')),
    proposals: JSON.parse(proposalsBytes.toString('utf8')),
    matrixBytes,
    proposalsBytes,
  });
  const output = path.resolve(options.output);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(path.join(output, 'knowledge-coverage-matrix.reviewed.v1.1.json'), `${JSON.stringify(artifacts.reviewedMatrix, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'knowledge-coverage-stats.reviewed.v1.1.json'), `${JSON.stringify(artifacts.stats, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'knowledge-review-queue.reviewed.v1.1.json'), `${JSON.stringify(artifacts.reviewQueue, null, 2)}\n`, 'utf8'),
    writeFile(path.join(output, 'reviews/complex-review-round-1.application-report.json'), `${JSON.stringify(artifacts.applicationReport, null, 2)}\n`, 'utf8'),
  ]);
  return artifacts;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const artifacts = await applyComplexReview(options);
  process.stdout.write(`${JSON.stringify({
    result: 'PC_BA_COMPLEX_REVIEW_APPLIED_TO_V1_1',
    output: path.resolve(options.output),
    totals: artifacts.stats.totals,
    complexity: artifacts.stats.by_complexity,
    source_queues: artifacts.reviewQueue.summary,
    application: artifacts.applicationReport.applied,
    questions_generated: 0,
  }, null, 2)}\n`);
}
