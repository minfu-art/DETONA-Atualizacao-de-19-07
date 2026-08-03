import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  HOME_HABIT_STATES,
  HOME_MENTOR_OWNERS,
  resolveHomeHabitState,
  resolveHomeMentorOwner,
} from '../js/ui/homeHabitState.js';
import {
  assertSingleDirectMentorCommunication,
  automaticMentorHtml,
  officialMentorHtml,
  rankedEventMentorHtml,
} from '../js/ui/mentorCommunication.js';

const enabled = (activeDays = [1]) => ({ id: 'habit:water', enabled: true, activeDays });
const scheduled = (completed = false) => ({ definition: enabled(), completed });

test('resolve os quatro estados explícitos da Home sem usar total diário como configuração', () => {
  assert.equal(resolveHomeHabitState({ definitions: [] }, []), HOME_HABIT_STATES.NO_CONFIGURATION);
  assert.equal(
    resolveHomeHabitState({ definitions: [enabled([1])] }, [], new Date('2026-08-02T12:00:00')),
    HOME_HABIT_STATES.CONFIGURED_NO_HABITS_TODAY,
  );
  assert.equal(
    resolveHomeHabitState({ definitions: [enabled()] }, [scheduled(false)]),
    HOME_HABIT_STATES.SCHEDULED_TODAY,
  );
  assert.equal(
    resolveHomeHabitState({ definitions: [enabled()] }, [scheduled(true)]),
    HOME_HABIT_STATES.COMPLETED_TODAY,
  );
});

test('Kaely só assume a comunicação direta sem configuração ou por prioridade explícita', () => {
  assert.equal(resolveHomeMentorOwner({ habitState: HOME_HABIT_STATES.NO_CONFIGURATION }), HOME_MENTOR_OWNERS.KAELY);
  for (const habitState of [
    HOME_HABIT_STATES.CONFIGURED_NO_HABITS_TODAY,
    HOME_HABIT_STATES.SCHEDULED_TODAY,
    HOME_HABIT_STATES.COMPLETED_TODAY,
  ]) {
    assert.equal(resolveHomeMentorOwner({ habitState }), HOME_MENTOR_OWNERS.AUTOMATIC);
  }
  assert.equal(resolveHomeMentorOwner({
    habitState: HOME_HABIT_STATES.CONFIGURED_NO_HABITS_TODAY,
    kaelyPriority: true,
  }), HOME_MENTOR_OWNERS.KAELY);
});

function directCommunicationFor(owner) {
  if (owner === HOME_MENTOR_OWNERS.KAELY) return '<section data-home-mentor-communication="direct"></section>';
  if (owner === HOME_MENTOR_OWNERS.RANKED) {
    return rankedEventMentorHtml({}, { id: 'ranked-1', title: 'Simulado', status: 'live' });
  }
  if (owner === HOME_MENTOR_OWNERS.OFFICIAL) {
    return officialMentorHtml({}, {
      id: 'announcement-1', category: 'event', priority: 'normal', title: 'Comunicado', summary: 'Aviso oficial.', body: 'Aviso oficial.', read: {},
    });
  }
  return automaticMentorHtml({}, {
    category: 'default', priority: 'normal', title: 'Conselho', message: 'Mensagem.', actionType: 'none',
  });
}

test('evento ranqueado e comunicado oficial têm precedência e mantêm um único mentor direto', () => {
  const scenarios = [
    { habitState: HOME_HABIT_STATES.NO_CONFIGURATION },
    { habitState: HOME_HABIT_STATES.CONFIGURED_NO_HABITS_TODAY },
    { habitState: HOME_HABIT_STATES.SCHEDULED_TODAY },
    { habitState: HOME_HABIT_STATES.COMPLETED_TODAY },
    { habitState: HOME_HABIT_STATES.NO_CONFIGURATION, rankedSelection: { id: 'ranked-1' } },
    { habitState: HOME_HABIT_STATES.NO_CONFIGURATION, officialAnnouncement: { id: 'announcement-1' } },
  ];
  for (const scenario of scenarios) {
    const owner = resolveHomeMentorOwner(scenario);
    assert.equal(assertSingleDirectMentorCommunication(directCommunicationFor(owner)), true);
  }
  assert.equal(resolveHomeMentorOwner(scenarios[4]), HOME_MENTOR_OWNERS.RANKED);
  assert.equal(resolveHomeMentorOwner(scenarios[5]), HOME_MENTOR_OWNERS.OFFICIAL);
});

test('estado configurado sem hábitos hoje preserva a fronteira exclusivamente local', async () => {
  const wellbeingSource = await readFile(fileURLToPath(new URL('../js/core/wellbeing.js', import.meta.url)), 'utf8');
  const resolverSource = await readFile(fileURLToPath(new URL('../js/ui/homeHabitState.js', import.meta.url)), 'utf8');
  assert.match(wellbeingSource, /localPersonalRepository as progressRepository/);
  assert.doesNotMatch(resolverSource, /supabase|progressCloud|hybridProgressAdapter/i);
  assert.equal(
    resolveHomeHabitState({ definitions: [enabled([1])] }, []),
    HOME_HABIT_STATES.CONFIGURED_NO_HABITS_TODAY,
  );
});

test('tipografia operacional e alvos de lembrete usam tokens oficiais', async () => {
  const dashboard = await readFile(fileURLToPath(new URL('../css/dashboard-jrpg.css', import.meta.url)), 'utf8');
  const designSystem = await readFile(fileURLToPath(new URL('../css/design-system.css', import.meta.url)), 'utf8');
  assert.match(dashboard, /\.dj-prep__identity strong[^}]*font-size:var\(--ds-type-label\)/);
  assert.match(dashboard, /\.dj-prep__identity span[^}]*font-size:var\(--ds-type-micro\)/);
  assert.match(designSystem, /\.hb-local-notice strong[^}]*font-size:var\(--ds-type-label\)/);
  assert.match(designSystem, /\.hb-local-notice p[^}]*font-size:var\(--ds-type-micro\)/);
  assert.match(designSystem, /\.hb-settings p,\.hb-privacy[^}]*font-size:var\(--ds-type-micro\)/);
  assert.match(designSystem, /\.habit-local-reminder__actions \.btn[^}]*min-height:var\(--ds-touch-target\)/);
});
