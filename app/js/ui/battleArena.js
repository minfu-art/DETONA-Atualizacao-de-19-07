import { $, starsHtml, formatStars, escapeHtml, escapeAttr, openModal, closeModal } from './helpers.js';
import {
  answerQuestion, finalizeBattle, getBattleResult, validateBattleSession,
} from '../core/battle.js?v=71';
import { SFX } from '../core/audio.js';
import { getPlayer } from '../core/seed.js';
import { heroImgHtml } from './heroAssets.js';
import { enemyImgHtml, BATTLE_BG } from './enemyAssets.js';
import { icon } from './icons.js?v=66';
import { buildQuestionExplanation } from '../services/questionExplanationService.js';

/**
 * Arena de Quiz gamificada — fundo artístico + inimigos estilo avatar
 */
export async function renderBattle(root, navigate, ctx) {
  const session = ctx.battleSession;
  if (!session || !session.questions?.length) {
    root.innerHTML = `
      <section class="battle-state battle-state--empty" aria-labelledby="battle-empty-title">
        <span class="battle-state__signal" aria-hidden="true">${icon('question')}</span>
        <h1 id="battle-empty-title">Nenhuma sessão ativa</h1>
        <p>Escolha um subtópico em Estudar para iniciar uma nova missão.</p>
        <button type="button" class="btn btn-primary" id="b-back">Voltar</button>
      </section>`;
    $('#b-back', root).onclick = () => navigate('map');
    return;
  }
  try {
    validateBattleSession(session);
  } catch {
    ctx.battleSession = null;
    root.innerHTML = `
      <section class="battle-state battle-state--error" role="alert" aria-labelledby="battle-invalid-title">
        <span class="battle-state__signal" aria-hidden="true">${icon('alert')}</span>
        <h1 id="battle-invalid-title">Sessão encerrada com segurança</h1>
        <p>Esta sessão não pôde ser aberta. Nenhum progresso acadêmico foi alterado.</p>
        <button type="button" class="btn btn-primary" id="b-invalid-back">Voltar para Estudar</button>
      </section>`;
    $('#b-invalid-back', root).onclick = () => navigate(ctx.returnToTree ? 'topicTree' : 'map');
    return;
  }

  const player = await getPlayer();
  const customHero = ctx?.contentPackage?.visualConfig?.battle_avatar || null;
  const battleHero = (className) => customHero
    ? `<img src="${escapeAttr(customHero)}" alt="Avatar do concurso" class="${className}" draggable="false">`
    : heroImgHtml({ className, level: player.level, sprite: player.avatar_sprite });
  let locked = false;
  ctx.requestBattleExit = (targetScreen) => {
    const modal = openModal(
      'Encerrar esta sessão?',
      '<p>As respostas desta sessão ainda não finalizada serão descartadas. Nenhuma recompensa final será concedida.</p>',
      '<button type="button" class="btn btn-primary" data-battle-stay autofocus>Continuar respondendo</button><button type="button" class="btn btn-ghost battle-exit-dialog__leave" data-battle-leave>Encerrar sessão</button>',
      { variant: 'confirm' },
    );
    modal.classList.add('battle-exit-dialog');
    modal.querySelector('[data-battle-stay]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-battle-leave]')?.addEventListener('click', () => {
      ctx.allowBattleExit = true;
      ctx.battleSession = null;
      ctx.requestBattleExit = null;
      closeModal();
      navigate(targetScreen);
    });
  };

  function paintQuestion() {
    if (session.finished) {
      paintResult();
      return;
    }
    const q = session.questions[session.index];
    const sub = session.subtopic;
    const enemyKey = sub?.enemy_sprite || 'enemy-1';
    const enemyName = sub?.enemy_name || 'Patrulha Diária';

    paintFocusQuestion(q, sub, enemyKey, enemyName);
  }

  function paintFocusQuestion(q, sub, enemyKey, enemyName) {
    const questionNumber = session.index + 1;
    const total = session.questions.length;
    const subjectLabel = sub?.name || sub?.enemy_name || 'Missão diária';
    const progress = Math.round((questionNumber / total) * 100);
    root.innerHTML = `
      <div class="battle-shell battle-focus" data-battle-state="question">
        <header class="battle-header battle-focus__header">
          <div class="battle-header__identity battle-focus__heading">
            <span class="battle-kicker battle-focus__eyebrow">Missão de domínio</span>
            <h1>${escapeHtml(subjectLabel)}</h1>
            <span class="battle-session-state">Sessão em andamento</span>
          </div>
          <div class="battle-progress battle-focus__progress" role="progressbar" aria-label="Progresso da sessão" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
            <div class="battle-focus__steps">
              ${session.questions.map((_, index) => {
                const previous = session.results[index];
                const state = previous ? (previous.correct ? 'is-correct' : 'is-wrong') : index === session.index ? 'is-current' : '';
                return `<span class="battle-focus__step ${state}" data-step="${index}" aria-label="Questão ${index + 1}"></span>`;
              }).join('')}
            </div>
            <div class="battle-focus__progress-copy"><span>Questão ${questionNumber} de ${total}</span><strong>${progress}%</strong></div>
          </div>
          <button type="button" class="btn btn-ghost battle-focus__exit" id="battle-exit" aria-label="Encerrar sessão de questões">Sair da sessão</button>
        </header>

        <section class="battle-stage battle-duel" id="stage" style="--arena-bg:url('${BATTLE_BG}')" aria-label="Contexto da missão">
          <div class="battle-duel__bg" aria-hidden="true"></div>
          <div class="battle-duel__fighter battle-duel__fighter--hero" id="hero">
            ${battleHero('hero-img battle-duel__image')}
            <span>${escapeHtml(player.name || 'Você')}</span>
          </div>
          <div class="battle-duel__center">
            <span>${icon('bolt', 'ico--sm')} Foco ${session.playerHp}%</span>
            <strong>Desafio ${questionNumber}</strong>
            <span>${icon('flame', 'ico--sm')} Combo ${session.combo}</span>
          </div>
          <div class="battle-duel__fighter battle-duel__fighter--enemy" id="monster">
            ${enemyImgHtml(enemyKey, { className: 'enemy-img battle-duel__image', size: 'battle' })}
            <span>${escapeHtml(enemyName.split('—')[0].trim())}</span>
          </div>
          <div class="battle-duel__resistance">
            <div><span>Resistência do desafio</span><strong id="mhp-txt">${session.monsterHp}%</strong></div>
            <div class="battle-duel__track" role="progressbar" aria-label="Resistência restante" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${session.monsterHp}"><span id="mhp" style="width:${session.monsterHp}%"></span></div>
          </div>
        </section>

        <main class="battle-workspace">
          <article class="battle-question" aria-labelledby="battle-statement">
            <div class="battle-question__meta">
              <span>${q.format === 'certo_errado' ? 'Certo ou errado' : 'Múltipla escolha'}</span>
              ${/DETONA INÉDITA/i.test(`${q.fonte || ''} ${q.metadata?.colecao || ''}`) ? '<span class="is-detona">Questão DETONA inédita</span>' : ''}
              <span>Questão ${questionNumber} de ${total}</span>
            </div>
            <div class="battle-question__statement">
              <span class="battle-kicker battle-question__label">Enunciado</span>
              <p id="battle-statement" tabindex="-1">${escapeHtml(q.statement)}</p>
            </div>

            <fieldset class="battle-answers" id="answers">
              <legend>Escolha sua resposta</legend>
              ${renderAnswers(q)}
            </fieldset>

            <fieldset class="battle-confidence" id="battle-confidence">
              <legend>Nível de confiança</legend>
              <label><input type="radio" name="answer-confidence" value="normal" checked><span>${icon('shieldCheck', 'ico--sm')} Confiante</span></label>
              <label><input type="radio" name="answer-confidence" value="low"><span>${icon('target', 'ico--sm')} Em dúvida</span></label>
              <p>Marcar dúvida ajuda o DETONA a identificar conteúdos que ainda precisam de consolidação.</p>
            </fieldset>

            <dl class="battle-mobile-stats" aria-label="Resumo da sessão">
              <div><dt>Acertos</dt><dd data-battle-stat="correct">${session.correct}</dd></div>
              <div><dt>Respondidas</dt><dd data-battle-stat="answered" data-total="${total}">${session.answered}/${total}</dd></div>
              <div><dt>Combo</dt><dd data-battle-stat="combo">${session.combo}</dd></div>
              <div><dt>Domínio</dt><dd>${Number(session.subtopic?.best_accuracy || 0).toFixed(0)}%</dd></div>
            </dl>

            <div class="battle-submit-row">
              <div class="battle-selection-hint" id="battle-selection-hint" aria-live="polite">Selecione uma alternativa para responder.</div>
              <button type="button" class="battle-submit" id="btn-answer" disabled><span>Responder</span> ${icon('bolt', 'ico--sm')}</button>
            </div>

            <div id="feedback" class="battle-feedback-wrap hidden" role="status" aria-live="polite" tabindex="-1"></div>
            <button type="button" class="battle-next hidden" id="btn-next">Próxima questão ${icon('bolt', 'ico--sm')}</button>
          </article>

          <aside class="battle-control" aria-label="Controle da missão">
            <span class="battle-kicker battle-control__kicker">Controle da missão</span>
            <h2>Clareza antes da velocidade.</h2>
            <p>Leia o comando, escolha com intenção e informe sua confiança.</p>
            <dl>
              <div><dt>Acertos</dt><dd data-battle-stat="correct">${session.correct}</dd></div>
              <div><dt>Respondidas</dt><dd data-battle-stat="answered">${session.answered}</dd></div>
              <div><dt>Combo</dt><dd data-battle-stat="combo">${session.combo}</dd></div>
              <div><dt>Domínio atual</dt><dd>${Number(session.subtopic?.best_accuracy || 0).toFixed(0)}%</dd></div>
            </dl>
            <div class="battle-control__attention"><strong>Orientação</strong><span>Errar faz parte do diagnóstico. A revisão é registrada somente ao concluir a sessão.</span></div>
          </aside>
        </main>
      </div>`;

    let selectedButton = null;
    const submit = $('#btn-answer', root);
    const hint = $('#battle-selection-hint', root);
    $('#answers', root).querySelectorAll('.answer-btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        if (locked) return;
        root.querySelectorAll('.answer-btn').forEach((item) => {
          item.classList.remove('is-selected');
          item.setAttribute('aria-pressed', 'false');
        });
        selectedButton = btn;
        btn.classList.add('is-selected');
        btn.setAttribute('aria-pressed', 'true');
        submit.disabled = false;
        hint.textContent = 'Resposta selecionada. Confirme quando estiver pronto.';
      });
    });
    root.querySelectorAll('input[name="answer-confidence"]').forEach((input) => {
      input.addEventListener('change', () => {
        $('#battle-confidence', root)?.classList.toggle('is-attention', input.value === 'low' && input.checked);
      });
    });
    submit.addEventListener('click', () => {
      if (selectedButton) onAnswer(selectedButton);
    });
    $('#battle-exit', root)?.addEventListener('click', () => navigate(ctx.returnToTree ? 'topicTree' : 'map'));
    requestAnimationFrame(() => $('#battle-statement', root)?.focus({ preventScroll: true }));
  }

  function renderAnswers(q) {
    if (q.format === 'certo_errado') {
      return `
        <button type="button" class="answer-btn certo" data-a="true"><span class="ans-letter">C</span><span class="answer-text">Certo</span></button>
        <button type="button" class="answer-btn errado" data-a="false"><span class="ans-letter">E</span><span class="answer-text">Errado</span></button>
      `;
    }
    const opts = q.options?.length ? q.options : ['A', 'B', 'C', 'D'];
    return opts.map((o) => {
      const letter = String(o).charAt(0);
      return `<button type="button" class="answer-btn" data-a="${escapeAttr(letter)}"><span class="ans-letter">${escapeHtml(letter)}</span><span class="answer-text">${escapeHtml(String(o).replace(/^[A-E]\)\s*/, ''))}</span></button>`;
    }).join('');
  }

  function onAnswer(btn) {
    if (locked || session.finished) return;
    locked = true;
    root.setAttribute('aria-busy', 'true');
    root.querySelectorAll('.answer-btn').forEach((answerButton) => { answerButton.disabled = true; });
    const submit = $('#btn-answer', root);
    if (submit) {
      submit.disabled = true;
      submit.querySelector('span').textContent = 'Confirmando…';
    }
    let ans = btn.dataset.a;
    if (ans === 'true') ans = true;
    if (ans === 'false') ans = false;

    const confidence = root.querySelector('input[name="answer-confidence"]:checked')?.value || 'normal';
    let result;
    try {
      result = answerQuestion(session, ans, {
        confidence,
        questionId: session.questions[session.index]?.id,
      });
    } catch {
      locked = false;
      root.removeAttribute('aria-busy');
      root.querySelectorAll('.answer-btn').forEach((answerButton) => { answerButton.disabled = false; });
      if (submit) {
        submit.disabled = false;
        submit.querySelector('span').textContent = 'Responder';
      }
      const hint = $('#battle-selection-hint', root);
      if (hint) {
        hint.setAttribute('role', 'alert');
        hint.textContent = 'Não foi possível confirmar agora. Sua questão continua aberta; tente novamente.';
        hint.setAttribute('tabindex', '-1');
        hint.focus({ preventScroll: true });
      }
      return;
    }
    if (!result) {
      locked = false;
      root.removeAttribute('aria-busy');
      root.querySelectorAll('.answer-btn').forEach((answerButton) => { answerButton.disabled = false; });
      if (submit) {
        submit.disabled = false;
        submit.querySelector('span').textContent = 'Responder';
      }
      return;
    }
    root.removeAttribute('aria-busy');
    if (submit?.querySelector('span')) submit.querySelector('span').textContent = 'Resposta confirmada';

    const stage = $('#stage', root);
    const hero = $('#hero', root);
    const monster = $('#monster', root);

    root.querySelectorAll('.answer-btn').forEach((b) => { b.disabled = true; });
    submit?.setAttribute('disabled', '');
    root.querySelector('.battle-focus')?.setAttribute('data-battle-state', result.correct ? 'correct' : 'wrong');
    if (result.correct) {
      btn.classList.add('correct');
      SFX.hit();
      hero?.classList.add('attack');
      monster?.classList.add('hurt');
      floatDmg(stage, '-10%', false);
      showEmote(stage, result.emote, 'left');
      if (result.critical) {
        SFX.critical();
        showCritical(stage);
      }
    } else {
      btn.classList.add('wrong');
      const expected = result.question.format === 'certo_errado'
        ? String(result.question.correct_answer === true || result.question.correct_answer === 'true' || result.question.correct_answer === 'Certo')
        : String(result.question.correct_answer);
      [...root.querySelectorAll('.answer-btn')]
        .find((option) => option.dataset.a === expected)
        ?.classList.add('is-solution');
      SFX.miss();
      monster?.classList.add('attack');
      hero?.classList.add('hurt');
      stage?.appendChild(Object.assign(document.createElement('div'), { className: 'slash-fx' }));
      floatDmg(stage, 'MISS', true);
      showEmote(stage, result.emote, 'left');
    }

    const mhp = $('#mhp', root);
    const mhpTxt = $('#mhp-txt', root);
    if (mhp) mhp.style.width = session.monsterHp + '%';
    if (mhpTxt) mhpTxt.textContent = session.monsterHp + '%';

    const fb = $('#feedback', root);
    fb.classList.remove('hidden');
    const explanation = buildQuestionExplanation(result.question);
    markAnswerOutcome(root, btn, result, explanation);
    const chosenAnswer = btn.querySelector('.answer-text')?.textContent?.trim() || String(ans);
    fb.innerHTML = renderBattleFeedback(result, explanation, confidence, chosenAnswer);
    updateSessionStats(root, session);

    const completedStep = root.querySelector(`[data-step="${session.results.length - 1}"]`);
    completedStep?.classList.remove('is-current');
    completedStep?.classList.add(result.correct ? 'is-correct' : 'is-wrong');

    const next = $('#btn-next', root);
    next.classList.remove('hidden');
    next.innerHTML = result.isLast ? `Ver resultado ${icon('chart', 'ico--sm')}` : `Próxima questão ${icon('bolt', 'ico--sm')}`;
    fb.focus({ preventScroll: true });
    next.onclick = async () => {
      SFX.click();
      locked = false;
      if (result.isLast) await paintResult();
      else paintQuestion();
    };
  }

  async function paintResult() {
    if (ctx.battleFinalizing) return;
    ctx.battleFinalizing = true;
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = `
      <section class="battle-state battle-state--loading" aria-labelledby="battle-finalizing-title">
        <span class="battle-state__signal" aria-hidden="true">${icon('bolt')}</span>
        <h1 id="battle-finalizing-title" tabindex="-1">Calculando seu resultado</h1>
        <p>Atualizando domínio, revisão e progresso da jornada.</p>
      </section>`;
    requestAnimationFrame(() => $('#battle-finalizing-title', root)?.focus({ preventScroll: true }));

    let summary;
    try {
      summary = await finalizeBattle(session);
    } catch (error) {
      if (error?.code === 'BATTLE_ALREADY_FINALIZED') {
        summary = await getBattleResult(session.id).catch(() => null);
      }
      if (!summary) {
        ctx.battleFinalizing = false;
        root.removeAttribute('aria-busy');
        root.innerHTML = `
          <section class="battle-state battle-state--error" role="alert">
            <span class="battle-state__signal" aria-hidden="true">${icon('alert')}</span>
            <h1 tabindex="-1" id="battle-result-error">Não foi possível concluir agora</h1>
            <p>As etapas já concluídas foram preservadas. Tente novamente para finalizar com segurança.</p>
            <button type="button" class="btn btn-primary" id="battle-result-retry">Tentar novamente</button>
          </section>`;
        $('#battle-result-retry', root)?.addEventListener('click', paintResult);
        requestAnimationFrame(() => $('#battle-result-error', root)?.focus());
        return;
      }
    }
    ctx.battleSession = null;
    ctx.requestBattleExit = null;
    ctx.battleFinalizing = false;
    root.removeAttribute('aria-busy');

    if (summary.improved) SFX.win();
    else SFX.click();
    if (summary.newCard) SFX.drop();

    const classification = classifyBattleResult(summary.newResult);
    const returnLabel = ctx.returnToTree ? 'Voltar ao subtópico' : 'Continuar estudando';
    const xpBreakdown = summary.xpBreakdown || {};
    const insignias = Array.isArray(summary.newInsignias) ? summary.newInsignias : [];
    root.innerHTML = `
      <main class="battle-result result-card" aria-labelledby="battle-result-title">
        <header class="battle-result__hero">
          <div>
            <span class="battle-kicker">Missão concluída</span>
            <h1 id="battle-result-title" tabindex="-1">Resultado da missão</h1>
            <p>${escapeHtml(classification)}</p>
          </div>
          <div class="battle-result__score" aria-label="${formatPercent(summary.newResult)}, ${summary.correct} acertos de ${summary.total}">
            <strong>${formatPercent(summary.newResult)}</strong>
            <span>${summary.correct} de ${summary.total} acertos</span>
          </div>
        </header>

        <section class="battle-result__section" aria-labelledby="battle-result-metrics">
          <div class="battle-result__section-head">
            <div><span class="battle-kicker">Visão geral</span><h2 id="battle-result-metrics">Desempenho persistido</h2></div>
            <div class="battle-result__stars" role="img" aria-label="${formatStars(summary.stars)} de 5 estrelas">
              <div>${starsHtml(summary.stars)}</div><strong>${formatStars(summary.stars)} / 5</strong><span>estrelas de domínio</span>
            </div>
          </div>
          <dl class="battle-result__metrics">
            <div class="is-correct"><dt>Acertos</dt><dd>${summary.correct}</dd></div>
            <div class="is-wrong"><dt>Erros</dt><dd>${summary.errors}</dd></div>
            <div><dt>Não respondidas</dt><dd>${summary.unanswered}</dd></div>
            <div><dt>Tempo ativo</dt><dd>${formatDuration(summary.activeSeconds)}</dd></div>
            <div><dt>Domínio atualizado</dt><dd>${formatPercent(summary.mastery)}</dd></div>
            <div><dt>Melhor resultado</dt><dd>${formatPercent(Math.max(summary.previousBest, summary.newResult))}</dd></div>
          </dl>
          <p class="battle-result__invariant"><strong>Conferência:</strong> ${summary.correct} acertos + ${summary.errors} erros + ${summary.unanswered} não respondidas = ${summary.total} questões.</p>
        </section>

        <section class="battle-result__section" aria-labelledby="battle-result-impact">
          <div class="battle-result__section-head"><div><span class="battle-kicker">Impacto acadêmico</span><h2 id="battle-result-impact">O que mudou nesta missão</h2></div></div>
          <div class="battle-result__impact">
            <article><span>Disciplina</span><strong>${formatPercent(summary.disciplineBefore)} → ${formatPercent(summary.disciplineAfter)}</strong><small>${formatDelta(summary.disciplineImpact)}</small></article>
            <article><span>Nível global</span><strong>${summary.levelBefore} → ${summary.levelAfter}</strong><small>${formatDelta(summary.levelImpact, false)}</small></article>
            <article><span>Tentativas</span><strong>${summary.attempts}</strong><small>total no subtópico</small></article>
            ${summary.reviewAdded > 0 ? `<article><span>Revisão</span><strong>${summary.reviewAdded}</strong><small>${summary.reviewAdded === 1 ? 'questão adicionada' : 'questões adicionadas'}</small></article>` : ''}
            ${summary.activity?.valid ? `<article><span>Tempo registrado</span><strong>${summary.activityMinutes || 1} min</strong><small>na disciplina</small></article>` : ''}
          </div>
        </section>

        <section class="battle-result__section battle-result__rewards" aria-labelledby="battle-result-rewards">
          <div class="battle-result__section-head"><div><span class="battle-kicker">Jornada</span><h2 id="battle-result-rewards">XP e recompensas confirmadas</h2></div></div>
          ${summary.xpEarned > 0 ? `
            <div class="battle-result__xp"><strong>+${summary.xpEarned} XP</strong><span>persistidos na jornada</span></div>
            <ul class="battle-result__xp-breakdown">
              ${xpBreakdown.correctAnswers ? `<li>Respostas corretas <strong>+${xpBreakdown.correctAnswers}</strong></li>` : ''}
              ${xpBreakdown.battleCompleted ? `<li>Sessão concluída <strong>+${xpBreakdown.battleCompleted}</strong></li>` : ''}
              ${xpBreakdown.combo ? `<li>Combo <strong>+${xpBreakdown.combo}</strong></li>` : ''}
              ${xpBreakdown.dailyGoal ? `<li>Meta diária <strong>+${xpBreakdown.dailyGoal}</strong></li>` : ''}
            </ul>` : '<p class="battle-result__empty-reward">Nenhum XP adicional foi concedido nesta missão.</p>'}
          ${summary.newCard ? `
            <article class="battle-result__reward-card mvp-card">
              <div class="rarity">NOVA CARTA · ${escapeHtml(summary.newCard.rarity)}</div>
              <div class="enemy">${icon('medal')}</div>
              <div class="name">${escapeHtml(summary.newCard.enemy_name)}</div>
            </article>` : ''}
          ${insignias.length ? `<div class="battle-result__insignias"><strong>Emblemas desbloqueados</strong><ul>${insignias.map((item) => `<li>${escapeHtml(item.name || item.title || item.id || 'Novo emblema')}</li>`).join('')}</ul></div>` : ''}
        </section>

        <nav class="battle-result__actions" aria-label="Próximas ações">
          <button type="button" class="btn btn-primary" id="r-map">${returnLabel}</button>
          <button type="button" class="btn btn-ghost" id="r-home">Ir para Hoje</button>
          ${summary.reviewAdded > 0 ? '<button type="button" class="btn btn-ghost" id="r-review">Ver revisões</button>' : ''}
        </nav>
      </main>
    `;
    requestAnimationFrame(() => $('#battle-result-title', root)?.focus({ preventScroll: true }));

    $('#r-map', root).onclick = () => {
      if (ctx.returnToTree) {
        ctx.disciplineId = ctx.returnToTree;
        ctx.returnToTree = null;
        navigate('topicTree');
      } else {
        navigate('map');
      }
    };
    $('#r-home', root).onclick = () => {
      ctx.returnToTree = null;
      navigate('home');
    };
    $('#r-review', root)?.addEventListener('click', () => navigate('review'));

    if (summary.player?._pending_celebration && !summary.player.celebration_shown) {
      setTimeout(() => navigate('celebration'), 1200);
    }
  }

  paintQuestion();
}

function floatDmg(stage, text, miss) {
  if (!stage) return;
  const d = document.createElement('div');
  d.className = 'dmg-float' + (miss ? ' miss' : '');
  d.textContent = text;
  d.style.left = miss ? '22%' : '62%';
  d.style.top = '38%';
  stage.appendChild(d);
  setTimeout(() => d.remove(), 800);
}

function showEmote(stage, emote, side) {
  if (!stage) return;
  const e = document.createElement('div');
  e.className = 'emote-balloon';
  e.textContent = emote;
  e.style[side === 'left' ? 'left' : 'right'] = '12px';
  stage.appendChild(e);
  setTimeout(() => e.remove(), 900);
}

function showCritical(stage) {
  if (!stage) return;
  const c = document.createElement('div');
  c.className = 'critical-banner';
  c.textContent = 'ACERTO CRÍTICO';
  stage.appendChild(c);
  setTimeout(() => c.remove(), 900);
}

/** Personagens de reação: joinha = acerto, dedo em riste = erro */
const BATTLE_REACT = Object.freeze({
  correct: 'assets/ui/battle-react-correct.png?v=2',
  wrong: 'assets/ui/battle-react-wrong.png?v=2',
});

function markAnswerOutcome(root, chosenButton, result, explanation) {
  const appendStatus = (button, text, tone) => {
    if (!button || button.querySelector('.answer-result-label')) return;
    const accessibleAnswer = button.querySelector('.answer-text')?.textContent?.trim()
      || button.textContent.trim();
    const label = document.createElement('span');
    label.className = `answer-result-label answer-result-label--${tone}`;
    label.textContent = text;
    button.appendChild(label);
    button.setAttribute('aria-label', `${accessibleAnswer}. ${text}`);
  };
  if (result.correct) {
    appendStatus(chosenButton, 'Sua resposta · correta', 'correct');
    return;
  }
  appendStatus(chosenButton, 'Sua resposta · incorreta', 'wrong');
  const expected = normalizedAnswerKey(explanation);
  const solution = [...root.querySelectorAll('.answer-btn')]
    .find((option) => String(option.dataset.a).toUpperCase() === expected.toUpperCase());
  appendStatus(solution, 'Resposta correta', 'correct');
}

export function renderBattleFeedback(result, explanation, confidence, chosenAnswer) {
  const correct = result.correct;
  const attention = confidence === 'low';
  const reactSrc = correct ? BATTLE_REACT.correct : BATTLE_REACT.wrong;
  const correctAnswer = describeCorrectAnswer(explanation);
  return `
    <section class="battle-feedback battle-feedback--${correct ? 'correct' : 'wrong'}" aria-label="${correct ? 'Resposta correta' : 'Resposta incorreta'}">
      <header class="battle-feedback__header">
        <div class="battle-feedback__copy">
          <span>${correct ? 'Resposta correta' : 'Resposta incorreta'}</span>
          <h2>${correct ? 'Decisão confirmada. Entenda por que funcionou.' : 'Transforme o erro em aprendizado.'}</h2>
          ${attention ? '<span class="battle-feedback__attention">Em dúvida</span>' : ''}
        </div>
        <div class="battle-feedback__react" aria-hidden="true">
          <img src="${reactSrc}" alt="" width="160" height="160" decoding="async" />
        </div>
      </header>
      <dl class="battle-feedback__answers">
        <div><dt>Sua resposta</dt><dd>${escapeHtml(chosenAnswer)}</dd></div>
        ${!correct ? `<div><dt>Resposta correta</dt><dd>${escapeHtml(correctAnswer)}</dd></div>` : ''}
      </dl>
      <div class="battle-learning">
        <span class="battle-kicker battle-learning__kicker">Explicação</span>
        <h3>Entenda a lógica da resposta</h3>
        <p>${escapeHtml(explanation.explanation)}</p>
      </div>
      ${renderExplanationDetails(explanation)}
      ${!correct || attention ? `
        <div class="battle-review-note battle-review-note--${!correct ? 'review' : 'attention'}">
          ${icon(!correct ? 'question' : 'target', 'ico--sm')}
          <div><strong>${!correct ? 'Revisão identificada' : 'Ponto de atenção identificado'}</strong><span>${!correct ? 'Esta questão entrou no seu ciclo de revisão e será persistida ao concluir a sessão.' : 'Sua dúvida foi registrada nesta sessão e ajudará o DETONA a priorizar este conteúdo após a conclusão.'}</span></div>
        </div>` : ''}
    </section>`;
}

function describeCorrectAnswer(explanation) {
  const answer = explanation.correctAnswer;
  const normalized = String(answer ?? '').trim().toUpperCase();
  if (explanation.alternatives?.length && /^[A-E]$/.test(normalized)) {
    return explanation.alternatives.find((item) => String(item).trim().toUpperCase().startsWith(`${normalized})`))
      || normalized;
  }
  if (answer === true || /^(true|certo|c)$/i.test(String(answer))) return 'Certo';
  if (answer === false || /^(false|errado|e)$/i.test(String(answer))) return 'Errado';
  const alternative = explanation.alternatives?.find((item) => String(item).trim().toUpperCase().startsWith(`${normalized})`));
  return alternative || normalized || 'Consulte a alternativa destacada acima.';
}

function normalizedAnswerKey(explanation) {
  const answer = explanation.correctAnswer;
  const normalized = String(answer ?? '').trim();
  if (explanation.alternatives?.length && /^[A-E]$/i.test(normalized)) return normalized.toUpperCase();
  if (answer === true || /^(true|certo|c)$/i.test(normalized)) return 'true';
  if (answer === false || /^(false|errado|e)$/i.test(normalized)) return 'false';
  return normalized;
}

function updateSessionStats(root, session) {
  root.querySelectorAll('[data-battle-stat="correct"]').forEach((item) => { item.textContent = session.correct; });
  root.querySelectorAll('[data-battle-stat="answered"]').forEach((item) => {
    item.textContent = item.dataset.total ? `${session.answered}/${item.dataset.total}` : session.answered;
  });
  root.querySelectorAll('[data-battle-stat="combo"]').forEach((item) => { item.textContent = session.combo; });
}

function renderExplanationDetails(explanation) {
  const presentation = deduplicateBattleExplanation(explanation);
  const sections = presentation.sections.map((section) => `
    <article class="battle-explanation__item"><strong>${escapeHtml(section.label)}</strong><p>${escapeHtml(section.text)}</p></article>
  `).join('');
  const references = presentation.references.length
    ? `<article class="battle-explanation__item battle-explanation__item--references"><strong>Referências</strong><ul>${presentation.references.map((reference) => `<li>${escapeHtml(reference)}</li>`).join('')}</ul></article>`
    : '';
  const source = presentation.source
    ? `<article class="battle-explanation__item battle-explanation__item--references"><strong>Fonte</strong><p>${escapeHtml(presentation.source)}</p></article>`
    : '';
  return sections || references || source ? `<div class="battle-explanation">${sections}${references}${source}</div>` : '';
}

export function deduplicateBattleExplanation(explanation = {}) {
  const seen = new Set([normalizePresentationText(explanation.explanation)]);
  const uniqueSections = [];
  const addSection = (label, text) => {
    const value = String(text || '').trim();
    const key = normalizePresentationText(value);
    if (!value || !key || seen.has(key)) return;
    seen.add(key);
    uniqueSections.push({ label, text: value });
  };
  (explanation.sections || []).forEach((section) => addSection(section.label, section.text));
  addSection('Pegadinha da banca', explanation.trap);
  addSection('Conhecimento adicional', explanation.addedKnowledge);
  const uniqueReferences = (explanation.references || [])
    .map((reference) => String(reference || '').trim())
    .filter((reference) => {
      const key = normalizePresentationText(reference);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const sourceKey = normalizePresentationText(explanation.source);
  return {
    sections: uniqueSections,
    references: uniqueReferences,
    source: sourceKey && !seen.has(sourceKey) ? String(explanation.source).trim() : '',
  };
}

function normalizePresentationText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function classifyBattleResult(value) {
  const accuracy = Math.max(0, Math.min(100, Number(value) || 0));
  if (accuracy >= 80) return 'Domínio consolidado';
  if (accuracy >= 60) return 'Bom avanço';
  if (accuracy >= 40) return 'Em desenvolvimento';
  return 'Precisa de reforço';
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.round(safeSeconds % 60);
  return minutes ? `${minutes} min ${remainder}s` : `${remainder}s`;
}

function formatDelta(value, percent = true) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${percent ? ' p.p.' : ''}`;
}
