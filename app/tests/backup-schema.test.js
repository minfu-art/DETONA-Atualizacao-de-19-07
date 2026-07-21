import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRestorePlanInMemory, BACKUP_VERSION, createBackupEnvelope, normalizeBackupPayload, prepareRestoreCollections } from '../js/core/backupSchema.js';

const current = {
  player: [{ id: 'player', name: 'Atual', level: 7 }], disciplines: [{ id: 'port' }], subtopics: [], questions: [{ id: 'q1' }],
  verticalized: [{ id: 'v1', theory_status: 'concluido' }], routines: [{ day_of_week: 1, goal_amount: 30 }],
  dailyLogs: [{ date: '2026-07-15', completed_amount: 10 }], mvpCards: [{ id: 'c1' }],
  wellbeingHabits: [], wellbeingLogs: [], reviewQueue: [{ questionId: 'q1', status: 'pending' }], meta: [{ key: 'seeded', value: true }],
};

test('novo backup possui versão, metadados e coleções', () => {
  const backup = createBackupEnvelope({ ...current, player: current.player[0] }, 'pc_al_2026');
  assert.equal(backup.backupVersion, BACKUP_VERSION);
  assert.equal(backup.collections.reviewQueue[0].questionId, 'q1');
  assert.equal(backup.metadata.contestId, 'pc_al_2026');
  assert.equal(backup.collections.player[0].level, 7);
  assert.ok(backup.exportedAt);
});

test('backup legado continua normalizável', () => {
  const legacy = { app: 'DETONA_CONCURSOS', version: 2, contest_id: 'pc_al_2026', player: current.player[0], routines: current.routines };
  const normalized = normalizeBackupPayload(legacy);
  assert.equal(normalized.metadata.contestId, 'pc_al_2026');
  assert.equal(normalized.collections.player[0].name, 'Atual');
});

test('backup inválido não altera a cópia atual', () => {
  const before = structuredClone(current);
  assert.throws(() => applyRestorePlanInMemory(current, { app: 'OUTRO' }, 'pc_al_2026'));
  assert.deepEqual(current, before);
});

test('coleção ausente preserva progresso, perfil, metas e histórico', () => {
  const partial = { app: 'DETONA_CONCURSOS', backupVersion: 2, metadata: { contestId: 'pc_al_2026' }, collections: { player: [{ id: 'player', name: 'Restaurado' }] } };
  const restored = applyRestorePlanInMemory(current, partial, 'pc_al_2026');
  assert.equal(restored.player[0].name, 'Restaurado');
  assert.deepEqual(restored.routines, current.routines);
  assert.deepEqual(restored.dailyLogs, current.dailyLogs);
  assert.deepEqual(restored.verticalized, current.verticalized);
  assert.deepEqual(restored.mvpCards, current.mvpCards);
});

test('restauração parcial inválida é rejeitada integralmente', () => {
  const invalid = { app: 'DETONA_CONCURSOS', backupVersion: 2, collections: { player: [] } };
  assert.throws(() => prepareRestoreCollections(invalid, current, 'pc_al_2026'), /perfil/);
  assert.equal(current.player[0].name, 'Atual');
});

test('backup de outro concurso é rejeitado', () => {
  const payload = { app: 'DETONA_CONCURSOS', backupVersion: 2, metadata: { contestId: 'pf_2026' }, collections: { player: current.player } };
  assert.throws(() => prepareRestoreCollections(payload, current, 'pc_al_2026'), /outro concurso/);
});

test('questão estruturalmente inválida bloqueia restauração antes da substituição', () => {
  const payload = { app: 'DETONA_CONCURSOS', backupVersion: 2, collections: { player: current.player, questions: [{ id: 'q-invalida' }] } };
  assert.throws(() => prepareRestoreCollections(payload, current, 'pc_al_2026'), /questão estruturalmente inválida/);
  assert.deepEqual(current.questions, [{ id: 'q1' }]);
});
