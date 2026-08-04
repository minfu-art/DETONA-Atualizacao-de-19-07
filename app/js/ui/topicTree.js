import { $, closeModal, escapeAttr, escapeHtml, formatDate, openModal, starsHtml } from './helpers.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { MIN_QUESTIONS_BATTLE } from '../core/ssot.js';
import { effectiveStars } from '../core/memory.js';
import { createBattleSession } from '../core/battle.js?v=69';
import { questionService } from '../services/questionService.js';
import { discIcon, icon } from './icons.js?v=67';
import { averageSubtopicMastery } from '../core/mastery.js';
import {
  buildDisciplineTopics,
  buildQuestionAvailabilityBySubtopic,
  createSingleSessionStarter,
  eligibleReviewItems,
  resolveQuestionBankState,
  resolveStudyContinuation,
  resolveSubtopicPresentation,
  studySessionErrorMessage,
} from './studyPresentation.js';

const STARS_TO_UNLOCK_NEXT = 1;

function topicProgress(subtopics = []) {
  return Math.max(0, Math.min(100, Math.round(averageSubtopicMastery(subtopics) * 100) / 100));
}
function lastActivity(subtopic) {
  return subtopic.last_attempt_at || subtopic.ultimaTentativaEm || subtopic.last_studied_at || null;
}

export async function renderTopicTree(root, navigate, ctx) {
  root.dataset.theme = 'study';
  const discId = ctx.disciplineId;
  if (!discId) {
    navigate('map');
    return;
  }

  const [discipline, allSubs, questions, reviewQueue] = await Promise.all([
    progressRepository.getById(STORES.disciplines, discId),
    progressRepository.getAll(STORES.subtopics),
    questionService.listar(),
    progressRepository.getAll(STORES.reviewQueue),
  ]);
  if (!discipline) {
    navigate('map');
    return;
  }

  const subs = allSubs
    .filter((item) => item.discipline_id === discId)
    .sort((a, b) => String(a.edital_numbering).localeCompare(String(b.edital_numbering), undefined, { numeric: true }));
  const curriculum = Array.isArray(ctx?.contentPackage?.curriculum) ? ctx.contentPackage.curriculum : [];
  const topics = buildDisciplineTopics(discipline, subs, curriculum);
  const availabilityBySubtopic = buildQuestionAvailabilityBySubtopic({ questions, subtopics: subs });
  const nodeById = new Map();
  subs.forEach((subtopic, index) => {
    const previous = index > 0 ? subs[index - 1] : null;
    const unlocked = index === 0 || effectiveStars(previous) >= STARS_TO_UNLOCK_NEXT;
    const availability = availabilityBySubtopic[subtopic.id] || {
      eligibleIds: [], total: 0, answeredEligibleIds: [], answeredTotal: 0, unseenEligibleIds: [], unseenTotal: 0,
    };
    const reviewItems = eligibleReviewItems({ reviewQueue, questions, subtopicId: subtopic.id });
    const topicId = topics.find((topic) => topic.subtopics.some((item) => item.id === subtopic.id))?.id || null;
    nodeById.set(String(subtopic.id), {
      subtopic,
      unlocked,
      topicId,
      availability,
      questionCount: availability.total,
      reviewItems,
      presentation: resolveSubtopicPresentation(subtopic, availability.total, {
        count: reviewItems.length,
        unlocked,
      }),
    });
  });

  const continuation = resolveStudyContinuation({
    subtopics: subs,
    nodes: nodeById,
    currentSubtopicId: ctx.studySubtopicId,
  });
  const initialTopic = topics.find((topic) => topic.subtopics.some((item) => item.id === continuation?.subtopicId))
    || topics.find((topic) => topic.id === ctx.studyTopicId)
    || topics[0];
  let expandedTopicId = initialTopic?.id || null;
  const disciplineProgress = topicProgress(subs);
  const started = subs.filter((item) => Number(item.attempts_count || 0) > 0);
  const disciplineAccuracy = started.length
    ? Math.round(started.reduce((sum, item) => sum + (Number(item.best_accuracy) || 0), 0) / started.length)
    : 0;

  root.innerHTML = `
    <section class="study-tree" aria-labelledby="study-tree-title">
      <header class="study-tree__header ds-surface">
        <button type="button" class="study-back" id="study-tree-back"><span aria-hidden="true">←</span> Voltar para Estudar</button>
        <div class="study-tree__identity">
          <span class="study-tree__icon" aria-hidden="true">${discIcon(discId, 'ico--control')}</span>
          <div>
            <span class="ds-eyebrow">Disciplina</span>
            <h1 id="study-tree-title">${escapeHtml(discipline.name)}</h1>
            <p>Avance pelos tópicos e subtópicos na ordem oficial do edital.</p>
          </div>
        </div>
        <div class="study-tree__summary" aria-label="Resumo da disciplina">
          <article><span>Progresso</span><strong>${disciplineProgress}%</strong></article>
          <article><span>Domínio médio</span><strong>${disciplineAccuracy}%</strong></article>
          <article><span>Tópicos</span><strong>${topics.length}</strong></article>
          <article><span>Subtópicos</span><strong>${subs.length}</strong></article>
        </div>
        <progress max="100" value="${disciplineProgress}" aria-label="Progresso em ${escapeAttr(discipline.name)}: ${disciplineProgress}%"></progress>
        ${continuation ? `<button type="button" class="ds-button ds-button--secondary" id="study-continue" data-subtopic-id="${escapeAttr(continuation.subtopicId)}" data-topic-id="${escapeAttr(continuation.topicId || '')}">${escapeHtml(continuation.actionLabel)}</button>` : ''}
      </header>
      <div class="study-topics" id="study-topics"></div>
    </section>`;

  const topicsRoot = $('#study-topics', root);

  function focusSubtopicAction(sid) {
    requestAnimationFrame(() => {
      const card = root.querySelector(`[data-subtopic-card="${CSS.escape(sid)}"]`);
      card?.scrollIntoView({ block: 'center' });
      card?.querySelector('[data-study-subtopic]')?.focus();
    });
  }

  function paintTopics() {
    topicsRoot.innerHTML = topics.map((topic, topicIndex) => {
      const expanded = String(topic.id) === String(expandedTopicId);
      const progress = topicProgress(topic.subtopics);
      const panelId = `study-topic-panel-${topicIndex}`;
      return `
        <article class="study-topic ${expanded ? 'is-expanded' : ''}">
          <h2>
            <button type="button" class="study-topic__toggle" data-topic-id="${escapeAttr(topic.id)}" aria-expanded="${expanded}" aria-controls="${panelId}">
              <span><strong>${escapeHtml(topic.name)}</strong><small>${topic.subtopics.length} subtópico${topic.subtopics.length === 1 ? '' : 's'} · ${progress}% de domínio médio</small></span>
              <span aria-hidden="true">${icon(expanded ? 'chevronDown' : 'chevronRight', 'ico--control')}</span>
            </button>
          </h2>
          <div class="study-topic__panel" id="${panelId}" ${expanded ? '' : 'hidden'}>
            ${topic.subtopics.length ? topic.subtopics.map((subtopic) => subtopicHtml(nodeById.get(String(subtopic.id)))).join('') : `
              <div class="ds-empty-state study-topic__empty">
                <strong>Tópico sem subtópicos</strong>
                <p>A estrutura editorial deste tópico ainda não possui subtópicos publicados.</p>
              </div>`}
          </div>
        </article>`;
    }).join('') || `
      <div class="ds-empty-state study-topic__empty">
        <strong>Disciplina sem conteúdo</strong>
        <p>Os tópicos desta disciplina ainda estão em preparação editorial.</p>
      </div>`;

    topicsRoot.querySelectorAll('[data-topic-id]').forEach((button) => {
      button.addEventListener('click', () => {
        expandedTopicId = button.getAttribute('aria-expanded') === 'true' ? null : button.dataset.topicId;
        ctx.studyTopicId = expandedTopicId;
        paintTopics();
        if (expandedTopicId) topicsRoot.querySelector(`[data-topic-id="${CSS.escape(expandedTopicId)}"]`)?.focus();
      });
    });
    topicsRoot.querySelectorAll('[data-study-subtopic]').forEach((button) => {
      button.addEventListener('click', () => openPreparation(button.dataset.studySubtopic));
    });
  }

  function subtopicHtml(node) {
    if (!node) return '';
    const { subtopic, questionCount, presentation } = node;
    const activity = lastActivity(subtopic);
    return `
      <article class="study-subtopic study-subtopic--${presentation.tone}" data-subtopic-card="${escapeAttr(subtopic.id)}">
        <div class="study-subtopic__main">
          <span class="study-subtopic__number">${escapeHtml(subtopic.edital_numbering)}</span>
          <div>
            <h3>${escapeHtml(subtopic.name)}</h3>
            <span class="study-state study-state--${presentation.tone}">${escapeHtml(presentation.label)}</span>
          </div>
        </div>
        <div class="study-subtopic__metrics">
          <span><small>Melhor acerto</small><strong>${presentation.accuracy}%</strong></span>
          <span><small>Estrelas</small>${starsHtml(presentation.stars)}</span>
          <span><small>Questões</small><strong>${questionCount}</strong></span>
          ${activity ? `<span><small>Última atividade</small><strong>${escapeHtml(formatDate(activity))}</strong></span>` : ''}
          ${presentation.reviewCount ? `<span><small>Revisões</small><strong>${presentation.reviewCount}</strong></span>` : ''}
        </div>
        <div class="study-subtopic__action">
          <p>${escapeHtml(presentation.disabled ? presentation.reason : presentation.description)}</p>
          <button type="button" class="ds-button ${presentation.disabled ? 'ds-button--secondary' : 'ds-button--primary'}" data-study-subtopic="${escapeAttr(subtopic.id)}" ${presentation.disabled ? 'disabled aria-describedby="locked-' + escapeAttr(subtopic.id) + '"' : ''}>${escapeHtml(presentation.actionLabel)}</button>
          ${presentation.disabled ? `<span class="sr-only" id="locked-${escapeAttr(subtopic.id)}">${escapeHtml(presentation.reason)}</span>` : ''}
        </div>
      </article>`;
  }

  async function createAndEnterSession(sid) {
    const session = await createBattleSession(sid);
    if (!session?.questions?.length) throw new Error('Não foi possível montar a sessão com as questões deste subtópico.');
    ctx.battleSession = session;
    ctx.returnToTree = discId;
    ctx.studySubtopicId = sid;
    ctx.studyTopicId = topics.find((topic) => topic.subtopics.some((item) => item.id === sid))?.id || expandedTopicId;
    closeModal();
    navigate('battle');
    return session;
  }

  function openUnavailable(node) {
    const state = resolveQuestionBankState(node.availability.total, MIN_QUESTIONS_BATTLE);
    openModal(
      state.title,
      `<div class="study-prep study-prep--empty">
        <p>${escapeHtml(state.description)}</p>
        <dl><div><dt>Disciplina</dt><dd>${escapeHtml(discipline.name)}</dd></div><div><dt>Subtópico</dt><dd>${escapeHtml(node.subtopic.name)}</dd></div></dl>
      </div>`,
      `<button type="button" class="ds-button ds-button--secondary" id="study-unavailable-close">Fechar</button>
       <button type="button" class="ds-button ds-button--primary" id="study-unavailable-other">Escolher outro subtópico</button>`,
      { variant: 'alert' },
    );
    $('#study-unavailable-close')?.addEventListener('click', closeModal);
    $('#study-unavailable-other')?.addEventListener('click', () => {
      const target = [...nodeById.values()].find((candidate) => (
        candidate.unlocked && candidate.availability.total >= MIN_QUESTIONS_BATTLE
      ));
      closeModal();
      if (!target) return;
      ctx.studyTopicId = target.topicId;
      ctx.studySubtopicId = target.subtopic.id;
      expandedTopicId = target.topicId || expandedTopicId;
      paintTopics();
      focusSubtopicAction(target.subtopic.id);
    });
  }

  function openPreparation(sid) {
    const node = nodeById.get(String(sid));
    if (!node || !node.unlocked) return;
    ctx.studySubtopicId = sid;
    ctx.studyTopicId = topics.find((topic) => topic.subtopics.some((item) => item.id === sid))?.id || expandedTopicId;
    if (!resolveQuestionBankState(node.questionCount, MIN_QUESTIONS_BATTLE).ready) {
      openUnavailable(node);
      return;
    }
    const topic = topics.find((entry) => entry.subtopics.some((item) => item.id === sid));
    const startOnce = createSingleSessionStarter(createAndEnterSession);
    openModal(
      'Preparação para questões',
      `<div class="study-prep">
        <nav aria-label="Localização curricular"><span>${escapeHtml(discipline.name)}</span><span>${escapeHtml(topic?.name || 'Conteúdos')}</span><strong>${escapeHtml(node.subtopic.name)}</strong></nav>
        <div class="study-prep__summary">
          <article><span>Disponíveis</span><strong>${node.availability.total}</strong></article>
          <article><span>Inéditas</span><strong>${node.availability.unseenTotal}</strong></article>
          <article><span>Já respondidas</span><strong>${node.availability.answeredTotal}</strong></article>
          <article><span>Erros para revisão</span><strong>${node.reviewItems.length}</strong></article>
          <article><span>Melhor resultado</span><strong>${Number(node.subtopic.best_accuracy) || 0}%</strong></article>
          <article><span>Estrelas atuais</span>${starsHtml(effectiveStars(node.subtopic))}</article>
        </div>
        <div class="study-prep__mode"><span>Modo disponível</span><strong>Treino padrão</strong><p>10 questões selecionadas pelo motor acadêmico atual.</p></div>
        <p class="study-prep__error" id="study-prep-error" role="alert" hidden></p>
      </div>`,
      `<button type="button" class="ds-button ds-button--secondary" id="study-prep-cancel">Cancelar</button>
       <button type="button" class="ds-button ds-button--primary" id="study-prep-start">Iniciar questões</button>`,
      { variant: 'confirm' },
    );
    $('#study-prep-cancel')?.addEventListener('click', closeModal);
    $('#study-prep-start')?.addEventListener('click', async () => {
      const button = $('#study-prep-start');
      const error = $('#study-prep-error');
      if (button?.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Preparando sessão…';
      if (error) error.hidden = true;
      try {
        await startOnce(sid);
      } catch (sessionError) {
        if (error) {
          error.textContent = studySessionErrorMessage(sessionError);
          error.hidden = false;
        }
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Iniciar questões';
      }
    });
  }

  $('#study-tree-back', root)?.addEventListener('click', () => navigate('map'));
  $('#study-continue', root)?.addEventListener('click', (event) => {
    const sid = event.currentTarget.dataset.subtopicId;
    const topicId = event.currentTarget.dataset.topicId || nodeById.get(String(sid))?.topicId || null;
    ctx.studyTopicId = topicId;
    ctx.studySubtopicId = sid;
    expandedTopicId = topicId || expandedTopicId;
    paintTopics();
    focusSubtopicAction(sid);
  });
  paintTopics();
  if (ctx.studySubtopicId) {
    requestAnimationFrame(() => root.querySelector(`[data-subtopic-card="${CSS.escape(ctx.studySubtopicId)}"]`)?.scrollIntoView({ block: 'center' }));
  }
}
