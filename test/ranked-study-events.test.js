import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createRankedEventHandler,
  publicQuestion,
  rankAttempts,
  rankingIsReleased,
  scoreRankedAnswers,
  selectHomeRankedEvent,
} from '../supabase/functions/ranked-events/core.js';

const migration = readFileSync(new URL('../supabase/migrations/20260729040059_ranked_study_events.sql', import.meta.url), 'utf8');
const edgeSource = readFileSync(new URL('../supabase/functions/ranked-events/index.ts', import.meta.url), 'utf8');
const studentSource = readFileSync(new URL('../app/js/ui/rankedEvent.js', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../app/js/ui/home.js', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../app/js/admin/adminEventsScreen.js', import.meta.url), 'utf8');

function event(overrides = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    contest_id: 'pp_pe_2027',
    title: 'Arena',
    description: 'Evento de teste',
    registration_starts_at: '2026-07-29T08:00:00.000Z',
    registration_ends_at: '2026-07-29T10:00:00.000Z',
    starts_at: '2026-07-29T10:00:00.000Z',
    ends_at: '2026-07-29T12:00:00.000Z',
    duration_minutes: 60,
    question_count: 2,
    scoring_mode: 'cebraspe',
    ranking_release_mode: 'after_event',
    result_display_hours: 24,
    status: 'scheduled',
    published_at: '2026-07-29T07:00:00.000Z',
    ...overrides,
  };
}

test('evento ao vivo substitui qualquer outra comunicação da Home', () => {
  const selected = selectHomeRankedEvent([
    event({ id: 'future', starts_at: '2026-07-30T10:00:00Z', ends_at: '2026-07-30T12:00:00Z' }),
    event({ id: 'live', starts_at: '2026-07-29T10:00:00Z', ends_at: '2026-07-29T12:00:00Z' }),
  ], new Date('2026-07-29T11:00:00Z'));
  assert.equal(selected.event.id, 'live');
  assert.equal(selected.effectiveStatus, 'live');
  assert.match(homeSource, /rankedSelection\s*\?\s*rankedEventMentorHtml/);
});

test('evento futuro dentro de 48 horas tem prioridade', () => {
  const selected = selectHomeRankedEvent([
    event({ id: 'near', starts_at: '2026-07-31T09:00:00Z', ends_at: '2026-07-31T11:00:00Z' }),
  ], new Date('2026-07-29T10:00:00Z'));
  assert.equal(selected.event.id, 'near');
});

test('evento encerrado deixa o card após o prazo configurado', () => {
  const selected = selectHomeRankedEvent([
    event({ status: 'finished', ends_at: '2026-07-28T08:00:00Z', result_display_hours: 24 }),
  ], new Date('2026-07-29T10:00:00Z'));
  assert.equal(selected, null);
});

test('pontuação CEBRASPE aplica +1, -1 e zero em branco', () => {
  const questions = [
    { question_id: 'q1', payload: { respostaCorreta: 'C' } },
    { question_id: 'q2', payload: { respostaCorreta: 'E' } },
    { question_id: 'q3', payload: { respostaCorreta: 'C' } },
  ];
  assert.deepEqual(scoreRankedAnswers(questions, [
    { questionId: 'q1', answer: 'C' },
    { questionId: 'q2', answer: 'C' },
  ], 'cebraspe'), {
    correctCount: 1, incorrectCount: 1, blankCount: 1, score: 0, accuracy: 50,
  });
});

test('ranking desempata por score, precisão, tempo e envio', () => {
  const ranked = rankAttempts([
    { display_name: 'Mais lento', status: 'submitted', score: 10, accuracy: 80, elapsed_seconds: 100, submitted_at: '2026-07-29T11:00:01Z', correct_count: 10, incorrect_count: 2 },
    { display_name: 'Primeiro', status: 'submitted', score: 10, accuracy: 80, elapsed_seconds: 90, submitted_at: '2026-07-29T11:00:02Z', correct_count: 10, incorrect_count: 2 },
    { display_name: 'Menor precisão', status: 'submitted', score: 10, accuracy: 70, elapsed_seconds: 50, submitted_at: '2026-07-29T11:00:00Z', correct_count: 10, incorrect_count: 3 },
  ]);
  assert.deepEqual(ranked.map(({ displayName }) => displayName), ['Primeiro', 'Mais lento', 'Menor precisão']);
});

test('ranking não libera antes do modo configurado', () => {
  assert.equal(rankingIsReleased(event(), new Date('2026-07-29T11:00:00Z')), false);
  assert.equal(rankingIsReleased(event(), new Date('2026-07-29T13:00:00Z')), true);
});

test('questão pública não expõe resposta nem explicação durante o evento', () => {
  const result = publicQuestion({
    question_id: 'q1',
    payload: { enunciado: 'Teste', respostaCorreta: 'C', explicacao: 'Segredo' },
  });
  assert.equal(result.payload.respostaCorreta, undefined);
  assert.equal(result.payload.explicacao, undefined);
  assert.doesNotMatch(JSON.stringify(result), /Segredo/);
});

test('aluno sem entitlement recebe bloqueio do servidor', async () => {
  const handler = createRankedEventHandler({
    resolveIdentity: async () => ({ userId: 'student', role: 'student' }),
    repository: { hasEntitlement: async () => false },
    now: () => new Date('2026-07-29T09:00:00Z'),
  });
  const response = await handler(new Request('https://local/ranked-events', {
    method: 'POST',
    headers: { authorization: 'Bearer safe-test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'list_events', contestId: 'pp_pe_2027' }),
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'ENTITLEMENT_REQUIRED');
});

test('tempo expirado finaliza uma tentativa como timed_out', async () => {
  let submitted;
  const currentEvent = event({ question_count: 1 });
  const handler = createRankedEventHandler({
    resolveIdentity: async () => ({ userId: 'student', role: 'student' }),
    repository: {
      getEvent: async () => currentEvent,
      hasEntitlement: async () => true,
      getAttempt: async () => ({
        id: 'attempt-1',
        event_id: currentEvent.id,
        user_id: 'student',
        status: 'started',
        started_at: '2026-07-29T10:00:00Z',
        answers: [],
      }),
      getQuestions: async () => [{ question_id: 'q1', payload: { correct_answer: 'C' } }],
      submit: async (_event, _user, result) => { submitted = result; return result; },
    },
    now: () => new Date('2026-07-29T11:30:00Z'),
  });
  const response = await handler(new Request('https://local/ranked-events', {
    method: 'POST',
    headers: { authorization: 'Bearer safe-test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'submit', eventId: currentEvent.id, answers: [{ questionId: 'q1', answer: 'C' }] }),
  }));
  assert.equal(response.status, 200);
  assert.equal(submitted.status, 'timed_out');
  assert.equal(submitted.correctCount, 1);
  assert.equal(submitted.blankCount, 0);
});

test('banco garante uma tentativa e impede questões de outro concurso', () => {
  assert.match(migration, /unique\s*\(event_id,\s*user_id\)/i);
  assert.match(migration, /foreign key\s*\(event_id,\s*contest_id\)[\s\S]*ranked_study_events\(id,\s*contest_id\)/i);
  assert.match(edgeSource, /\.eq\('contest_id',\s*event\.contest_id\)/);
});

test('RLS e grants impedem escrita do aluno e qualquer acesso anon', () => {
  for (const table of ['ranked_study_events', 'ranked_event_questions', 'ranked_event_attempts']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete)[^;]*\s+to authenticated/i);
  assert.match(migration, /entitlement\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
});

test('evento é isolado de XP, nível, domínio, estrelas e sequência', () => {
  const implementation = `${migration}\n${edgeSource}\n${studentSource}`;
  assert.doesNotMatch(implementation, /\b(?:xp|level|domain|mastery|stars|streak_days)\s*(?:=|:|\()/i);
  assert.match(studentSource, /Adicionar questões erradas à revisão/);
});

test('painel é de tela única e exige confirmação exata de publicação', () => {
  assert.match(adminSource, /PUBLICAR EVENTO RANKEADO/);
  assert.match(adminSource, /Salvar rascunho/);
  assert.match(adminSource, /data-publish-event/);
  assert.match(adminSource, /data-cancel-event/);
  assert.match(adminSource, /data-participants/);
});
