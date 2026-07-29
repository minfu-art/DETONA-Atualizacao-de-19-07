import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DAILY_CHARACTER_CATALOG,
  DAILY_CHARACTER_MESSAGES,
  dailyCharacterMessage,
} from '../app/js/services/dailyCharacterMessage.js';
import { automaticMentorHtml } from '../app/js/ui/mentorCommunication.js';

const homeSource = readFileSync(new URL('../app/js/ui/home.js', import.meta.url), 'utf8');

test('catálogo possui quatro personagens e 28 mensagens originais', () => {
  assert.deepEqual(Object.keys(DAILY_CHARACTER_CATALOG), ['cleric', 'strategist', 'warrior', 'master']);
  assert.equal(DAILY_CHARACTER_MESSAGES.length, 28);
  for (const characterId of Object.keys(DAILY_CHARACTER_CATALOG)) {
    assert.equal(DAILY_CHARACTER_MESSAGES.filter((item) => item.characterId === characterId).length, 7);
  }
});

test('mesmo usuário, concurso e data recebem sempre a mesma mensagem', () => {
  const input = { date: '2026-07-29', contestId: 'pp_pe_2027', userId: 'student-a' };
  assert.deepEqual(dailyCharacterMessage(input), dailyCharacterMessage(input));
});

test('recarregar em horários diferentes do mesmo dia não troca a mensagem', () => {
  const base = { contestId: 'pp_pe_2027', userId: 'student-a' };
  const morning = dailyCharacterMessage({ ...base, date: new Date(2026, 6, 29, 8, 15) });
  const evening = dailyCharacterMessage({ ...base, date: new Date(2026, 6, 29, 22, 40) });
  assert.equal(morning.id, evening.id);
  assert.equal(morning.text, evening.text);
});

test('dia seguinte avança deterministicamente para outra mensagem', () => {
  const base = { contestId: 'pp_pe_2027', userId: 'student-a' };
  const today = dailyCharacterMessage({ ...base, date: '2026-07-29' });
  const tomorrow = dailyCharacterMessage({ ...base, date: '2026-07-30' });
  assert.notEqual(today.text, tomorrow.text);
});

test('identidade do usuário e concurso participam da seleção', () => {
  const date = '2026-07-29';
  const first = dailyCharacterMessage({ date, contestId: 'pp_pe_2027', userId: 'student-a' });
  const second = dailyCharacterMessage({ date, contestId: 'pc_al_2026', userId: 'student-b' });
  assert.notEqual(first.id, second.id);
});

test('card apresenta somente personagem, categoria, título, texto e ação opcional', () => {
  const message = dailyCharacterMessage({
    date: '2026-07-29',
    contestId: 'pp_pe_2027',
    userId: 'student-a',
  });
  const html = automaticMentorHtml({}, message);
  assert.match(html, new RegExp(message.character.name.toUpperCase()));
  assert.match(html, new RegExp(message.title));
  assert.match(html, new RegExp(message.actionLabel));
  assert.doesNotMatch(html, /revisões vencidas|Abrir revisão|XP|domínio/i);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
});

test('Home usa mensagem diária e restringe o palco oficial a eventos', () => {
  assert.match(homeSource, /dailyCharacterMessage\(\{/);
  assert.match(homeSource, /dailyCharacterMessage\(\{\s*date: new Date\(\)/);
  assert.doesNotMatch(homeSource, /dailyCharacterMessage\(\{\s*date: today/);
  assert.match(homeSource, /candidate\?\.category === 'event' \? candidate : null/);
  assert.doesNotMatch(homeSource, /getMentorMessage\(\{/);
});
