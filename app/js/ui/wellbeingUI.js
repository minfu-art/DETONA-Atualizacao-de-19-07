import { $, toast, escapeHtml, openModal, closeModal } from './helpers.js';
import { SFX } from '../core/audio.js';
import {
  getHabitConfiguration,
  getHabitSystemState,
  incrementHabitForDate,
  recordHabitDetails,
  saveHabitConfiguration,
  setHabitAmountForDate,
  skipHabitConfiguration,
  skipHabitForDate,
  toggleHabitForDate,
} from '../core/wellbeing.js';
import {
  HABIT_CATALOG,
  HABIT_RECORD_TYPES,
  MAX_ACTIVE_HABITS,
  habitPrivacyStatement,
} from '../core/habitSystem.js';
import { localDateKey } from '../core/localDate.js';
import { mountPageContainer, sectionHeader } from './appShell.js';
import {
  KAELY,
  agendaState,
  buildHabitAnalysis,
  buildHabitCalendar,
  buildHabitHistory,
  buildWeekStrip,
  chooseKaelyGuidance,
  habitRoutineEntries,
  nextHabitFromAgenda,
  refreshKaelyConsistency,
} from '../services/kaelyHabitService.js';

const FILTERS = Object.freeze([
  ['all', 'Todos'],
  ['sleep_schedule', 'Sono'],
  ['water', 'Água'],
  ['exercise', 'Treino'],
  ['creatine', 'Creatina'],
  ['medication', 'Medicação'],
  ['other', 'Outros'],
]);

const STATUS_LABELS = Object.freeze({
  completed: 'Concluído',
  partial: 'Parcial',
  minimum: 'Mínimo possível',
  skipped: 'Ignorado hoje',
  missed: 'Não realizado',
  planned: 'Programado',
});

function dateLabel(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
}

function formatTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || '')) ? value : 'Sem horário';
}

function minutesBetween(start, end) {
  if (!/^\d{2}:\d{2}$/.test(String(start || '')) || !/^\d{2}:\d{2}$/.test(String(end || ''))) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

function habitIcon(habitId) {
  const paths = {
    water: '<path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11Z"/><path d="M9 15c.5 1.5 1.5 2 3 2"/>',
    exercise: '<path d="M4 10v4M7 8v8M17 8v8M20 10v4M7 12h10"/>',
    sleep_schedule: '<path d="M18 15a7 7 0 0 1-9-9 7 7 0 1 0 9 9Z"/><path d="M15 5h4l-4 4h4"/>',
    wake_time: '<circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
    creatine: '<circle cx="12" cy="12" r="7"/><path d="M9 9h6v6H9zM12 5v2M12 17v2"/>',
    medication: '<path d="m8 16 8-8a3 3 0 0 1 4 4l-8 8a3 3 0 0 1-4-4Z"/><path d="m10 14 4 4"/>',
    nutrition: '<path d="M7 3v7M4 3v5a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 2 4 6 0 9"/>',
    conscious_break: '<path d="M8 5v14M16 5v14"/>',
    meditation: '<circle cx="12" cy="6" r="2"/><path d="M12 8v5M7 12l5 2 5-2M8 20l4-6 4 6M5 20h14"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[habitId] || '<circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/>'}</g></svg>`;
}

function renderHabitCard(card, selectedDate) {
  const { definition, catalog, pct, completed, done, target, automatic, status } = card;
  const label = definition.habitId === 'medication' && definition.discreteMode
    ? 'Medicação'
    : definition.privateLabel || catalog?.label || card.habit.name;
  const isQuantitative = definition.recordType === HABIT_RECORD_TYPES.QUANTITATIVE;
  const isScale = definition.recordType === HABIT_RECORD_TYPES.SCALE;
  const isTime = definition.recordType === HABIT_RECORD_TYPES.TIME;
  const statusLabel = automatic ? 'Automático · somente leitura' : STATUS_LABELS[status] || 'Pendente';
  const schedule = definition.windowStart && definition.windowEnd
    ? `${definition.windowStart}–${definition.windowEnd}`
    : definition.mealAnchor
      ? `${definition.mealAnchor}${definition.reminderTime ? ` · ${definition.reminderTime}` : ''}`
      : formatTime(definition.reminderTime || definition.desiredSleepTime || definition.desiredWakeTime);
  return `
    <article class="hb-habit-card ${completed ? 'is-complete' : ''}" data-habit-card="${definition.id}">
      <div class="hb-habit-card__icon">${habitIcon(definition.habitId)}</div>
      <div class="hb-habit-card__main">
        <div class="hb-habit-card__title">
          <h4>${escapeHtml(label)}</h4>
          <span class="hb-status hb-status--${escapeHtml(status || 'planned')}">${escapeHtml(statusLabel)}</span>
        </div>
        <p>${escapeHtml(catalog?.description || '')}</p>
        <div class="hb-habit-card__meta">
          <span><strong>Meta:</strong> ${target} ${escapeHtml(definition.unit)}</span>
          <span><strong>Horário:</strong> ${escapeHtml(schedule)}</span>
          ${definition.habitId === 'water' && definition.cutoffTime
            ? `<span><strong>Evitar após:</strong> ${escapeHtml(definition.cutoffTime)}</span>` : ''}
          ${definition.habitId === 'exercise' && definition.minimumPossible
            ? `<span><strong>Mínimo possível:</strong> ${definition.minimumPossible} min</span>` : ''}
        </div>
        <div class="hb-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${done}" aria-label="${escapeHtml(label)}: ${done} de ${target}">
          <span style="--habit-progress:${pct}%"></span>
        </div>
        <small>${done} de ${target} ${escapeHtml(definition.unit)}</small>
      </div>
      <div class="hb-habit-card__actions">
        ${automatic ? '<span class="hb-readonly">Atualizado pelo registro acadêmico</span>' : isQuantitative ? `
          <button type="button" class="hb-icon-btn" data-habit-delta="-1" data-definition="${definition.id}" data-date="${selectedDate}" aria-label="Reduzir ${escapeHtml(label)}">−</button>
          <button type="button" class="btn btn-primary" data-habit-delta="1" data-definition="${definition.id}" data-date="${selectedDate}">+1 ${definition.habitId === 'water' ? 'copo' : escapeHtml(definition.unit)}</button>
          <button type="button" class="btn btn-ghost" data-record-details="${definition.id}">Informar valor</button>
        ` : isTime ? `
          <button type="button" class="btn btn-primary" data-record-details="${definition.id}">${definition.habitId === 'sleep_schedule' ? 'Informar sono' : 'Registrar horário'}</button>
        ` : isScale ? `
          <button type="button" class="btn btn-primary" data-record-details="${definition.id}">Registrar percepção</button>
        ` : `
          <button type="button" class="btn ${completed ? 'btn-ghost' : 'btn-primary'}" data-toggle-habit="${definition.id}" data-date="${selectedDate}">
            ${completed ? 'Desfazer' : definition.habitId === 'creatine' ? 'Confirmar creatina' : definition.habitId === 'medication' ? 'Confirmar medicação' : 'Registrar'}
          </button>
        `}
        ${!automatic ? `<button type="button" class="hb-more-btn" data-edit-habit="${definition.habitId}" aria-label="Editar ${escapeHtml(label)}">Editar</button>` : ''}
      </div>
    </article>`;
}

function renderAgenda(entries, selectedDate) {
  if (!entries.length) {
    return `<div class="hb-empty"><strong>Nenhum hábito planejado</strong><p>Este dia está livre. Você pode configurar um hábito sem alterar os outros dias.</p></div>`;
  }
  return `<ol class="hb-timeline">
    ${entries.map((entry) => {
      const state = agendaState(entry);
      return `<li class="hb-timeline__item is-${state.replace(/\s+/g, '-')}">
        <time>${escapeHtml(entry.time || '—')}</time>
        <span class="hb-timeline__line" aria-hidden="true"></span>
        <div class="hb-timeline__content">
          <div><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.category === 'study' ? 'Acadêmico' : 'Corpo e rotina')} · ${escapeHtml(entry.source)}</span></div>
          <span class="hb-status">${escapeHtml(state)}</span>
          ${entry.definition.note ? `<p>${escapeHtml(entry.definition.note)}</p>` : ''}
          <div class="hb-timeline__actions">
            ${entry.definition.recordType !== HABIT_RECORD_TYPES.AUTOMATIC && !['completed', 'skipped'].includes(entry.status)
              ? `<button type="button" class="btn btn-primary" data-agenda-register="${entry.definitionId}">Registrar</button>
                 <button type="button" class="btn btn-ghost" data-agenda-postpone="${entry.definitionId}">Adiar</button>
                 <button type="button" class="btn btn-ghost" data-agenda-skip="${entry.definitionId}" data-date="${selectedDate}">Pular hoje</button>` : ''}
            <button type="button" class="btn btn-ghost" data-edit-habit="${entry.definition.habitId}">Editar</button>
          </div>
        </div>
      </li>`;
    }).join('')}
  </ol>`;
}

function configurationBody(configuration, focusHabitId = null) {
  const currentMap = new Map(configuration.definitions.map((item) => [item.habitId, item]));
  return `
    <div class="hb-config">
      <p>Escolha até ${MAX_ACTIVE_HABITS} hábitos. Os dados ficam isolados nesta conta e neste concurso.</p>
      <p class="hb-config__count" id="hb-config-count">0/${MAX_ACTIVE_HABITS} ativos</p>
      <div class="hb-config__list">
        ${HABIT_CATALOG.map((item) => {
          const definition = currentMap.get(item.id);
          const selected = definition?.enabled !== false && Boolean(definition);
          const days = definition?.activeDays || [0, 1, 2, 3, 4, 5, 6];
          const focused = focusHabitId === item.id;
          return `
            <article class="hb-config-row ${selected ? 'is-selected' : ''} ${focused ? 'is-focused' : ''}" data-config-row="${item.id}">
              <label class="hb-config-row__main">
                <input type="checkbox" data-habit-select="${item.id}" ${selected ? 'checked' : ''}>
                <span class="hb-config-row__icon">${habitIcon(item.id)}</span>
                <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span>
              </label>
              <div class="hb-config-row__options" ${selected ? '' : 'hidden'}>
                <label>Meta pessoal
                  <select data-habit-target="${item.id}">
                    ${item.allowedTargets.map((value) => `<option value="${value}" ${value === (definition?.target || item.defaultTarget) ? 'selected' : ''}>${value} ${escapeHtml(item.unit)}</option>`).join('')}
                  </select>
                </label>
                <label>Horário preferencial
                  <input type="time" data-habit-reminder="${item.id}" value="${definition?.reminderTime || ''}">
                </label>
                ${item.id === 'water' ? `
                  <label>Início da janela<input type="time" data-field="windowStart" data-for="${item.id}" value="${definition?.windowStart || '07:00'}"></label>
                  <label>Fim da janela<input type="time" data-field="windowEnd" data-for="${item.id}" value="${definition?.windowEnd || '20:30'}"></label>
                  <label>Evitar após<input type="time" data-field="cutoffTime" data-for="${item.id}" value="${definition?.cutoffTime || '21:00'}"></label>
                  <label>Tamanho do copo (ml)<input type="number" min="50" max="2000" step="50" data-field="cupSizeMl" data-for="${item.id}" value="${definition?.cupSizeMl || 250}"></label>` : ''}
                ${item.id === 'creatine' ? `
                  <label>Momento<input type="text" maxlength="60" data-field="mealAnchor" data-for="${item.id}" value="${escapeHtml(definition?.mealAnchor || 'Após o almoço')}"></label>` : ''}
                ${item.id === 'medication' ? `
                  <label>Nome ou apelido opcional<input type="text" maxlength="80" data-field="privateLabel" data-for="${item.id}" value="${escapeHtml(definition?.privateLabel || '')}"></label>
                  <label class="hb-check"><input type="checkbox" data-field="discreteMode" data-for="${item.id}" ${definition?.discreteMode !== false ? 'checked' : ''}> Modo discreto</label>
                  <p class="hb-medical-note">Este registro serve apenas como lembrete e não substitui orientação profissional.</p>` : ''}
                ${item.id === 'sleep_schedule' ? `
                  <label>Dormir às<input type="time" data-field="desiredSleepTime" data-for="${item.id}" value="${definition?.desiredSleepTime || '22:30'}"></label>
                  <label>Acordar às<input type="time" data-field="desiredWakeTime" data-for="${item.id}" value="${definition?.desiredWakeTime || '06:00'}"></label>` : ''}
                ${item.id === 'exercise' ? `
                  <label>Tipo de atividade<select data-field="activityType" data-for="${item.id}">
                    ${['Musculação', 'Caminhada', 'Corrida', 'Mobilidade', 'Alongamento', 'Treino livre', 'Outro'].map((value) => `<option ${value === (definition?.activityType || 'Treino livre') ? 'selected' : ''}>${value}</option>`).join('')}
                  </select></label>
                  <label>Mínimo possível (min)<input type="number" min="1" max="240" data-field="minimumPossible" data-for="${item.id}" value="${definition?.minimumPossible || 10}"></label>` : ''}
                <fieldset>
                  <legend>Dias da semana</legend>
                  <div class="hb-day-options">
                    ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, day) => `
                      <label><input type="checkbox" data-habit-day="${item.id}" value="${day}" ${days.includes(day) ? 'checked' : ''}><span>${label}</span></label>`).join('')}
                  </div>
                </fieldset>
                <label>Observação opcional<textarea maxlength="500" rows="2" data-field="note" data-for="${item.id}">${escapeHtml(definition?.note || '')}</textarea></label>
                <div class="hb-order-actions">
                  <button type="button" class="btn btn-ghost" data-move-habit="${item.id}" data-direction="-1" aria-label="Mover ${escapeHtml(item.label)} para cima">↑</button>
                  <button type="button" class="btn btn-ghost" data-move-habit="${item.id}" data-direction="1" aria-label="Mover ${escapeHtml(item.label)} para baixo">↓</button>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
      <label class="hb-minimum">Meta mínima do dia
        <select id="hb-minimum-percent">
          ${[40, 50, 60, 70, 80].map((value) => `<option value="${value}" ${value === configuration.minimumPercent ? 'selected' : ''}>${value}% dos hábitos ativos</option>`).join('')}
        </select>
      </label>
      <p class="hb-privacy">${escapeHtml(habitPrivacyStatement())}</p>
    </div>`;
}

export async function renderWellbeing(root, navigate, ctx = {}) {
  let selectedDate = localDateKey();
  let calendarFilter = 'all';

  async function paint() {
    const state = await getHabitSystemState(selectedDate);
    const today = localDateKey();
    const actualTodayState = selectedDate === today ? state : await getHabitSystemState(today);
    const shieldLedger = await refreshKaelyConsistency(actualTodayState);
    const definitions = state.configuration.definitions.filter((item) => item.enabled !== false);
    const agenda = habitRoutineEntries(definitions, selectedDate, state.logs);
    const nextHabit = nextHabitFromAgenda(agenda);
    const nextCard = nextHabit ? state.cards.find((card) => card.definition.id === nextHabit.definitionId) : null;
    const guidance = chooseKaelyGuidance(state, nextHabit ? { ...nextHabit, card: nextCard } : null);
    const week = buildWeekStrip({
      definitions,
      logs: state.logs,
      selectedDate,
      today,
      minimumPercent: state.configuration.minimumPercent,
    });
    const calendar = buildHabitCalendar({
      definitions,
      logs: state.logs,
      today,
      minimumPercent: state.configuration.minimumPercent,
      protectedDates: shieldLedger.protectedDates,
    });
    const history = buildHabitHistory({
      definitions,
      logs: state.logs,
      today,
      minimumPercent: state.configuration.minimumPercent,
    });
    const analysis = buildHabitAnalysis({ definitions, logs: state.logs, today });
    const percent = state.total ? Math.round(state.doneCount / state.total * 100) : 0;
    const pending = Math.max(0, state.total - state.doneCount);
    const nextTime = nextHabit?.time || null;
    const nextState = nextHabit ? agendaState(nextHabit) : null;
    const calendarHabits = calendarFilter === 'all'
      ? definitions
      : calendarFilter === 'other'
        ? definitions.filter((item) => !['sleep_schedule', 'water', 'exercise', 'creatine', 'medication'].includes(item.habitId))
        : definitions.filter((item) => item.habitId === calendarFilter);
    const filteredCalendar = buildHabitCalendar({
      definitions: calendarHabits,
      logs: state.logs,
      today,
      minimumPercent: state.configuration.minimumPercent,
      protectedDates: shieldLedger.protectedDates,
    });

    root.innerHTML = `
      <div class="hb-screen" data-habits-v4="kaely-resistance">
        <section class="kaely-hero" aria-labelledby="kaely-hero-title">
          <div class="kaely-hero__portrait">
            <img src="${KAELY.asset}" alt="Kaely, Mentora da Resistência"
              onerror="this.onerror=null;this.src='${KAELY.fallbackAsset}'">
          </div>
          <div class="kaely-hero__copy">
            <div class="kaely-hero__identity"><strong>KAELY</strong><span>MENTORA DA RESISTÊNCIA</span></div>
            <h2 id="kaely-hero-title">${escapeHtml(guidance.title)}</h2>
            <blockquote>“Seu corpo sustenta a mente que enfrentará a prova.”</blockquote>
            ${nextHabit ? `<div class="kaely-hero__next"><span>PRÓXIMO HÁBITO</span><strong>${escapeHtml(nextHabit.title)}${nextTime ? ` — ${escapeHtml(nextTime)}` : ''}</strong><small>${escapeHtml(nextState)}</small></div>` : ''}
            <div class="kaely-hero__today"><span>HOJE</span><strong>${state.doneCount} de ${state.total} hábitos concluídos</strong></div>
            <button type="button" class="btn btn-primary" id="kaely-action">${escapeHtml(guidance.actionLabel)}</button>
          </div>
        </section>

        <section class="hb-panel hb-day-summary" aria-labelledby="hb-day-title">
          <div class="hb-section-head"><div><span class="hb-eyebrow">${escapeHtml(dateLabel(selectedDate))}</span><h3 id="hb-day-title">Hábitos do dia</h3></div><div class="hb-day-summary__progress"><strong>${percent}%</strong><span>${state.doneCount}/${state.total}</span></div></div>
          <div class="hb-summary-grid">
            <div><span>Planejados</span><strong>${state.total}</strong></div>
            <div><span>Concluídos</span><strong>${state.doneCount}</strong></div>
            <div><span>Pendentes</span><strong>${pending}</strong></div>
            <div><span>Próximo horário</span><strong>${escapeHtml(nextTime || '—')}</strong></div>
          </div>
          <p>${state.total === 0
            ? 'Escolha os hábitos que deseja acompanhar.'
            : state.allDone
              ? 'Todos os hábitos planejados para este dia foram registrados.'
              : pending > 0 && selectedDate <= today
                ? `Há ${pending} hábito${pending === 1 ? '' : 's'} pendente${pending === 1 ? '' : 's'}. Escolha o próximo passo possível.`
                : 'O dia está organizado. Registre cada hábito quando ele acontecer.'}</p>
          <button type="button" class="btn btn-ghost" id="hb-summary-action">${state.total ? 'Ver próximo hábito' : 'Configurar hábitos'}</button>
        </section>

        <nav class="hb-week" aria-label="Semana de hábitos">
          ${week.map((day) => `<button type="button" class="${day.selected ? 'is-selected' : ''} ${day.isToday ? 'is-today' : ''}" data-week-date="${day.date}" aria-pressed="${day.selected}">
            <span>${day.label}</span><strong>${day.planned ? `${day.completed}/${day.planned}` : '—'}</strong><small>${day.isToday ? 'Hoje' : day.delayed ? 'Pendente' : day.planned ? 'Planejado' : 'Livre'}</small>
          </button>`).join('')}
        </nav>

        <section class="hb-panel hb-agenda" aria-labelledby="hb-agenda-title">
          <div class="hb-section-head"><div><span class="hb-eyebrow">ORDEM DO DIA</span><h3 id="hb-agenda-title">Agenda de ${selectedDate === today ? 'hoje' : dateLabel(selectedDate)}</h3></div><button type="button" class="btn btn-ghost" id="hb-configure">Configurar</button></div>
          ${renderAgenda(agenda, selectedDate)}
        </section>

        <section class="hb-panel hb-my-habits" aria-labelledby="hb-my-habits-title">
          <div class="hb-section-head"><div><span class="hb-eyebrow">ACOMPANHAMENTO</span><h3 id="hb-my-habits-title">Meus hábitos</h3></div><span>${state.cards.length} ativos neste dia</span></div>
          <div class="hb-habit-list">${state.cards.length ? state.cards.map((card) => renderHabitCard(card, selectedDate)).join('') : '<div class="hb-empty"><strong>Sem hábitos configurados</strong><p>Comece escolhendo o que deseja acompanhar.</p></div>'}</div>
        </section>

        <section class="hb-panel hb-history" id="hb-history" aria-labelledby="hb-history-title">
          <div class="hb-section-head"><div><span class="hb-eyebrow">ESTA SEMANA</span><h3 id="hb-history-title">Histórico da semana</h3></div><strong>${history.rate}%</strong></div>
          <div class="hb-history-grid">
            <div><span>Planejados</span><strong>${history.planned}</strong></div><div><span>Realizados</span><strong>${history.completed}</strong></div>
            <div><span>Dias completos</span><strong>${history.completeDays}</strong></div><div><span>Dias parciais</span><strong>${history.partialDays}</strong></div>
            <div><span>Sem registros</span><strong>${history.emptyDays}</strong></div><div><span>Sequência atual</span><strong>${state.consistency.streakCurrent}</strong></div>
          </div>
          <div class="hb-history-list">${history.byHabit.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${item.completed} de ${item.planned} dias</strong><small>${item.rate}%</small></div>`).join('') || '<p class="muted">Ainda não há histórico suficiente.</p>'}</div>
          ${history.mostConsistent ? `<p><strong>Mais consistente:</strong> ${escapeHtml(history.mostConsistent.label)} · <strong>Precisa de atenção:</strong> ${escapeHtml(history.needsAttention?.label || '—')}</p>` : ''}
        </section>

        <section class="hb-panel hb-calendar-panel" aria-labelledby="hb-calendar-title">
          <div class="hb-section-head"><div><span class="hb-eyebrow">REGISTROS REAIS</span><h3 id="hb-calendar-title">Calendário de 30 dias</h3></div></div>
          <div class="hb-filter-row" role="group" aria-label="Filtrar calendário por hábito">${FILTERS.map(([id, label]) => `<button type="button" class="${calendarFilter === id ? 'is-active' : ''}" data-calendar-filter="${id}" aria-pressed="${calendarFilter === id}">${label}</button>`).join('')}</div>
          <div class="hb-calendar" role="grid" aria-label="Registros dos últimos 30 dias">
            ${filteredCalendar.map((day) => `<button type="button" role="gridcell" class="is-${day.state}" data-calendar-date="${day.date}" aria-label="${day.date}: ${day.completed} de ${day.planned}; estado ${day.state}"><span>${day.date.slice(-2)}</span><i aria-hidden="true"></i><small>${day.completed}/${day.planned}</small></button>`).join('')}
          </div>
          <div class="hb-calendar-legend"><span>✓ Completo</span><span>◐ Parcial</span><span>! Não realizado</span><span>— Sem hábitos</span></div>
        </section>

        <section class="hb-panel hb-analysis" aria-labelledby="hb-analysis-title">
          <div class="hb-section-head"><div><span class="hb-eyebrow">PADRÕES REGISTRADOS</span><h3 id="hb-analysis-title">Análise por hábito</h3></div></div>
          <div class="hb-analysis-grid">${analysis.map((item) => `<article>
            <h4>${escapeHtml(item.label)}</h4><strong>${item.completed} de ${item.planned}</strong><span>registros nos últimos 30 dias</span>
            <dl><div><dt>Parciais</dt><dd>${item.partial}</dd></div><div><dt>Não realizados</dt><dd>${item.missed}</dd></div><div><dt>Horário frequente</dt><dd>${escapeHtml(item.frequentTime || '—')}</dd></div></dl>
            <p>${escapeHtml(item.suggestion)}</p>
          </article>`).join('') || '<div class="hb-empty"><p>Configure hábitos para começar a visualizar padrões.</p></div>'}</div>
        </section>

        <section class="hb-panel hb-settings" aria-labelledby="hb-settings-title">
          <div><span class="hb-eyebrow">CONTROLE PESSOAL</span><h3 id="hb-settings-title">Configurações</h3><p>Edite dias, horários, metas, lembretes, privacidade e ordem dos hábitos.</p></div>
          <button type="button" class="btn btn-primary" id="hb-settings-open">Configurar hábitos</button>
          <p class="hb-privacy">${escapeHtml(habitPrivacyStatement())}</p>
        </section>
        <button type="button" class="btn btn-block" id="hb-home">← Voltar ao Início</button>
      </div>`;

    mountPageContainer(root, {
      variant: 'wellbeing',
      header: sectionHeader({
        eyebrow: 'Kaely · Mentora da Resistência',
        title: 'Hábitos do dia',
        subtitle: 'Organize os hábitos que sustentam seu estudo.',
      }),
    });
    bind({ state, guidance, agenda, calendar, today });
    const intent = ctx?.habitNavigationIntent;
    if (intent) {
      delete ctx.habitNavigationIntent;
      if (intent.type === 'record' && intent.definitionId) openRecord(intent.definitionId, state);
      else if (intent.type === 'configure') openConfiguration();
      else if (intent.type === 'history') {
        document.getElementById('hb-history')?.scrollIntoView({ block: 'start' });
      }
    }
  }

  async function openConfiguration(focusHabitId = null) {
    const configuration = await getHabitConfiguration();
    let selected = configuration.definitions
      .filter((item) => item.enabled !== false)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => item.habitId);
    openModal('Configurar hábitos', configurationBody(configuration, focusHabitId), `
      <button type="button" class="btn btn-ghost" id="hb-config-skip">Pular por agora</button>
      <button type="button" class="btn btn-primary" id="hb-config-save">Salvar hábitos</button>`);
    const modal = document.getElementById('app-modal');
    const update = () => {
      modal?.querySelectorAll('[data-habit-select]').forEach((input) => {
        const row = input.closest('.hb-config-row');
        row?.classList.toggle('is-selected', input.checked);
        const options = row?.querySelector('.hb-config-row__options');
        if (options) options.hidden = !input.checked;
      });
      const count = document.getElementById('hb-config-count');
      if (count) count.textContent = `${selected.length}/${MAX_ACTIVE_HABITS} ativos`;
    };
    modal?.querySelectorAll('[data-habit-select]').forEach((input) => input.addEventListener('change', () => {
      const habitId = input.dataset.habitSelect;
      if (input.checked && selected.length >= MAX_ACTIVE_HABITS) {
        input.checked = false;
        toast(`Você pode manter no máximo ${MAX_ACTIVE_HABITS} hábitos ativos.`);
        return;
      }
      selected = input.checked ? [...selected, habitId] : selected.filter((id) => id !== habitId);
      update();
    }));
    modal?.querySelectorAll('[data-move-habit]').forEach((button) => button.addEventListener('click', () => {
      const from = selected.indexOf(button.dataset.moveHabit);
      const to = from + Number(button.dataset.direction);
      if (from < 0 || to < 0 || to >= selected.length) return;
      [selected[from], selected[to]] = [selected[to], selected[from]];
      toast('Ordem ajustada. Salve para confirmar.');
    }));
    document.getElementById('hb-config-skip')?.addEventListener('click', async () => {
      await skipHabitConfiguration();
      closeModal();
      await paint();
    });
    document.getElementById('hb-config-save')?.addEventListener('click', async () => {
      const fieldValue = (habitId, field) => {
        const input = modal?.querySelector(`[data-field="${field}"][data-for="${habitId}"]`);
        if (!input) return undefined;
        return input.type === 'checkbox' ? input.checked : input.value || null;
      };
      const selections = selected.map((habitId) => ({
        habitId,
        target: Number(modal?.querySelector(`[data-habit-target="${habitId}"]`)?.value),
        reminderTime: modal?.querySelector(`[data-habit-reminder="${habitId}"]`)?.value || null,
        activeDays: [...(modal?.querySelectorAll(`[data-habit-day="${habitId}"]:checked`) || [])].map((input) => Number(input.value)),
        windowStart: fieldValue(habitId, 'windowStart'),
        windowEnd: fieldValue(habitId, 'windowEnd'),
        cutoffTime: fieldValue(habitId, 'cutoffTime'),
        cupSizeMl: Number(fieldValue(habitId, 'cupSizeMl')) || null,
        mealAnchor: fieldValue(habitId, 'mealAnchor'),
        privateLabel: fieldValue(habitId, 'privateLabel'),
        discreteMode: fieldValue(habitId, 'discreteMode'),
        desiredSleepTime: fieldValue(habitId, 'desiredSleepTime'),
        desiredWakeTime: fieldValue(habitId, 'desiredWakeTime'),
        activityType: fieldValue(habitId, 'activityType'),
        minimumPossible: Number(fieldValue(habitId, 'minimumPossible')) || null,
        note: fieldValue(habitId, 'note'),
      }));
      try {
        await saveHabitConfiguration({
          selections,
          minimumPercent: Number(document.getElementById('hb-minimum-percent')?.value) || 60,
        });
        closeModal();
        toast('Seus hábitos foram salvos.');
        await paint();
      } catch {
        toast('Não foi possível salvar os hábitos.');
      }
    });
    update();
    if (focusHabitId) modal?.querySelector(`[data-config-row="${focusHabitId}"]`)?.scrollIntoView({ block: 'center' });
  }

  function openRecord(definitionId, state) {
    const card = state.cards.find((item) => item.definition.id === definitionId);
    if (!card) return;
    const { definition, catalog } = card;
    const isSleep = definition.habitId === 'sleep_schedule';
    const isScale = definition.recordType === HABIT_RECORD_TYPES.SCALE;
    const isTime = definition.recordType === HABIT_RECORD_TYPES.TIME;
    openModal(`Registrar ${catalog?.label || 'hábito'}`, `
      <div class="hb-record-form">
        ${isSleep ? `
          <label>Dormiu às<input type="time" id="hb-record-sleep" value="${definition.desiredSleepTime || ''}"></label>
          <label>Acordou às<input type="time" id="hb-record-wake" value="${definition.desiredWakeTime || ''}"></label>
          <label>Qualidade percebida<select id="hb-record-quality"><option value="1">1 · Muito baixa</option><option value="2">2 · Baixa</option><option value="3" selected>3 · Regular</option><option value="4">4 · Boa</option><option value="5">5 · Muito boa</option></select></label>
        ` : isTime ? `<label>Horário real<input type="time" id="hb-record-time" value="${new Date().toTimeString().slice(0, 5)}"></label>` : isScale ? `
          <label>Nível percebido<select id="hb-record-scale">
            <option value="1">1 · Muito baixo</option>
            <option value="2">2 · Baixo</option>
            <option value="3" selected>3 · Regular</option>
            <option value="4">4 · Alto</option>
            <option value="5">5 · Muito alto</option>
          </select></label>
        ` : `
          <label>Valor realizado<input type="number" id="hb-record-value" min="0" max="10000" value="${card.done}" inputmode="decimal"></label>
          ${definition.habitId === 'exercise' ? `<label>Resultado<select id="hb-record-status"><option value="completed">Completo</option><option value="partial">Parcial</option><option value="minimum">Mínimo possível</option></select></label>` : ''}
        `}
        <label>Observação opcional<textarea id="hb-record-note" maxlength="500" rows="3"></textarea></label>
        ${definition.habitId === 'medication' ? '<p class="hb-medical-note">Este registro serve apenas como lembrete e não substitui orientação profissional.</p>' : ''}
      </div>`, '<button type="button" class="btn btn-primary" id="hb-record-save">Salvar registro</button>');
    document.getElementById('hb-record-save')?.addEventListener('click', async () => {
      const sleep = document.getElementById('hb-record-sleep')?.value;
      const wake = document.getElementById('hb-record-wake')?.value;
      const actualTime = document.getElementById('hb-record-time')?.value;
      const actualValue = isSleep
        ? minutesBetween(sleep, wake)
        : isTime
          ? definition.target
          : isScale
            ? Number(document.getElementById('hb-record-scale')?.value) || 0
          : Number(document.getElementById('hb-record-value')?.value) || 0;
      await recordHabitDetails(definition.id, {
        actualValue,
        actualTime: actualTime || wake || null,
        plannedTime: definition.reminderTime || definition.desiredWakeTime || definition.desiredSleepTime,
        status: document.getElementById('hb-record-status')?.value || (actualValue >= definition.target ? 'completed' : 'partial'),
        quality: Number(document.getElementById('hb-record-quality')?.value) || null,
        note: document.getElementById('hb-record-note')?.value || null,
      }, selectedDate);
      closeModal();
      toast('Registro salvo.');
      await paint();
    });
  }

  function openPostpone(definitionId, state) {
    const card = state.cards.find((item) => item.definition.id === definitionId);
    if (!card) return;
    const originalTime = card.log?.originalPlannedTime
      || card.log?.plannedTime
      || card.definition.reminderTime
      || card.definition.desiredSleepTime
      || card.definition.desiredWakeTime
      || '';
    openModal('Adiar somente hoje', `
      <div class="hb-record-form">
        <p>O horário original será preservado no histórico. Os outros dias não serão alterados.</p>
        <label>Novo horário<input type="time" id="hb-postpone-time" value="${escapeHtml(originalTime)}" required></label>
      </div>`, '<button type="button" class="btn btn-primary" id="hb-postpone-save">Salvar novo horário</button>');
    document.getElementById('hb-postpone-save')?.addEventListener('click', async () => {
      const plannedTime = document.getElementById('hb-postpone-time')?.value;
      if (!plannedTime) return toast('Informe o novo horário.');
      await recordHabitDetails(definitionId, {
        actualValue: card.done,
        plannedTime,
        originalPlannedTime: originalTime || null,
        status: card.status === 'planned' ? 'planned' : card.status,
        note: card.log?.note || null,
      }, selectedDate);
      closeModal();
      toast('Horário alterado somente para este dia.');
      await paint();
    });
  }

  function openCalendarDetail(date, state) {
    const definitions = state.configuration.definitions.filter((item) => item.enabled !== false);
    const entries = habitRoutineEntries(definitions, date, state.logs);
    openModal(`Hábitos de ${date}`, entries.length ? `
      <div class="hb-day-detail">${entries.map((entry) => `<article><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(STATUS_LABELS[entry.status] || entry.status)}</span><p>Planejado: ${escapeHtml(entry.time || 'sem horário')} · Registrado: ${escapeHtml(entry.log?.actualTime || '—')}</p>${entry.log?.note ? `<small>${escapeHtml(entry.log.note)}</small>` : ''}</article>`).join('')}</div>`
      : '<p>Nenhum hábito estava planejado para este dia.</p>', '<button type="button" class="btn btn-primary" data-modal-close>Fechar</button>');
  }

  function bind({ state, guidance, agenda, today }) {
    $('#hb-home', root)?.addEventListener('click', () => navigate('home'));
    $('#hb-configure', root)?.addEventListener('click', () => openConfiguration());
    $('#hb-settings-open', root)?.addEventListener('click', () => openConfiguration());
    $('#hb-summary-action', root)?.addEventListener('click', () => {
      if (!state.total) openConfiguration();
      else document.getElementById('hb-agenda-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#kaely-action', root)?.addEventListener('click', async () => {
      if (guidance.action === 'configure') return openConfiguration();
      if (guidance.action === 'record' && guidance.definitionId) return openRecord(guidance.definitionId, state);
      document.getElementById(guidance.action === 'history' ? 'hb-history' : 'hb-agenda-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    root.querySelectorAll('[data-week-date]').forEach((button) => button.addEventListener('click', async () => {
      selectedDate = button.dataset.weekDate;
      await paint();
    }));
    root.querySelectorAll('[data-toggle-habit]').forEach((button) => button.addEventListener('click', async () => {
      SFX.click();
      await toggleHabitForDate(button.dataset.toggleHabit, button.dataset.date);
      await paint();
    }));
    root.querySelectorAll('[data-habit-delta]').forEach((button) => button.addEventListener('click', async () => {
      SFX.click();
      await incrementHabitForDate(button.dataset.definition, Number(button.dataset.habitDelta), button.dataset.date);
      await paint();
    }));
    root.querySelectorAll('[data-record-details]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.recordDetails, state)));
    root.querySelectorAll('[data-agenda-register]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.agendaRegister, state)));
    root.querySelectorAll('[data-agenda-postpone]').forEach((button) => button.addEventListener('click', () => openPostpone(button.dataset.agendaPostpone, state)));
    root.querySelectorAll('[data-agenda-skip]').forEach((button) => button.addEventListener('click', async () => {
      await skipHabitForDate(button.dataset.agendaSkip, button.dataset.date);
      toast('Exceção registrada somente para este dia.');
      await paint();
    }));
    root.querySelectorAll('[data-edit-habit]').forEach((button) => button.addEventListener('click', () => openConfiguration(button.dataset.editHabit)));
    root.querySelectorAll('[data-calendar-filter]').forEach((button) => button.addEventListener('click', async () => {
      calendarFilter = button.dataset.calendarFilter;
      await paint();
    }));
    root.querySelectorAll('[data-calendar-date]').forEach((button) => button.addEventListener('click', () => openCalendarDetail(button.dataset.calendarDate, state)));
    if (selectedDate > today) root.querySelectorAll('[data-toggle-habit],[data-habit-delta],[data-record-details],[data-agenda-register],[data-agenda-postpone],[data-agenda-skip]').forEach((button) => {
      button.disabled = true;
      button.title = 'Registros futuros não podem ser concluídos antecipadamente.';
    });
  }

  await paint();
}
