import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildKnowledgeBinding } from '../scripts/generate-pc-ba-investigador-knowledge-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftDir = path.join(root, 'course-drafts', 'pc-ba-2026-investigador');
const injectedFields = [
  'fragment_id',
  'discipline_id',
  'topic_id',
  'subtopic_id',
  'canonical_scope',
  'canonical_binding_method',
  'canonical_binding_confidence',
];

async function bytes(relative) {
  return readFile(path.join(draftDir, relative));
}

async function json(relative) {
  return JSON.parse((await bytes(relative)).toString('utf8'));
}

async function rebuild() {
  const masterBytes = await bytes('sources/knowledge-map.master.v1.json');
  const bindingBytes = await bytes('fragment-bindings.json');
  return buildKnowledgeBinding({
    master: JSON.parse(masterBytes.toString('utf8')),
    bindingMap: JSON.parse(bindingBytes.toString('utf8')),
    bindingReport: await json('binding-report.json'),
    bundle: await json('bundle.draft.json'),
    masterBytes,
    bindingBytes,
  });
}

function flatten(map) {
  const fragments = map.disciplines.flatMap((discipline) => discipline.fragments);
  const microknowledges = fragments.flatMap((fragment) => fragment.microknowledges);
  return { fragments, microknowledges };
}

test('binding do Mapa Mestre é determinístico', async () => {
  const generated = await rebuild();
  assert.deepEqual(await json('knowledge-map.bound.v2.json'), generated.boundMap);
  assert.deepEqual(await json('knowledge-binding-report.json'), generated.report);
  assert.deepEqual(await json('knowledge-map.stats.json'), generated.stats);
  assert.deepEqual(await json('knowledge-map.exceptions.json'), generated.exceptions);
  assert.deepEqual(await json('bundle.draft.json'), generated.updatedBundle);
});

test('conteúdo pedagógico original é preservado integralmente', async () => {
  const original = await json('sources/knowledge-map.master.v1.json');
  const restored = await json('knowledge-map.bound.v2.json');
  restored.schema_version = original.schema_version;
  restored.artifact_type = original.artifact_type;
  delete restored.canonical_binding_summary;
  for (const discipline of restored.disciplines) {
    for (const fragment of discipline.fragments) {
      for (const field of injectedFields.slice(1)) delete fragment[field];
      for (const microknowledge of fragment.microknowledges) {
        for (const field of injectedFields) delete microknowledge[field];
      }
    }
  }
  assert.deepEqual(restored, original);
});

test('2.545 microconhecimentos únicos herdam os 420 bindings válidos', async () => {
  const map = await json('knowledge-map.bound.v2.json');
  const binding = await json('fragment-bindings.json');
  const byFragment = new Map(binding.bindings.map((entry) => [entry.fragment_id, entry]));
  const { fragments, microknowledges } = flatten(map);
  assert.equal(fragments.length, 420);
  assert.equal(microknowledges.length, 2545);
  assert.equal(new Set(microknowledges.map(({ microknowledge_id }) => microknowledge_id)).size, 2545);
  assert.equal(new Set(microknowledges.map(({ fragment_id }) => fragment_id)).size, 420);
  for (const microknowledge of microknowledges) {
    const canonical = byFragment.get(microknowledge.fragment_id);
    assert.ok(canonical);
    assert.equal(microknowledge.discipline_id, canonical.discipline_id);
    assert.equal(microknowledge.topic_id, canonical.topic_id);
    assert.equal(microknowledge.subtopic_id, canonical.subtopic_id);
    assert.equal(microknowledge.canonical_scope, canonical.binding_scope);
    assert.equal(microknowledge.canonical_binding_method, canonical.binding_method);
    assert.equal(microknowledge.canonical_binding_confidence, canonical.binding_confidence);
  }
});

test('cobertura preserva 14 disciplinas, 161 tópicos e 296 subtópicos', async () => {
  const map = await json('knowledge-map.bound.v2.json');
  const { fragments } = flatten(map);
  assert.equal(new Set(fragments.map(({ discipline_id }) => discipline_id)).size, 14);
  assert.equal(new Set(fragments.map(({ topic_id }) => topic_id)).size, 161);
  assert.equal(new Set(fragments.map(({ subtopic_id }) => subtopic_id).filter(Boolean)).size, 296);
});

test('dois fragmentos penais e seus 18 microconhecimentos permanecem topic-scoped', async () => {
  const map = await json('knowledge-map.bound.v2.json');
  const exceptions = await json('knowledge-map.exceptions.json');
  const topicScoped = flatten(map).fragments.filter(({ canonical_scope }) => canonical_scope === 'topic');
  assert.equal(topicScoped.length, 2);
  assert.equal(topicScoped.reduce((total, fragment) => total + fragment.microknowledges.length, 0), 18);
  assert.ok(topicScoped.every(({ subtopic_id }) => subtopic_id === null));
  assert.ok(topicScoped.every(({ microknowledges }) => microknowledges.every((item) => (
    item.subtopic_id === null && item.canonical_scope === 'topic'
  ))));
  assert.equal(exceptions.exceptions.filter(({ type }) => type === 'canonical_subtopic_absent').length, 2);
});

test('Contabilidade 3.1/3.2 mantém dois fragmentos no mesmo subtopic_id', async () => {
  const exceptions = await json('knowledge-map.exceptions.json');
  const accounting = exceptions.exceptions.find(({ id }) => (
    id === 'accounting_3_1_3_2_shared_canonical_subtopic'
  ));
  assert.equal(accounting.fragments.length, 2);
  assert.equal(new Set(accounting.fragments.map(({ subtopic_id }) => subtopic_id)).size, 1);
  assert.equal(accounting.fragments.reduce((total, fragment) => total + fragment.microknowledge_ids.length, 0), 8);
});

test('classificações pendentes e bloqueios operacionais são preservados', async () => {
  const stats = await json('knowledge-map.stats.json');
  const bundle = await json('bundle.draft.json');
  assert.deepEqual(stats.classification_counts.validation_status, {
    editorial_validation_required: 1945,
    requires_official_normative_validation: 576,
    requires_current_affairs_source_snapshot: 24,
  });
  assert.deepEqual(stats.classification_counts.question_generation_allowed, { false: 2545 });
  assert.equal(bundle.status, 'draft');
  assert.ok(Object.values(bundle.authorization).every((value) => value === false));
  assert.equal(bundle.sources.bound_knowledge_map, 'knowledge-map.bound.v2.json');
  assert.equal(bundle.sources.knowledge_binding_report, 'knowledge-binding-report.json');
});

test('estatísticas e relatório registram cobertura integral sem inconsistências', async () => {
  const stats = await json('knowledge-map.stats.json');
  const report = await json('knowledge-binding-report.json');
  assert.deepEqual(stats.totals, {
    disciplines: 14,
    topics: 161,
    subtopics: 296,
    fragments: 420,
    microknowledges: 2545,
    topic_scoped_fragments: 2,
    topic_scoped_microknowledges: 18,
  });
  assert.equal(stats.by_discipline.length, 14);
  assert.equal(stats.by_topic.length, 161);
  assert.equal(stats.by_subtopic.length, 296);
  assert.equal(stats.by_fragment.length, 420);
  assert.deepEqual(report.errors, []);
  assert.ok(Object.values(report.criteria).every(({ passed }) => passed));
});

test('artefatos permanecem isolados de Escrivão, Delegado e PC AL', async () => {
  const bundle = JSON.stringify(await json('bundle.draft.json'));
  const map = JSON.stringify(await json('knowledge-map.bound.v2.json'));
  const catalog = await readFile(path.join(root, 'app', 'js', 'contest', 'contestCatalog.js'), 'utf8');
  assert.doesNotMatch(bundle + map, /pc_ba_2026_escrivao_policia_civil/);
  assert.doesNotMatch(bundle + map, /pc_ba_2026_delegado_policia_civil/);
  assert.match(catalog, /id:\s*['"]pc_al_2026['"]/);
  assert.doesNotMatch(catalog, /pc_ba_2026/);
});
