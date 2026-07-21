/**
 * Rotina V3 — Hoje · Semana · Mês · Jornada · Foco · Progresso
 * Calendário dinâmico + jornada até a prova (sem XP acadêmico).
 */
import { $, toast, escapeHtml, openModal, closeModal, todayStr } from './helpers.js';
import { SFX } from '../core/audio.js';
import { icon, semanticIcon } from './icons.js?v=66';
import { mountPageContainer, sectionHeader } from './appShell.js';
import { routineService } from '../services/routineService.js';
import {
  activityLabel,
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
} from '../core/routine/routineCalendar.js';
import { prefersReducedMotion } from './components.js';
import { daysUntilExam } from '../core/progression.js';

const TABS = [
  ['hoje', 'Hoje'],
  ['semana', 'Semana'],
  ['mes', 'Mês'],
  ['jornada', 'Jornada'],
  ['foco', 'Sessão'],
  ['progresso', 'Análise'],
];

const DAY_NAMES = WEEKDAY_SHORT;

export async function renderExpedition(root, navigate, ctx) {
  let tab = 'hoje';
  let profile = await routineService.ensureProfile();
  let focusCtl = null;
  let focusTimer = null;
  let pendingReschedule = null;
  let weekCursor = dateKey();
  let monthCursor = { year: new Date().getFullYear(), monthIndex: new Date().getMonth() };

  const cleanup = () => {
    if (focusTimer) clearInterval(focusTimer);
    focusTimer = null;
  };

  async function paint() {
    cleanup();
    if (!profile.setupCompleted) {
      root.innerHTML = renderSetup(profile);
      bindSetup();
      mountShell('Configuração');
      return;
    }

    if (tab === 'hoje') await paintHoje();
    else if (tab === 'semana') await paintSemana();
    else if (tab === 'mes') await paintMes();
    else if (tab === 'jornada') await paintJornada();
    else if (tab === 'foco') await paintFoco();
    else if (tab === 'progresso') await paintProgresso();
    else if (tab === 'revisao') await paintRevisao();

    mountShell(TABS.find((t) => t[0] === tab)?.[1] || 'Rotina');
    bindTabs();
  }

  function mountShell(title) {
    mountPageContainer(root, {
      variant: 'routine',
      header: sectionHeader({
        eyebrow: 'Rotina de Estudos V3',
        title,
        subtitle: 'Calendário, plano até a prova e execução diária.',
      }),
    });
  }

  function tabsHtml(active) {
    return `
      <nav class="routine-tabs" aria-label="Áreas da rotina">
        ${TABS.map(([id, label]) => `
          <button type="button" class="routine-tab ${active === id ? 'is-active' : ''}" data-tab="${id}" aria-current="${active === id ? 'page' : 'false'}">${label}</button>
        `).join('')}
      </nav>`;
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
    return `
      <div class="routine-setup ro-window">
        <div class="ro-title">${icon('clipboard', 'ico--inline')} Configurar plano de estudos</div>
        <div class="ro-body">
          <p class="muted mb-8">Escolha um modelo inicial. Você pode ajustar tudo depois — nenhum campo é obrigatório para usar o app.</p>
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
          <p class="muted">Dias de estudo padrão: segunda a sexta. Descanso: sábado e domingo (editável depois).</p>
          <button type="button" class="btn btn-primary btn-block mt-12" id="rs-save">Começar com este plano</button>
          <button type="button" class="btn btn-ghost btn-block mt-8" id="rs-skip">Pular e usar padrão leve</button>
        </div>
      </div>`;
  }

  function bindSetup() {
    let model = profile.model || 'equilibrada';
    root.querySelectorAll('[data-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        model = btn.dataset.model;
        root.querySelectorAll('[data-model]').forEach((b) => b.classList.toggle('is-selected', b.dataset.model === model));
      });
    });
    const finish = async (skip = false) => {
      SFX.click();
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
      paint();
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
    const planned = state.plannedMinutes || 0;
    const actual = state.actualMinutes || 0;
    const pct = planned ? Math.min(100, Math.round((actual / planned) * 100)) : (state.minGoalMet ? 100 : 0);
    const j = journeySnap.journey;
    const nextLabel = next
      ? `Próximo passo: ${next.plannedMinutes || 25} min de ${next.title}`
      : 'Nenhum bloco pendente — adicione um na Semana ou regenere o plano.';

    root.innerHTML = `
      ${tabsHtml('hoje')}
      <section class="routine-hero ro-window mb-8" aria-label="Resumo de hoje">
        <div class="ro-body">
          <div class="routine-hero__top">
            <div>
              <small class="muted">${escapeHtml(dash.date)} · ${escapeHtml(dash.contestId || '')}</small>
              <h2 class="routine-hello">Olá, ${escapeHtml(dash.playerName)}</h2>
              <p class="muted">${semanticIcon('fire', 'ico--inline')} Sequência ${streak}d · ${icon('shield', 'ico--inline')} ${shields} proteção(ões)</p>
              <p class="routine-encouragement">Pequenas ações constroem grandes conquistas.</p>
              ${j.hasExam
                ? `<p class="routine-countdown-inline" aria-label="Contagem para a prova">${semanticIcon('exam', 'ico--inline')} Prova em <strong>${j.daysLeft}</strong> dia(s) · jornada ${j.positionPct}%</p>`
                : `<p class="muted"><button type="button" class="btn btn-ghost" id="rt-goto-jornada" style="padding:0;min-height:auto">Definir data da prova na Jornada</button></p>`}
            </div>
            <div class="routine-hero__ring" style="--p:${pct}" aria-label="Progresso do dia ${pct}%">
              <strong>${pct}%</strong>
              <small>do plano</small>
            </div>
          </div>
          <div class="routine-next-card" role="status">
            <small>Comece por aqui</small>
            <strong>${escapeHtml(nextLabel)}</strong>
          </div>
          <div class="routine-kpis" aria-label="Indicadores do dia">
            <div><small>Meta mínima</small><strong>${state.minGoalMet ? `${icon('check', 'ico--inline')} Cumprida` : `${semanticIcon('plan', 'ico--inline')} Em aberto`}</strong></div>
            <div><small>Minutos</small><strong>${actual}/${planned || profile.minDailyMinutes || 10}</strong></div>
            <div><small>Questões</small><strong>${state.answeredQuestions || 0}/${state.plannedQuestions || profile.dailyQuestionsGoal || 0}</strong></div>
            <div><small>Ação de entrada</small><strong>${state.entryActionDone ? icon('check', 'ico--inline') : '5 min / 1 questão'}</strong></div>
          </div>
          <button type="button" class="btn btn-primary btn-block mt-12" id="rt-next" ${next ? '' : 'disabled'}>
            ▶ Começar agora${next ? ` · ${escapeHtml(next.title)}` : ''}
          </button>
          <div class="routine-quick-row mt-8">
            <button type="button" class="btn" id="rt-little-time">Tenho pouco tempo hoje</button>
            <button type="button" class="btn btn-ghost" id="rt-close-day">Fechar dia / sequência</button>
          </div>
        </div>
      </section>

      <section class="ro-window mb-8">
        <div class="ro-title">Blocos de hoje</div>
        <div class="ro-body">
          ${blocks.length ? blocks.map(blockCard).join('') : '<p class="muted">Nenhum bloco hoje. Gere a semana ou adicione um bloco na aba Semana.</p>'}
        </div>
      </section>
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
    $('#rt-little-time', root)?.addEventListener('click', () => openLittleTimeModal());
    $('#rt-close-day', root)?.addEventListener('click', async () => {
      SFX.click();
      const res = await routineService.closeDay();
      if (res.message) toast(res.message, 4000);
      else toast(res.state.minGoalMet ? 'Dia registrado · sequência atualizada' : 'Dia registrado');
      if (res.unlocked?.length) toast(`Conquista: ${res.unlocked[0].title}`);
      paint();
    });
    bindBlockActions(blocks, navigate);
  }

  function blockCard(b) {
    const statusLabel = {
      planned: 'Planejado', in_progress: 'Em andamento', completed: 'Concluído',
      partially_completed: 'Parcial', skipped: 'Ignorado', rescheduled: 'Reagendado', cancelled: 'Cancelado',
    }[b.status] || b.status;
    return `
      <article class="routine-block status-${b.status}" data-block="${b.id}">
        <div class="routine-block__main">
          <strong>${escapeHtml(b.title)}</strong>
          <small>${activityLabel(b.activityType)} · ${b.plannedMinutes} min${b.startTime ? ` · ${b.startTime}` : ''} · ${statusLabel}</small>
          ${b.description ? `<p class="muted routine-block__desc">${escapeHtml(b.description)}</p>` : ''}
        </div>
        <div class="routine-block__actions">
          ${['planned', 'in_progress', 'partially_completed'].includes(b.status) ? `
            <button type="button" class="btn btn-primary" data-act="start" data-id="${b.id}">Iniciar</button>
            <button type="button" class="btn" data-act="done" data-id="${b.id}">Concluir</button>
            <button type="button" class="btn" data-act="partial" data-id="${b.id}">Parcial</button>
            <button type="button" class="btn btn-ghost" data-act="reschedule" data-id="${b.id}">Reagendar</button>
            <button type="button" class="btn btn-ghost" data-act="skip" data-id="${b.id}">Ignorar</button>
            <button type="button" class="btn btn-ghost" data-act="open" data-id="${b.id}">Abrir módulo</button>
          ` : `<span class="muted">${statusLabel}${b.actualMinutes ? ` · ${b.actualMinutes} min reais` : ''}</span>`}
        </div>
      </article>`;
  }

  function bindBlockActions(blocks, navigate) {
    root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        SFX.click();
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        const block = blocks.find((b) => b.id === id);
        if (!block) return;
        if (act === 'start') await startBlockFlow(block, navigate);
        if (act === 'done') {
          await routineService.completeBlock(id, { actualMinutes: block.actualMinutes || block.plannedMinutes, partial: false });
          toast('Bloco de estudo concluído.');
          paint();
        }
        if (act === 'partial') openSkipModal(id, true);
        if (act === 'skip') openSkipModal(id, false);
        if (act === 'reschedule') openRescheduleModal(id);
        if (act === 'open') {
          const target = routineService.navigateTargetForBlock(block);
          navigate(target);
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
    openModal('Tenho pouco tempo hoje', `
      <p class="muted mb-8">Montamos um plano reduzido <strong>sem apagar</strong> seu planejamento original.</p>
      <div class="routine-quick-row">
        <button type="button" class="btn btn-primary" data-lt="10">10 min</button>
        <button type="button" class="btn btn-primary" data-lt="20">20 min</button>
        <button type="button" class="btn btn-primary" data-lt="30">30 min</button>
      </div>
      <div class="field mt-12">
        <label for="lt-custom">Personalizar (minutos)</label>
        <input type="number" id="lt-custom" min="10" max="60" value="15" />
      </div>
    `, `<button type="button" class="btn btn-primary" id="lt-go">Criar plano reduzido</button>
        <button type="button" class="btn" id="lt-cancel">Cancelar</button>`);
    document.querySelectorAll('[data-lt]').forEach((b) => {
      b.addEventListener('click', async () => {
        closeModal();
        await routineService.activateReducedPlan(Number(b.dataset.lt));
        toast('Plano reduzido adicionado ao dia.');
        paint();
      });
    });
    document.getElementById('lt-go')?.addEventListener('click', async () => {
      const m = Number(document.getElementById('lt-custom')?.value) || 15;
      closeModal();
      await routineService.activateReducedPlan(m);
      toast('Plano reduzido adicionado ao dia.');
      paint();
    });
    document.getElementById('lt-cancel')?.addEventListener('click', closeModal);
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
      <div class="routine-quick-row" style="flex-direction:column;align-items:stretch">
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

    root.innerHTML = `
      ${tabsHtml('semana')}
      <section class="routine-week-desktop ro-window mb-8">
        <div class="ro-title">Minha semana</div>
        <div class="ro-body">
          <div class="routine-cal-nav" role="navigation" aria-label="Navegação semanal">
            <button type="button" class="btn" id="wk-prev" aria-label="Semana anterior">←</button>
            <div class="routine-cal-nav__label">
              <strong>${escapeHtml(rangeLabel)}</strong>
              <small class="muted">${sum.plannedMinutes || 0} min planejados · ${sum.actualMinutes || 0} executados · adesão ${sum.adherence || 0}%</small>
            </div>
            <button type="button" class="btn" id="wk-next" aria-label="Próxima semana">→</button>
            <button type="button" class="btn btn-ghost" id="wk-today">Hoje</button>
          </div>
          <div class="routine-week-grid" role="list">
            ${(view.days || view.week.map((date) => ({ date, blocks: [], plannedMinutes: 0 }))).map((day, i) => {
              const date = day.date;
              const dayBlocks = (day.blocks && day.blocks.length)
                ? day.blocks.filter((b) => b.status !== 'rescheduled' && b.status !== 'cancelled')
                : view.blocks.filter((b) => b.date === date && b.status !== 'rescheduled' && b.status !== 'cancelled');
              const load = day.plannedMinutes ?? dayBlocks.reduce((s, b) => s + (b.plannedMinutes || 0), 0);
              const level = dayLoadLevel(load, maxDaily);
              const isRest = day.restDay || (profile.restDays || []).includes(new Date(date + 'T12:00:00').getDay());
              return `
                <div class="routine-day-col load-${level} ${date === todayStr() ? 'is-today' : ''} ${isRest ? 'is-rest' : ''}" role="listitem" data-date="${date}">
                  <header>
                    <strong>${DAY_NAMES[i] || DAY_NAMES[new Date(date + 'T12:00:00').getDay()]}</strong>
                    <small>${date.slice(8)}/${date.slice(5, 7)}</small>
                    <span class="muted">${load} min${day.completed ? ` · ${day.completed}✓` : ''}</span>
                    ${isRest ? '<span class="routine-badge rest">Descanso</span>' : ''}
                    ${level === 'overload' ? '<span class="routine-badge overload">Sobrecarga</span>' : ''}
                  </header>
                  <div class="routine-day-blocks">
                    ${dayBlocks.map((b) => `
                      <button type="button" class="routine-chip status-${b.status}" data-open-block="${b.id}" title="${escapeHtml(b.title)}">
                        <strong>${escapeHtml(b.title)}</strong>
                        <small>${activityLabel(b.activityType)} · ${b.plannedMinutes}m${b.startTime ? ` · ${b.startTime}` : ''}</small>
                      </button>
                    `).join('') || '<span class="muted">—</span>'}
                  </div>
                </div>`;
            }).join('')}
          </div>
          ${view.alerts.length ? `
            <div class="routine-alerts mt-12" role="status">
              <strong>Alertas de planejamento</strong>
              <ul>${view.alerts.map((a) => `<li>${escapeHtml(a.message)}</li>`).join('')}</ul>
              <p class="muted">Sugestões — não bloqueiam o uso.</p>
            </div>` : ''}
          <div class="routine-quick-row mt-12">
            <button type="button" class="btn btn-primary" id="wk-regen">Regenerar plano da semana</button>
            <button type="button" class="btn" id="wk-add">+ Bloco rápido</button>
            <button type="button" class="btn btn-ghost" id="wk-pause">${profile.paused ? 'Retomar rotina' : 'Pausar rotina'}</button>
          </div>
        </div>
      </section>
    `;

    $('#wk-prev', root)?.addEventListener('click', () => {
      SFX.click();
      weekCursor = shiftWeek(weekCursor, -1);
      paint();
    });
    $('#wk-next', root)?.addEventListener('click', () => {
      SFX.click();
      weekCursor = shiftWeek(weekCursor, 1);
      paint();
    });
    $('#wk-today', root)?.addEventListener('click', () => {
      SFX.click();
      weekCursor = dateKey();
      paint();
    });
    $('#wk-regen', root)?.addEventListener('click', async () => {
      SFX.click();
      await routineService.regenerateCurrentWeek();
      toast('Semana regenerada (históricos concluídos preservados).');
      paint();
    });
    $('#wk-pause', root)?.addEventListener('click', async () => {
      profile = await routineService.saveProfile({ paused: !profile.paused });
      toast(profile.paused ? 'Rotina pausada.' : 'Rotina retomada.');
      paint();
    });
    $('#wk-add', root)?.addEventListener('click', async () => {
      await routineService.createBlock({
        title: 'Bloco personalizado',
        activityType: 'questoes',
        plannedMinutes: profile.preferredSessionMinutes || 25,
        date: todayStr(),
        source: 'user',
      });
      toast('Bloco adicionado a hoje.');
      paint();
    });
  }

  /* ───────── Mês ───────── */
  async function paintMes() {
    const view = await routineService.getMonthView(monthCursor.year, monthCursor.monthIndex);
    profile = view.profile;
    monthCursor = { year: view.year, monthIndex: view.monthIndex };

    root.innerHTML = `
      ${tabsHtml('mes')}
      <section class="ro-window mb-8" aria-label="Calendário mensal">
        <div class="ro-title">Visão do mês</div>
        <div class="ro-body">
          <div class="routine-cal-nav" role="navigation" aria-label="Navegação mensal">
            <button type="button" class="btn" id="mo-prev" aria-label="Mês anterior">←</button>
            <div class="routine-cal-nav__label">
              <strong>${escapeHtml(view.monthName)} ${view.year}</strong>
              <small class="muted">Toque em um dia para ver detalhes · marca da prova em destaque</small>
            </div>
            <button type="button" class="btn" id="mo-next" aria-label="Próximo mês">→</button>
            <button type="button" class="btn btn-ghost" id="mo-today">Este mês</button>
          </div>
          <div class="routine-month-head" aria-hidden="true">
            ${WEEKDAY_SHORT.map((d) => `<span>${d}</span>`).join('')}
          </div>
          <div class="routine-month-grid" role="grid" aria-label="${escapeHtml(view.monthName)} ${view.year}">
            ${view.cells.map((c) => {
              const dots = [];
              if (c.plannedMinutes) dots.push('plan');
              if (c.minGoalMet || c.completed > 0) dots.push('done');
              if (c.reviews) dots.push('rev');
              if (c.restDay) dots.push('rest');
              return `
                <button type="button"
                  class="routine-month-cell load-${c.load || 'empty'} ${c.inMonth ? '' : 'is-out'} ${c.isToday ? 'is-today' : ''} ${c.isExam ? 'is-exam' : ''} ${c.minGoalMet ? 'is-met' : ''}"
                  data-day="${c.date}"
                  role="gridcell"
                  aria-label="${c.date}${c.isExam ? ', dia da prova' : ''}${c.plannedMinutes ? `, ${c.plannedMinutes} min planejados` : ''}"
                  ${c.inMonth ? '' : 'tabindex="-1"'}>
                  <span class="routine-month-cell__day">${c.day}</span>
                  ${c.plannedMinutes ? `<span class="routine-month-cell__min">${c.plannedMinutes}m</span>` : ''}
                  <span class="routine-month-cell__dots" aria-hidden="true">
                    ${dots.map((d) => `<i class="dot-${d}"></i>`).join('')}
                  </span>
                  ${c.isExam ? '<span class="routine-month-cell__exam">Prova</span>' : ''}
                </button>`;
            }).join('')}
          </div>
          <div class="routine-month-legend muted mt-12">
            <span><i class="dot-plan"></i> planejado</span>
            <span><i class="dot-done"></i> cumprido</span>
            <span><i class="dot-rev"></i> revisão</span>
            <span><i class="dot-rest"></i> descanso</span>
            <span class="is-exam-legend">■ dia da prova</span>
          </div>
          <div id="mo-detail" class="routine-day-detail mt-12" hidden></div>
        </div>
      </section>
    `;

    $('#mo-prev', root)?.addEventListener('click', () => {
      SFX.click();
      monthCursor = view.prev;
      paint();
    });
    $('#mo-next', root)?.addEventListener('click', () => {
      SFX.click();
      monthCursor = view.next;
      paint();
    });
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
        panel.innerHTML = `
          <strong>${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}</strong>
          ${cell.isExam ? ' · <em>Dia da prova</em>' : ''}
          <p class="muted">Planejado: ${cell.plannedMinutes || 0} min · Realizado: ${cell.actualMinutes || 0} min · Blocos: ${list.length}</p>
          <ul class="routine-day-detail__list">
            ${list.map((b) => `<li>${escapeHtml(b.title)} · ${activityLabel(b.activityType)} · ${b.plannedMinutes}m · ${b.status}</li>`).join('') || '<li class="muted">Sem blocos neste dia.</li>'}
          </ul>
          <button type="button" class="btn mt-8" id="mo-goto-week">Ver na semana</button>
        `;
        $('#mo-goto-week', root)?.addEventListener('click', () => {
          weekCursor = date;
          tab = 'semana';
          paint();
        });
      });
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

    root.innerHTML = `
      ${tabsHtml('jornada')}
      <section class="ro-window mb-8 routine-journey" aria-label="Jornada até a prova">
        <div class="ro-title">Jornada até a prova</div>
        <div class="ro-body">
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
                ${j.phase === 'reta_final' || j.phase === 'semana_prova' ? '<p class="routine-final-strip">🏁 Reta final — foque no essencial.</p>' : ''}
              </div>
            </div>

            <div class="routine-trail ${reduceMotion ? 'is-static' : ''}" aria-label="Trilha temporal até a prova">
              <div class="routine-trail__track">
                <div class="routine-trail__progress" style="width:${pos}%"></div>
                <div class="routine-trail__chibi pose-${escapeHtml(chibi.pose)}" style="left:${pos}%" aria-hidden="true">
                  <span class="chibi-face">🚶</span>
                </div>
                <div class="routine-trail__flag" aria-hidden="true">🏁</div>
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
              <p>Defina a data da prova para ativar a contagem regressiva e a trilha com o avatar.</p>
              <p class="muted">Sem data fechada, você pode usar a rotina normalmente com meta semanal.</p>
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
    root.innerHTML = `
      ${tabsHtml('foco')}
      <section class="routine-focus ro-window mb-8">
        <div class="ro-title">Sessão de foco</div>
        <div class="ro-body">
          <div class="field">
            <label for="focus-block">Atividade</label>
            <select id="focus-block">
              <option value="">— livre —</option>
              ${blocks.map((b) => `<option value="${b.id}">${escapeHtml(b.title)} (${b.plannedMinutes}m)</option>`).join('')}
            </select>
          </div>
          <div class="routine-presets" role="group" aria-label="Duração">
            ${FOCUS_PRESETS.map((m) => `<button type="button" class="btn" data-preset="${m}">${m} min</button>`).join('')}
            <label class="field" style="margin:0">
              <span class="sr-only">Personalizado</span>
              <input type="number" id="focus-mins" min="1" max="180" value="${profile.focus?.sessionMinutes || 25}" aria-label="Minutos personalizados" />
            </label>
            <label class="field" style="margin:0">
              <input type="checkbox" id="focus-countup" /> Cronômetro crescente
            </label>
          </div>
          <div class="focus-timer" id="focus-display" aria-live="polite">25:00</div>
          <p class="muted text-center" id="focus-meta">Pronto para começar</p>
          <div class="routine-quick-row">
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
        $('#focus-pause', root).textContent = 'Continuar';
      } else if (s.status === 'paused') {
        focusCtl.resume();
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
        <p>Como foi o foco? (1–5)</p>
        <input type="number" id="fc-focus" min="1" max="5" value="3" />
        <p class="mt-8">Dificuldade percebida (1–5)</p>
        <input type="number" id="fc-diff" min="1" max="5" value="3" />
        <label class="field mt-8"><input type="checkbox" id="fc-done" checked /> Sessão concluída (desmarque se parcial)</label>
        <label class="field">Observação<input type="text" id="fc-note" maxlength="200" /></label>
      `, `<button type="button" class="btn btn-primary" id="fc-save">Salvar tempo real</button>
          <button type="button" class="btn" id="fc-cancel">Voltar</button>`);
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
    root.innerHTML = `
      ${tabsHtml('progresso')}
      <section class="ro-window mb-8">
        <div class="ro-title">Consistência de estudo</div>
        <div class="ro-body">
          <div class="routine-kpis">
            <div><small>Sequência</small><strong>${m.streak}d</strong></div>
            <div><small>Recorde</small><strong>${m.bestStreak}d</strong></div>
            <div><small>Semanal</small><strong>${m.weeklyConsistency}%</strong></div>
            <div><small>Horas</small><strong>${m.actualHours}/${m.plannedHours}h</strong></div>
          </div>
          <p class="muted mt-8">Este painel acompanha a execução da rotina; o domínio continua sendo calculado pelas atividades de estudo.</p>
          ${snap.loadAdvice?.action !== 'keep' ? `<p class="routine-tip">💡 ${escapeHtml(snap.loadAdvice.reason)} (${snap.loadAdvice.action} ~${snap.loadAdvice.percent}%)</p>` : ''}
        </div>
      </section>
      <section class="ro-window mb-8">
        <div class="ro-title">Conquistas de rotina</div>
        <div class="ro-body">
          ${snap.achievements.length
            ? `<ul class="routine-achievements">${snap.achievements.map((a) => `<li>🏅 ${escapeHtml(a.title)}</li>`).join('')}</ul>`
            : '<p class="muted">Execute sessões reais para desbloquear conquistas.</p>'}
        </div>
      </section>
      <section class="ro-window mb-8">
        <div class="ro-title">Precisão de planejamento</div>
        <div class="ro-body">
          <p>Conclusão de blocos: <strong>${m.planning?.completionRate || 0}%</strong></p>
          <p class="muted">Reagendados: ${m.rescheduledBlocks || 0} · Ignorados: ${m.skippedBlocks || 0}</p>
          <p class="muted">Distração mais comum: ${escapeHtml(m.topDistraction || '—')} (${m.distractionsTotal || 0} reg.)</p>
        </div>
      </section>
    `;
  }

  /* ───────── Revisão semanal ───────── */
  async function paintRevisao() {
    const snap = await routineService.getProgressSnapshot();
    const m = snap.metrics;
    root.innerHTML = `
      ${tabsHtml('revisao')}
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
