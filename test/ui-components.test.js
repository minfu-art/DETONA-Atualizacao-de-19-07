import test from 'node:test';
import assert from 'node:assert/strict';

import {
  actionCard, appCard, characterPanel, emptyState, enemyPanel, errorState,
  feedbackMessage, gamePanel, levelBadge, masteryBadge, prefersReducedMotion,
  progressBar, statusBadge, xpBar,
} from '../app/js/ui/components.js';
import { clearActiveContestId, getActiveContestId, setActiveContestId } from '../app/js/contest/activeContest.js';
import { CONTEST_CATALOG } from '../app/js/contest/contestCatalog.js';
import { decodeKafraPayload, encodeKafraSnapshot } from '../app/js/core/kafra.js';

test('barra de progresso limita valores e oferece alternativa acessivel', () => {
  const html = progressBar({ value: 140, label: 'Edital' });
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="100"/);
  assert.match(html, /--progress:100%/);
});

test('estados visualmente essenciais nao dependem apenas de cor', () => {
  assert.match(statusBadge('Em preparacao', 'warning'), /Em preparacao/);
  assert.match(feedbackMessage({ correct: false, explanation: 'Revise a regra.' }), /adicionada automaticamente à sua revisão/);
  assert.match(feedbackMessage({ correct: true }), /Resposta dominada/);
});

test('estado vazio possui semantica e orientacao clara', () => {
  const html = emptyState({ title: 'Sem atividades', description: 'Planeje seu primeiro dia.' });
  assert.match(html, /role="status"/);
  assert.match(html, /Planeje seu primeiro dia/);
});

test('preferencia de movimento reduzido e respeitada', () => {
  assert.equal(prefersReducedMotion(() => ({ matches: true })), true);
  assert.equal(prefersReducedMotion(() => ({ matches: false })), false);
});

test('componentes RPG reutilizaveis preservam semantica e dados reais', () => {
  assert.match(appCard({ content: '<strong>Real</strong>', label: 'Resumo real' }), /aria-label="Resumo real"/);
  assert.match(gamePanel({ title: 'Jornada', content: 'Conteudo', tone: 'data' }), /ds-game-panel--data/);
  assert.match(xpBar({ value: 50, current: 500, target: 1000 }), /500\/1000 XP/);
  assert.match(levelBadge(27), /Nível 27/);
  assert.match(masteryBadge({ label: 'Mestre', value: '85%', tone: 'gold' }), /85%/);
  assert.match(actionCard({ title: 'Continuar', description: 'Retome seu estudo.' }), /Retome seu estudo/);
  assert.match(characterPanel({ name: 'Guia', role: 'Conhecimento' }), /Conhecimento/);
  assert.match(enemyPanel({ progress: 72, detail: '72%' }), /aria-valuenow="72"/);
  assert.match(errorState({ title: 'Falha', description: 'Tente novamente.' }), /role="alert"/);
});

test('navegacao persiste o concurso ativo para restaurar a Home após atualizar', () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try {
    clearActiveContestId();
    assert.equal(getActiveContestId(), null);
    setActiveContestId('pc_al_2026');
    assert.equal(getActiveContestId(), 'pc_al_2026');
    assert.equal(values.get('detona.activeContestId'), 'pc_al_2026');
    clearActiveContestId();
    assert.equal(getActiveContestId(), null);
    assert.equal(values.has('detona.activeContestId'), false);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('PC AL esta pronto e PF/PRF permanecem em preparacao', () => {
  const states = Object.fromEntries(CONTEST_CATALOG.map((contest) => [contest.id, contest.contentStatus]));
  assert.equal(states.pc_al_2026, 'ready');
  assert.equal(states.pf_2026, 'preparing');
  assert.equal(states.prf_2026, 'preparing');
});

test('Kafra restaura snapshot do concurso sem perder identificacao', () => {
  const snapshot = { app: 'DETONA_CONCURSOS', contest_id: 'pc_al_2026', player: { id: 'player', xp: 4321 } };
  assert.deepEqual(decodeKafraPayload(encodeKafraSnapshot(snapshot)), snapshot);
  assert.deepEqual(decodeKafraPayload(JSON.stringify(snapshot)), snapshot);
});
