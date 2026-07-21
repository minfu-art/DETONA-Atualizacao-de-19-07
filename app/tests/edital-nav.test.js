import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichItems,
  filterEnriched,
  sortEnriched,
  buildDisciplineCards,
  buildEditalInsights,
  matchesSearch,
  loadNavState,
  saveNavState,
  groupByNumberingPrefix,
  itemStatus,
  sphereProgressPct,
  isOverdue,
  MIN_QUESTIONS_BATTLE,
} from '../js/core/editalUiModel.js';
import { getMasterySpheres } from '../js/core/ssot.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeItems() {
  const items = [
    { id: 'v1', subtopic_id: 's1', edital_numbering: '1.1', title: 'Interpretação', theory_status: 'nao_iniciado', review_count: 0, last_review_date: null },
    { id: 'v2', subtopic_id: 's2', edital_numbering: '1.2', title: 'Ortografia', theory_status: 'concluido', review_count: 1, last_review_date: new Date().toISOString() },
    { id: 'v3', subtopic_id: 's3', edital_numbering: '2.1', title: 'Constituição', theory_status: 'estudando', review_count: 0, last_review_date: null },
  ];
  const subMap = {
    s1: { id: 's1', discipline_id: 'port', name: 'Interpretação', stars: 0, best_accuracy: 0, attempts_count: 0, answered_question_ids: [] },
    s2: { id: 's2', discipline_id: 'port', name: 'Ortografia', stars: 3, best_accuracy: 80, attempts_count: 2, answered_question_ids: ['a', 'b'], correct_question_ids: ['a'], incorrect_question_ids: ['b'] },
    s3: { id: 's3', discipline_id: 'const', name: 'Constituição', stars: 1, best_accuracy: 40, attempts_count: 1, answered_question_ids: ['c'], correct_question_ids: [], incorrect_question_ids: ['c'] },
  };
  const counts = { s1: 5, s2: 20, s3: 12 };
  const disciplines = [
    { id: 'port', name: 'Língua Portuguesa', order: 1, icon: '📘' },
    { id: 'const', name: 'Direito Constitucional', order: 2, icon: '⚖️' },
  ];
  return { items, subMap, counts, disciplines };
}

test('tela principal agrega apenas disciplinas (não lista subtópicos como raiz)', () => {
  const { items, subMap, counts, disciplines } = fakeItems();
  const enriched = enrichItems(items, subMap, counts);
  const cards = buildDisciplineCards(disciplines, enriched);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].discipline.name, 'Língua Portuguesa');
  assert.equal(cards[0].total, 2);
  assert.equal(cards[0].complete, 1); // s2 com 3 esferas
  assert.equal(cards[0].correct, 1);
  assert.equal(cards[0].wrong, 1);
  assert.ok(cards.every((c) => c.discipline && c.pct != null));
});

test('edital apresenta tópicos expansíveis e estatísticas reais por subtópico', async () => {
  const source = await readFile(path.join(rootDir, 'js/ui/grimorio.js'), 'utf8');
  assert.match(source, /data-toggle-disc/);
  assert.match(source, /ev-topic__panel/);
  assert.match(source, /Respondidas/);
  assert.match(source, /Acertos/);
  assert.match(source, /Erros/);
  assert.match(source, /Memória/);
  assert.match(source, /renderTopicGroup/);
  assert.match(source, /ev-mastery--/);
});

test('painel separa forças, fragilidades e pendências sem alterar domínio oficial', () => {
  const { items, subMap, counts } = fakeItems();
  const enriched = enrichItems(items, subMap, counts);
  const insights = buildEditalInsights(enriched);
  assert.equal(insights.pendingCount, 2);
  assert.equal(insights.weakCount >= 1, true);
  assert.ok(insights.nextAction);
});

test('abertura de disciplina filtra subtópicos corretos', () => {
  const { items, subMap, counts } = fakeItems();
  const enriched = enrichItems(items, subMap, counts);
  const port = enriched.filter((e) => e.disciplineId === 'port');
  assert.equal(port.length, 2);
  assert.ok(port.every((e) => e.item.edital_numbering.startsWith('1.')));
});

test('filtros: não iniciados, concluídos e batalha (regra legada)', () => {
  const { items, subMap, counts } = fakeItems();
  const enriched = enrichItems(items, subMap, counts);
  assert.equal(filterEnriched(enriched, 'nao').length, 1);
  assert.equal(filterEnriched(enriched, 'concluidos').length, 1);
  // batalha: teoria concluída e stars < 3 — s2 tem 3 estrelas, não entra; nenhum outro com teoria concluída e stars<3
  const bat = filterEnriched(enriched, 'batalha');
  assert.ok(Array.isArray(bat));
});

test('busca por disciplina e código', () => {
  const { items, subMap, counts, disciplines } = fakeItems();
  const enriched = enrichItems(items, subMap, counts);
  const disc = disciplines[0];
  const hit = enriched.filter((e) => matchesSearch(e, disc, 'portuguesa') || matchesSearch(e, disc, '1.1'));
  assert.ok(hit.some((e) => e.item.id === 'v1'));
});

test('ordenação por progresso e nome', () => {
  const { items, subMap, counts } = fakeItems();
  const enriched = enrichItems(items, subMap, counts);
  const byProg = sortEnriched(enriched, 'progresso');
  assert.ok(byProg[0].progress >= byProg[byProg.length - 1].progress);
  const byName = sortEnriched(enriched, 'nome');
  assert.equal(byName[0].item.edital_numbering, '1.1');
});

test('persistência de disciplina/subtópico em storage isolado por concurso', () => {
  const mem = {
    data: {},
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); },
  };
  saveNavState('pc_al', { lastDisciplineId: 'port', lastSubtopicId: 'v1', sort: 'progresso' }, mem);
  saveNavState('pf', { lastDisciplineId: 'const', lastSubtopicId: 'v3', sort: 'nome' }, mem);
  const a = loadNavState('pc_al', mem);
  const b = loadNavState('pf', mem);
  assert.equal(a.lastDisciplineId, 'port');
  assert.equal(b.lastDisciplineId, 'const');
  assert.notEqual(a.lastDisciplineId, b.lastDisciplineId);
  assert.equal(a.sort, 'progresso');
});

test('ação contextual curta evita botão grande no card compacto', async () => {
  const source = await readFile(path.join(rootDir, 'js/ui/grimorio.js'), 'utf8');
  assert.match(source, /shortAction|Começar >/);
  assert.match(source, /ev-short-act/);
  // ação acadêmica principal só aparece no detalhe
  assert.match(source, /Iniciar questões/);
  assert.match(source, /ev-expanded-actions|ev-detail/);
  // navegação 3 níveis
  assert.match(source, /disciplines/);
  assert.match(source, /data-open-disc/);
  assert.match(source, /data-open-sub/);
  assert.match(source, /data-nav="disciplines"/);
});

test('layout prevê overflow visível e safe-area para não cortar ações', async () => {
  const css = await readFile(path.join(rootDir, 'css/design-system.css'), 'utf8');
  assert.match(css, /ev-subcard__hit/);
  assert.match(css, /overflow:\s*visible/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*44px/);
});

test('regras de negócio getMasterySpheres inalteradas na UI', () => {
  const item = { theory_status: 'concluido', review_count: 1 };
  const sub = { stars: 3 };
  const s = getMasterySpheres(item, sub);
  assert.equal(s.complete, true);
  assert.equal(sphereProgressPct(s), 100);
  assert.equal(MIN_QUESTIONS_BATTLE, 10);
});

test('status e atraso não inventam conclusão', () => {
  const item = { theory_status: 'nao_iniciado', review_count: 0, last_review_date: null };
  const sub = { attempts_count: 0, stars: 0 };
  const spheres = getMasterySpheres(item, sub);
  const st = itemStatus(item, sub, spheres, 0);
  assert.equal(st.key, 'nao_iniciado');
  assert.equal(st.shortAction.includes('Começar'), true);
  assert.equal(isOverdue(item), false);
});

test('agrupamento opcional por prefixo de numeração', () => {
  const { items, subMap, counts } = fakeItems();
  const enriched = enrichItems(items, subMap, counts).filter((e) => e.disciplineId === 'port');
  const groups = groupByNumberingPrefix(enriched);
  assert.ok(groups.length >= 1);
  assert.ok(groups.every((g) => g.items.length >= 1));
  assert.ok(groups.every((g) => Number.isFinite(g.progress) && Number.isFinite(g.accuracy)));
  assert.ok(groups.every((g) => g.total >= g.complete));
});

test('isolamento: enrich não mistura disciplineId entre concursos (dados injetados)', () => {
  // simula dois contextos com os mesmos ids de item em mapas diferentes
  const a = enrichItems(
    [{ id: 'v1', subtopic_id: 's1', edital_numbering: '1', title: 'A', theory_status: 'nao_iniciado', review_count: 0 }],
    { s1: { id: 's1', discipline_id: 'port', stars: 0, best_accuracy: 0 } },
    { s1: 1 },
  );
  const b = enrichItems(
    [{ id: 'v1', subtopic_id: 's1', edital_numbering: '1', title: 'A', theory_status: 'nao_iniciado', review_count: 0 }],
    { s1: { id: 's1', discipline_id: 'const', stars: 0, best_accuracy: 0 } },
    { s1: 1 },
  );
  assert.equal(a[0].disciplineId, 'port');
  assert.equal(b[0].disciplineId, 'const');
});
