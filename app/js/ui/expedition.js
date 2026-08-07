/**
 * Plano de Edital — Semana · Mês · Vida (estudo/trabalho/descanso)
 * UI animada com avatar planejando + calendário inteligente.
 */
import { $, toast, escapeHtml, openModal, closeModal, todayStr } from './helpers.js';
import { SFX } from '../core/audio.js';
import { icon, semanticIcon } from './icons.js?v=67';
import { mountPageContainer, sectionHeader } from './appShell.js';
import { routineService } from '../services/routineService.js';
import {
  activityLabel,
  activityFamily,
  modelTemplate,
  SKIP_REASONS,
  DISTRACTION_CATEGORIES,
  dateKey,
} from '../core/routine/routineSchema.js';
import { FOCUS_PRESETS, formatClock } from '../core/routine/routineFocus.js';
import {
  WEEKDAY_SHORT,
  dayLoadLevel,
  shiftWeek,
  weekDatesFrom,
} from '../core/routine/routineCalendar.js';
import {
  dailyCapacityForDate,
  validateStudyAvailability,
} from '../core/routine/studyPlanContract.js';
import { prefersReducedMotion } from './components.js';
import { daysUntilExam } from '../core/progression.js';
import { heroImgHtml } from './heroAssets.js';
import { getHabitConfiguration } from '../core/wellbeing.js';
import { habitRoutineEntries } from '../services/kaelyHabitService.js';
import {
  buildAvailabilityPresentation,
  buildBlockPresentation,
  buildExamJourneyPresentation,
  buildFocusPresentation,
  buildMonthPresentation,
  buildPlanEmptyState,
  buildPlanErrorPresentation,
  buildProgressPresentation,
  buildTodayPresentation,
  buildWeekPresentation,
  formatPlanMinutes,
} from './studyPlanVisualModel.js';

const TABS = [
  { id: 'hoje', label: 'Missões', detail: 'Plano de hoje', icon: 'target' },
  { id: 'semana', label: 'Semana', detail: 'Cronograma', icon: 'calendar' },
  { id: 'mes', label: 'Calendário', detail: 'Visão mensal', icon: 'calendar' },
  { id: 'revisao', label: 'Revisões', detail: 'Memória em dia', icon: 'layers' },
  { id: 'vida', label: 'Disponibilidade', detail: 'Vida real', icon: 'focus' },
  { id: 'jornada', label: 'Até a prova', detail: 'Rota completa', icon: 'flag' },
  { id: 'foco', label: 'Sessão', detail: 'Modo foco', icon: 'bolt' },
  { id: 'progresso', label: 'Resultados', detail: 'Análise', icon: 'chart' },
];

const DAY_NAMES = WEEKDAY_SHORT;
const LIFE_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const PLANNER_ART = 'assets/mentors/evi-plan-strategist.webp?v=1';

function endTimeFrom(start, minutes) {
  if (!start || !/^\d{2}:\d{2}$/.test(start)) return null;
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + (Number(minutes) || 0);
  const hh = String(Math.floor((total % (24 * 60)) / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function familyMinutes(blocks = []) {
  const out = { estudo: 0, trabalho: 0, descanso: 0 };
  for (const b of blocks) {
    if (['cancelled', 'rescheduled'].includes(b.status)) continue;
    const fam = activityFamily(b.activityType);
    out[fam] = (out[fam] || 0) + (b.plannedMinutes || 0);
  }
  return out;
}

export async function renderExpedition(root, navigate, ctx) {
  const requestedTab = String(ctx?.planSection || '');
  let tab = TABS.some((item) => item.id === requestedTab) ? requestedTab : 'semana';
  if (ctx) delete ctx.planSection;
  let profile = await routineService.ensureProfile();
  let focusCtl = null;
  let focusTimer = null;
  let pendingReschedule = null;
  let planGenerationInFlight = false;
  const blockOperations = new Set();
  let weekCursor = dateKey();
  let monthCursor = { year: new Date().getFullYear(), monthIndex: new Date().getMonth() };

  const cleanup = () => {
    if (focusTimer) clearInterval(focusTimer);
    focusTimer = null;
  };

  async function paint() {
    cleanup();
    try {
      if (!profile.setupCompleted) {
        root.innerHTML = renderSetup(profile);
        bindSetup();
        mountShell('Configuração');
        return;
      }

      if (tab === 'hoje') await paintHoje();
      else if (tab === 'semana') await paintSemana();
      else if (tab === 'mes') await paintMes();
      else if (tab === 'vida') await paintVida();
      else if (tab === 'jornada') await paintJornada();
      else if (tab === 'foco') await paintFoco();
      else if (tab === 'progresso') await paintProgresso();
      else if (tab === 'revisao') await paintRevisao();

      mountShell(TABS.find((item) => item.id === tab)?.label || 'Plano');
      bindTabs();
    } catch (error) {
      const failure = buildPlanErrorPresentation(error?.message);
      root.innerHTML = `
        ${tabsHtml(tab)}
        <section class="plan-state plan-state--error" role="alert">
          <span class="plan-state__symbol" aria-hidden="true">${icon('alertTriangle')}</span>
          <div><h2>${escapeHtml(failure.title)}</h2><p>${escapeHtml(failure.message)}</p></div>
          <button type="button" class="btn btn-primary" id="plan-retry">Tentar novamente</button>
        </section>`;
      mountShell(TABS.find((item) => item.id === tab)?.label || 'Plano');
      bindTabs();
      $('#plan-retry', root)?.addEventListener('click', paint);
    }
  }

  function mountShell(title) {
    mountPageContainer(root, {
      variant: 'routine',
      header: sectionHeader({
        eyebrow: 'Plano de edital',
        title,
        subtitle: 'Organize estudo, trabalho e descanso até a prova.',
      }),
    });
  }

  function tabsHtml(active) {
    return `
      <nav class="plan-workspace-nav" aria-label="Áreas do plano">
        <div class="plan-workspace-nav__intro">
          <span>Central de planejamento</span>
          <strong>Escolha o que deseja organizar</strong>
        </div>
        <div class="plan-workspace-nav__rail">
          ${TABS.map((item) => `
            <button type="button" class="plan-workspace-tab ${active === item.id ? 'is-active' : ''}" data-tab="${item.id}" aria-current="${active === item.id ? 'page' : 'false'}" aria-label="${item.label}: ${item.detail}">
              <span class="plan-workspace-tab__icon" aria-hidden="true">${icon(item.icon, 'ico--sm')}</span>
              <span class="plan-workspace-tab__copy">
                <strong>${item.label}</strong>
                <small>${item.detail}</small>
              </span>
            </button>
          `).join('')}
        </div>
      </nav>`;
  }

  function planBanner({ title, subtitle, stats = [] } = {}) {
    const statsHtml = stats.map((s) => `<span>${s.icon || ''}<strong>${escapeHtml(String(s.value))}</strong> ${escapeHtml(s.label || '')}</span>`).join('');
    return `
      <section class="plan-banner" aria-label="Planejamento do edital">
        <div class="plan-banner__copy">
          <span class="plan-banner__kicker">Evi organiza sua próxima missão</span>
          <h2>${escapeHtml(title || 'Planeje a semana com inteligência')}</h2>
          <p>${escapeHtml(subtitle || 'Equilibre estudo, trabalho e descanso para sustentar a jornada até a prova.')}</p>
          ${statsHtml ? `<div class="plan-banner__stats">${statsHtml}</div>` : ''}
        </div>
        <div class="plan-banner__art">
          <div class="plan-banner__glow"></div>
          <img class="plan-banner__hero" src="${PLANNER_ART}" alt="Evi organizando o plano de missões" width="1536" height="1024" decoding="async" />
        </div>
      </section>`;
  }

  function legendHtml() {
    return `
      <div class="plan-legend" aria-label="Legenda de blocos">
        <span><i class="fam-estudo"></i> Estudo</span>
        <span><i class="fam-trabalho"></i> Trabalho</span>
        <span><i class="fam-descanso"></i> Descanso</span>
      </div>`;
  }

  function bindTabs() {
    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        tab = btn.dataset.tab;
        paint();
      });
    });
  }

  /* ───────── Setup ───────── */
  function renderSetup(p) {
    const empty = buildPlanEmptyState('setup');
    return `
      <section class="routine-setup plan-setup" aria-labelledby="plan-setup-title">
        <div class="plan-setup__intro">
          <div class="plan-setup__copy">
            <span class="plan-banner__kicker">Estratégia com Evi</span>
            <h2 id="plan-setup-title">${escapeHtml(empty.title)}</h2>
            <p>${escapeHtml(empty.description)}</p>
          </div>
          <img src="${PLANNER_ART}" alt="Evi, estrategista do plano de estudos" width="1536" height="1024" decoding="async" />
        </div>
        <div class="plan-setup__form">
          <h3>Escolha seu ponto de partida</h3>
          <div class="routine-models" role="list">
            ${['leve', 'equilibrada', 'intensa'].map((m) => {
              const t = modelTemplate(m);
              return `
                <button type="button" class="routine-model-card ${p.model === m ? 'is-selected' : ''}" data-model="${m}" role="listitem">
                  <strong>${m === 'leve' ? 'Leve' : m === 'intensa' ? 'Intensa' : 'Equilibrada'}</strong>
                  <small>${t.minDailyMinutes}–${t.maxDailyMinutes} min/dia · ${t.dailyQuestionsGoal} questões · até ${t.maxBlocksPerDay} blocos</small>
                </button>`;
            }).join('')}
          </div>
          <div class="field mt-12">
            <label for="rs-min">Meta mínima diária (minutos)</label>
            <input type="number" id="rs-min" min="5" max="120" value="${p.minGoal?.minutes || 10}" />
          </div>
          <div class="field">
            <label for="rs-q">Meta diária de questões</label>
            <input type="number" id="rs-q" min="0" max="300" value="${p.dailyQuestionsGoal || 30}" />
          </div>
          <div class="field">
            <label for="rs-flex">
              <input type="checkbox" id="rs-flex" ${p.flexible !== false ? 'checked' : ''} />
              Rotina flexível (recomendado)
            </label>
          </div>
          <p class="plan-field-note">Dias de estudo padrão: segunda a sexta. Descanso: sábado e domingo. Tudo poderá ser ajustado depois.</p>
          <button type="button" class="btn btn-primary btn-block mt-12" id="rs-save">Começar com este plano</button>
          <button type="button" class="btn btn-ghost btn-block mt-8" id="rs-skip">Pular e usar padrão leve</button>
        </div>
      </section>`;
  }

  function bindSetup() {
    let model = profile.model || 'equilibrada';
    let setupInFlight = false;
    root.querySelectorAll('[data-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        model = btn.dataset.model;
        root.querySelectorAll('[data-model]').forEach((b) => b.classList.toggle('is-selected', b.dataset.model === model));
      });
    });
    const finish = async (skip = false) => {
      if (setupInFlight) return;
      setupInFlight = true;
      const buttons = [$('#rs-save', root), $('#rs-skip', root)].filter(Boolean);
      buttons.forEach((button) => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      });
      SFX.click();
      try {
        const m = skip ? 'leve' : model;
        const minutes = Number($('#rs-min', root)?.value) || 10;
        const questions = Number($('#rs-q', root)?.value) || 30;
        const flexible = $('#rs-flex', root)?.checked !== false;
        profile = await routineService.completeSetup({
          model: m,
          overrides: {
            flexible,
            dailyQuestionsGoal: questions,
            minGoal: { type: 'minutes', minutes, questions: 5, blocks: 1, reviews: 0 },
            minDailyMinutes: minutes,
          },
          generatePlan: true,
        });
        toast('Plano de estudos pronto. Boa jornada!');
        await paint();
      } catch (error) {
        toast(error?.message || 'Não foi possível salvar o plano. Seus dados anteriores foram preservados.');
      } finally {
        setupInFlight = false;
        buttons.forEach((button) => {
          if (!button.isConnected) return;
          button.disabled = false;
          button.removeAttribute('aria-busy');
        });
      }
    };
    $('#rs-save', root)?.addEventListener('click', () => finish(false));
    $('#rs-skip', root)?.addEventListener('click', () => finish(true));
  }

  /* ───────── Hoje ───────── */
  async function paintHoje() {
    const dash = await routineService.getTodayDashboard();
    const journeySnap = await routineService.getExamJourney();
    profile = dash.profile;
    const { state, blocks, next, streak, shields } = dash;
    const habitConfiguration = await getHabitConfiguration();
    const habitReminders = habitRoutineEntries(habitConfiguration.definitions, todayStr());
    const planned = state.plannedMinutes || 0;
    const actual = state.actualMinutes || 0;
    const pct = planned ? Math.min(100, Math.round((actual / planned) * 100)) : (state.minGoalMet ? 100 : 0);
    const j = journeySnap.journey;
    const bal = familyMinutes(blocks);
    const today = buildTodayPresentation({ state, blocks, next, streak, profile, journey: j });
    const dayEmpty = buildPlanEmptyState('day');
    const nextModel = next ? buildBlockPresentation(next, {
      activity: activityLabel(next.activityType),
      family: activityFamily(next.activityType),
    }) : null;

    root.innerHTML = `
      ${tabsHtml('hoje')}
      ${planBanner({
        title: today.heroTitle,
        subtitle: today.heroSubtitle,
        stats: [
          { value: `${today.progress}%`, label: 'executado', icon: icon('target', 'ico--sm') },
          { value: `${today.streak}d`, label: 'sequência', icon: icon('flame', 'ico--sm') },
          { value: `${today.pending}`, label: 'pendentes', icon: icon('clipboard', 'ico--sm') },
        ],
      })}
      ${legendHtml()}
      <div class="plan-today-grid">
        <section class="plan-card plan-next-mission ${nextModel ? `fam-${nextModel.family}` : 'is-empty'}" aria-labelledby="plan-next-title">
          <span class="plan-card__eyebrow">Próxima missão</span>
          <h2 id="plan-next-title">${escapeHtml(nextModel?.title || dayEmpty.title)}</h2>
          <p class="plan-next-mission__meta">${nextModel
            ? `${escapeHtml(nextModel.activity)} · ${escapeHtml(nextModel.duration)} · ${escapeHtml(nextModel.time)}`
            : escapeHtml(dayEmpty.description)}</p>
          ${nextModel?.context ? `<p class="plan-next-mission__context">${escapeHtml(nextModel.context)}</p>` : ''}
          <button type="button" class="btn btn-primary plan-next-mission__cta" id="rt-next" ${next ? '' : 'disabled'}>
            ${icon('bolt', 'ico--sm')} ${escapeHtml(today.nextAction)}
          </button>
        </section>
        <section class="plan-card plan-day-load" aria-labelledby="plan-load-title">
          <span class="plan-card__eyebrow">Carga do dia</span>
          <h2 id="plan-load-title">Equilíbrio planejado</h2>
          <div class="plan-balance">
            <div class="fam-estudo"><small>Estudo</small><strong>${formatPlanMinutes(bal.estudo)}</strong></div>
            <div class="fam-trabalho"><small>Trabalho</small><strong>${formatPlanMinutes(bal.trabalho)}</strong></div>
            <div class="fam-descanso"><small>Descanso</small><strong>${formatPlanMinutes(bal.descanso)}</strong></div>
          </div>
          <p class="plan-day-load__status">${state.minGoalMet ? 'Meta mínima cumprida.' : 'Meta mínima ainda em aberto.'}
            <span>${icon('shield', 'ico--sm')} ${shields} proteção(ões)</span></p>
          ${!j.hasExam ? '<button type="button" class="dj-link plan-inline-action" id="rt-goto-jornada">Definir data da prova →</button>' : ''}
        </section>
      </div>

      <section class="plan-card plan-timeline mb-8" aria-labelledby="plan-blocks-title">
        <div class="plan-section-heading">
          <div><span class="plan-card__eyebrow">Agenda operacional</span><h2 id="plan-blocks-title">Blocos de hoje</h2></div>
          <span class="plan-section-heading__count">${blocks.length} bloco(s)</span>
        </div>
        ${blocks.length ? `<div class="plan-timeline__list">${blocks.map(blockCard).join('')}</div>` : `
          <div class="plan-state plan-state--compact">
            <span class="plan-state__symbol" aria-hidden="true">${icon('calendar')}</span>
            <div><h3>${escapeHtml(dayEmpty.title)}</h3><p>${escapeHtml(dayEmpty.description)}</p></div>
          </div>`}
        <div class="plan-secondary-actions">
          <button type="button" class="btn" id="rt-add-today">${icon('plus', 'ico--sm')} Adicionar bloco</button>
          <button type="button" class="btn btn-ghost" id="rt-little-time">Tenho pouco tempo</button>
          <button type="button" class="btn btn-ghost" id="rt-close-day">Fechar dia</button>
        </div>
      </section>
      ${habitReminders.length ? `
        <section class="plan-card mb-8" aria-labelledby="routine-habits-title">
          <div class="plan-section-heading">
            <h2 id="routine-habits-title">Rituais de hoje</h2>
            <button type="button" class="btn btn-ghost" id="rt-open-rituals">Abrir Meus Rituais</button>
          </div>
          <div class="pd-routine-list">
            ${habitReminders.map((entry) => `<div><time>${escapeHtml(entry.time)}</time><span>${escapeHtml(entry.title)}</span></div>`).join('')}
          </div>
        </section>` : ''}
    `;

    $('#rt-next', root)?.addEventListener('click', async () => {
      if (!next) return;
      SFX.click();
      await startBlockFlow(next, navigate);
    });
    $('#rt-goto-jornada', root)?.addEventListener('click', () => {
      SFX.click();
      tab = 'jornada';
      paint();
    });
    $('#rt-add-today', root)?.addEventListener('click', () => openSmartBlockModal({ date: todayStr() }));
    $('#rt-little-time', root)?.addEventListener('click', () => openLittleTimeModal());
    $('#rt-close-day', root)?.addEventListener('click', async () => {
      SFX.click();
      const res = await routineService.closeDay();
      if (res.message) toast(res.message, 4000);
      else toast(res.state.minGoalMet ? 'Dia registrado · sequência atualizada' : 'Dia registrado');
      if (res.unlocked?.length) toast(`Conquista: ${res.unlocked[0].title}`);
      paint();
    });
    $('#rt-open-rituals', root)?.addEventListener('click', () => navigate('wellbeing'));
    bindBlockActions(blocks, navigate);
  }

  function blockCard(b) {
    const fam = activityFamily(b.activityType);
    const card = buildBlockPresentation(b, { activity: activityLabel(b.activityType), family: fam });
    return `
      <article class="routine-block status-${b.status} fam-${fam}" data-block="${b.id}">
        <span class="routine-block__marker" aria-hidden="true">${card.status.symbol}</span>
        <div class="routine-block__main">
          <div class="routine-block__heading"><strong>${escapeHtml(card.title)}</strong><span class="routine-block__status tone-${card.status.tone}">${escapeHtml(card.status.label)}</span></div>
          <p class="routine-block__meta">${escapeHtml(card.activity)} · ${escapeHtml(card.duration)} · ${escapeHtml(card.time)}</p>
          ${card.context ? `<p class="routine-block__context">${escapeHtml(card.context)}</p>` : ''}
          ${card.description ? `<p class="muted routine-block__desc">${escapeHtml(card.description)}</p>` : ''}
        </div>
        <div class="routine-block__actions">
          ${card.canAct ? `
            <button type="button" class="btn btn-primary" data-act="start" data-id="${b.id}">${escapeHtml(card.primaryLabel)}</button>
            <details class="routine-block__more">
              <summary aria-label="Mais ações para ${escapeHtml(card.title)}">Mais ações</summary>
              <div class="routine-block__menu">
                <button type="button" class="btn" data-act="open" data-id="${b.id}">Abrir módulo</button>
                <button type="button" class="btn" data-act="partial" data-id="${b.id}">Concluir parcial</button>
                <button type="button" class="btn" data-act="reschedule" data-id="${b.id}">Reagendar</button>
                <button type="button" class="btn btn-ghost" data-act="skip" data-id="${b.id}">Ignorar</button>
              </div>
            </details>
          ` : `<span class="routine-block__actual">${escapeHtml(card.status.label)}${card.actual ? ` · ${escapeHtml(card.actual)} reais` : ''}</span>`}
        </div>
      </article>`;
  }

  function bindBlockActions(blocks, navigate) {
    root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        const block = blocks.find((b) => b.id === id);
        const operationKey = `${act}:${id}`;
        if (!block || blockOperations.has(operationKey)) return;
        blockOperations.add(operationKey);
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        SFX.click();
        try {
          if (act === 'start') await startBlockFlow(block, navigate);
          if (act === 'partial') openSkipModal(id, true);
          if (act === 'skip') openSkipModal(id, false);
          if (act === 'reschedule') openRescheduleModal(id);
          if (act === 'open') {
            const target = routineService.navigateTargetForBlock(block);
            navigate(target);
          }
        } catch (error) {
          toast(error?.message || 'Não foi possível atualizar este bloco.');
        } finally {
          blockOperations.delete(operationKey);
          if (btn.isConnected) {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
          }
        }
      });
    });
  }

  async function startBlockFlow(block, navigate) {
    await routineService.startBlock(block.id);
    tab = 'foco';
    await paint();
    // auto-select block in focus
    const sel = root.querySelector('#focus-block');
    if (sel) sel.value = block.id;
    const mins = root.querySelector('#focus-mins');
    if (mins) mins.value = String(block.plannedMinutes || 25);
  }

  function openLittleTimeModal() {
    openModal('Tenho pouco tempo', `
      <div id="lt-panel" class="plan-reduced-modal">
      <p>Vamos montar uma versão possível para hoje sem apagar seu planejamento original.</p>
      <div class="plan-duration-options" id="lt-actions" role="group" aria-label="Duração do plano reduzido">
        <button type="button" class="plan-duration-option" data-lt="10"><strong>10</strong><span>min</span></button>
        <button type="button" class="plan-duration-option" data-lt="20"><strong>20</strong><span>min</span></button>
        <button type="button" class="plan-duration-option" data-lt="30"><strong>30</strong><span>min</span></button>
      </div>
      <div class="field plan-reduced-modal__custom">
        <label for="lt-custom">Personalizar (minutos)</label>
        <input type="number" id="lt-custom" min="10" max="60" value="15" />
      </div>
      <p id="lt-status" class="plan-operation-status" role="status" aria-live="polite"></p>
      </div>
    `, `<button type="button" class="btn btn-primary" id="lt-go">Criar plano reduzido</button>
        <button type="button" class="btn" id="lt-cancel">Cancelar</button>`);
    let running = false;
    const run = async (minutes) => {
      if (running) return;
      running = true;
      const panel = document.getElementById('lt-panel');
      const status = document.getElementById('lt-status');
      const controls = [...document.querySelectorAll('[data-lt], #lt-go, #lt-cancel, #lt-custom')];
      panel?.setAttribute('aria-busy', 'true');
      controls.forEach((control) => { control.disabled = true; });
      if (status) status.textContent = 'Verificando sua disponibilidade...';
      try {
        const result = await routineService.activateReducedPlan(minutes);
        if (!result.reduced?.length) {
          if (status) {
            status.setAttribute('role', 'alert');
            status.textContent = 'Não há conteúdo acadêmico elegível ou espaço disponível para montar um plano reduzido agora.';
          }
          return;
        }
        if (status) status.textContent = result.created ? 'Plano reduzido criado.' : 'Este plano reduzido já estava disponível.';
        toast(result.created ? 'Plano reduzido adicionado ao dia.' : 'Plano reduzido já estava disponível.');
        closeModal();
        await paint();
      } catch (error) {
        if (status) {
          status.setAttribute('role', 'alert');
          status.textContent = error?.message || 'Não foi possível criar o plano reduzido.';
        }
      } finally {
        running = false;
        panel?.removeAttribute('aria-busy');
        controls.forEach((control) => { if (control.isConnected) control.disabled = false; });
      }
    };
    document.querySelectorAll('[data-lt]').forEach((b) => {
      b.addEventListener('click', () => run(Number(b.dataset.lt)));
    });
    document.getElementById('lt-go')?.addEventListener('click', () => {
      const m = Number(document.getElementById('lt-custom')?.value) || 15;
      run(m);
    });
    document.getElementById('lt-cancel')?.addEventListener('click', () => { if (!running) closeModal(); });
  }

  function openSkipModal(blockId, partial) {
    openModal(partial ? 'Concluir parcialmente' : 'Ignorar bloco', `
      <p class="muted">Motivo (opcional) — ajuda a ajustar o plano:</p>
      <div class="routine-reasons">
        ${SKIP_REASONS.map((r) => `<button type="button" class="btn" data-reason="${r}">${r.replace(/_/g, ' ')}</button>`).join('')}
      </div>
    `, `<button type="button" class="btn btn-primary" id="sk-ok">Confirmar</button>
        <button type="button" class="btn" id="sk-cancel">Cancelar</button>`);
    let reason = null;
    document.querySelectorAll('[data-reason]').forEach((b) => {
      b.addEventListener('click', () => {
        reason = b.dataset.reason;
        document.querySelectorAll('[data-reason]').forEach((x) => x.classList.toggle('is-selected', x === b));
      });
    });
    document.getElementById('sk-ok')?.addEventListener('click', async () => {
      closeModal();
      if (partial) await routineService.completeBlock(blockId, { partial: true, skipReason: reason, actualMinutes: 0 });
      else await routineService.skipBlock(blockId, reason);
      toast(partial ? 'Registrado como parcial.' : 'Bloco ignorado — sem punição.');
      paint();
    });
    document.getElementById('sk-cancel')?.addEventListener('click', closeModal);
  }

  function openRescheduleModal(blockId) {
    openModal('Reagendar bloco', `
      <p class="muted mb-8">Nada é movido em silêncio — escolha e confirme.</p>
      <div class="routine-quick-row routine-quick-row--stacked">
        <button type="button" class="btn" data-rs="today">Hoje</button>
        <button type="button" class="btn" data-rs="tomorrow">Amanhã</button>
        <button type="button" class="btn btn-primary" data-rs="find_week">Encontrar espaço nesta semana</button>
        <button type="button" class="btn" data-rs="next_week">Próxima semana</button>
        <button type="button" class="btn" data-rs="pending">Manter pendente</button>
        <button type="button" class="btn btn-ghost" data-rs="cancel">Cancelar bloco</button>
      </div>
      <div id="rs-preview" class="mt-12 muted"></div>
    `, `<button type="button" class="btn btn-primary" id="rs-confirm" disabled>Confirmar sugestão</button>
        <button type="button" class="btn" id="rs-close">Fechar</button>`);
    pendingReschedule = null;
    document.querySelectorAll('[data-rs]').forEach((b) => {
      b.addEventListener('click', async () => {
        const opt = b.dataset.rs;
        const res = await routineService.rescheduleBlock(blockId, opt);
        const preview = document.getElementById('rs-preview');
        if (res.keepPending) {
          preview.textContent = res.reason;
          pendingReschedule = null;
          document.getElementById('rs-confirm').disabled = true;
          return;
        }
        if (res.cancel) {
          await routineService.skipBlock(blockId, 'mudanca_prioridade');
          closeModal();
          toast('Bloco cancelado conscientemente.');
          paint();
          return;
        }
        if (!res.ok && !res.suggestion) {
          preview.textContent = res.reason || 'Sem espaço.';
          pendingReschedule = null;
          document.getElementById('rs-confirm').disabled = true;
          return;
        }
        pendingReschedule = { blockId, suggestion: res.suggestion };
        preview.innerHTML = `<strong>Sugestão:</strong> ${escapeHtml(res.suggestion.date)} ${escapeHtml(res.suggestion.startTime || '')}–${escapeHtml(res.suggestion.endTime || '')}<br/><span class="muted">${escapeHtml(res.reason || '')}</span>`;
        document.getElementById('rs-confirm').disabled = false;
      });
    });
    document.getElementById('rs-confirm')?.addEventListener('click', async () => {
      if (!pendingReschedule) return;
      await routineService.confirmReschedule(pendingReschedule.blockId, pendingReschedule.suggestion);
      closeModal();
      toast('Reagendado. Histórico do bloco original preservado.');
      paint();
    });
    document.getElementById('rs-close')?.addEventListener('click', closeModal);
  }

  /* ───────── Semana ───────── */
  async function paintSemana() {
    const view = await routineService.getWeekView(weekCursor);
    profile = view.profile;
    weekCursor = view.weekStart || weekCursor;
    const sum = view.summary || {};
    const maxDaily = view.maxDaily || 90;
    const rangeLabel = `${view.week[0].slice(8)}/${view.week[0].slice(5, 7)} – ${view.week[6].slice(8)}/${view.week[6].slice(5, 7)}`;
    const weekBlocks = view.blocks || [];
    const weekUi = buildWeekPresentation(view);
    const weekEmpty = buildPlanEmptyState('week');
    const hasGeneratedPlan = weekBlocks.some((block) => (
      ['template', 'weakspot', 'review'].includes(block.source)
      && ['planned', 'in_progress', 'partially_completed', 'completed'].includes(block.status)
    ));
    const weekBal = familyMinutes(weekBlocks);

    root.innerHTML = `
      ${tabsHtml('semana')}
      ${planBanner({
        title: weekUi.title,
        subtitle: weekUi.subtitle,
        stats: [
          { value: weekUi.planned, label: 'planejados' },
          { value: weekUi.actual, label: 'realizados' },
          { value: weekUi.adherence, label: 'aderência' },
        ],
      })}
      ${legendHtml()}
      <section class="plan-week" aria-label="Grade semanal">
        <div class="plan-week__nav" role="navigation" aria-label="Navegação semanal">
          <button type="button" class="btn" id="wk-prev" aria-label="Semana anterior">←</button>
          <div class="plan-nav-label">
            <strong>${escapeHtml(rangeLabel)}</strong>
            <small>Estudo ${weekBal.estudo}m · Trabalho ${weekBal.trabalho}m · Descanso ${weekBal.descanso}m</small>
          </div>
          <button type="button" class="btn" id="wk-next" aria-label="Próxima semana">→</button>
          <button type="button" class="btn btn-ghost" id="wk-today">Hoje</button>
        </div>
        <div class="plan-week-grid" role="list">
          ${(view.days || view.week.map((date) => ({ date, blocks: [], plannedMinutes: 0 }))).map((day, i) => {
            const date = day.date;
            const dayBlocks = (day.blocks && day.blocks.length)
              ? day.blocks.filter((b) => b.status !== 'rescheduled' && b.status !== 'cancelled')
              : weekBlocks.filter((b) => b.date === date && b.status !== 'rescheduled' && b.status !== 'cancelled');
            const load = day.plannedMinutes ?? dayBlocks.reduce((s, b) => s + (b.plannedMinutes || 0), 0);
            const loadPct = Math.min(100, Math.round((load / maxDaily) * 100));
            const level = dayLoadLevel(load, maxDaily);
            const isRest = day.restDay || (profile.restDays || []).includes(new Date(`${date}T12:00:00`).getDay());
            const dow = new Date(`${date}T12:00:00`).getDay();
            return `
              <div class="plan-day-col load-${level} ${date === todayStr() ? 'is-today' : ''} ${isRest ? 'is-rest' : ''}" role="listitem" data-date="${date}">
                <header>
                  <strong>${DAY_NAMES[i] || LIFE_DAY_LABELS[dow]}</strong>
                  <small>${date.slice(8)}/${date.slice(5, 7)} · ${load} min</small>
                </header>
                <div class="plan-day-col__load" role="progressbar" aria-label="Carga planejada" aria-valuenow="${loadPct}" aria-valuemin="0" aria-valuemax="100"><span style="--plan-progress:${loadPct}%"></span></div>
                <div class="plan-day-col__blocks">
                  ${dayBlocks.map((b) => {
                    const fam = activityFamily(b.activityType);
                    return `
                      <button type="button" class="plan-chip fam-${fam} status-${b.status}" data-open-block="${b.id}" title="${escapeHtml(b.title)}">
                        <strong>${escapeHtml(b.title)}</strong>
                        <small>${activityLabel(b.activityType)} · ${b.plannedMinutes}m${b.startTime ? ` · ${b.startTime}` : ''}</small>
                      </button>`;
                  }).join('') || `<span class="plan-day-col__empty">${escapeHtml(isRest ? 'Descanso' : 'Dia livre')}</span>`}
                </div>
                <button type="button" class="plan-day-col__add" data-add-date="${date}">+ horário</button>
              </div>`;
          }).join('')}
        </div>
        ${view.alerts?.length ? `
          <div class="routine-alerts mt-12 plan-suggest" role="status">
            <strong>Sugestões inteligentes</strong>
            <ul class="plan-suggest__list">${view.alerts.map((a) => `<li>${escapeHtml(a.message)}</li>`).join('')}</ul>
          </div>` : ''}
        ${weekBlocks.length ? '' : `<div class="plan-state plan-state--compact"><span class="plan-state__symbol" aria-hidden="true">${icon('calendar')}</span><div><h3>${escapeHtml(weekEmpty.title)}</h3><p>${escapeHtml(weekEmpty.description)}</p></div></div>`}
        <div class="plan-week__actions">
          <button type="button" class="btn btn-primary" id="wk-add">+ Bloco inteligente</button>
          <button type="button" class="btn" id="wk-regen"${hasGeneratedPlan ? ' disabled aria-disabled="true" title="O plano desta semana já foi gerado"' : ''}>${hasGeneratedPlan ? 'Plano desta semana já gerado' : 'Gerar plano de estudo'}</button>
          <button type="button" class="btn btn-ghost" id="wk-vida">Ajustar vida (trabalho/descanso)</button>
          <button type="button" class="btn btn-ghost" id="wk-pause">${profile.paused ? 'Retomar' : 'Pausar'}</button>
        </div>
      </section>
    `;

    $('#wk-prev', root)?.addEventListener('click', () => { SFX.click(); weekCursor = shiftWeek(weekCursor, -1); paint(); });
    $('#wk-next', root)?.addEventListener('click', () => { SFX.click(); weekCursor = shiftWeek(weekCursor, 1); paint(); });
    $('#wk-today', root)?.addEventListener('click', () => { SFX.click(); weekCursor = dateKey(); paint(); });
    $('#wk-regen', root)?.addEventListener('click', async () => {
      if (planGenerationInFlight || hasGeneratedPlan) return;
      planGenerationInFlight = true;
      const button = root.querySelector('#wk-regen');
      if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Gerando plano…';
      }
      SFX.click();
      try {
        const result = await routineService.regenerateCurrentWeek();
        const message = result.created
          ? 'Plano de estudo gerado.'
          : result.reason === 'no_available_content'
            ? 'Ainda não há questões ou revisões elegíveis para montar o plano.'
            : result.reason === 'configuration_required'
              ? 'Configure sua disponibilidade antes de gerar o plano.'
              : 'O plano desta semana já está pronto.';
        toast(message);
        await paint();
      } catch (error) {
        toast(error?.message || 'Não foi possível gerar o plano.');
        if (button) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = 'Gerar plano de estudo';
        }
      } finally {
        planGenerationInFlight = false;
      }
    });
    $('#wk-pause', root)?.addEventListener('click', async () => {
      profile = await routineService.saveProfile({ paused: !profile.paused });
      toast(profile.paused ? 'Plano pausado.' : 'Plano retomado.');
      paint();
    });
    $('#wk-vida', root)?.addEventListener('click', () => { SFX.click(); tab = 'vida'; paint(); });
    $('#wk-add', root)?.addEventListener('click', () => openSmartBlockModal({ date: todayStr() }));
    root.querySelectorAll('[data-add-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        openSmartBlockModal({ date: btn.getAttribute('data-add-date') });
      });
    });
    root.querySelectorAll('[data-open-block]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        SFX.click();
        const id = btn.getAttribute('data-open-block');
        const block = weekBlocks.find((b) => b.id === id);
        if (!block) return;
        if (['trabalho', 'descanso', 'lazer', 'compromisso'].includes(block.activityType)) {
          toast(`${activityLabel(block.activityType)} · ${block.startTime || '—'} (${block.plannedMinutes} min)`);
          return;
        }
        await startBlockFlow(block, navigate);
      });
    });
  }

  /* ───────── Mês ───────── */
  async function paintMes() {
    const view = await routineService.getMonthView(monthCursor.year, monthCursor.monthIndex);
    profile = view.profile;
    monthCursor = { year: view.year, monthIndex: view.monthIndex };
    const monthUi = buildMonthPresentation(view);

    root.innerHTML = `
      ${tabsHtml('mes')}
      ${planBanner({
        title: monthUi.title,
        subtitle: monthUi.subtitle,
        stats: [
          { value: monthUi.month, label: monthUi.year },
        ],
      })}
      ${legendHtml()}
      <section class="plan-month" aria-label="Calendário mensal">
        <div class="plan-week__nav" role="navigation" aria-label="Navegação mensal">
          <button type="button" class="btn" id="mo-prev" aria-label="Mês anterior">←</button>
          <div class="plan-nav-label">
            <strong>${escapeHtml(view.monthName)} ${view.year}</strong>
            <small>Prova e carga diária em destaque</small>
          </div>
          <button type="button" class="btn" id="mo-next" aria-label="Próximo mês">→</button>
          <button type="button" class="btn btn-ghost" id="mo-today">Este mês</button>
        </div>
        <div class="plan-month-head" aria-hidden="true">
          ${WEEKDAY_SHORT.map((d) => `<span>${d}</span>`).join('')}
        </div>
        <div class="plan-month-grid" role="grid" aria-label="${escapeHtml(view.monthName)} ${view.year}">
          ${view.cells.map((c) => {
            const list = (c.blocks || []).filter((b) => !['cancelled', 'rescheduled'].includes(b.status));
            const bal = familyMinutes(list);
            return `
              <button type="button"
                class="plan-month-cell load-${c.load || 'empty'} ${c.inMonth ? '' : 'is-out'} ${c.isToday ? 'is-today' : ''} ${c.isExam ? 'is-exam' : ''}"
                data-day="${c.date}"
                role="gridcell"
                aria-label="${c.date}${c.isExam ? ', dia da prova' : ''}"
                ${c.inMonth ? '' : 'tabindex="-1"'}>
                <span class="plan-month-cell__day">${c.day}</span>
                <span class="plan-month-cell__bars" aria-hidden="true">
                  <i class="${bal.estudo ? 'on-estudo' : ''}"></i>
                  <i class="${bal.trabalho ? 'on-trabalho' : ''}"></i>
                  <i class="${bal.descanso ? 'on-descanso' : ''}"></i>
                </span>
                ${c.plannedMinutes ? `<span class="plan-month-cell__min">${c.plannedMinutes}m</span>` : ''}
              </button>`;
          }).join('')}
        </div>
        <div id="mo-detail" class="plan-day-detail" hidden></div>
      </section>
    `;

    $('#mo-prev', root)?.addEventListener('click', () => { SFX.click(); monthCursor = view.prev; paint(); });
    $('#mo-next', root)?.addEventListener('click', () => { SFX.click(); monthCursor = view.next; paint(); });
    $('#mo-today', root)?.addEventListener('click', () => {
      SFX.click();
      const n = new Date();
      monthCursor = { year: n.getFullYear(), monthIndex: n.getMonth() };
      paint();
    });
    root.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        const date = btn.dataset.day;
        const cell = view.cells.find((c) => c.date === date);
        const panel = $('#mo-detail', root);
        if (!panel || !cell) return;
        panel.hidden = false;
        const list = (cell.blocks || []).filter((b) => b.status !== 'cancelled');
        const bal = familyMinutes(list);
        panel.innerHTML = `
          <strong>${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}</strong>
          ${cell.isExam ? ' · <em>Dia da prova</em>' : ''}
          <p class="muted">Estudo ${bal.estudo}m · Trabalho ${bal.trabalho}m · Descanso ${bal.descanso}m</p>
          <ul class="routine-day-detail__list">
            ${list.map((b) => `<li><span class="plan-chip plan-chip--detail fam-${activityFamily(b.activityType)}">${escapeHtml(b.title)} · ${b.plannedMinutes}m${b.startTime ? ` · ${b.startTime}` : ''}</span></li>`).join('') || '<li class="muted">Sem blocos neste dia.</li>'}
          </ul>
          <div class="routine-quick-row mt-8">
            <button type="button" class="btn btn-primary" id="mo-add">+ Horário neste dia</button>
            <button type="button" class="btn" id="mo-goto-week">Abrir na semana</button>
          </div>
        `;
        $('#mo-add', root)?.addEventListener('click', () => openSmartBlockModal({ date }));
        $('#mo-goto-week', root)?.addEventListener('click', () => {
          weekCursor = date;
          tab = 'semana';
          paint();
        });
      });
    });
  }

  /* ───────── Vida (trabalho / descanso) ───────── */
  async function paintVida() {
    profile = await routineService.ensureProfile();
    const rest = new Set(profile.restDays || [0, 6]);
    const available = new Set(profile.availableDays || [1, 2, 3, 4, 5]);
    const win = profile.dayWindows || {};
    const sampleDow = [...available][0] ?? 1;
    const sample = win[sampleDow] || { start: '19:00', end: '21:00' };
    const today = dateKey();
    const todayDow = new Date(`${today}T12:00:00`).getDay();
    const canonicalAvailability = validateStudyAvailability(profile, { weekDates: weekDatesFrom(today) });
    const availabilityUi = buildAvailabilityPresentation(profile, {
      todayCapacityMinutes: dailyCapacityForDate(profile, today),
      weeklyCapacityMinutes: canonicalAvailability.weeklyCapacity,
      todayIsRestDay: rest.has(todayDow),
    });
    const work = (profile.fixedCommitments || []).find((c) => c.kind === 'trabalho') || {
      kind: 'trabalho', start: '08:00', end: '17:00',
    };

    root.innerHTML = `
      ${tabsHtml('vida')}
      ${planBanner({
        title: availabilityUi.title,
        subtitle: availabilityUi.subtitle,
        stats: [
          { value: `${availabilityUi.availableDays}`, label: 'dias disponíveis' },
          { value: availabilityUi.weeklyCapacity, label: 'por semana' },
          { value: availabilityUi.preferredSession, label: 'por sessão' },
        ],
      })}
      <div class="plan-life">
        <section class="plan-life-card">
          <span class="plan-card__eyebrow">01 · Dias disponíveis</span>
          <h2>Escolha seus dias de estudo</h2>
          <p>Alterne entre estudo e descanso. O estado é sempre indicado por texto, não apenas pela cor.</p>
          <div class="plan-life-days" role="group" aria-label="Dias de estudo e descanso">
            ${LIFE_DAY_LABELS.map((label, dow) => {
              const isRest = rest.has(dow);
              return `<button type="button" class="plan-life-day ${isRest ? 'is-rest' : 'is-study'}" data-life-dow="${dow}">${label}<br/><small>${isRest ? 'Descanso' : 'Estudo'}</small></button>`;
            }).join('')}
          </div>
        </section>
        <section class="plan-life-card">
          <span class="plan-card__eyebrow">02 · Janelas de tempo</span>
          <h2>Trabalho, compromissos e estudo</h2>
          <p>Esses limites são usados ao gerar o plano e sugerir blocos possíveis.</p>
          <div class="plan-life-fields">
            <label>Trabalho — início
              <input type="time" id="life-work-start" value="${escapeHtml(work.start || '08:00')}" />
            </label>
            <label>Trabalho — fim
              <input type="time" id="life-work-end" value="${escapeHtml(work.end || '17:00')}" />
            </label>
            <label>Estudo — início preferido
              <input type="time" id="life-study-start" value="${escapeHtml(sample.start || '19:00')}" />
            </label>
            <label>Estudo — fim preferido
              <input type="time" id="life-study-end" value="${escapeHtml(sample.end || '21:00')}" />
            </label>
            <label>Sessão preferida (min)
              <input type="number" id="life-session" min="10" max="120" value="${profile.preferredSessionMinutes || 25}" />
            </label>
            <label>Meta semanal (horas de estudo)
              <input type="number" id="life-week-h" min="1" max="40" value="${profile.weeklyHoursGoal || 6}" />
            </label>
          </div>
          <div class="plan-capacity" aria-label="Capacidade configurada">
            <div><small>${escapeHtml(availabilityUi.dailyCapacityLabel)}</small><strong>${escapeHtml(availabilityUi.dailyCapacity)}</strong></div>
            <div><small>Capacidade da semana</small><strong>${escapeHtml(availabilityUi.weeklyCapacity)}</strong></div>
            <div><small>Sessão preferida</small><strong>${escapeHtml(availabilityUi.preferredSession)}</strong></div>
            <div><small>Máximo de blocos</small><strong>${availabilityUi.maxBlocks || '—'}</strong></div>
          </div>
          <div class="plan-week__actions plan-life__actions">
            <button type="button" class="btn btn-primary" id="life-save">Salvar e aplicar na semana</button>
            <button type="button" class="btn" id="life-blocks">Gerar blocos de trabalho/descanso</button>
          </div>
          <p class="plan-suggest" id="life-hint">Se o trabalho ocupa o dia, o estudo permanece na janela disponível e o gerador evita sobrecarga.</p>
        </section>
      </div>
    `;

    root.querySelectorAll('[data-life-dow]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        const dow = Number(btn.dataset.lifeDow);
        if (rest.has(dow)) {
          rest.delete(dow);
          available.add(dow);
          btn.classList.remove('is-rest');
          btn.classList.add('is-study');
          btn.innerHTML = `${LIFE_DAY_LABELS[dow]}<br/><small>Estudo</small>`;
        } else {
          rest.add(dow);
          available.delete(dow);
          btn.classList.add('is-rest');
          btn.classList.remove('is-study');
          btn.innerHTML = `${LIFE_DAY_LABELS[dow]}<br/><small>Descanso</small>`;
        }
      });
    });

    $('#life-save', root)?.addEventListener('click', async () => {
      SFX.click();
      const studyStart = $('#life-study-start', root)?.value || '19:00';
      const studyEnd = $('#life-study-end', root)?.value || '21:00';
      const workStart = $('#life-work-start', root)?.value || '08:00';
      const workEnd = $('#life-work-end', root)?.value || '17:00';
      const dayWindows = {};
      for (const d of available) {
        dayWindows[d] = { start: studyStart, end: studyEnd };
      }
      profile = await routineService.saveProfile({
        restDays: [...rest].sort(),
        availableDays: [...available].sort(),
        dayWindows,
        preferredSessionMinutes: Number($('#life-session', root)?.value) || 25,
        weeklyHoursGoal: Number($('#life-week-h', root)?.value) || 6,
        fixedCommitments: [
          {
            id: 'work_default',
            kind: 'trabalho',
            title: 'Trabalho',
            start: workStart,
            end: workEnd,
            days: [...available],
          },
        ],
      });
      toast('Vida salva no perfil do plano.');
      paint();
    });

    $('#life-blocks', root)?.addEventListener('click', async () => {
      SFX.click();
      const studyStart = $('#life-study-start', root)?.value || '19:00';
      const workStart = $('#life-work-start', root)?.value || '08:00';
      const workEnd = $('#life-work-end', root)?.value || '17:00';
      const workMins = (() => {
        const [a, b] = workStart.split(':').map(Number);
        const [c, d] = workEnd.split(':').map(Number);
        return Math.max(30, (c * 60 + d) - (a * 60 + b));
      })();
      const week = await routineService.getWeekView(dateKey());
      let created = 0;
      for (const date of week.week || []) {
        const dow = new Date(`${date}T12:00:00`).getDay();
        if (rest.has(dow)) {
          await routineService.createBlock({
            date,
            title: 'Descanso programado',
            activityType: 'descanso',
            plannedMinutes: 60,
            startTime: '12:00',
            endTime: '13:00',
            source: 'user',
            scheduleType: 'horario_fixo',
          });
          created += 1;
        } else {
          await routineService.createBlock({
            date,
            title: 'Trabalho',
            activityType: 'trabalho',
            plannedMinutes: Math.min(480, workMins),
            startTime: workStart,
            endTime: workEnd,
            source: 'user',
            scheduleType: 'horario_fixo',
          });
          created += 1;
        }
      }
      toast(`${created} blocos de vida criados nesta semana.`);
      tab = 'semana';
      paint();
    });
  }

  /* ───────── Modal: bloco inteligente ───────── */
  async function openSmartBlockModal({ date = todayStr() } = {}) {
    let family = 'estudo';
    let academicOptions = { disciplines: [], subtopics: [] };
    try {
      academicOptions = await routineService.getAcademicOptions();
    } catch (error) {
      toast(error?.message || 'Não foi possível carregar o currículo deste concurso.');
    }
    const win = profile?.dayWindows?.[new Date(`${date}T12:00:00`).getDay()] || { start: '19:00', end: '21:00' };
    openModal('Novo horário no plano', `
      <div class="plan-modal">
        <p class="plan-modal__intro">Defina uma atividade possível. A duração sugerida usa somente as preferências já salvas no seu perfil.</p>
        <fieldset class="plan-type-fieldset"><legend>Tipo de bloco</legend>
          <div class="plan-type-row">
            <button type="button" class="plan-type-btn fam-estudo is-selected" data-fam="estudo">${semanticIcon('study', 'ico--inline')} Estudo<small>Edital e questões</small></button>
            <button type="button" class="plan-type-btn fam-trabalho" data-fam="trabalho">${icon('briefcase', 'ico--inline')} Trabalho<small>Expediente e compromissos</small></button>
            <button type="button" class="plan-type-btn fam-descanso" data-fam="descanso">${icon('moon', 'ico--inline')} Descanso<small>Pausa e recuperação</small></button>
          </div>
        </fieldset>
        <div class="field"><label for="sb-title">Título</label><input id="sb-title" type="text" maxlength="80" value="Bloco de estudo" /></div>
        <div class="field" id="sb-study-wrap">
          <label for="sb-study-type">Tipo de estudo</label>
          <select id="sb-study-type">
            <option value="questoes">Questões</option>
            <option value="revisao">Revisão</option>
            <option value="teoria">Teoria</option>
            <option value="lei_seca">Lei seca</option>
            <option value="simulado">Simulado</option>
            <option value="estudo">Estudo geral</option>
            <option value="estudo_livre">Foco livre (sem vínculo curricular)</option>
          </select>
        </div>
        <div class="field" id="sb-subject-wrap">
          <label for="sb-subject">Disciplina</label>
          <select id="sb-subject" aria-describedby="sb-errors">
            <option value="">Selecione uma disciplina</option>
            ${academicOptions.disciplines.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="sb-subtopic-wrap">
          <label for="sb-subtopic">Subtópico</label>
          <select id="sb-subtopic" aria-describedby="sb-errors" disabled>
            <option value="">Selecione primeiro a disciplina</option>
          </select>
        </div>
        <div class="plan-modal__schedule">
          <div class="field"><label for="sb-date">Dia</label><input id="sb-date" type="date" value="${escapeHtml(date)}" /></div>
          <div class="field"><label for="sb-start">Início</label><input id="sb-start" type="time" value="${escapeHtml(win.start || '19:00')}" /></div>
          <div class="field"><label for="sb-mins">Duração (minutos)</label><input id="sb-mins" type="number" min="5" max="480" value="${profile?.preferredSessionMinutes || 25}" /></div>
        </div>
        <div class="field">
          <label><input type="checkbox" id="sb-week" /> Repetir nos dias de estudo desta semana</label>
        </div>
        <div class="plan-suggest" id="sb-hint">Sugestão: sessões de ${profile?.preferredSessionMinutes || 25} min cabem melhor na janela de estudo.</div>
        <p id="sb-errors" class="muted" role="alert" aria-live="assertive"></p>
      </div>
    `, `<button type="button" class="btn btn-primary" id="sb-save">Salvar no plano</button>
        <button type="button" class="btn" id="sb-cancel">Cancelar</button>`);

    const titles = { estudo: 'Bloco de estudo', trabalho: 'Trabalho', descanso: 'Descanso' };
    const curricularTypes = new Set(['questoes', 'teoria', 'lei_seca', 'estudo', 'simulado', 'correcao_simulado']);
    const questionTypes = new Set(['questoes', 'simulado', 'correcao_simulado']);
    const studyType = document.getElementById('sb-study-type');
    const subject = document.getElementById('sb-subject');
    const subtopic = document.getElementById('sb-subtopic');
    const updateCurriculumFields = () => {
      const type = studyType?.value || 'questoes';
      const needsCurriculum = family === 'estudo' && curricularTypes.has(type);
      const subjectWrap = document.getElementById('sb-subject-wrap');
      const subtopicWrap = document.getElementById('sb-subtopic-wrap');
      if (subjectWrap) subjectWrap.hidden = !needsCurriculum;
      if (subtopicWrap) subtopicWrap.hidden = !needsCurriculum;
      if (!needsCurriculum || !subtopic) return;
      const options = academicOptions.subtopics.filter((item) => (
        String(item.subjectId) === String(subject?.value || '')
        && (!questionTypes.has(type) || item.hasQuestionBank)
      ));
      subtopic.innerHTML = `<option value="">${subject?.value ? 'Selecione um subtópico' : 'Selecione primeiro a disciplina'}</option>`
        + options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
      subtopic.disabled = !subject?.value || options.length === 0;
    };
    subject?.addEventListener('change', updateCurriculumFields);
    studyType?.addEventListener('change', updateCurriculumFields);
    document.querySelectorAll('[data-fam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        family = btn.dataset.fam;
        document.querySelectorAll('[data-fam]').forEach((b) => b.classList.toggle('is-selected', b.dataset.fam === family));
        const title = document.getElementById('sb-title');
        if (title) title.value = titles[family] || 'Bloco';
        const wrap = document.getElementById('sb-study-wrap');
        if (wrap) wrap.hidden = family !== 'estudo';
        updateCurriculumFields();
        const mins = document.getElementById('sb-mins');
        if (mins) {
          if (family === 'trabalho') mins.value = '240';
          else if (family === 'descanso') mins.value = '60';
          else mins.value = String(profile?.preferredSessionMinutes || 25);
        }
        const hint = document.getElementById('sb-hint');
        if (hint) {
          hint.textContent = family === 'estudo'
            ? `Sugestão: ${profile?.preferredSessionMinutes || 25} min de foco no edital.`
            : family === 'trabalho'
              ? 'Marque o expediente para o plano não empilhar estudo em cima do trabalho.'
              : 'Descanso protege a sequência — o app evita sobrecarga nesses horários.';
        }
      });
    });
    updateCurriculumFields();

    document.getElementById('sb-cancel')?.addEventListener('click', closeModal);
    document.getElementById('sb-save')?.addEventListener('click', async () => {
      const saveButton = document.getElementById('sb-save');
      const errorBox = document.getElementById('sb-errors');
      if (saveButton?.getAttribute('aria-busy') === 'true') return;
      const d = document.getElementById('sb-date')?.value || date;
      const start = document.getElementById('sb-start')?.value || null;
      const mins = Number(document.getElementById('sb-mins')?.value) || 25;
      const title = document.getElementById('sb-title')?.value || titles[family];
      let activityType = 'questoes';
      if (family === 'trabalho') activityType = 'trabalho';
      else if (family === 'descanso') activityType = 'descanso';
      else activityType = document.getElementById('sb-study-type')?.value || 'questoes';
      const needsCurriculum = curricularTypes.has(activityType);
      const subjectId = needsCurriculum ? document.getElementById('sb-subject')?.value || null : null;
      const subtopicId = needsCurriculum ? document.getElementById('sb-subtopic')?.value || null : null;
      document.getElementById('sb-subject')?.removeAttribute('aria-invalid');
      document.getElementById('sb-subtopic')?.removeAttribute('aria-invalid');
      if (needsCurriculum && (!subjectId || !subtopicId)) {
        if (!subjectId) document.getElementById('sb-subject')?.setAttribute('aria-invalid', 'true');
        if (!subtopicId) document.getElementById('sb-subtopic')?.setAttribute('aria-invalid', 'true');
        if (errorBox) errorBox.textContent = 'Selecione uma disciplina e um subtópico elegível.';
        document.getElementById(!subjectId ? 'sb-subject' : 'sb-subtopic')?.focus();
        return;
      }
      const payload = {
        date: d,
        title,
        activityType,
        subjectId,
        subtopicId,
        plannedMinutes: mins,
        startTime: start,
        endTime: endTimeFrom(start, mins),
        source: 'user',
        scheduleType: start ? 'horario_fixo' : 'janela_flexivel',
      };
      saveButton?.setAttribute('aria-busy', 'true');
      if (saveButton) saveButton.disabled = true;
      try {
        const repeat = document.getElementById('sb-week')?.checked;
        if (repeat) {
          const week = await routineService.getWeekView(d);
          const rest = new Set(profile.restDays || []);
          let n = 0;
          for (const day of week.week || []) {
            const dow = new Date(`${day}T12:00:00`).getDay();
            if (rest.has(dow) && family === 'estudo') continue;
            await routineService.createBlock({ ...payload, date: day });
            n += 1;
          }
          toast(`${n} blocos criados na semana.`);
        } else {
          await routineService.createBlock(payload);
          toast('Horário adicionado ao plano.');
        }
        closeModal();
        await paint();
      } catch (error) {
        if (errorBox) errorBox.textContent = error?.message || 'Não foi possível salvar este bloco.';
      } finally {
        saveButton?.removeAttribute('aria-busy');
        if (saveButton?.isConnected) saveButton.disabled = false;
      }
    });
  }

  /* ───────── Jornada até a prova ───────── */
  async function paintJornada() {
    const snap = await routineService.getExamJourney();
    profile = snap.profile;
    const j = snap.journey;
    const chibi = snap.chibi;
    const reduceMotion = prefersReducedMotion?.() || false;
    const pos = j.hasExam ? Math.min(100, Math.max(0, j.positionPct)) : 0;
    const journeyUi = buildExamJourneyPresentation(snap);
    const examEmpty = buildPlanEmptyState('exam');

    root.innerHTML = `
      ${tabsHtml('jornada')}
      ${planBanner({
        title: journeyUi.title,
        subtitle: journeyUi.subtitle,
        stats: journeyUi.hasExam ? [
          { value: `${journeyUi.daysLeft}`, label: 'dias restantes' },
          { value: `${journeyUi.weeksLeft}`, label: 'semanas restantes' },
          { value: `${journeyUi.remaining}%`, label: 'tempo restante' },
        ] : [],
      })}
      <section class="plan-card routine-journey mb-8" aria-labelledby="journey-panel-title">
        <div class="plan-section-heading"><div><span class="plan-card__eyebrow">Linha temporal</span><h2 id="journey-panel-title">Preparação até a prova</h2></div></div>
        <div class="routine-journey__body">
          ${j.hasExam ? `
            <div class="routine-countdown-panel" role="status">
              <div>
                <small class="muted">Contagem regressiva</small>
                <p class="routine-countdown-panel__big"><strong>${j.daysLeft}</strong> dias</p>
                <p class="muted">${j.weeksLeft} semana(s) · prova em ${escapeHtml(j.examDate)}${snap.examTime ? ` · ${escapeHtml(snap.examTime)}` : ''}</p>
              </div>
              <div class="routine-countdown-panel__bars">
                <label>Tempo já percorrido <strong>${j.elapsedPct}%</strong>
                  <div class="routine-bar" style="--p:${j.elapsedPct}" role="progressbar" aria-valuenow="${j.elapsedPct}" aria-valuemin="0" aria-valuemax="100"></div>
                </label>
                <label>Tempo restante <strong>${j.remainingPct}%</strong>
                  <div class="routine-bar routine-bar--rest" style="--p:${j.remainingPct}" role="progressbar" aria-valuenow="${j.remainingPct}" aria-valuemin="0" aria-valuemax="100"></div>
                </label>
                ${j.phase === 'reta_final' || j.phase === 'semana_prova' ? `<p class="routine-final-strip">${icon('flag', 'ico--sm')} Reta final — foque no essencial.</p>` : ''}
              </div>
            </div>

            <div class="routine-trail ${reduceMotion ? 'is-static' : ''}" aria-label="Trilha temporal até a prova">
              <div class="routine-trail__track">
                <div class="routine-trail__progress" style="width:${pos}%"></div>
                <div class="routine-trail__chibi pose-${escapeHtml(chibi.pose)}" style="left:${pos}%" aria-hidden="true">
                  <span class="chibi-face">${icon('user', 'ico--sm')}</span>
                </div>
                <div class="routine-trail__flag" aria-hidden="true">${icon('flag', 'ico--sm')}</div>
              </div>
              <p class="routine-chibi-msg" role="status">${escapeHtml(chibi.message)}</p>
              <p class="muted text-center">Indicador visual da distância percorrida até a prova.</p>
            </div>

            <div class="routine-milestones" role="list" aria-label="Marcos da preparação">
              ${(j.milestones || []).map((m) => `
                <div class="routine-milestone ${m.passed ? 'is-passed' : ''} ${m.isToday ? 'is-today' : ''}" role="listitem">
                  <span class="routine-milestone__dot"></span>
                  <strong>${escapeHtml(m.label)}</strong>
                  <small>${escapeHtml(m.date)} · ${m.pct}%</small>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="routine-journey-empty">
              <span class="plan-state__symbol" aria-hidden="true">${icon('flag')}</span>
              <div><h3>${escapeHtml(examEmpty.title)}</h3><p>${escapeHtml(examEmpty.description)}</p><p class="muted">Sem data fechada, a rotina continua disponível com meta semanal.</p></div>
            </div>
          `}

          <form id="exam-meta-form" class="routine-exam-form mt-12">
            <h3 class="h4">Dados da prova</h3>
            <div class="field">
              <label for="ex-date">Data da prova</label>
              <input type="date" id="ex-date" value="${escapeHtml(snap.examDate || '')}" />
            </div>
            <div class="field">
              <label for="ex-time">Horário (opcional)</label>
              <input type="time" id="ex-time" value="${escapeHtml(snap.examTime || '')}" />
            </div>
            <div class="field">
              <label for="ex-loc">Local (opcional)</label>
              <input type="text" id="ex-loc" maxlength="120" value="${escapeHtml(snap.examLocation || '')}" placeholder="Cidade / local" />
            </div>
            <div class="field">
              <label for="ex-start">Início da preparação</label>
              <input type="date" id="ex-start" value="${escapeHtml(profile.journeyStartDate || '')}" />
            </div>
            <div class="field">
              <label for="ex-notes">Observações</label>
              <textarea id="ex-notes" rows="2" maxlength="300">${escapeHtml(snap.examNotes || '')}</textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Salvar jornada</button>
          </form>
        </div>
      </section>
    `;

    $('#exam-meta-form', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      SFX.click();
      profile = await routineService.setExamMeta({
        examDate: $('#ex-date', root)?.value || null,
        examTime: $('#ex-time', root)?.value || null,
        examLocation: $('#ex-loc', root)?.value || null,
        examNotes: $('#ex-notes', root)?.value || null,
        journeyStartDate: $('#ex-start', root)?.value || null,
      });
      toast('Plano até a prova atualizado.');
      paint();
    });
  }

  /* ───────── Foco ───────── */
  async function paintFoco() {
    const blocks = (await routineService.getBlocksForDate()).filter((b) =>
      ['planned', 'in_progress', 'partially_completed'].includes(b.status));
    const focusUi = buildFocusPresentation({ blocks, profile });
    root.innerHTML = `
      ${tabsHtml('foco')}
      <section class="routine-focus plan-focus mb-8" data-focus-state="ready" aria-labelledby="focus-title">
        <header class="plan-focus__header"><span class="plan-card__eyebrow">Sessão estratégica</span><h2 id="focus-title">${escapeHtml(focusUi.title)}</h2><p>${escapeHtml(focusUi.subtitle)}</p></header>
        <div class="plan-focus__body">
          <div class="field plan-focus__activity">
            <label for="focus-block">Atividade</label>
            <select id="focus-block">
              <option value="">— livre —</option>
              ${blocks.map((b) => `<option value="${b.id}">${escapeHtml(b.title)} (${b.plannedMinutes}m)</option>`).join('')}
            </select>
          </div>
          <div class="routine-presets" role="group" aria-label="Duração">
            ${FOCUS_PRESETS.map((m) => `<button type="button" class="btn" data-preset="${m}">${m} min</button>`).join('')}
            <label class="field plan-field-inline">
              <span class="sr-only">Personalizado</span>
              <input type="number" id="focus-mins" min="1" max="180" value="${profile.focus?.sessionMinutes || 25}" aria-label="Minutos personalizados" />
            </label>
            <label class="field plan-field-inline">
              <input type="checkbox" id="focus-countup" /> Cronômetro crescente
            </label>
          </div>
          <div class="focus-timer" id="focus-display" aria-live="polite">${formatClock(focusUi.defaultMinutes * 60)}</div>
          <p class="plan-focus__status" id="focus-meta" role="status">Pronto</p>
          <div class="routine-quick-row plan-focus__controls">
            <button type="button" class="btn btn-primary" id="focus-start">Iniciar</button>
            <button type="button" class="btn" id="focus-pause" disabled>Pausar</button>
            <button type="button" class="btn" id="focus-distract" disabled>Distração</button>
            <button type="button" class="btn btn-ghost" id="focus-end" disabled>Encerrar</button>
          </div>
        </div>
      </section>
    `;

    root.querySelectorAll('[data-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        $('#focus-mins', root).value = b.dataset.preset;
      });
    });

    const display = $('#focus-display', root);
    const meta = $('#focus-meta', root);

    const tick = () => {
      if (!focusCtl) return;
      const d = focusCtl.display();
      display.textContent = d.label;
    };

    $('#focus-start', root)?.addEventListener('click', async () => {
      SFX.click();
      const blockId = $('#focus-block', root)?.value || null;
      if (blockId) await routineService.startBlock(blockId);
      const mins = Number($('#focus-mins', root)?.value) || 25;
      const countup = $('#focus-countup', root)?.checked;
      focusCtl = routineService.createFocus({
        plannedMinutes: mins,
        mode: countup ? 'countup' : 'countdown',
        blockId,
        date: todayStr(),
      });
      focusCtl.start();
      root.querySelector('.plan-focus')?.setAttribute('data-focus-state', 'running');
      meta.textContent = blockId ? 'Sessão em andamento' : 'Sessão livre em andamento';
      $('#focus-pause', root).disabled = false;
      $('#focus-distract', root).disabled = false;
      $('#focus-end', root).disabled = false;
      $('#focus-start', root).disabled = true;
      if (profile.focus?.keepScreenAwake && navigator.wakeLock?.request) {
        try { await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
      }
      focusTimer = setInterval(tick, 250);
      tick();
    });

    $('#focus-pause', root)?.addEventListener('click', () => {
      if (!focusCtl) return;
      const s = focusCtl.getSession();
      if (s.status === 'running') {
        focusCtl.pause();
        root.querySelector('.plan-focus')?.setAttribute('data-focus-state', 'paused');
        $('#focus-pause', root).textContent = 'Continuar';
      } else if (s.status === 'paused') {
        focusCtl.resume();
        root.querySelector('.plan-focus')?.setAttribute('data-focus-state', 'running');
        $('#focus-pause', root).textContent = 'Pausar';
      }
      tick();
    });

    $('#focus-distract', root)?.addEventListener('click', async () => {
      if (!focusCtl) return;
      openModal('Registrar distração', `
        <div class="routine-reasons">
          ${DISTRACTION_CATEGORIES.map((c) => `<button type="button" class="btn" data-dist="${c}">${c.replace(/_/g, ' ')}</button>`).join('')}
        </div>
      `, `<button type="button" class="btn" id="dist-close">Fechar</button>`);
      document.querySelectorAll('[data-dist]').forEach((b) => {
        b.addEventListener('click', async () => {
          const d = focusCtl.registerDistraction(b.dataset.dist);
          await routineService.addDistraction(d);
          closeModal();
          toast('Distração registrada — sem julgamento.');
        });
      });
      document.getElementById('dist-close')?.addEventListener('click', closeModal);
    });

    $('#focus-end', root)?.addEventListener('click', () => {
      if (!focusCtl) return;
      openModal('Encerrar sessão', `
        <div class="plan-session-close">
          <p>Registre sua percepção sem alterar o tempo medido pela sessão.</p>
          <div class="field"><label for="fc-focus">Foco percebido (1–5)</label><input type="number" id="fc-focus" min="1" max="5" value="3" /></div>
          <div class="field"><label for="fc-diff">Dificuldade percebida (1–5)</label><input type="number" id="fc-diff" min="1" max="5" value="3" /></div>
          <label class="field plan-check"><input type="checkbox" id="fc-done" checked /> Sessão concluída (desmarque se parcial)</label>
          <div class="field"><label for="fc-note">Observação</label><input type="text" id="fc-note" maxlength="200" /></div>
        </div>
      `, `<button type="button" class="btn btn-primary" id="fc-save">Salvar sessão</button>
          <button type="button" class="btn" id="fc-cancel">Continuar estudando</button>`);
      document.getElementById('fc-save')?.addEventListener('click', async () => {
        const done = document.getElementById('fc-done')?.checked;
        const focusScore = Number(document.getElementById('fc-focus')?.value) || null;
        const difficultyScore = Number(document.getElementById('fc-diff')?.value) || null;
        const note = document.getElementById('fc-note')?.value || '';
        const result = done
          ? focusCtl.complete({ focusScore, difficultyScore, note })
          : focusCtl.abort({ focusScore, difficultyScore, note, reason: 'encerrada' });
        await routineService.recordSessionResult(result.session, result.actualMinutes, {
          blockId: result.session.blockId,
          partial: !done,
        });
        closeModal();
        cleanup();
        if (profile.focus?.soundOnEnd !== false) SFX.levelUp?.() || SFX.forge?.();
        if (profile.focus?.vibrateOnEnd && navigator.vibrate) navigator.vibrate(80);
        toast(`Tempo real registrado: ${result.actualMinutes} min.`);
        focusCtl = null;
        tab = 'hoje';
        paint();
      });
      document.getElementById('fc-cancel')?.addEventListener('click', closeModal);
    });
  }

  /* ───────── Progresso ───────── */
  async function paintProgresso() {
    const snap = await routineService.getProgressSnapshot();
    profile = snap.profile;
    const m = snap.metrics;
    const progressUi = buildProgressPresentation(snap);
    const historyEmpty = buildPlanEmptyState('history');
    const hasHistory = Boolean(progressUi.actualHours || m.daysMet || m.distractionsTotal || snap.achievements.length);
    root.innerHTML = `
      ${tabsHtml('progresso')}
      ${planBanner({
        title: progressUi.title,
        subtitle: progressUi.subtitle,
        stats: [
          { value: `${progressUi.consistency}%`, label: 'consistência' },
          { value: `${progressUi.actualHours}h`, label: 'tempo real' },
          { value: `${progressUi.streak}d`, label: 'sequência' },
        ],
      })}
      ${hasHistory ? `
      <section class="plan-card plan-results mb-8" aria-labelledby="results-summary-title">
        <div class="plan-section-heading"><div><span class="plan-card__eyebrow">Leitura principal</span><h2 id="results-summary-title">Execução da rotina</h2></div></div>
          <div class="routine-kpis plan-results__kpis">
            <div><small>Sequência</small><strong>${progressUi.streak}d</strong></div>
            <div><small>Recorde</small><strong>${progressUi.bestStreak}d</strong></div>
            <div><small>Consistência semanal</small><strong>${progressUi.consistency}%</strong></div>
            <div><small>Planejado x real</small><strong>${progressUi.actualHours}/${progressUi.plannedHours}h</strong></div>
          </div>
          <p class="plan-field-note">Este painel acompanha a execução da rotina. O domínio acadêmico continua sendo calculado apenas pelas atividades de estudo.</p>
          ${snap.loadAdvice?.action !== 'keep' ? `<p class="routine-tip">${icon('info', 'ico--sm')} ${escapeHtml(snap.loadAdvice.reason)} (${snap.loadAdvice.action} ~${snap.loadAdvice.percent}%)</p>` : ''}
      </section>
      <div class="plan-results__grid">
      <section class="plan-card mb-8">
          <span class="plan-card__eyebrow">Indicadores secundários</span><h2>Conquistas de rotina</h2>
          ${snap.achievements.length
            ? `<ul class="routine-achievements">${snap.achievements.map((a) => `<li>${icon('award', 'ico--sm')} ${escapeHtml(a.title)}</li>`).join('')}</ul>`
            : '<p class="muted">Execute sessões reais para desbloquear conquistas.</p>'}
      </section>
      <section class="plan-card mb-8">
          <span class="plan-card__eyebrow">Precisão</span><h2>Planejamento e execução</h2>
          <p>Conclusão de blocos: <strong>${m.planning?.completionRate || 0}%</strong></p>
          <p class="muted">Reagendados: ${m.rescheduledBlocks || 0} · Ignorados: ${m.skippedBlocks || 0}</p>
          <p class="muted">Distração mais comum: ${escapeHtml(m.topDistraction || '—')} (${m.distractionsTotal || 0} reg.)</p>
      </section>
      </div>` : `<section class="plan-state"><span class="plan-state__symbol" aria-hidden="true">${icon('chart')}</span><div><h2>${escapeHtml(historyEmpty.title)}</h2><p>${escapeHtml(historyEmpty.description)}</p></div></section>`}
    `;
  }

  /* ───────── Revisão semanal ───────── */
  async function paintRevisao() {
    const snap = await routineService.getProgressSnapshot();
    const m = snap.metrics;
    root.innerHTML = `
      ${tabsHtml('revisao')}
      ${planBanner({
        title: 'Proteja o que você já aprendeu',
        subtitle: 'Confira seu ritmo, abra a fila de revisão e ajuste a próxima semana sem perder o foco da missão principal.',
        stats: [
          { value: `${m.actualHours || 0}h`, label: 'realizadas', icon: icon('focus', 'ico--sm') },
          { value: `${m.daysMet || 0}/${m.daysProgrammed || 0}`, label: 'dias cumpridos', icon: icon('checkCircle', 'ico--sm') },
          { value: `${m.weeklyConsistency || 0}%`, label: 'constância', icon: icon('flame', 'ico--sm') },
        ],
      })}
      <section class="plan-review-entry mb-8" aria-labelledby="plan-review-entry-title">
        <div class="plan-review-entry__icon" aria-hidden="true">${icon('layers')}</div>
        <div>
          <span class="plan-review-entry__eyebrow">Plano de revisão</span>
          <h2 id="plan-review-entry-title">Reforce os pontos no momento certo</h2>
          <p>A fila prioriza o conteúdo que precisa voltar à memória. O início da atividade continua sob seu controle.</p>
        </div>
        <button type="button" class="btn btn-primary" id="plan-open-review">
          Ver fila de revisão ${icon('chevronRight', 'ico--sm')}
        </button>
      </section>
      <section class="ro-window mb-8">
        <div class="ro-title">Revisão semanal (~2 min)</div>
        <div class="ro-body">
          <div class="routine-kpis mb-8">
            <div><small>Planejado</small><strong>${m.plannedHours}h</strong></div>
            <div><small>Realizado</small><strong>${m.actualHours}h</strong></div>
            <div><small>Dias ok</small><strong>${m.daysMet}/${m.daysProgrammed}</strong></div>
            <div><small>Foco médio</small><strong>${m.avgFocus ?? '—'}</strong></div>
          </div>
          <div class="field"><label for="rw-worked">O que funcionou?</label><textarea id="rw-worked" rows="2"></textarea></div>
          <div class="field"><label for="rw-hind">O que atrapalhou?</label><textarea id="rw-hind" rows="2"></textarea></div>
          <div class="field">
            <label for="rw-load">A carga estava</label>
            <select id="rw-load">
              <option value="leve">Leve</option>
              <option value="adequada" selected>Adequada</option>
              <option value="excessiva">Excessiva</option>
            </select>
          </div>
          <div class="field"><label for="rw-period">Melhor período</label>
            <select id="rw-period">
              <option value="manha">Manhã</option>
              <option value="tarde">Tarde</option>
              <option value="noite" selected>Noite</option>
            </select>
          </div>
          <div class="field"><label for="rw-next">O que ajustar na próxima semana?</label><textarea id="rw-next" rows="2"></textarea></div>
          <button type="button" class="btn btn-primary btn-block" id="rw-save">Salvar revisão e ver sugestões</button>
          <div id="rw-out" class="mt-12"></div>
        </div>
      </section>
    `;

    $('#plan-open-review', root)?.addEventListener('click', () => {
      SFX.click();
      navigate('review');
    });

    $('#rw-save', root)?.addEventListener('click', async () => {
      SFX.click();
      const answers = {
        worked: $('#rw-worked', root)?.value || '',
        hindered: $('#rw-hind', root)?.value || '',
        load: $('#rw-load', root)?.value || 'adequada',
        bestPeriod: $('#rw-period', root)?.value || '',
        adjustNext: $('#rw-next', root)?.value || '',
      };
      const { review, unlocked } = await routineService.createWeeklyReview(answers);
      const out = $('#rw-out', root);
      out.innerHTML = `
        <div class="routine-alerts">
          <strong>Sugestões locais (confirmacao necessária)</strong>
          <ul>
            ${(review.suggestions || []).map((s) => `
              <li>
                ${escapeHtml(s.message)}
                ${s.type === 'reduce_load' || s.type === 'increase_load'
                  ? `<button type="button" class="btn" data-apply='${escapeHtml(JSON.stringify(s))}'>Aplicar</button>`
                  : ''}
              </li>
            `).join('') || '<li>Sem ajustes automáticos sugeridos.</li>'}
          </ul>
        </div>`;
      out.querySelectorAll('[data-apply]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const s = JSON.parse(btn.getAttribute('data-apply'));
          const res = await routineService.applySuggestion(s, { confirm: true });
          toast(res.applied ? 'Ajuste aplicado ao perfil.' : res.reason);
        });
      });
      if (unlocked?.length) toast(`Conquista: ${unlocked[0].title}`);
      else toast('Revisão semanal salva.');
    });
  }

  await paint();
  return cleanup;
}
