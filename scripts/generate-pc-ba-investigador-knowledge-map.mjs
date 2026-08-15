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
  topicScopedFragments: 2,
});

const OUTPUT_REFERENCES = Object.freeze({
  master_knowledge_map_source: 'sources/knowledge-map.master.v1.json',
  bound_knowledge_map: 'knowledge-map.bound.v2.json',
  knowledge_binding_report: 'knowledge-binding-report.json',
  knowledge_map_stats: 'knowledge-map.stats.json',
  knowledge_map_exceptions: 'knowledge-map.exceptions.json',
});

const INHERITED_FIELDS = Object.freeze([
  'fragment_id',
  'discipline_id',
  'topic_id',
  'subtopic_id',
  'canonical_scope',
  'canonical_binding_method',
  'canonical_binding_confidence',
]);

function invariant(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = 'PC_BA_KNOWLEDGE_BINDING_INVALID';
    throw error;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function validateIdentity(master, bindingMap, bindingReport, bundle) {
  const identity = master.identity || {};
  invariant(identity.contest_id === EXPECTED.contestId, 'contest_id do Mapa Mestre divergente.');
  invariant(identity.position_id === EXPECTED.positionId, 'position_id do Mapa Mestre divergente.');
  invariant(identity.offering_id === EXPECTED.offeringId, 'offering_id do Mapa Mestre divergente.');
  invariant(identity.canonical_id_convention === EXPECTED.idConvention, 'Convenção canônica divergente.');
  invariant(bindingMap.contest_id === EXPECTED.contestId, 'Mapa de fragmentos pertence a outro concurso.');
  invariant(bindingMap.position_id === EXPECTED.positionId, 'Mapa de fragmentos pertence a outro cargo.');
  invariant(bindingMap.offering_id === EXPECTED.offeringId, 'Mapa de fragmentos pertence a outra oferta.');
  invariant(bindingReport.contest_id === EXPECTED.contestId, 'Relatório estrutural pertence a outro concurso.');
  invariant(bundle.contest?.id === EXPECTED.contestId, 'Bundle pertence a outro concurso.');
  invariant(bundle.position?.id === EXPECTED.positionId, 'Bundle pertence a outro cargo.');
  invariant(bundle.offering?.id === EXPECTED.offeringId, 'Bundle pertence a outra oferta.');
  invariant(master.operational_safety?.publication_authorized === false, 'Publicação deve permanecer bloqueada.');
  invariant(master.operational_safety?.import_authorized === false, 'Importação deve permanecer bloqueada.');
  invariant(master.operational_safety?.question_generation_authorized_from_this_map === false,
    'Geração de questões deve permanecer bloqueada.');
  invariant(master.operational_safety?.production_changes_authorized === false,
    'Alterações de produção devem permanecer bloqueadas.');
  invariant(bindingMap.import_authorized === false && bindingMap.publication_authorized === false,
    'Mapa estrutural não está em modo seguro.');
  invariant(Object.values(bundle.authorization || {}).every((value) => value === false),
    'Bundle contém autorização operacional ativa.');
}

function flattenMaster(master) {
  const disciplines = master.disciplines || [];
  const fragments = [];
  const microknowledges = [];
  for (const discipline of disciplines) {
    for (const fragment of discipline.fragments || []) {
      fragments.push({ discipline, fragment });
      for (const microknowledge of fragment.microknowledges || []) {
        microknowledges.push({ discipline, fragment, microknowledge });
      }
    }
  }
  return { disciplines, fragments, microknowledges };
}

function classificationCounts(records) {
  const validationStatus = {};
  const origin = {};
  const questionGenerationAllowed = {};
  for (const { microknowledge } of records) {
    increment(validationStatus, String(microknowledge.validation_status));
    increment(origin, String(microknowledge.origin));
    increment(questionGenerationAllowed, String(microknowledge.question_generation_allowed));
  }
  return {
    validation_status: validationStatus,
    origin,
    question_generation_allowed: questionGenerationAllowed,
  };
}

function makeStats(boundMap) {
  const flat = flattenMaster(boundMap);
  const byDiscipline = new Map();
  const byTopic = new Map();
  const bySubtopic = new Map();
  const byFragment = [];

  for (const { discipline, fragment } of flat.fragments) {
    const microknowledgeCount = (fragment.microknowledges || []).length;
    const disciplineStats = byDiscipline.get(fragment.discipline_id) || {
      discipline_id: fragment.discipline_id,
      source_name: discipline.name,
      topics: new Set(),
      subtopics: new Set(),
      fragments: 0,
      microknowledges: 0,
    };
    disciplineStats.topics.add(fragment.topic_id);
    if (fragment.subtopic_id) disciplineStats.subtopics.add(fragment.subtopic_id);
    disciplineStats.fragments += 1;
    disciplineStats.microknowledges += microknowledgeCount;
    byDiscipline.set(fragment.discipline_id, disciplineStats);

    const topicStats = byTopic.get(fragment.topic_id) || {
      discipline_id: fragment.discipline_id,
      topic_id: fragment.topic_id,
      subtopics: new Set(),
      fragments: 0,
      microknowledges: 0,
    };
    if (fragment.subtopic_id) topicStats.subtopics.add(fragment.subtopic_id);
    topicStats.fragments += 1;
    topicStats.microknowledges += microknowledgeCount;
    byTopic.set(fragment.topic_id, topicStats);

    if (fragment.subtopic_id) {
      const subtopicStats = bySubtopic.get(fragment.subtopic_id) || {
        discipline_id: fragment.discipline_id,
        topic_id: fragment.topic_id,
        subtopic_id: fragment.subtopic_id,
        fragments: 0,
        microknowledges: 0,
      };
      subtopicStats.fragments += 1;
      subtopicStats.microknowledges += microknowledgeCount;
      bySubtopic.set(fragment.subtopic_id, subtopicStats);
    }

    byFragment.push({
      discipline_id: fragment.discipline_id,
      topic_id: fragment.topic_id,
      subtopic_id: fragment.subtopic_id,
      fragment_id: fragment.fragment_id,
      canonical_scope: fragment.canonical_scope,
      microknowledges: microknowledgeCount,
    });
  }

  const topicScoped = flat.fragments.filter(({ fragment }) => fragment.canonical_scope === 'topic');
  return {
    schema_version: 'detona_knowledge_map_stats_v1',
    status: 'draft',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    totals: {
      disciplines: byDiscipline.size,
      topics: byTopic.size,
      subtopics: bySubtopic.size,
      fragments: flat.fragments.length,
      microknowledges: flat.microknowledges.length,
      topic_scoped_fragments: topicScoped.length,
      topic_scoped_microknowledges: topicScoped.reduce(
        (total, { fragment }) => total + fragment.microknowledges.length,
        0,
      ),
    },
    classification_counts: classificationCounts(flat.microknowledges),
    by_discipline: [...byDiscipline.values()].map((entry) => ({
      ...entry,
      topics: entry.topics.size,
      subtopics: entry.subtopics.size,
    })),
    by_topic: [...byTopic.values()].map((entry) => ({
      ...entry,
      subtopics: entry.subtopics.size,
    })),
    by_subtopic: [...bySubtopic.values()],
    by_fragment: byFragment,
  };
}

export function buildKnowledgeBinding({ master, bindingMap, bindingReport, bundle, masterBytes, bindingBytes }) {
  validateIdentity(master, bindingMap, bindingReport, bundle);
  const source = flattenMaster(master);
  invariant(source.disciplines.length === EXPECTED.disciplines, 'Quantidade de disciplinas divergente.');
  invariant(source.fragments.length === EXPECTED.fragments, 'Quantidade de fragmentos divergente.');
  invariant(source.microknowledges.length === EXPECTED.microknowledges, 'Quantidade de microconhecimentos divergente.');
  invariant(duplicateValues(source.fragments.map(({ fragment }) => fragment.fragment_id)).length === 0,
    'fragment_id duplicado no Mapa Mestre.');
  invariant(duplicateValues(source.microknowledges.map(({ microknowledge }) => microknowledge.microknowledge_id)).length === 0,
    'microknowledge_id duplicado no Mapa Mestre.');
  invariant(source.fragments.every(({ fragment }) => fragment.microknowledges?.length > 0),
    'Fragmento sem microconhecimento.');
  invariant(source.microknowledges.every(({ microknowledge }) => (
    INHERITED_FIELDS.every((field) => !Object.hasOwn(microknowledge, field))
  )), 'O Mapa Mestre de origem já contém campos reservados de binding.');

  const bindingByFragment = new Map(bindingMap.bindings.map((binding) => [binding.fragment_id, binding]));
  invariant(bindingByFragment.size === EXPECTED.fragments, 'Mapa estrutural não possui 420 fragmentos únicos.');
  const sourceFragmentIds = new Set(source.fragments.map(({ fragment }) => fragment.fragment_id));
  const invalidFragmentIds = [...sourceFragmentIds].filter((id) => !bindingByFragment.has(id));
  const missingFragmentIds = [...bindingByFragment.keys()].filter((id) => !sourceFragmentIds.has(id));
  invariant(invalidFragmentIds.length === 0, `fragment_id inválido: ${invalidFragmentIds.join(', ')}.`);
  invariant(missingFragmentIds.length === 0, `Fragmentos sem microconhecimento: ${missingFragmentIds.join(', ')}.`);

  const boundDisciplines = master.disciplines.map((discipline) => ({
    ...discipline,
    fragments: discipline.fragments.map((fragment) => {
      const binding = bindingByFragment.get(fragment.fragment_id);
      const canonical = {
        discipline_id: binding.discipline_id,
        topic_id: binding.topic_id,
        subtopic_id: binding.subtopic_id,
        canonical_scope: binding.binding_scope,
        canonical_binding_method: binding.binding_method,
        canonical_binding_confidence: binding.binding_confidence,
      };
      return {
        ...fragment,
        ...canonical,
        microknowledges: fragment.microknowledges.map((microknowledge) => ({
          ...microknowledge,
          fragment_id: fragment.fragment_id,
          ...canonical,
        })),
      };
    }),
  }));

  const sourceHashes = {
    master_knowledge_map_v1_sha256: sha256(masterBytes),
    fragment_bindings_sha256: sha256(bindingBytes),
  };
  const boundMap = {
    ...master,
    schema_version: 'detona_master_knowledge_map_bound_v2',
    artifact_type: 'master_knowledge_map_with_canonical_bindings',
    canonical_binding_summary: {
      status: 'complete_with_documented_topic_scope_exception',
      source_hashes: sourceHashes,
      hierarchy: ['discipline_id', 'topic_id', 'subtopic_id', 'fragment_id', 'microknowledge_id'],
      canonical_id_convention: EXPECTED.idConvention,
      fragments_linked: EXPECTED.fragments,
      microknowledges_linked: EXPECTED.microknowledges,
      orphan_microknowledges: 0,
      canonical_ids_created: 0,
      canonical_ids_modified: 0,
    },
    disciplines: boundDisciplines,
  };

  const bound = flattenMaster(boundMap);
  const topicScopedFragments = bound.fragments.filter(({ fragment }) => fragment.canonical_scope === 'topic');
  const subtopicScopedFragments = bound.fragments.filter(({ fragment }) => fragment.canonical_scope === 'subtopic');
  const disciplineIds = new Set(bound.fragments.map(({ fragment }) => fragment.discipline_id));
  const topicIds = new Set(bound.fragments.map(({ fragment }) => fragment.topic_id));
  const subtopicIds = new Set(bound.fragments.map(({ fragment }) => fragment.subtopic_id).filter(Boolean));
  invariant(bound.microknowledges.length === EXPECTED.microknowledges, 'Binding perdeu microconhecimentos.');
  invariant(topicScopedFragments.length === EXPECTED.topicScopedFragments,
    'Quantidade de fragmentos em escopo de tópico divergente.');
  invariant(topicScopedFragments.every(({ fragment }) => fragment.subtopic_id === null),
    'Escopo de tópico deve usar subtopic_id null.');
  invariant(subtopicScopedFragments.length === EXPECTED.fragments - EXPECTED.topicScopedFragments,
    'Quantidade de fragmentos em escopo de subtópico divergente.');
  invariant(subtopicScopedFragments.every(({ fragment }) => fragment.subtopic_id),
    'Escopo de subtópico sem subtopic_id.');
  invariant(disciplineIds.size === EXPECTED.disciplines, 'Cobertura canônica de disciplinas incompleta.');
  invariant(topicIds.size === EXPECTED.topics, 'Cobertura canônica de tópicos incompleta.');
  invariant(subtopicIds.size === EXPECTED.subtopics, 'Cobertura canônica de subtópicos incompleta.');
  invariant(bound.microknowledges.every(({ fragment, microknowledge }) => (
    microknowledge.fragment_id === fragment.fragment_id
      && microknowledge.discipline_id === fragment.discipline_id
      && microknowledge.topic_id === fragment.topic_id
      && microknowledge.subtopic_id === fragment.subtopic_id
      && microknowledge.canonical_scope === fragment.canonical_scope
      && microknowledge.canonical_binding_method === fragment.canonical_binding_method
      && microknowledge.canonical_binding_confidence === fragment.canonical_binding_confidence
  )), 'Microconhecimento não herdou integralmente o binding do fragmento.');

  const originalClassifications = classificationCounts(source.microknowledges);
  const boundClassifications = classificationCounts(bound.microknowledges);
  invariant(JSON.stringify(boundClassifications) === JSON.stringify(originalClassifications),
    'Classificações pedagógicas foram alteradas.');

  const accountingException = bindingReport.exceptions.find(({ id }) => (
    id === 'accounting_3_1_3_2_shared_canonical_subtopic'
  ));
  invariant(accountingException?.fragment_ids?.length === 2, 'Exceção de Contabilidade ausente ou inválida.');
  const accountingFragments = accountingException.fragment_ids.map((fragmentId) => {
    const { fragment } = bound.fragments.find((entry) => entry.fragment.fragment_id === fragmentId);
    return {
      fragment_id: fragmentId,
      subtopic_id: fragment.subtopic_id,
      canonical_scope: fragment.canonical_scope,
      microknowledge_ids: fragment.microknowledges.map(({ microknowledge_id }) => microknowledge_id),
    };
  });
  invariant(new Set(accountingFragments.map(({ subtopic_id }) => subtopic_id)).size === 1,
    'Contabilidade 3.1/3.2 não compartilha o mesmo subtopic_id.');

  const penalExceptions = topicScopedFragments.map(({ fragment }) => ({
    id: `penal_topic_scope_${fragment.fragment_id}`,
    type: 'canonical_subtopic_absent',
    status: 'accepted_topic_scope_not_orphan',
    discipline_id: fragment.discipline_id,
    topic_id: fragment.topic_id,
    subtopic_id: null,
    fragment_id: fragment.fragment_id,
    canonical_scope: 'topic',
    microknowledge_ids: fragment.microknowledges.map(({ microknowledge_id }) => microknowledge_id),
    resolution: 'Mantido no topic_id canônico; nenhum subtopic_id foi criado ou inferido.',
  }));

  const exceptions = {
    schema_version: 'detona_knowledge_map_exceptions_v1',
    status: 'draft',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    exception_count: 3,
    exceptions: [
      {
        id: 'accounting_3_1_3_2_shared_canonical_subtopic',
        type: 'two_fragments_share_one_approved_canonical_subtopic',
        status: 'resolved_without_canonical_id_change',
        fragments: accountingFragments,
        resolution: 'Os dois fragmentos pedagógicos permanecem distintos e herdam o mesmo subtopic_id V2.',
      },
      ...penalExceptions,
    ],
  };

  const stats = makeStats(boundMap);
  invariant(stats.totals.disciplines === EXPECTED.disciplines, 'Estatística de disciplinas divergente.');
  invariant(stats.totals.topics === EXPECTED.topics, 'Estatística de tópicos divergente.');
  invariant(stats.totals.subtopics === EXPECTED.subtopics, 'Estatística de subtópicos divergente.');
  invariant(stats.totals.fragments === EXPECTED.fragments, 'Estatística de fragmentos divergente.');
  invariant(stats.totals.microknowledges === EXPECTED.microknowledges, 'Estatística de microconhecimentos divergente.');

  const report = {
    schema_version: 'detona_knowledge_binding_report_v1',
    status: 'complete_with_documented_exceptions',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    offering_id: EXPECTED.offeringId,
    source_hashes: sourceHashes,
    criteria: {
      microknowledges: { expected: 2545, actual: bound.microknowledges.length, passed: true },
      microknowledges_linked: { expected: 2545, actual: bound.microknowledges.length, passed: true },
      orphan_microknowledges: { expected: 0, actual: 0, passed: true },
      fragments_represented: { expected: 420, actual: sourceFragmentIds.size, passed: true },
      canonical_topics_preserved: { expected: 161, actual: topicIds.size, passed: true },
      canonical_subtopics_preserved: { expected: 296, actual: subtopicIds.size, passed: true },
      canonical_ids_created: { expected: 0, actual: 0, passed: true },
      canonical_ids_modified: { expected: 0, actual: 0, passed: true },
      duplicate_microknowledge_ids: { expected: 0, actual: 0, passed: true },
      invalid_fragment_ids: { expected: 0, actual: 0, passed: true },
      topic_scoped_fragments: { expected: 2, actual: topicScopedFragments.length, passed: true },
      subtopic_scoped_fragments: { expected: 418, actual: subtopicScopedFragments.length, passed: true },
      classifications_preserved: { expected: true, actual: true, passed: true },
      import_authorized: { expected: false, actual: false, passed: true },
      publication_authorized: { expected: false, actual: false, passed: true },
      question_generation_authorized: { expected: false, actual: false, passed: true },
    },
    coverage: stats.totals,
    classification_counts: boundClassifications,
    errors: [],
    warnings: [
      {
        code: 'ACCOUNTING_SHARED_CANONICAL_SUBTOPIC',
        affected_fragments: accountingException.fragment_ids,
      },
      {
        code: 'PENAL_TOPIC_SCOPE_WITHOUT_CANONICAL_SUBTOPIC',
        affected_fragments: penalExceptions.map(({ fragment_id }) => fragment_id),
        affected_microknowledges: penalExceptions.reduce(
          (total, exception) => total + exception.microknowledge_ids.length,
          0,
        ),
      },
    ],
  };

  const updatedBundle = {
    ...bundle,
    sources: {
      ...bundle.sources,
      ...OUTPUT_REFERENCES,
    },
  };
  invariant(Object.values(updatedBundle.authorization || {}).every((value) => value === false),
    'Atualização do bundle alterou autorizações.');
  invariant(updatedBundle.status === 'draft', 'Bundle deixou de ser draft.');

  return { boundMap, report, stats, exceptions, updatedBundle };
}

function parseArguments(argv) {
  const options = { master: '', bindings: '', bindingReport: '', bundle: '', output: '' };
  const flags = {
    '--master': 'master',
    '--bindings': 'bindings',
    '--binding-report': 'bindingReport',
    '--bundle': 'bundle',
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
  invariant(Object.values(options).every(Boolean),
    'Use --master, --bindings, --binding-report, --bundle e --output.');
  return options;
}

export async function generateKnowledgeBinding(options) {
  const [masterBytes, bindingBytes, bindingReportBytes, bundleBytes] = await Promise.all([
    readFile(path.resolve(options.master)),
    readFile(path.resolve(options.bindings)),
    readFile(path.resolve(options.bindingReport)),
    readFile(path.resolve(options.bundle)),
  ]);
  const artifacts = buildKnowledgeBinding({
    master: JSON.parse(masterBytes.toString('utf8')),
    bindingMap: JSON.parse(bindingBytes.toString('utf8')),
    bindingReport: JSON.parse(bindingReportBytes.toString('utf8')),
    bundle: JSON.parse(bundleBytes.toString('utf8')),
    masterBytes,
    bindingBytes,
  });
  const output = path.resolve(options.output);
  const sources = path.join(output, 'sources');
  await mkdir(sources, { recursive: true });
  await writeFile(path.join(sources, 'knowledge-map.master.v1.json'), masterBytes);
  await writeFile(path.join(output, 'knowledge-map.bound.v2.json'), `${JSON.stringify(artifacts.boundMap, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'knowledge-binding-report.json'), `${JSON.stringify(artifacts.report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'knowledge-map.stats.json'), `${JSON.stringify(artifacts.stats, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'knowledge-map.exceptions.json'), `${JSON.stringify(artifacts.exceptions, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'bundle.draft.json'), `${JSON.stringify(artifacts.updatedBundle, null, 2)}\n`, 'utf8');
  return artifacts;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const artifacts = await generateKnowledgeBinding(options);
  process.stdout.write(`${JSON.stringify({
    result: 'PC_BA_INVESTIGADOR_KNOWLEDGE_MAP_BOUND',
    output: path.resolve(options.output),
    status: artifacts.report.status,
    coverage: artifacts.report.coverage,
    errors: artifacts.report.errors.length,
    warnings: artifacts.report.warnings.length,
    import_authorized: false,
    publication_authorized: false,
    question_generation_authorized: false,
  }, null, 2)}\n`);
}
