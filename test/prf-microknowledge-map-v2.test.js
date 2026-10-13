import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const map = readJson('../course-drafts/prf-pre-edital/master-microknowledge-map-v2.draft.json');
const index = readJson('../course-drafts/prf-pre-edital/sources/contran-2026-10-13-official-index.v1.json');

test('PRF draft map covers the curriculum while blocking publication', () => {
  assert.equal(map.publication_blocked, true);
  assert.equal(map.summary.disciplines, 14);
  assert.equal(map.subtopics.length, 246);
  assert.equal(map.summary.subtopics_pending_decomposition, 0);
  assert.ok(map.subtopics.every((item) => item.microknowledge_count > 0));
  const units = map.subtopics.flatMap((item) => item.microknowledges);
  assert.equal(new Set(units.map((unit) => unit.id)).size, units.length);
  assert.equal(units.filter((unit) => unit.status === 'existing_editorial').length, 378);
  assert.equal(units.filter((unit) => unit.status === 'new_draft_requires_editorial_review').length, 676);
  assert.ok(units.filter((unit) => unit.status === 'new_draft_requires_editorial_review')
    .every((unit) => unit.scope_review_required && unit.traces[0].canonical_subtopic_id));
});

test('every historical CONTRAN resolution has source status and year mismatches stay visible', () => {
  const traffic = map.subtopics.filter((item) => item.discipline === 'Legislação de Trânsito');
  const linked = traffic.filter((item) => item.contran_index_evidence);
  assert.equal(linked.length, 39);
  assert.equal(index.index_indicates_revoked, 31);
  assert.deepEqual(index.edital_index_year_mismatches, [92, 210]);
  assert.equal(index.retified_2021_resolution_count, 34);
  assert.deepEqual(index.removed_from_retified_2021_list, [268, 292, 453, 619, 723]);
  assert.equal(linked.filter((item) => item.contran_index_evidence.retified_2021_scope === 'removed_from_retified_list').length, 5);
  assert.deepEqual(linked.filter((item) => item.contran_index_evidence.edital_index_year_mismatch)
    .map((item) => item.contran_index_evidence.resolution_number), [92, 210]);
  assert.ok(linked.every((item) => item.normative_reconciliation_required));
});
