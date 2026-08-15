import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildPcBaInvestigatorDraft,
  DISCIPLINE_ALIASES,
} from '../scripts/generate-pc-ba-investigador-draft.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftDir = path.join(root, 'course-drafts', 'pc-ba-2026-investigador');

async function json(relative) {
  return JSON.parse(await readFile(path.join(draftDir, relative), 'utf8'));
}

async function rebuild() {
  const canonicalBytes = await readFile(path.join(draftDir, 'sources', 'curriculum.canonical.json'));
  const overlayBytes = await readFile(path.join(draftDir, 'sources', 'curriculum.fragmentation-overlay.json'));
  return buildPcBaInvestigatorDraft({
    canonical: JSON.parse(canonicalBytes.toString('utf8')),
    overlay: JSON.parse(overlayBytes.toString('utf8')),
    canonicalBytes,
    overlayBytes,
  });
}

test('draft PC BA é determinístico e preserva as fontes auditadas', async () => {
  const generated = await rebuild();
  assert.deepEqual(await json('fragment-bindings.json'), generated.bindingMap);
  assert.deepEqual(await json('binding-report.json'), generated.report);
  assert.deepEqual(await json('bundle.draft.json'), generated.bundle);
});

test('mapa cobre 14 disciplinas, 161 tópicos, 296 subtópicos e 420 fragmentos', async () => {
  const map = await json('fragment-bindings.json');
  const fragmentIds = new Set(map.bindings.map(({ fragment_id }) => fragment_id));
  const disciplineIds = new Set(map.bindings.map(({ discipline_id }) => discipline_id));
  const topicIds = new Set(map.bindings.map(({ topic_id }) => topic_id));
  const subtopicIds = new Set(map.bindings.map(({ subtopic_id }) => subtopic_id).filter(Boolean));
  assert.equal(map.bindings.length, 420);
  assert.equal(fragmentIds.size, 420);
  assert.equal(disciplineIds.size, 14);
  assert.equal(topicIds.size, 161);
  assert.equal(subtopicIds.size, 296);
  assert.equal(map.counts.fragments_linked, 420);
  assert.equal(map.counts.orphan_fragments, 0);
});

test('aliases preservam os quatro nomes originais sem sobrescrever o overlay', async () => {
  const map = await json('fragment-bindings.json');
  const overlay = await json('sources/curriculum.fragmentation-overlay.json');
  const originalNames = new Set(overlay.disciplines.map(({ name }) => name));
  assert.equal(map.discipline_aliases.length, 4);
  for (const [original, canonical] of Object.entries(DISCIPLINE_ALIASES)) {
    assert.ok(originalNames.has(original));
    assert.ok(map.discipline_aliases.some((alias) => (
      alias.overlay_name === original && alias.canonical_name === canonical
    )));
  }
});

test('Contabilidade 3.1 e 3.2 usam o mesmo subtopic_id canônico sem criar ID', async () => {
  const map = await json('fragment-bindings.json');
  const concept = map.bindings.find(({ fragment_id }) => fragment_id === 'pc_ba_2026_inv_frag_5722df3298ce');
  const facts = map.bindings.find(({ fragment_id }) => fragment_id === 'pc_ba_2026_inv_frag_2b3b0150d1ee');
  assert.ok(concept?.subtopic_id);
  assert.equal(facts?.subtopic_id, concept.subtopic_id);
  assert.equal(facts.binding_method, 'documented_accounting_3_1_3_2_shared_canonical_subtopic');
});

test('exceção penal permanece topic-scoped em vez de inventar subtopic_id', async () => {
  const report = await json('binding-report.json');
  const map = await json('fragment-bindings.json');
  const topicScoped = map.bindings.filter(({ binding_scope }) => binding_scope === 'topic');
  assert.equal(topicScoped.length, 2);
  assert.ok(topicScoped.every(({ subtopic_id }) => subtopic_id === null));
  assert.equal(report.ambiguities.length, 2);
  assert.ok(report.ambiguities.every(({ type }) => type === 'canonical_subtopic_absent'));
});

test('bundle draft isola Investigador e bloqueia efeitos remotos', async () => {
  const bundle = await json('bundle.draft.json');
  const serialized = JSON.stringify(bundle);
  assert.equal(bundle.status, 'draft');
  assert.equal(bundle.contest.id, 'pc_ba_2026');
  assert.equal(bundle.position.id, 'pc_ba_2026_investigador_policia_civil');
  assert.equal(bundle.offering.id, 'pc_ba_2026_investigador');
  assert.equal(bundle.offering.sales_status, 'unavailable');
  assert.equal(bundle.authorization.import_authorized, false);
  assert.equal(bundle.authorization.publication_authorized, false);
  assert.equal(bundle.authorization.question_generation_authorized, false);
  assert.equal(bundle.authorization.remote_migration_authorized, false);
  assert.equal(bundle.authorization.entitlement_grant_authorized, false);
  assert.deepEqual(bundle.questions, []);
  assert.doesNotMatch(serialized, /pc_ba_2026_escrivao_policia_civil/);
  assert.doesNotMatch(serialized, /pc_ba_2026_delegado_policia_civil/);
});

test('artefatos PC BA não alteram a definição comercial existente da PC AL', async () => {
  const catalog = await readFile(path.join(root, 'app', 'js', 'contest', 'contestCatalog.js'), 'utf8');
  assert.match(catalog, /id:\s*['"]pc_al_2026['"]/);
  assert.match(catalog, /role:\s*['"]Agente e Escrivao['"]/);
  assert.doesNotMatch(catalog, /pc_ba_2026/);
});
