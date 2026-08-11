import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildPerformanceVisualModel,
  clampVisualPercent,
  formatPerformanceMinutes,
  formatPerformancePercent,
  performanceToneFromClassification,
} from '../js/ui/performanceVisualModel.js';
import { masteryHeroCard, renderPerformancePage, sortDisciplines } from '../js/ui/performance.js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = path.resolve(appRoot, '..');

function dashboard(overrides = {}) {
  return {
    period: '30d',
    progress: {
      completion: 42,
      remainingCompletion: 58,
      completedTopics: 18,
      totalTopics: 40,
      remainingTopics: 22,
    },
    overview: { answered: 82, correct: 56, errors: 26, accuracy: 68.2926829268 },
    disciplines: [
      {
        id: 'strong', name: 'Língua Portuguesa', order: 1, answered: 20, correct: 16, errors: 4,
        accuracy: 80, classification: 'Forte', masteryPct: 72, minutes: 130, subtopicCount: 1,
        subtopics: [{
          id: 'long', numbering: '1.1',
          name: 'Subtópico com nome muito longo '.repeat(8), answered: 10, correct: 8, errors: 2,
          accuracy: 80, classification: 'Forte', masteryPct: 70, stars: 3, memory: 'quente', minutes: 45,
        }],
      },
      { id: 'growing', name: 'Direito Constitucional', order: 2, answered: 20, correct: 12, errors: 8, accuracy: 60, classification: 'Em evolução', masteryPct: 45, minutes: 70, subtopicCount: 0, subtopics: [] },
      { id: 'attention', name: 'Tecnologia da Informação', order: 3, answered: 20, correct: 9, errors: 11, accuracy: 45, classification: 'Atenção', masteryPct: 30, minutes: 30, subtopicCount: 0, subtopics: [] },
      { id: 'priority', name: 'Disciplina prioritária', order: 4, answered: 20, correct: 4, errors: 16, accuracy: 20, classification: 'Prioridade de revisão', masteryPct: 10, minutes: 20, subtopicCount: 0, subtopics: [] },
      { id: 'empty', name: 'Disciplina sem respostas '.repeat(6), order: 5, answered: 0, correct: 0, errors: 0, accuracy: null, classification: 'Sem respostas', masteryPct: null, minutes: 0, subtopicCount: 0, subtopics: [] },
    ],
    time: {
      totalMinutes: 460,
      distributedMinutes: 400,
      undistributedMinutes: 60,
      hasDistribution: true,
      byDiscipline: [
        { id: 'strong', name: 'Língua Portuguesa', minutes: 300, percentage: 65 },
        { id: 'growing', name: 'Direito Constitucional', minutes: 100, percentage: 22 },
      ],
    },
    reviews: {
      completedInPeriod: 9,
      totalCompleted: 20,
      pending: 13,
      active: 13,
      due: 7,
      frozen: 2,
      memory: { quente: 7, morna: 6, fria: 0, congelada: 2 },
    },
    evolution: [
      { at: '2026-08-01T12:00:00', value: 50, accuracy: 50, answered: 10, correct: 5 },
      { at: '2026-08-02T12:00:00', value: 75, accuracy: 75, answered: 20, correct: 15 },
    ],
    summary: 'Você concluiu integralmente 42% do edital. Língua Portuguesa teve a maior taxa de acertos.',
    quality: { warnings: [], projection: { available: false, reason: 'EDITAL_COMPLETION_HISTORY_UNAVAILABLE' } },
    hasQuestionData: true,
    hasAnyData: true,
    ...overrides,
  };
}

const contest = { name: 'Polícia Civil de Alagoas', role: 'Agente e Escrivão' };

test('estrutura premium possui um h1, Orion e as oito áreas analíticas', () => {
  const html = renderPerformancePage(dashboard(), contest);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<main\b/g) || []).length, 0);
  for (const marker of [
    'Analista de desempenho', 'Indicadores principais', 'Desempenho por disciplina',
    '>Evolução<', 'Foco por disciplina', 'Memória e revisões', 'Progresso integral do edital',
  ]) assert.match(html, new RegExp(marker));
  for (const period of ['7 dias', '30 dias', '90 dias', 'Todo o histórico']) assert.match(html, new RegExp(period));
});

test('semântica separa conclusão integral, accuracy, teoria e domínio', () => {
  const html = renderPerformancePage(dashboard(), contest);
  assert.match(html, /Conclusão do edital/);
  assert.match(html, /Taxa de acertos/);
  assert.match(html, /Teoria concluída/);
  assert.match(html, /Domínio: 70%/);
  assert.doesNotMatch(html, /Cobertura do edital|Edital percorrido|Domínio do edital/);
});

test('ausência e zero observado permanecem diferentes em valor e ARIA', () => {
  const missing = masteryHeroCard({ progress: { completion: null, remainingCompletion: null, completedTopics: 0, totalTopics: 10 } });
  const zero = masteryHeroCard({ progress: { completion: 0, remainingCompletion: 100, completedTopics: 0, totalTopics: 10 } });
  assert.match(missing, />—</);
  assert.match(missing, /aria-valuetext="Conclusão do edital indisponível"/);
  assert.doesNotMatch(missing, /aria-valuenow="0"[^>]+aria-label="Conclusão do edital"/);
  assert.match(zero, />0%</);
  assert.match(zero, /aria-valuenow="0"[^>]+aria-label="Conclusão do edital"/);
});

test('accuracy nula, zero e cem preservam seus estados factuais', () => {
  const missing = buildPerformanceVisualModel(dashboard({ overview: { answered: 0, correct: 0, errors: 0, accuracy: null } }));
  const zero = buildPerformanceVisualModel(dashboard({ overview: { answered: 10, correct: 0, errors: 10, accuracy: 0 } }));
  const full = buildPerformanceVisualModel(dashboard({ overview: { answered: 10, correct: 10, errors: 0, accuracy: 100 } }));
  assert.equal(missing.accuracy.display, '—');
  assert.equal(zero.accuracy.display, '0%');
  assert.equal(full.accuracy.display, '100%');
});

test('classificações possuem texto e tone próprios, sem depender apenas de cor', () => {
  assert.equal(performanceToneFromClassification('Forte'), 'strong');
  assert.equal(performanceToneFromClassification('Em evolução'), 'growing');
  assert.equal(performanceToneFromClassification('Atenção'), 'attention');
  assert.equal(performanceToneFromClassification('Prioridade de revisão'), 'priority');
  assert.equal(performanceToneFromClassification('Sem respostas'), 'neutral');
  const html = renderPerformancePage(dashboard(), contest);
  for (const label of ['Forte', 'Em evolução', 'Atenção', 'Prioridade de revisão', 'Sem respostas']) assert.match(html, new RegExp(label));
});

test('nomes longos permanecem completos no HTML e CSS permite quebra', async () => {
  const data = dashboard();
  const html = renderPerformancePage(data, contest);
  assert.match(html, new RegExp(data.disciplines[4].name.trim()));
  assert.match(html, new RegExp(data.disciplines[0].subtopics[0].name.trim()));
  const css = await readFile(path.join(appRoot, 'css/performance-mobile.css'), 'utf8');
  assert.match(css, /overflow-wrap:\s*break-word/);
});

test('subtópicos distinguem null, zero, domínio, estrelas e memória', () => {
  const data = dashboard();
  data.disciplines[0].subtopics.push({
    id: 'zero', name: 'Zero real', numbering: '1.2', answered: 5, correct: 0, errors: 5,
    accuracy: 0, classification: 'Prioridade de revisão', masteryPct: 0, stars: 0, memory: 'fria', minutes: 0,
  });
  data.disciplines[0].subtopics.push({
    id: 'null', name: 'Sem resposta', numbering: '1.3', answered: 0, correct: 0, errors: 0,
    accuracy: null, classification: 'Sem respostas', masteryPct: null, stars: 0, memory: null, minutes: 0,
  });
  const html = renderPerformancePage(data, contest);
  assert.match(html, /Zero real[\s\S]+>0%</);
  assert.match(html, /Domínio: 0%/);
  assert.match(html, /Memória: fria/);
  assert.match(html, /Sem resposta[\s\S]+>—</);
  assert.match(html, /Estrelas: 3/);
});

test('evolução vazia e com um ponto não desenha gráfico falso', () => {
  const none = renderPerformancePage(dashboard({ evolution: [] }), contest);
  const one = renderPerformancePage(dashboard({ evolution: [{ at: '2026-08-01', value: 40, answered: 5, correct: 2 }] }), contest);
  assert.match(none, /Evolução ainda em formação/);
  assert.match(one, /Continue respondendo questões para formar uma série comparável/);
  assert.doesNotMatch(one, /<polyline/);
});

test('evolução múltipla preserva pontos e fornece texto acessível equivalente', () => {
  const html = renderPerformancePage(dashboard(), contest);
  assert.match(html, /<polyline points="0\.00,24\.00 100\.00,12\.00"/);
  assert.match(html, /Em 01\/08: 50% de acertos em 10 respostas/);
  assert.match(html, /Em 02\/08: 75% de acertos em 20 respostas/);
});

test('tempo cobre zero, distribuição parcial e minutos não identificados', () => {
  const zero = renderPerformancePage(dashboard({ time: { totalMinutes: 0, hasDistribution: false, byDiscipline: [], undistributedMinutes: 0 } }), contest);
  const partial = renderPerformancePage(dashboard(), contest);
  assert.match(zero, /Ainda não há tempo registrado/);
  assert.match(partial, /Tempo sem disciplina identificada/);
  assert.match(partial, /1h/);
  assert.equal(buildPerformanceVisualModel(dashboard()).time.undistributedMinutes, 60);
});

test('tempo totalmente não identificado não é redistribuído', () => {
  const html = renderPerformancePage(dashboard({
    time: { totalMinutes: 80, distributedMinutes: 0, undistributedMinutes: 80, hasDistribution: false, byDiscipline: [] },
  }), contest);
  assert.match(html, /Todo o tempo registrado está sem disciplina identificada/);
  assert.match(html, /Nenhum minuto foi redistribuído/);
});

test('revisões cobrem vazio, vencidas, congeladas e memória', () => {
  const html = renderPerformancePage(dashboard(), contest);
  assert.match(html, /Vencidas[\s\S]+>7</);
  assert.match(html, /Congeladas[\s\S]+>2</);
  assert.match(html, /Quente[\s\S]+>7</);
  assert.match(html, /Revisar agora/);
  const empty = renderPerformancePage(dashboard({ reviews: {} }), contest);
  assert.doesNotMatch(empty, /Revisar agora/);
});

test('Orion usa somente resumo real, estado vazio e projeção indisponível factual', () => {
  const rich = renderPerformancePage(dashboard(), contest);
  assert.match(rich, /Você concluiu integralmente 42% do edital/);
  assert.match(rich, /Histórico de conclusão ainda insuficiente para projeção/);
  const emptyData = dashboard({
    progress: { completion: null, remainingCompletion: null, completedTopics: 0, totalTopics: 40 },
    overview: { answered: 0, correct: 0, errors: 0, accuracy: null },
    time: { totalMinutes: 0, hasDistribution: false, byDiscipline: [], undistributedMinutes: 0 },
    reviews: {}, evolution: [], summary: '', hasQuestionData: false, hasAnyData: false,
  });
  const empty = renderPerformancePage(emptyData, contest);
  assert.match(empty, /Seu painel ainda está começando/);
  assert.match(empty, /Responda questões e registre sessões de estudo/);
  assert.doesNotMatch(empty, /chance de aprovação|você vai passar|previsão garantida/i);
});

test('clamp é somente visual e nunca excede cem', () => {
  assert.equal(clampVisualPercent(150), 100);
  assert.equal(clampVisualPercent(-20), 0);
  assert.equal(clampVisualPercent(null), null);
  assert.equal(formatPerformancePercent(null), '—');
  assert.equal(formatPerformanceMinutes(460), '7h 40min');
});

test('acessibilidade, toque, responsividade e movimento reduzido têm contratos explícitos', async () => {
  const [ui, css] = await Promise.all([
    readFile(path.join(appRoot, 'js/ui/performance.js'), 'utf8'),
    readFile(path.join(appRoot, 'css/performance-mobile.css'), 'utf8'),
  ]);
  assert.match(ui, /aria-busy/);
  assert.match(ui, /requestVersion/);
  assert.match(ui, /aria-expanded/);
  assert.match(ui, /aria-controls/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(max-width: 340px\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.doesNotMatch(css, /!important/);
  const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size < 12), false);
  assert.doesNotMatch(ui, /style="(?:width|height|background):/);
  assert.match(ui, /style="--perf-/);
});

test('motores funcionais protegidos permanecem inalterados entre plataformas', async () => {
  const expected = {
    'app/js/services/performanceService.js': '7e4764612a4aa8e91b507153e7a156d4f0ee37fb35cc78e696ff5d776f6ebdc9',
    'app/js/services/orionEvolutionService.js': 'ba0d8d7fdf235cbcd22f136cc90aeba97197b622e5e35ffd217118d8e2c188ea',
    'app/js/core/ssot.js': '86c5065863374b2220de9781c9bde5b6ee16e2f89c3d72fc8cdc15089b7f4dea',
    'app/js/core/mastery.js': '385efb23c0cf3f3cdc373209a84b7ef3272984c04ef9c3479f08a5a84759bf28',
    'app/js/core/battle.js': '631a501ccae04a8d871f431981d04f0faf724d2f7e5207aa9f09b595f8b4eb4a',
    'app/js/core/reviewQueue.js': '5b29e65e66b6ab39b812240aae81e5c9b9f5f29ec712ef6c23c4e83f73321435',
    'app/js/services/academicProgressService.js': 'b7c55b15245698f02d1c110aeca067f1a9cb03b5a1489a7b9dd3a5e2bb5d85e2',
    'app/js/services/routineService.js': 'a14138aee1e1e2dc58142bc25bbf73ad83008391c3ab941b5b9a4797d1693604',
    'app/js/core/routine/studyPlanContract.js': '54f1295655c87a6a91939aa20c85c9c732a5a4576dce63889e6b603eb91fc85a',
  };
  for (const [relative, hash] of Object.entries(expected)) {
    const source = await readFile(path.join(repositoryRoot, relative), 'utf8');
    const canonicalSource = source.replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(canonicalSource, 'utf8').digest('hex'), hash, relative);
  }
});

test('ordenação permanece local, determinística e não converte null em zero', () => {
  const rows = dashboard().disciplines;
  assert.deepEqual(sortDisciplines(rows, 'edital').map((row) => row.id), ['strong', 'growing', 'attention', 'priority', 'empty']);
  assert.equal(sortDisciplines(rows, 'lowest').at(-1).id, 'empty');
  assert.equal(sortDisciplines(rows, 'highest').at(-1).id, 'empty');
});
