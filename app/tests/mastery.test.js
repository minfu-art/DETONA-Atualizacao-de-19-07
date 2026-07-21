import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyGlobalMasteryToPlayer, applyOfficialMasteryAttempt, disciplineMastery, globalMastery,
  levelFromMastery, masteryFromAttempt, migrateSubtopicMastery,
} from '../js/core/mastery.js';
import { contestDatabaseName } from '../js/core/db.js';
import { applyXp, starsFromAccuracy } from '../js/core/progression.js';

test('simulado oficial calcula 9/10, 5/10 e 10/10', () => {
  assert.equal(masteryFromAttempt(9, 10), 90);
  assert.equal(masteryFromAttempt(5, 10), 50);
  assert.equal(masteryFromAttempt(10, 10), 100);
});

test('melhor domínio é monotônico', () => {
  const first = applyOfficialMasteryAttempt({ id: 's', best_accuracy: 0 }, { correct: 8, total: 10, attemptedAt: '2026-01-01', questionIds: ['1'] }).subtopic;
  const lower = applyOfficialMasteryAttempt(first, { correct: 6, total: 10, attemptedAt: '2026-01-02', questionIds: ['2'] }).subtopic;
  const higher = applyOfficialMasteryAttempt(lower, { correct: 9, total: 10, attemptedAt: '2026-01-03', questionIds: ['3'] }).subtopic;
  assert.equal(lower.best_accuracy, 80);
  assert.equal(higher.best_accuracy, 90);
  assert.equal(higher.best_correct_answers, 9);
  assert.equal(higher.attempts_count, 3);
});

test('subtópico não realizado conta como zero', () => {
  assert.equal(globalMastery([{ best_accuracy: 90 }, {}]), 45);
});

test('cenários globais obrigatórios', () => {
  assert.equal(levelFromMastery(globalMastery([...Array(50).fill({ best_accuracy: 90 }), ...Array(50).fill({ best_accuracy: 0 })])), 45);
  assert.equal(levelFromMastery(globalMastery(Array(100).fill({ best_accuracy: 90 }))), 90);
  assert.equal(levelFromMastery(globalMastery(Array(100).fill({ best_accuracy: 50 }))), 50);
  assert.equal(levelFromMastery(globalMastery([...Array(50).fill({ best_accuracy: 100 }), ...Array(50).fill({ best_accuracy: 0 })])), 50);
});

test('barra da disciplina usa média dos seus subtópicos', () => {
  const subs = [...Array(5).fill(0).map(() => ({ discipline_id: 'port', best_accuracy: 90 })), ...Array(5).fill(0).map(() => ({ discipline_id: 'port', best_accuracy: 0 }))];
  assert.equal(disciplineMastery(subs, 'port'), 45);
});

test('nível global pesa subtópicos diretamente, não disciplinas', () => {
  const subs = [...Array(20).fill(0).map(() => ({ discipline_id: 'port', best_accuracy: 100 })), ...Array(5).fill(0).map(() => ({ discipline_id: 'info', best_accuracy: 0 }))];
  assert.equal(globalMastery(subs), 80);
  assert.notEqual(globalMastery(subs), (disciplineMastery(subs, 'port') + disciplineMastery(subs, 'info')) / 2);
});

test('simulado incompleto não altera domínio', () => {
  const before = { id: 's', best_accuracy: 80, attempts_count: 1 };
  const result = applyOfficialMasteryAttempt(before, { correct: 5, total: 8, attemptedAt: '2026-01-02', questionIds: [] });
  assert.equal(result.official, false);
  assert.deepEqual(result.subtopic, before);
});

test('progresso permanece separado por usuário e concurso', () => {
  assert.notEqual(contestDatabaseName('u1', 'pc'), contestDatabaseName('u2', 'pc'));
  assert.notEqual(contestDatabaseName('u1', 'pc'), contestDatabaseName('u1', 'pf'));
});

test('LV é limitado ao intervalo de zero a cem e preserva XP separado', () => {
  assert.equal(levelFromMastery(-10), 0);
  assert.equal(levelFromMastery(150), 100);
  const player = applyGlobalMasteryToPlayer({ level: 37, xp: 20 }, [{ best_accuracy: 90 }]);
  assert.equal(player.level, 90);
  assert.equal(player.xp_level, 37);
});

test('migração prioriza percentual, acertos e não inventa valor pelas estrelas', () => {
  assert.equal(migrateSubtopicMastery({ melhorPercentual: 80, best_correct_answers: 9, best_total_questions: 10 }).best_accuracy, 80);
  assert.equal(migrateSubtopicMastery({ best_correct_answers: 9, best_total_questions: 10, best_accuracy: 70 }).best_accuracy, 90);
  const ambiguous = migrateSubtopicMastery({ stars: 4, attempts_count: 1 });
  assert.equal(ambiguous.best_accuracy, 0);
  assert.ok(ambiguous.mastery_migration_review.length > 0);
});

test('média mantém precisão antes do piso visual', () => {
  const values = [45.67, 45.67, 45.67];
  const mastery = globalMastery(values.map((best_accuracy) => ({ best_accuracy })));
  assert.ok(Math.abs(mastery - 45.67) < 1e-10);
  assert.equal(levelFromMastery(mastery), 45);
});

test('XP permanece separado do LV', () => {
  const player = { level: 50, mastery_pct: 50, xp_level: 1, xp: 0, edital_completion_pct: 0 };
  applyXp(player, 100);
  assert.equal(player.level, 50);
  assert.equal(player.xp_level, 2);
});

test('estrelas representam o domínio em passos de meia estrela', () => {
  assert.deepEqual(
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(starsFromAccuracy),
    [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
  );
  assert.equal(starsFromAccuracy(0), 0);
});

test('tentativa inferior não reduz as estrelas do melhor resultado', () => {
  const first = applyOfficialMasteryAttempt(
    { id: 'stars', best_accuracy: 0 },
    { correct: 5, total: 10, attemptedAt: '2026-01-01', questionIds: ['1'] },
  ).subtopic;
  const lower = applyOfficialMasteryAttempt(
    first,
    { correct: 3, total: 10, attemptedAt: '2026-01-02', questionIds: ['2'] },
  ).subtopic;
  const higher = applyOfficialMasteryAttempt(
    lower,
    { correct: 8, total: 10, attemptedAt: '2026-01-03', questionIds: ['3'] },
  ).subtopic;

  assert.equal(starsFromAccuracy(first.best_accuracy), 2.5);
  assert.equal(starsFromAccuracy(lower.best_accuracy), 2.5);
  assert.equal(starsFromAccuracy(higher.best_accuracy), 4);
  assert.equal(first.stars, 2.5);
  assert.equal(lower.stars, 2.5);
  assert.equal(higher.stars, 4);
});

test('batalha diaria nao consulta subtopico sem chave', async () => {
  const source = await readFile(new URL('../js/core/battle.js', import.meta.url), 'utf8');
  assert.match(source, /let subtopic = opts\.daily \? null : await getById\(STORES\.subtopics, subtopicId\)/);
});

test('resultado inferior preserva domínio legado mesmo sem total histórico', () => {
  const result = applyOfficialMasteryAttempt(
    { id: 'legacy', best_accuracy: 80, attempts_count: 1 },
    { correct: 4, total: 10, attemptedAt: '2026-07-15', questionIds: ['q1'] },
  );
  assert.equal(result.subtopic.best_accuracy, 80);
  assert.equal(result.improved, false);
});

test('histórico registra respondidas, corretas, erradas e revisão', () => {
  const result = applyOfficialMasteryAttempt(
    { id: 'history' },
    {
      correct: 1, total: 10, attemptedAt: '2026-07-15T12:00:00.000Z',
      questionIds: ['q1', 'q2'],
      results: [{ questionId: 'q1', correct: true }, { questionId: 'q2', correct: false }],
    },
  ).subtopic;
  assert.deepEqual(result.questoesRespondidas, ['q1', 'q2']);
  assert.deepEqual(result.questoesAcertadas, ['q1']);
  assert.deepEqual(result.questoesErradas, ['q2']);
  assert.deepEqual(result.questoesRevisao, ['q2']);
  assert.equal(result.historicoQuestoes.q2.incorrectCount, 1);
  assert.equal(result.ultimaTentativa, 10);
  assert.equal(result.ultimaData, '2026-07-15T12:00:00.000Z');
});
