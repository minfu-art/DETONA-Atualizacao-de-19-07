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
});

export const DISCIPLINE_ALIASES = Object.freeze({
  'NOÇÕES DIREITO ADMINISTRATIVO': 'NOÇÕES DE DIREITO ADMINISTRATIVO',
  'NOÇÕES DIREITO CONSTITUCIONAL': 'NOÇÕES DE DIREITO CONSTITUCIONAL',
  'NOÇÕES DIREITO PENAL': 'NOÇÕES DE DIREITO PENAL',
  'NOÇÕES DIREITO PROCESSUAL PENAL': 'NOÇÕES DE DIREITO PROCESSUAL PENAL',
});

const ACCOUNTING_SHARED_SUBTOPIC_ID = 'pc_ba_2026_investigador_policia_civil_subtopic_nocoes_de_contabilidade_3_1_conceitos_3_2atos_administrativos_e_fatos_contabeis';
const PENAL_MERGED_TOPIC_ID = 'pc_ba_2026_investigador_policia_civil_topic_nocoes_de_direito_penal_1_principios_do_direito_penal_2_aplicacao_da_lei_penal';

function invariant(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = 'PC_BA_DRAFT_INVALID';
    throw error;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceKey(value) {
  return `${String(value?.source_number ?? '')}\u0000${String(value?.source_sequence ?? '')}`;
}

function countBy(values, field) {
  return new Set(values.map((value) => value[field]).filter(Boolean)).size;
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

function validateIdentity(canonical, overlay) {
  invariant(canonical.contest_id === EXPECTED.contestId, 'contest_id canônico divergente.');
  invariant(canonical.position_id === EXPECTED.positionId, 'position_id canônico divergente.');
  invariant(canonical.id_convention_version === EXPECTED.idConvention, 'Convenção de IDs divergente.');
  invariant(overlay.contest_id === EXPECTED.contestId, 'contest_id do overlay divergente.');
  invariant(overlay.position_id === EXPECTED.positionId, 'position_id do overlay divergente.');
  invariant(overlay.offering_id === EXPECTED.offeringId, 'offering_id do overlay divergente.');
  invariant(overlay.canonical_id_convention === EXPECTED.idConvention, 'Convenção do overlay divergente.');
  invariant(canonical.import_authorized === false && canonical.publication_authorized === false,
    'O currículo canônico precisa permanecer bloqueado para importação/publicação.');
  invariant(overlay.import_authorized === false && overlay.publication_authorized === false,
    'O overlay precisa permanecer bloqueado para importação/publicação.');
}

function canonicalIndex(canonical) {
  const curriculum = canonical.curriculum;
  invariant(curriculum?.contest_id === EXPECTED.contestId, 'Currículo interno pertence a outro concurso.');
  invariant(curriculum?.position_id === EXPECTED.positionId, 'Currículo interno pertence a outro cargo.');
  const disciplines = curriculum.disciplines || [];
  const topics = disciplines.flatMap((discipline) => discipline.topics || []);
  const subtopics = topics.flatMap((topic) => topic.subtopics || []);
  invariant(disciplines.length === EXPECTED.disciplines, 'Quantidade canônica de disciplinas divergente.');
  invariant(topics.length === EXPECTED.topics, 'Quantidade canônica de tópicos divergente.');
  invariant(subtopics.length === EXPECTED.subtopics, 'Quantidade canônica de subtópicos divergente.');

  const allIds = [
    canonical.position_id,
    ...disciplines.map(({ discipline_id }) => discipline_id),
    ...topics.map(({ topic_id }) => topic_id),
    ...subtopics.map(({ subtopic_id }) => subtopic_id),
  ];
  invariant(duplicateValues(allIds).length === 0, 'IDs canônicos duplicados.');
  const topicIds = new Set(topics.map(({ topic_id }) => topic_id));
  invariant(subtopics.every(({ parent_topic_id }) => topicIds.has(parent_topic_id)), 'Parent de subtópico inválido.');

  return {
    curriculum,
    disciplines,
    topics,
    subtopics,
    disciplineByName: new Map(disciplines.map((discipline) => [discipline.name, discipline])),
    allIds,
  };
}

function resolveDiscipline(index, overlayDiscipline) {
  const canonicalName = DISCIPLINE_ALIASES[overlayDiscipline.name] || overlayDiscipline.name;
  const discipline = index.disciplineByName.get(canonicalName);
  invariant(discipline, `Disciplina sem correspondência canônica: ${overlayDiscipline.name}.`);
  return {
    discipline,
    canonicalName,
    aliasUsed: canonicalName !== overlayDiscipline.name,
  };
}

function resolveTopic(discipline, overlayTopic) {
  const locator = overlayTopic.canonical_locator || {};
  const matches = (discipline.topics || []).filter((topic) => sourceKey(topic) === sourceKey(locator));
  invariant(matches.length === 1,
    `Locator de tópico ambíguo: ${discipline.name} ${locator.source_number}/${locator.source_sequence}.`);
  return matches[0];
}

function bindingRow({ fragment, discipline, topic, subtopic, method, confidence = 1, scope = 'subtopic', overlay }) {
  return {
    fragment_id: fragment.fragment_id,
    discipline_id: discipline.discipline_id,
    topic_id: topic.topic_id,
    subtopic_id: subtopic?.subtopic_id || null,
    binding_method: method,
    binding_confidence: confidence,
    binding_scope: scope,
    overlay_locator: overlay,
  };
}

export function buildPcBaInvestigatorDraft({ canonical, overlay, canonicalBytes, overlayBytes }) {
  validateIdentity(canonical, overlay);
  const index = canonicalIndex(canonical);
  const bindings = [];
  const exceptions = [];
  const ambiguities = [];
  const aliasUsage = [];

  for (const overlayDiscipline of overlay.disciplines || []) {
    const { discipline, canonicalName, aliasUsed } = resolveDiscipline(index, overlayDiscipline);
    if (aliasUsed) {
      aliasUsage.push({
        overlay_name: overlayDiscipline.name,
        canonical_name: canonicalName,
        discipline_id: discipline.discipline_id,
      });
    }

    for (const overlayTopic of overlayDiscipline.topics || []) {
      const topic = resolveTopic(discipline, overlayTopic);
      const canonicalSubtopics = new Map((topic.subtopics || []).map((subtopic) => [sourceKey(subtopic), subtopic]));

      for (const overlaySubtopic of overlayTopic.subtopics || []) {
        let subtopic = canonicalSubtopics.get(sourceKey(overlaySubtopic));
        let method = aliasUsed
          ? 'canonical_source_locator_with_explicit_discipline_alias'
          : 'canonical_source_locator_exact';

        if (!subtopic
          && discipline.name === 'NOÇÕES DE CONTABILIDADE'
          && topic.source_number === '3'
          && overlaySubtopic.source_number === '3.2') {
          subtopic = (topic.subtopics || []).find(({ subtopic_id }) => subtopic_id === ACCOUNTING_SHARED_SUBTOPIC_ID);
          invariant(subtopic, 'Exceção de Contabilidade não encontrou o subtópico canônico compartilhado.');
          method = 'documented_accounting_3_1_3_2_shared_canonical_subtopic';
        }

        invariant(subtopic,
          `Subtópico sem correspondência: ${discipline.name} ${topic.source_number} ${overlaySubtopic.source_number}.`);

        for (const fragment of overlaySubtopic.fragments || []) {
          bindings.push(bindingRow({
            fragment,
            discipline,
            topic,
            subtopic,
            method,
            overlay: {
              discipline_name: overlayDiscipline.name,
              topic_source_number: overlayTopic.source_number,
              topic_source_sequence: overlayTopic.source_sequence,
              subtopic_source_number: overlaySubtopic.source_number,
              subtopic_source_sequence: overlaySubtopic.source_sequence,
            },
          }));
        }
      }

      for (const fragment of overlayTopic.direct_fragments || []) {
        invariant(topic.topic_id === PENAL_MERGED_TOPIC_ID,
          `Fragmento direto inesperado fora da exceção penal: ${fragment.fragment_id}.`);
        const row = bindingRow({
          fragment,
          discipline,
          topic,
          subtopic: null,
          method: 'documented_penal_topic_scope_without_canonical_subtopic',
          confidence: 1,
          scope: 'topic',
          overlay: {
            discipline_name: overlayDiscipline.name,
            topic_source_number: overlayTopic.source_number,
            topic_source_sequence: overlayTopic.source_sequence,
            subtopic_source_number: null,
            subtopic_source_sequence: null,
          },
        });
        bindings.push(row);
        ambiguities.push({
          fragment_id: fragment.fragment_id,
          type: 'canonical_subtopic_absent',
          topic_id: topic.topic_id,
          subtopic_id: null,
          candidate_subtopic_ids: (topic.subtopics || []).map(({ subtopic_id }) => subtopic_id),
          resolution: 'Preservado em escopo de tópico; é proibido inventar ou escolher um subtopic_id semanticamente incorreto.',
        });
      }
    }
  }

  const fragmentIds = bindings.map(({ fragment_id }) => fragment_id);
  invariant(bindings.length === EXPECTED.fragments, `Cobertura de fragmentos divergente: ${bindings.length}.`);
  invariant(duplicateValues(fragmentIds).length === 0, 'fragment_id duplicado no mapa de bindings.');
  invariant(bindings.every(({ discipline_id, topic_id }) => discipline_id && topic_id), 'Fragmento órfão.');
  invariant(countBy(bindings, 'discipline_id') === EXPECTED.disciplines, 'Cobertura de disciplinas incompleta.');
  invariant(countBy(bindings, 'topic_id') === EXPECTED.topics, 'Cobertura de tópicos incompleta.');
  invariant(countBy(bindings, 'subtopic_id') === EXPECTED.subtopics, 'Cobertura de subtópicos incompleta.');
  invariant(aliasUsage.length === Object.keys(DISCIPLINE_ALIASES).length, 'Uso de aliases divergente.');

  const accountingRows = bindings.filter(({ subtopic_id }) => subtopic_id === ACCOUNTING_SHARED_SUBTOPIC_ID);
  const accountingExceptionRow = accountingRows.find(({ binding_method }) => (
    binding_method === 'documented_accounting_3_1_3_2_shared_canonical_subtopic'
  ));
  invariant(accountingExceptionRow, 'Binding documentado de Contabilidade 3.2 ausente.');
  exceptions.push({
    id: 'accounting_3_1_3_2_shared_canonical_subtopic',
    status: 'resolved_without_canonical_id_change',
    canonical_subtopic_id: ACCOUNTING_SHARED_SUBTOPIC_ID,
    fragment_ids: accountingRows.map(({ fragment_id }) => fragment_id),
    explanation: 'Os itens 3.1 e 3.2 permanecem como fragmentos distintos vinculados ao único subtopic_id aprovado na V2.',
  });
  exceptions.push({
    id: 'penal_principles_and_application_topic_scope',
    status: 'documented_topic_scope_pending_future_canonical_decision',
    canonical_topic_id: PENAL_MERGED_TOPIC_ID,
    fragment_ids: ambiguities.map(({ fragment_id }) => fragment_id),
    explanation: 'A V2 não possui subtopic_id próprio para os dois conhecimentos diretos; nenhum ID foi criado e nenhum filho arbitrário foi escolhido.',
  });

  const sourceHashes = {
    canonical_sha256: sha256(canonicalBytes),
    overlay_sha256: sha256(overlayBytes),
    edital_sha256: canonical.curriculum.source.sha256,
  };
  const subtopicBound = bindings.filter(({ subtopic_id }) => subtopic_id).length;
  const topicScoped = bindings.length - subtopicBound;

  const bindingMap = {
    schema_version: 'detona_fragment_binding_map_v1',
    status: 'draft',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    offering_id: EXPECTED.offeringId,
    canonical_id_convention: EXPECTED.idConvention,
    import_authorized: false,
    publication_authorized: false,
    source_hashes: sourceHashes,
    discipline_aliases: aliasUsage,
    counts: {
      canonical_disciplines: EXPECTED.disciplines,
      canonical_topics: EXPECTED.topics,
      canonical_subtopics: EXPECTED.subtopics,
      fragments: bindings.length,
      fragments_linked: bindings.length,
      fragments_bound_to_subtopic: subtopicBound,
      fragments_bound_to_topic_scope: topicScoped,
      orphan_fragments: 0,
    },
    bindings,
  };

  const report = {
    schema_version: 'detona_fragment_binding_report_v1',
    status: 'draft_with_documented_topic_scope_exception',
    contest_id: EXPECTED.contestId,
    position_id: EXPECTED.positionId,
    offering_id: EXPECTED.offeringId,
    source_hashes: sourceHashes,
    criteria: {
      canonical_disciplines: { expected: 14, actual: index.disciplines.length, passed: true },
      canonical_topics: { expected: 161, actual: index.topics.length, passed: true },
      canonical_subtopics: { expected: 296, actual: index.subtopics.length, passed: true },
      fragments: { expected: 420, actual: bindings.length, passed: true },
      fragments_linked: { expected: 420, actual: bindings.length, passed: true },
      orphan_fragments: { expected: 0, actual: 0, passed: true },
      canonical_ids_created: { expected: 0, actual: 0, passed: true },
      canonical_ids_removed: { expected: 0, actual: 0, passed: true },
      canonical_ids_changed: { expected: 0, actual: 0, passed: true },
      improper_duplicates: { expected: 0, actual: 0, passed: true },
      import_authorized: { expected: false, actual: false, passed: true },
      publication_authorized: { expected: false, actual: false, passed: true },
    },
    coverage: {
      disciplines_with_fragments: countBy(bindings, 'discipline_id'),
      topics_with_fragments: countBy(bindings, 'topic_id'),
      subtopics_with_fragments: countBy(bindings, 'subtopic_id'),
      fragments_bound_to_subtopic: subtopicBound,
      fragments_bound_to_topic_scope: topicScoped,
    },
    aliases: aliasUsage,
    exceptions,
    ambiguities,
  };

  const bundle = {
    schema_version: 'detona_position_course_bundle_draft_v1',
    status: 'draft',
    inert_local_artifact: true,
    contest: { id: EXPECTED.contestId, name: canonical.curriculum.contest_name },
    position: {
      id: EXPECTED.positionId,
      name: canonical.position_name,
      code: canonical.position_code,
    },
    offering: {
      id: EXPECTED.offeringId,
      slug: overlay.commercial_slug,
      sales_status: 'unavailable',
      price_cents: 0,
      currency: 'BRL',
    },
    canonical_id_convention: EXPECTED.idConvention,
    sources: {
      canonical_curriculum: 'sources/curriculum.canonical.json',
      fragmentation_overlay: 'sources/curriculum.fragmentation-overlay.json',
      fragment_bindings: 'fragment-bindings.json',
      binding_report: 'binding-report.json',
      master_knowledge_map_source: 'sources/knowledge-map.master.v1.json',
      bound_knowledge_map: 'knowledge-map.bound.v2.json',
      knowledge_binding_report: 'knowledge-binding-report.json',
      knowledge_map_stats: 'knowledge-map.stats.json',
      knowledge_map_exceptions: 'knowledge-map.exceptions.json',
      ...sourceHashes,
    },
    counts: bindingMap.counts,
    authorization: {
      import_authorized: false,
      publication_authorized: false,
      question_generation_authorized: false,
      remote_migration_authorized: false,
      entitlement_grant_authorized: false,
    },
    questions: [],
    content_packages: [],
  };

  return { bindingMap, report, bundle };
}

function parseArguments(argv) {
  const options = { canonical: '', overlay: '', output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--canonical', '--overlay', '--output'].includes(key)) throw new Error(`Argumento desconhecido: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} exige um caminho.`);
    options[key.slice(2)] = value;
    index += 1;
  }
  invariant(options.canonical && options.overlay && options.output,
    'Use --canonical, --overlay e --output.');
  return options;
}

export async function generatePcBaInvestigatorDraft(options) {
  const canonicalBytes = await readFile(path.resolve(options.canonical));
  const overlayBytes = await readFile(path.resolve(options.overlay));
  const canonical = JSON.parse(canonicalBytes.toString('utf8'));
  const overlay = JSON.parse(overlayBytes.toString('utf8'));
  const artifacts = buildPcBaInvestigatorDraft({ canonical, overlay, canonicalBytes, overlayBytes });
  const output = path.resolve(options.output);
  const sources = path.join(output, 'sources');
  await mkdir(sources, { recursive: true });
  await writeFile(path.join(sources, 'curriculum.canonical.json'), canonicalBytes);
  await writeFile(path.join(sources, 'curriculum.fragmentation-overlay.json'), overlayBytes);
  await writeFile(path.join(output, 'fragment-bindings.json'), `${JSON.stringify(artifacts.bindingMap, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'binding-report.json'), `${JSON.stringify(artifacts.report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(output, 'bundle.draft.json'), `${JSON.stringify(artifacts.bundle, null, 2)}\n`, 'utf8');
  return artifacts;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const { report } = await generatePcBaInvestigatorDraft(options);
  process.stdout.write(`${JSON.stringify({
    result: 'PC_BA_INVESTIGADOR_DRAFT_GENERATED',
    output: path.resolve(options.output),
    status: report.status,
    coverage: report.coverage,
    exceptions: report.exceptions.length,
    ambiguities: report.ambiguities.length,
    import_authorized: false,
    publication_authorized: false,
  }, null, 2)}\n`);
}
