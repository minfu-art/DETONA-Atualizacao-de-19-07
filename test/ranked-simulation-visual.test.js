import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  KIRO_ASSET,
  rankedEventAction,
  rankedEventGroups,
  rankedQuestionPresentation,
  rankedRankingReleaseLabel,
  rankedResultStatus,
  rankedScoringLabel,
  rankedStatusLabel,
  rankedTimerPresentation,
} from '../app/js/ui/rankedVisualModel.js';

const uiSource = readFileSync(new URL('../app/js/ui/rankedEvent.js', import.meta.url), 'utf8');
const modelSource = readFileSync(new URL('../app/js/ui/rankedVisualModel.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/css/ranked-functional.css', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const swSource = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');

function event(id, status, startsAt) {
  return { id, status, effectiveStatus: status, starts_at: startsAt };
}

test('modelo visual traduz estados e oferece somente ações compatíveis', () => {
  assert.deepEqual(
    ['scheduled', 'registration_open', 'live', 'finished', 'cancelled'].map(rankedStatusLabel),
    ['Em breve', 'Inscrições abertas', 'Ao vivo', 'Encerrado', 'Cancelado'],
  );
  assert.deepEqual(
    ['scheduled', 'registration_open', 'live', 'finished', 'cancelled'].map(rankedEventAction),
    ['Ver detalhes', 'Inscrever-se', 'Entrar no simulado', 'Ver resultado', 'Ver detalhes'],
  );
});

test('evento ao vivo recebe destaque e agenda/histórico permanecem separados', () => {
  const events = [
    event('finished', 'finished', '2026-08-01T10:00:00Z'),
    event('scheduled', 'scheduled', '2026-08-10T10:00:00Z'),
    event('live', 'live', '2026-08-05T10:00:00Z'),
    event('registration', 'registration_open', '2026-08-07T10:00:00Z'),
    event('cancelled', 'cancelled', '2026-08-02T10:00:00Z'),
  ];
  const groups = rankedEventGroups(events);
  assert.equal(groups.featured.id, 'live');
  assert.deepEqual(groups.upcoming.map(({ id }) => id), ['registration', 'scheduled']);
  assert.deepEqual(groups.recent.map(({ id }) => id), ['finished', 'cancelled']);
});

test('pontuação e liberação do ranking comunicam somente regras reais', () => {
  assert.equal(rankedScoringLabel('simple'), 'Quantidade de acertos');
  assert.equal(rankedScoringLabel('cebraspe'), 'Acertos menos erros');
  assert.equal(rankedRankingReleaseLabel('after_event'), 'Após o encerramento do evento');
  assert.match(rankedRankingReleaseLabel('immediate'), /Após a entrega/);
});

test('cronômetro possui estados normal, atenção, urgente e finalizado', () => {
  assert.deepEqual(rankedTimerPresentation(600_000), { state: 'normal', label: 'Tempo restante' });
  assert.deepEqual(rankedTimerPresentation(300_000), { state: 'attention', label: 'Atenção ao tempo' });
  assert.deepEqual(rankedTimerPresentation(60_000), { state: 'urgent', label: 'Último minuto' });
  assert.deepEqual(rankedTimerPresentation(0), { state: 'finished', label: 'Tempo encerrado' });
});

test('mapa combina estado atual, resposta, branco, marcação e entrega sem depender de cor', () => {
  const marked = rankedQuestionPresentation({ current: true, answered: true, marked: true });
  assert.equal(marked.label, 'atual, respondida, marcada para revisar');
  assert.match(marked.className, /is-current/);
  assert.match(marked.className, /is-answered/);
  assert.match(marked.className, /is-marked/);
  const blank = rankedQuestionPresentation({ submitted: true });
  assert.equal(blank.label, 'em branco, entregue');
  assert.match(blank.className, /is-blank/);
  assert.match(blank.className, /is-submitted/);
});

test('resultado diferencia entrega manual e expiração sem alterar métricas', () => {
  assert.deepEqual(rankedResultStatus({ status: 'submitted' }), { label: 'Entrega registrada', tone: 'submitted' });
  assert.deepEqual(rankedResultStatus({ status: 'timed_out' }), { label: 'Tempo encerrado e respostas entregues', tone: 'timed-out' });
});

test('lista, vazio, preparação e cancelamento têm contratos factuais e um h1 principal', () => {
  assert.match(uiSource, /Simulados ranqueados/);
  assert.match(uiSource, /Nenhum simulado ranqueado ativo/);
  assert.match(uiSource, /Os próximos desafios aparecerão aqui quando forem liberados/);
  assert.match(uiSource, /As respostas ainda não entregues permanecem apenas nesta tela/);
  assert.match(uiSource, /Simulado cancelado/);
  assert.match(uiSource, /Voltar para Simulados/);
  assert.doesNotMatch(uiSource, /participantes? fictícios?|posição nacional|Top 10|Campeão/i);
  assert.equal(KIRO_ASSET, 'assets/mentors/kiro-official.webp');
});

test('tentativa mantém semântica de prova, acessibilidade e mensagens seguras', () => {
  for (const contract of [
    /<fieldset class="ranked-question"/,
    /<legend id="ranked-question-title" tabindex="-1">/,
    /type="radio" name="ranked-answer"/,
    /type="checkbox" id="ranked-mark-review"/,
    /role="timer" aria-live="off"/,
    /aria-current=/,
    /aria-busy=/,
    /Estamos registrando suas respostas com segurança/,
    /Suas respostas permanecem preservadas nesta tela/,
    /Faltam cinco minutos/,
    /Falta um minuto/,
    /O tempo terminou/,
  ]) assert.match(uiSource, contract);
  assert.doesNotMatch(uiSource, /style\s*=/i);
});

test('resultado não antecipa gabarito e preserva privacidade do ranking', () => {
  assert.match(uiSource, /O gabarito permanece protegido até a liberação oficial do resultado/);
  assert.match(uiSource, /Classificação ainda indisponível/);
  assert.match(uiSource, /Explicação detalhada ainda não disponível/);
  assert.match(uiSource, /Adicionar questões erradas à revisão/);
  assert.doesNotMatch(uiSource, /row\.(userId|user_id|email|uuid|document)/);
});

test('CSS ranqueado é isolado, responsivo, acessível e respeita movimento reduzido', () => {
  for (const selector of [
    '.ranked-shell', '.ranked-hero', '.ranked-event-card', '.ranked-preparation',
    '.ranked-attempt', '.ranked-timer', '.ranked-question-map', '.ranked-question',
    '.ranked-answer', '.ranked-navigation', '.ranked-result', '.ranked-ranking',
    '.ranked-explanation', '.ranked-state',
  ]) assert.match(cssSource, new RegExp(selector.replace('.', '\\.')));
  assert.match(cssSource, /min-height:\s*var\(--ds-touch-target\)/);
  assert.match(cssSource, /@media \(max-width: 768px\)/);
  assert.match(cssSource, /@media \(max-width: 340px\)/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cssSource, /padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(cssSource, /outline:\s*3px solid var\(--ranked-cyan\)/);
  assert.doesNotMatch(cssSource, /!important/);
  assert.doesNotMatch(cssSource, /font-size:\s*(?:[0-9]|1[01])px/);
});

test('cache e carregamento entregam juntos o modelo, CSS e retrato de Kiro', () => {
  assert.ok(indexSource.indexOf('dashboard-jrpg.css') < indexSource.indexOf('ranked-functional.css?v=3'));
  assert.match(swSource, /detona-v120-performance-analytics/);
  assert.match(swSource, /js\/ui\/rankedVisualModel\.js/);
  assert.match(swSource, /assets\/mentors\/kiro-official\.webp/);
  assert.match(modelSource, /Object\.freeze/);
});
