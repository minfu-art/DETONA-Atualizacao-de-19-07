import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyStudyStreak } from '../js/core/battle.js';
import {
  buildEmblemCatalog,
  getConsistencyThresholds,
} from '../js/data/emblemCatalog.js';
import {
  collectEmblemMetrics,
  decorateEmblems,
  evaluateEmblems,
  normalizeEarnedState,
  refreshEmblems,
} from '../js/services/emblemService.js';

test('1. catálogo tem as quatro categorias obrigatórias', () => {
  assert.deepEqual([...new Set(buildEmblemCatalog(120).map((item) => item.category))],
    ['missions', 'focus', 'consistency', 'domain']);
});

test('2. missões usam os sete marcos definidos', () => {
  assert.deepEqual(buildEmblemCatalog(120).filter((item) => item.category === 'missions').map((item) => item.threshold),
    [1, 10, 25, 50, 100, 250, 500]);
});

test('3. foco usa os seis marcos definidos', () => {
  assert.deepEqual(buildEmblemCatalog(120).filter((item) => item.category === 'focus').map((item) => item.threshold),
    [3, 7, 15, 30, 60, 100]);
});

test('4. constância completa respeita o teto de 120 dias', () => {
  assert.deepEqual(getConsistencyThresholds(500), [3, 7, 14, 30, 60, 90, 120]);
});

test('5. constância curta limita os marcos à reta final da prova', () => {
  assert.deepEqual(getConsistencyThresholds(45), [3, 7, 14, 30]);
});

test('6. prova muito próxima não inventa marco inalcançável', () => {
  assert.deepEqual(getConsistencyThresholds(2), []);
});

test('7. missões contam battleIds oficiais únicos e concluídos', () => {
  const metrics = collectEmblemMetrics({
    subtopics: [{ attempt_history: [{ battleId: 'a' }, { battleId: 'b' }] }],
    metaRows: [
      { key: 'battle_finalization:a', battleId: 'a', status: 'completed' },
      { key: 'battle_finalization:b', battleId: 'b', status: 'processing' },
    ],
  });
  assert.equal(metrics.missions, 1);
});

test('8. histórico legado sem journal continua contabilizado uma vez', () => {
  const metrics = collectEmblemMetrics({
    subtopics: [{ attempt_history: [{ battleId: 'legacy' }, { battleId: 'legacy' }] }],
  });
  assert.equal(metrics.missions, 1);
});

test('9. metas contam somente datas únicas cumpridas', () => {
  const metrics = collectEmblemMetrics({
    dailyLogs: [
      { date: '2026-07-01', status: 'cumprido' },
      { date: '2026-07-01', status: 'cumprido' },
      { date: '2026-07-02', status: 'parcial' },
    ],
  });
  assert.equal(metrics.focus, 1);
});

test('10. constância usa o melhor streak histórico', () => {
  assert.equal(collectEmblemMetrics({ player: { streak_days: 4, best_streak: 9 } }).consistency, 9);
});

test('11. atualização de streak preserva o recorde', () => {
  const player = applyStudyStreak({ streak_days: 2, best_streak: 8, last_study_date: null }, '2026-07-23', '2026-07-22');
  assert.equal(player.best_streak, 8);
});

test('12. domínio conta apenas subtópicos em 100%', () => {
  assert.equal(collectEmblemMetrics({
    subtopics: [{ id: 'a', best_accuracy: 100 }, { id: 'b', best_accuracy: 99 }],
  }).domain, 1);
});

test('13. domínio total exige as três esferas em todos os itens', () => {
  const subtopics = [{ id: 'a', best_accuracy: 100 }];
  const incomplete = collectEmblemMetrics({
    subtopics,
    verticalized: [{ subtopic_id: 'a', theory_status: 'concluido', review_count: 0 }],
  });
  const complete = collectEmblemMetrics({
    subtopics,
    verticalized: [{ subtopic_id: 'a', theory_status: 'concluido', review_count: 1 }],
  });
  assert.equal(incomplete.domainAll, 0);
  assert.equal(complete.domainAll, 1);
});

test('14. desbloqueio é idempotente e não duplica itens', () => {
  const catalog = buildEmblemCatalog(120);
  const first = evaluateEmblems(catalog, { missions: 1 }, { version: 1, items: [] }, '2026-07-23T00:00:00Z');
  const retry = evaluateEmblems(catalog, { missions: 1 }, first.state, '2026-07-24T00:00:00Z');
  assert.equal(first.unlocked.length, 1);
  assert.equal(retry.unlocked.length, 0);
  assert.equal(retry.state.items.length, 1);
});

test('15. estado persistido nunca remove emblema antigo', () => {
  const result = evaluateEmblems(buildEmblemCatalog(3), {}, {
    version: 1,
    items: [{ id: 'missions_10', unlocked_at: '2026-01-01', source_metric: 'missions', source_value: 10 }],
  });
  assert.equal(result.state.items[0].id, 'missions_10');
});

test('16. normalização remove duplicatas sem trocar a primeira conquista', () => {
  const state = normalizeEarnedState({ items: [
    { id: 'missions_1', unlocked_at: 'primeira' },
    { id: 'missions_1', unlocked_at: 'segunda' },
  ] });
  assert.deepEqual(state.items, [{ id: 'missions_1', unlocked_at: 'primeira' }]);
});

test('17. progresso visual fica limitado entre zero e cem', () => {
  const catalog = [{ id: 'x', metric: 'missions', threshold: 10 }];
  assert.equal(decorateEmblems(catalog, { items: [] }, { missions: 50 })[0].progress, 100);
});

test('18. refresh persiste earned_emblems_v1 pelo repositório', async () => {
  const stores = {
    player: [{ streak_days: 3 }],
    subtopics: [],
    verticalized: [],
    dailyLogs: [],
    meta: [],
  };
  let saved = null;
  const repository = {
    getAll: async (store) => stores[store] || [],
    getMeta: async () => null,
    setMeta: async (key, value) => { saved = { key, value }; },
  };
  const result = await refreshEmblems({
    repository,
    daysUntilExam: 10,
    now: () => new Date('2026-07-23T12:00:00Z'),
  });
  assert.equal(result.unlocked[0].id, 'consistency_3');
  assert.equal(saved.key, 'earned_emblems_v1');
  assert.equal(saved.value.version, 1);
});

test('interface contém HUD de quatro blocos, galeria e SVG nativo', async () => {
  const [home, profile, art, css] = await Promise.all([
    readFile(new URL('../js/ui/home.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/ui/profile.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/ui/emblems/emblemArt.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/dashboard-jrpg.css', import.meta.url), 'utf8'),
  ]);
  assert.match(home, /today-emblems/);
  assert.match(profile, /profile-emblems/);
  assert.match(art, /<svg viewBox=/);
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
});

test('marco de constância conquistado continua visível quando a prova se aproxima', async () => {
  const repository = {
    getAll: async (store) => store === 'player' ? [{ best_streak: 60 }] : [],
    getMeta: async () => ({
      version: 1,
      items: [{ id: 'consistency_60', unlocked_at: '2026-01-01', source_metric: 'consistency', source_value: 60 }],
    }),
    setMeta: async () => {},
  };
  const result = await refreshEmblems({ repository, daysUntilExam: 45 });
  assert.equal(result.emblems.find((emblem) => emblem.id === 'consistency_60')?.earned, true);
});
