import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const map = readJson('../course-drafts/prf-pre-edital/master-microknowledge-map-v2.draft.json');
const manifest = readJson('../course-drafts/prf-pre-edital/usb-review/microknowledge-link-candidates.v1.json');

test('USB suggestions cover every source ID without pretending to be approved links', () => {
  const known = new Map(map.subtopics.flatMap((subtopic) =>
    subtopic.microknowledges.map((unit) => [unit.id, subtopic])));
  assert.equal(manifest.question_count, 6674);
  assert.equal(manifest.questions.length, 6674);
  assert.equal(new Set(manifest.questions.map((item) => item.id)).size, 6674);
  assert.ok(manifest.questions.every((item) => item.assigned_microknowledge_id === null));
  assert.ok(manifest.questions.every((item) => item.candidates.length <= 3 &&
    item.candidates.every((candidate) => known.get(candidate.microknowledge_id)?.subtopic_id === candidate.subtopic_id)));
  assert.equal(manifest.summary.high_lexical_overlap_only +
    manifest.summary.weak_or_ambiguous_candidate +
    manifest.summary.no_lexical_candidate, 6674);
  assert.equal(manifest.summary.visual_reference_without_attachment, 130);
  assert.equal(manifest.summary.truncated_answer_marker, 25);
  assert.equal(manifest.summary.answer_leaked_in_statement, 8);
  assert.equal(manifest.summary.answer_conflict_requires_independent_verification, 11);
});
