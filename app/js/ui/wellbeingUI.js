import { $, toast, escapeHtml, openModal, closeModal } from './helpers.js';
import { SFX } from '../core/audio.js';
import {
  completeMicroPractice,
  getHabitConfiguration,
  getTodayWellbeingState,
  saveHabitConfiguration,
  setHabitAmount,
  skipHabitConfiguration,
  toggleHabit,
} from '../core/wellbeing.js';
import {
  HABIT_CATALOG,
  MAX_ACTIVE_HABITS,
  habitPrivacyStatement,
} from '../core/habitSystem.js';
import {
  DAY_MESSAGES,
  EDUCATION_CARDS,
  greetingForNow,
  messageForNow,
  pickMessage,
  progressHumanLabel,
} from '../core/wellbeingMessages.js';
import { getPlayer } from '../core/seed.js';
import { mountPageContainer, sectionHeader } from './appShell.js';
import {
  KAELA,
  buildHabitCalendar,
  chooseKaelaGuidance,
  habitRoutineEntries,
  refreshKaelaConsistency,
} from '../services/kaelaVigorService.js';

function renderHabitCard(card) {
  const { habit, catalog, pct, completed, done, target, automatic } = card;
  return `
    <article class="pd-habit ${completed ? 'is-done' : ''}" data-habit-card="${habit.id}">
      <span class="pd-habit__ico" aria-hidden="true">${escapeHtml(catalog?.icon || '•')}</span>
      <div class="pd-habit__body">
        <strong>${escapeHtml(catalog?.label || habit.name)}</strong>
        <p>${escapeHtml(catalog?.description || '')}</p>
        <div class="pd-habit__track" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <small>${done}/${target} ${escapeHtml(habit.unit)}${automatic ? ' · automático' : ''}</small>
      </div>
      <button type="button" class="btn ${completed ? 'btn-ghost' : 'btn-primary'} pd-habit__act"
        data-toggle-habit="${habit.id}" aria-label="${completed ? 'Desfazer' : 'Marcar'} ${escapeHtml(catalog?.label || habit.name)}">
        ${completed ? 'Desfazer' : 'Registrar'}
      </button>
    </article>`;
}

function configurationBody(configuration) {
  const currentMap = new Map(configuration.definitions.map((item) => [item.habitId, item]));
  return `
    <div class="pd-config">
      <p>Escolha de 3 a 5 hábitos. Você pode misturar estudo e bem-estar ou pular por agora.</p>
      <p class="pd-config__count" id="pd-config-count">0/${MAX_ACTIVE_HABITS} ativos</p>
      <div class="pd-config__list">
        ${HABIT_CATALOG.map((item) => {
          const definition = currentMap.get(item.id);
          const selected = definition?.enabled !== false && Boolean(definition);
          const days = definition?.activeDays || [0, 1, 2, 3, 4, 5, 6];
          return `
            <article class="pd-config-row ${selected ? 'is-selected' : ''}" data-config-row="${item.id}">
              <label class="pd-config-row__main">
                <input type="checkbox" data-habit-select="${item.id}" ${selected ? 'checked' : ''}>
                <span class="pd-config-row__icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
                <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span>
              </label>
              <div class="pd-config-row__options" ${selected ? '' : 'hidden'}>
                <label>Meta
                  <select data-habit-target="${item.id}">
                    ${item.allowedTargets.map((value) => `<option value="${value}" ${value === (definition?.target || item.defaultTarget) ? 'selected' : ''}>${value} ${escapeHtml(item.unit)}</option>`).join('')}
                  </select>
                </label>
                <label>Lembrete opcional
                  <input type="time" data-habit-reminder="${item.id}" value="${definition?.reminderTime || ''}">
                </label>
                <fieldset>
                  <legend>Dias da semana</legend>
                  <div class="pd-day-options">
                    ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, day) => `
                      <label>
                        <input type="checkbox" data-habit-day="${item.id}" value="${day}" ${days.includes(day) ? 'checked' : ''}>
                        <span>${label}</span>
                      </label>`).join('')}
                  </div>
                </fieldset>
                <div class="pd-order-actions">
                  <button type="button" class="btn btn-ghost" data-move-habit="${item.id}" data-direction="-1" aria-label="Mover ${escapeHtml(item.label)} para cima">↑</button>
                  <button type="button" class="btn btn-ghost" data-move-habit="${item.id}" data-direction="1" aria-label="Mover ${escapeHtml(item.label)} para baixo">↓</button>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
      <label class="pd-minimum">Meta mínima do dia
        <select id="pd-minimum-percent">
          ${[40, 50, 60, 70, 80].map((value) => `<option value="${value}" ${value === configuration.minimumPercent ? 'selected' : ''}>${value}% dos hábitos ativos</option>`).join('')}
        </select>
      </label>
      <p class="pd-privacy">${escapeHtml(habitPrivacyStatement())}</p>
    </div>`;
}

export async function renderWellbeing(root, navigate) {
  let mood = null;

  async function paint() {
    const state = await getTodayWellbeingState();
    const player = await getPlayer().catch(() => null);
    const shieldLedger = await refreshKaelaConsistency(state);
    const guidance = chooseKaelaGuidance(state);
    const calendar = buildHabitCalendar({
      definitions: state.configuration.definitions.filter((item) => item.enabled !== false),
      logs: state.logs,
      today: state.date,
      minimumPercent: state.configuration.minimumPercent,
      protectedDates: shieldLedger.protectedDates,
    });
    const routineEntries = habitRoutineEntries(state.configuration.definitions, state.date);
    const message = mood === 'hard'
      ? pickMessage(DAY_MESSAGES.baixa_energia, Date.now())
      : messageForNow(new Date());
    const percent = state.total ? Math.round((state.doneCount / state.total) * 100) : 0;
    root.innerHTML = `
      <div class="pd-screen" data-wellbeing-v3="kaela-habits">
        <section class="kaela-card" aria-labelledby="kaela-guidance-title">
          <div class="kaela-card__portrait">
            <img src="${KAELA.asset}" alt="${escapeHtml(KAELA.name)}"
              onerror="this.onerror=null;this.src='${KAELA.fallbackAsset}'">
          </div>
          <div class="kaela-card__copy">
            <p class="pd-kicker">${escapeHtml(KAELA.name)}</p>
            <h2 id="kaela-guidance-title">${escapeHtml(guidance.title)}</h2>
            <p>${escapeHtml(guidance.message)}</p>
            <button type="button" class="btn btn-primary" id="kaela-action">${escapeHtml(guidance.actionLabel)}</button>
          </div>
        </section>

        <header class="pd-hero" aria-label="Preparação do dia">
          <div class="pd-hero__glow" aria-hidden="true"></div>
          <p class="pd-kicker">Preparação do Dia</p>
          <h2 class="pd-greeting">${escapeHtml(greetingForNow(new Date(), player?.name || ''))}</h2>
          <p class="pd-message">${escapeHtml(message)}</p>
          <p class="pd-sub">Como posso me preparar melhor para estudar hoje?</p>
          <button type="button" class="btn btn-primary pd-cta" id="pd-start-small">Começar pequeno · 1 minuto</button>
        </header>

        <section class="pd-modes" aria-label="Modos do dia">
          <button type="button" class="pd-mode pd-mode--go ${mood === 'productive' ? 'is-on' : ''}" id="pd-mode-prod">
            <strong>Quero entrar no modo produtivo</strong><small>Um ritual leve para começar</small>
          </button>
          <button type="button" class="pd-mode pd-mode--soft ${mood === 'hard' ? 'is-on' : ''}" id="pd-mode-hard">
            <strong>Hoje estou sem energia</strong><small>Faça o mínimo possível, sem culpa</small>
          </button>
        </section>

        <section class="pd-block pd-block--habits" aria-labelledby="pd-habits-title">
          <div class="pd-block__head">
            <div>
              <h3 id="pd-habits-title">Meus rituais</h3>
              <p class="pd-human-progress">${escapeHtml(progressHumanLabel(state.doneCount, state.total))}</p>
            </div>
            <div class="pd-ring" style="--p:${percent}" role="img" aria-label="Progresso ${percent}%">
              <strong>${state.doneCount}</strong><small>de ${state.total}</small>
            </div>
          </div>
          <div class="pd-habits">
            ${state.cards.length ? state.cards.map(renderHabitCard).join('') : `
              <div class="pd-empty-habits">
                <strong>Escolha os rituais que combinam com sua rotina</strong>
                <p>Nenhuma escolha bloqueia o aplicativo. Você pode voltar depois.</p>
              </div>`}
          </div>
          <button type="button" class="btn btn-ghost pd-configure" id="pd-configure">Configurar hábitos</button>
          <p class="pd-privacy">${escapeHtml(habitPrivacyStatement())}</p>
        </section>

        <section class="pd-block pd-constancy" aria-label="Constância">
          <h3>Sua constância</h3>
          <div class="pd-stat-grid">
            <div><strong>${state.consistency.streakCurrent}</strong><span>sequência</span></div>
            <div><strong>${state.consistency.weeklyConsistency}%</strong><span>esta semana</span></div>
            <div><strong>${state.consistency.thirtyDayConsistency}%</strong><span>últimos 30 dias</span></div>
            <div><strong>${state.consistency.streakBest}</strong><span>melhor sequência</span></div>
          </div>
          <p>${state.minimumReached
            ? 'Meta mínima de hoje alcançada. Consistência não exige perfeição.'
            : `Você concluiu ${state.doneCount} de ${state.total} hábitos planejados hoje.`}</p>
          <p class="pd-vigor-hint">Vigor consolidado: ${state.vigor}</p>
          <div class="pd-shields" aria-label="${shieldLedger.shields} escudos de constância">
            <strong>Escudos de Constância</strong>
            <span>${Array.from({ length: 2 }, (_, index) => `<i class="${index < shieldLedger.shields ? 'is-active' : ''}" aria-hidden="true">◆</i>`).join('')}</span>
            <small>${shieldLedger.protectedDates.length
              ? `Proteção usada em ${shieldLedger.protectedDates.at(-1)}. Os hábitos reais não foram marcados.`
              : 'Uma semana com 6 ou 7 dias cumpridos gera um escudo.'}</small>
          </div>
        </section>

        <section class="pd-block pd-calendar-block" aria-labelledby="pd-calendar-title">
          <div class="pd-block__head">
            <div><h3 id="pd-calendar-title">Últimos 30 dias</h3><p class="pd-human-progress">Histórico real, sem inventar conclusões.</p></div>
          </div>
          <div class="pd-calendar" role="list" aria-label="Calendário de constância">
            ${calendar.map((day) => `
              <span role="listitem" class="is-${day.state}" title="${day.date}: ${day.completed}/${day.planned}">
                <i aria-hidden="true"></i><small>${day.date.slice(-2)}</small>
              </span>`).join('')}
          </div>
          <div class="pd-calendar-legend">
            <span><i class="is-completed"></i>Cumprido</span>
            <span><i class="is-protected"></i>Protegido</span>
            <span><i class="is-missed"></i>Não atingido</span>
          </div>
        </section>

        <section class="pd-block pd-routine-habits" aria-labelledby="pd-routine-habits-title">
          <h3 id="pd-routine-habits-title">Rituais na rotina de hoje</h3>
          ${routineEntries.length ? `
            <div class="pd-routine-list">${routineEntries.map((entry) => `
              <div><time>${escapeHtml(entry.time)}</time><span>${escapeHtml(entry.title)}</span></div>`).join('')}</div>`
            : '<p class="muted">Adicione um horário opcional ao configurar um hábito. O histórico não muda quando o horário for alterado.</p>'}
        </section>

        <section class="pd-block pd-block--edu">
          <h3>Isso ajuda seu estudo</h3>
          <div class="pd-edu-grid">
            ${EDUCATION_CARDS.slice(0, 4).map((card) => `
              <article class="pd-edu-card"><strong>${escapeHtml(card.title)}</strong><p>${escapeHtml(card.text)}</p></article>`).join('')}
          </div>
        </section>
        <button type="button" class="btn btn-block" id="pd-home">← Voltar ao Início</button>
      </div>`;

    mountPageContainer(root, {
      variant: 'wellbeing',
      header: sectionHeader({
        eyebrow: 'Cuidado estratégico',
        title: 'Preparação do Dia',
        subtitle: 'Hábitos, energia e constância para sustentar o estudo.',
      }),
    });
    bind(state, guidance);
  }

  async function openConfiguration() {
    const configuration = await getHabitConfiguration();
    let selected = configuration.definitions
      .filter((item) => item.enabled !== false)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => item.habitId);
    openModal(
      'Configurar meus hábitos',
      configurationBody(configuration),
      `<button type="button" class="btn btn-ghost" id="pd-config-skip">Pular por agora</button>
       <button type="button" class="btn btn-primary" id="pd-config-save">Salvar hábitos</button>`,
    );
    const modal = document.getElementById('app-modal');
    const update = () => {
      modal?.querySelectorAll('[data-habit-select]').forEach((input) => {
        const row = input.closest('.pd-config-row');
        row?.classList.toggle('is-selected', input.checked);
        const options = row?.querySelector('.pd-config-row__options');
        if (options) options.hidden = !input.checked;
      });
      const count = document.getElementById('pd-config-count');
      if (count) count.textContent = `${selected.length}/${MAX_ACTIVE_HABITS} ativos`;
    };
    modal?.querySelectorAll('[data-habit-select]').forEach((input) => {
      input.addEventListener('change', () => {
        const habitId = input.dataset.habitSelect;
        if (input.checked && selected.length >= MAX_ACTIVE_HABITS) {
          input.checked = false;
          toast('Você pode manter no máximo cinco hábitos ativos.');
          return;
        }
        selected = input.checked
          ? [...selected, habitId]
          : selected.filter((id) => id !== habitId);
        update();
      });
    });
    modal?.querySelectorAll('[data-move-habit]').forEach((button) => {
      button.addEventListener('click', () => {
        const from = selected.indexOf(button.dataset.moveHabit);
        const to = from + Number(button.dataset.direction);
        if (from < 0 || to < 0 || to >= selected.length) return;
        [selected[from], selected[to]] = [selected[to], selected[from]];
        toast('Ordem ajustada. Salve para confirmar.');
      });
    });
    document.getElementById('pd-config-skip')?.addEventListener('click', async () => {
      await skipHabitConfiguration();
      closeModal();
      await paint();
    });
    document.getElementById('pd-config-save')?.addEventListener('click', async () => {
      const selections = selected.map((habitId) => ({
        habitId,
        target: Number(modal?.querySelector(`[data-habit-target="${habitId}"]`)?.value),
        reminderTime: modal?.querySelector(`[data-habit-reminder="${habitId}"]`)?.value || null,
        activeDays: [...(modal?.querySelectorAll(`[data-habit-day="${habitId}"]:checked`) || [])].map((input) => Number(input.value)),
      }));
      try {
        await saveHabitConfiguration({
          selections,
          minimumPercent: Number(document.getElementById('pd-minimum-percent')?.value) || 60,
        });
        closeModal();
        toast(selected.length < 3 ? 'Salvo. Você pode adicionar outros hábitos quando quiser.' : 'Seus hábitos foram salvos.');
        await paint();
      } catch {
        toast('Não foi possível salvar os hábitos.');
      }
    });
    update();
  }

  function bind(state, guidance) {
    $('#pd-home', root)?.addEventListener('click', () => navigate('home'));
    $('#pd-configure', root)?.addEventListener('click', openConfiguration);
    $('#kaela-action', root)?.addEventListener('click', async () => {
      if (guidance.action === 'configure') {
        await openConfiguration();
      } else if (guidance.action === 'home') {
        navigate('home');
      } else if (guidance.action === 'mark' && guidance.definitionId) {
        const card = state.cards.find((item) => item.definition.id === guidance.definitionId);
        if (card && !card.automatic) {
          await completeMicroPractice(card.definition.id, card.definition.target);
          await paint();
        }
      } else {
        document.getElementById('pd-habits-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    $('#pd-mode-prod', root)?.addEventListener('click', async () => {
      mood = 'productive';
      toast('Ritual iniciado. Agora escolha a primeira tarefa do edital.');
      await paint();
    });
    $('#pd-mode-hard', root)?.addEventListener('click', async () => { mood = 'hard'; await paint(); });
    $('#pd-start-small', root)?.addEventListener('click', async () => {
      const meditation = state.cards.find((card) => card.definition.habitId === 'meditation');
      if (meditation) await completeMicroPractice(meditation.definition.id, 1);
      toast('Você começou pequeno. Isso já é movimento.');
      await paint();
    });
    root.querySelectorAll('[data-toggle-habit]').forEach((button) => {
      button.addEventListener('click', async () => {
        SFX.click();
        const card = state.cards.find((item) => item.habit.id === button.dataset.toggleHabit);
        if (!card || card.automatic) {
          if (card?.automatic) toast('Este hábito acompanha uma atividade acadêmica real.');
          return;
        }
        try {
          if (card.completed) await setHabitAmount(card.definition.id, 0);
          else if (['registro', 'planejamento', 'missão'].includes(card.definition.unit)) {
            await toggleHabit(card.definition.id);
          } else {
            await completeMicroPractice(card.definition.id, card.definition.target);
          }
          await paint();
        } catch (error) {
          toast(error?.message || 'Não foi possível registrar.');
        }
      });
    });
  }

  await paint();
}
