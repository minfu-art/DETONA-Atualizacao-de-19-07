import { $, starsHtml, formatStars, escapeHtml, escapeAttr } from './helpers.js';
import { answerQuestion, finalizeBattle } from '../core/battle.js?v=69';
import { SFX } from '../core/audio.js';
import { getPlayer } from '../core/seed.js';
import { heroImgHtml } from './heroAssets.js';
import { enemyImgHtml, BATTLE_BG } from './enemyAssets.js';
import { icon } from './icons.js?v=66';
import { progressBar } from './components.js';
import { buildQuestionExplanation } from '../services/questionExplanationService.js';

/**
 * Arena de Quiz gamificada — fundo artístico + inimigos estilo avatar
 */
export async function renderBattle(root, navigate, ctx) {
  const session = ctx.battleSession;
  if (!session || !session.questions?.length) {
    root.innerHTML = `
      <div class="ro-window"><div class="ro-body text-center">
        <p class="mb-8">Nenhuma batalha ativa.</p>
        <button type="button" class="btn btn-primary" id="b-back">Voltar</button>
      </div></div>`;
    $('#b-back', root).onclick = () => navigate('map');
    return;
  }

  const player = await getPlayer();
  let locked = false;

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
    return;

    root.innerHTML = `
      <div class="arena arena--v2">
        <div class="arena-stage" id="stage" style="--arena-bg:url('${BATTLE_BG}')">
          <div class="arena-stage__bg" aria-hidden="true"></div>
          <div class="arena-stage__vignette" aria-hidden="true"></div>
          <div class="arena-hud">
            <div class="arena-enemy-name">
              ${icon('skull', 'ico--sm')}
              <span>${escapeHtml(enemyName.split('—')[0].trim())}</span>
            </div>
            <div class="arena-hp-block">
              <div class="bar-label"><span>Resistência do desafio</span><span id="mhp-txt">${session.monsterHp}%</span></div>
              <div class="bar-track arena-hp-track" role="progressbar" aria-label="Resistência visual do desafio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${session.monsterHp}"><div class="bar-fill hp" id="mhp" style="width:${session.monsterHp}%"></div></div>
            </div>
          </div>

          <div class="arena-row">
            <div class="fighter fighter--hero" id="hero">
              <div class="fighter-glow fighter-glow--hero"></div>
              ${heroImgHtml({ className: 'hero-img hero-img--battle', level: player.level, sprite: player.avatar_sprite })}
              <div class="fighter-tag">${escapeHtml(player.name || 'Você')}</div>
              <div class="bar-track fighter-mini-hp" role="progressbar" aria-label="Foco visual da sessão" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${session.playerHp}">
                <div class="bar-fill xp" style="width:${session.playerHp}%"></div>
              </div>
            </div>
            <div class="arena-vs">
              <span>VS</span>
              <small>Q ${session.index + 1}/${session.questions.length}</small>
            </div>
            <div class="fighter fighter--enemy" id="monster">
              <div class="fighter-glow fighter-glow--enemy"></div>
              ${enemyImgHtml(enemyKey, { className: 'enemy-img enemy-img--battle', size: 'battle' })}
              <div class="fighter-tag">${escapeHtml(enemyName.split('—')[0].trim())}</div>
            </div>
          </div>

          <div class="arena-meta">
            <span>${icon('bolt', 'ico--sm')} Combo ${session.combo}</span>
            <span>${icon('gem', 'ico--sm')} Domínio ${Number(session.subtopic?.best_accuracy || 0).toFixed(0)}%</span>
          </div>
        </div>

        <div class="battle-objective"><span aria-hidden="true">${icon('bolt', 'ico--sm')}</span><strong>Objetivo</strong><span>Avance pela sessão e transforme cada resposta em domínio real do conteúdo.</span></div>

        <div class="question-card question-card--v2">
          <div class="q-meta">
            <span class="q-badge">${q.format === 'certo_errado' ? 'CERTO / ERRADO' : 'MÚLTIPLA ESCOLHA'}</span>
            ${/DETONA INÉDITA/i.test(`${q.fonte || ''} ${q.metadata?.colecao || ''}`) ? '<span class="q-badge">QUESTÃO DETONA INÉDITA</span>' : ''}
          </div>
          <div class="q-text">${escapeHtml(q.statement)}</div>
          ${progressBar({ value: Math.round(((session.index + 1) / session.questions.length) * 100), label: 'Progresso da sessão', tone: 'data', detail: `${session.index + 1} de ${session.questions.length}` })}
          <div class="answer-grid" id="answers">
            ${renderAnswers(q)}
          </div>
          <label class="review-confidence"><input type="checkbox" id="low-confidence"> Marcar baixa confiança</label>
          <div id="feedback" class="hidden" aria-live="polite"></div>
          <button type="button" class="btn btn-primary btn-block mt-12 hidden dash-cta" id="btn-next">Próxima →</button>
        </div>
      </div>
    `;

    $('#answers', root).querySelectorAll('.answer-btn').forEach((btn) => {
      btn.addEventListener('click', () => onAnswer(btn));
    });
  }

  function paintFocusQuestion(q, sub, enemyKey, enemyName) {
    const questionNumber = session.index + 1;
    const total = session.questions.length;
    const subjectLabel = sub?.name || sub?.enemy_name || 'Missão diária';
    const progress = Math.round((questionNumber / total) * 100);
    root.innerHTML = `
      <div class="battle-focus" data-battle-state="question">
        <header class="battle-focus__header">
          <div class="battle-focus__heading">
            <span class="battle-focus__eyebrow">Missão de domínio</span>
            <h1>${escapeHtml(subjectLabel)}</h1>
          </div>
          <div class="battle-focus__counter"><strong>${questionNumber}</strong><span>de ${total}</span></div>
          <div class="battle-focus__progress" aria-label="Progresso do bloco">
            <div class="battle-focus__steps">
              ${session.questions.map((_, index) => {
                const previous = session.results[index];
                const state = previous ? (previous.correct ? 'is-correct' : 'is-wrong') : index === session.index ? 'is-current' : '';
                return `<span class="battle-focus__step ${state}" data-step="${index}" aria-label="Questão ${index + 1}"></span>`;
              }).join('')}
            </div>
            <div class="battle-focus__progress-copy"><span>Progresso do bloco</span><strong>${progress}%</strong></div>
          </div>
        </header>

        <section class="battle-duel" id="stage" style="--arena-bg:url('${BATTLE_BG}')" aria-label="Contexto da missão">
          <div class="battle-duel__bg" aria-hidden="true"></div>
          <div class="battle-duel__fighter battle-duel__fighter--hero" id="hero">
            ${heroImgHtml({ className: 'hero-img battle-duel__image', level: player.level, sprite: player.avatar_sprite })}
            <span>${escapeHtml(player.name || 'Você')}</span>
          </div>
          <div class="battle-duel__center">
            <span>${icon('bolt', 'ico--sm')} Foco ${session.playerHp}%</span>
            <strong>QUESTÃO ${questionNumber}</strong>
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
            </div>
            <div class="battle-question__statement">
              <span class="battle-question__label">Enunciado</span>
              <p id="battle-statement">${escapeHtml(q.statement)}</p>
            </div>

            <fieldset class="battle-answers" id="answers">
              <legend>Escolha sua resposta</legend>
              ${renderAnswers(q)}
            </fieldset>

            <fieldset class="battle-confidence" id="battle-confidence">
              <legend>Nível de confiança</legend>
              <label><input type="radio" name="answer-confidence" value="normal" checked><span>${icon('shieldCheck', 'ico--sm')} Confiante</span></label>
              <label><input type="radio" name="answer-confidence" value="low"><span>${icon('target', 'ico--sm')} Em dúvida</span></label>
              <p>Marcar dúvida ajuda o DETONA a identificar pontos que merecem atenção.</p>
            </fieldset>

            <div class="battle-submit-row">
              <div class="battle-selection-hint" id="battle-selection-hint" aria-live="polite">Selecione uma alternativa para responder.</div>
              <button type="button" class="battle-submit" id="btn-answer" disabled>Responder ${icon('bolt', 'ico--sm')}</button>
            </div>

            <div id="feedback" class="battle-feedback-wrap hidden" aria-live="polite"></div>
            <button type="button" class="battle-next hidden" id="btn-next">Próxima questão ${icon('bolt', 'ico--sm')}</button>
          </article>

          <aside class="battle-control" aria-label="Controle da missão">
            <span class="battle-control__kicker">Controle da missão</span>
            <h2>Clareza antes da velocidade.</h2>
            <p>Leia o comando, escolha com intenção e informe sua confiança.</p>
            <dl>
              <div><dt>Acertos</dt><dd>${session.correct}</dd></div>
              <div><dt>Respondidas</dt><dd>${session.answered}</dd></div>
              <div><dt>Combo</dt><dd>${session.combo}</dd></div>
              <div><dt>Domínio atual</dt><dd>${Number(session.subtopic?.best_accuracy || 0).toFixed(0)}%</dd></div>
            </dl>
            <div class="battle-control__attention"><strong>Atenção</strong><span>Errar faz parte do diagnóstico. Toda resposta errada entra no ciclo de revisão.</span></div>
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
  }

  function renderAnswers(q) {
    if (q.format === 'certo_errado') {
      return `
        <button type="button" class="answer-btn certo" data-a="true"><span class="ans-letter">C</span> Certo</button>
        <button type="button" class="answer-btn errado" data-a="false"><span class="ans-letter">E</span> Errado</button>
      `;
    }
    const opts = q.options?.length ? q.options : ['A', 'B', 'C', 'D'];
    return opts.map((o) => {
      const letter = String(o).charAt(0);
      return `<button type="button" class="answer-btn" data-a="${escapeAttr(letter)}"><span class="ans-letter">${escapeHtml(letter)}</span> ${escapeHtml(String(o).replace(/^[A-E]\)\s*/, ''))}</button>`;
    }).join('');
  }

  function onAnswer(btn) {
    if (locked || session.finished) return;
    locked = true;
    let ans = btn.dataset.a;
    if (ans === 'true') ans = true;
    if (ans === 'false') ans = false;

    const confidence = root.querySelector('input[name="answer-confidence"]:checked')?.value || 'normal';
    const result = answerQuestion(session, ans, { confidence });
    if (!result) return;

    const stage = $('#stage', root);
    const hero = $('#hero', root);
    const monster = $('#monster', root);

    root.querySelectorAll('.answer-btn').forEach((b) => { b.disabled = true; });
    $('#btn-answer', root)?.setAttribute('disabled', '');
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
    fb.innerHTML = renderBattleFeedback(result, explanation, confidence);

    const completedStep = root.querySelector(`[data-step="${session.results.length - 1}"]`);
    completedStep?.classList.remove('is-current');
    completedStep?.classList.add(result.correct ? 'is-correct' : 'is-wrong');

    const next = $('#btn-next', root);
    next.classList.remove('hidden');
    next.innerHTML = result.isLast ? `Ver resultado ${icon('chart', 'ico--sm')}` : `Próxima questão ${icon('bolt', 'ico--sm')}`;
    next.focus();
    next.onclick = async () => {
      SFX.click();
      locked = false;
      if (result.isLast) await paintResult();
      else paintQuestion();
    };
  }

  async function paintResult() {
    root.innerHTML = `
      <div class="ro-window">
        <div class="ro-title">Calculando domínio...</div>
        <div class="ro-body text-center"><p class="muted">Atualizando seu progresso no edital...</p></div>
      </div>`;

    const summary = await finalizeBattle(session);
    ctx.battleSession = null;

    if (summary.improved) SFX.win();
    else SFX.click();
    if (summary.newCard) SFX.drop();

    root.innerHTML = `
      <div class="ro-window result-card">
        <div class="ro-title">Resultado do desafio</div>
        <div class="ro-body">
          <div class="result-stars">${starsHtml(summary.stars)}</div>
          <p class="text-center muted">${formatStars(summary.stars)} / 5 estrelas de domínio</p>
          <p class="text-center muted">${summary.correct}/${summary.total} · novo resultado ${formatPercent(summary.newResult)}</p>
          <ul class="muted result-list">
            <li>Melhor resultado anterior: <strong>${formatPercent(summary.previousBest)}</strong></li>
            <li>Novo resultado: <strong>${formatPercent(summary.newResult)}</strong></li>
            <li>Domínio atualizado: <strong>${formatPercent(summary.mastery)}</strong>${summary.improved ? ' · novo melhor' : ' · melhor preservado'}</li>
            <li>Barra da disciplina: ${formatPercent(summary.disciplineBefore)} → <strong>${formatPercent(summary.disciplineAfter)}</strong> (${formatDelta(summary.disciplineImpact)})</li>
            <li>LV global: ${summary.levelBefore} → <strong>${summary.levelAfter}</strong> (${formatDelta(summary.levelImpact, false)})</li>
            <li>Quantidade de tentativas: <strong>${summary.attempts}</strong></li>
            <li>Questões adicionadas à revisão: <strong>${summary.reviewAdded}</strong></li>
          </ul>
          ${summary.newCard ? `
            <div class="mvp-card mb-8" style="margin:0 auto;max-width:200px">
              <div class="rarity">NOVA CARTA · ${summary.newCard.rarity}</div>
              <div class="enemy">${icon('medal')}</div>
              <div class="name">${escapeHtml(summary.newCard.enemy_name)}</div>
            </div>
          ` : ''}
          <div class="row gap-8 mt-12">
            <button type="button" class="btn btn-block" id="r-map">Mapa</button>
            <button type="button" class="btn btn-primary btn-block" id="r-home">Hoje</button>
          </div>
        </div>
      </div>
    `;

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

    // Se veio da árvore, botão mapa vira "Árvore"
    if (ctx.returnToTree) {
      const mapBtn = $('#r-map', root);
      if (mapBtn) mapBtn.textContent = 'Árvore';
    }

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
  correct: 'assets/ui/battle-react-correct.png?v=1',
  wrong: 'assets/ui/battle-react-wrong.png?v=1',
});

function renderBattleFeedback(result, explanation, confidence) {
  const correct = result.correct;
  const attention = confidence === 'low';
  const reactSrc = correct ? BATTLE_REACT.correct : BATTLE_REACT.wrong;
  return `
    <section class="battle-feedback battle-feedback--${correct ? 'correct' : 'wrong'}" aria-label="${correct ? 'Resposta correta' : 'Resposta errada'}">
      <header class="battle-feedback__header">
        <div class="battle-feedback__copy">
          <span>${correct ? 'Resposta correta' : 'Resposta incorreta'}</span>
          <h2>${correct ? 'Muito bom! Continue avançando.' : 'Transforme o erro em aprendizado.'}</h2>
          ${attention ? '<span class="battle-feedback__attention">Em dúvida</span>' : ''}
        </div>
        <div class="battle-feedback__react" aria-hidden="true">
          <img src="${reactSrc}" alt="" width="160" height="160" decoding="async" />
        </div>
      </header>
      <div class="battle-learning">
        <span class="battle-learning__kicker">Explicação</span>
        <h3>Entenda a lógica da resposta</h3>
        <p>${escapeHtml(explanation.explanation)}</p>
      </div>
      ${renderExplanationDetails(explanation)}
      ${!correct || attention ? `
        <div class="battle-review-note battle-review-note--${!correct ? 'review' : 'attention'}">
          ${icon(!correct ? 'question' : 'target', 'ico--sm')}
          <div><strong>${!correct ? 'Adicionada à revisão' : 'Ponto de atenção registrado'}</strong><span>${!correct ? 'Esta questão entrará no seu ciclo de memória para ser retomada no momento certo.' : 'Mesmo acertando, sua baixa confiança ajuda a revelar um conteúdo que ainda precisa de consolidação.'}</span></div>
        </div>` : ''}
    </section>`;
}

function renderExplanationDetails(explanation) {
  const sections = explanation.sections.map((section) => `
    <article class="battle-explanation__item"><strong>${escapeHtml(section.label)}</strong><p>${escapeHtml(section.text)}</p></article>
  `).join('');
  const references = explanation.references.length
    ? `<article class="battle-explanation__item battle-explanation__item--references"><strong>Referências</strong><ul>${explanation.references.map((reference) => `<li>${escapeHtml(reference)}</li>`).join('')}</ul></article>`
    : '';
  return sections || references ? `<div class="battle-explanation">${sections}${references}</div>` : '';
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatDelta(value, percent = true) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${percent ? ' p.p.' : ''}`;
}
