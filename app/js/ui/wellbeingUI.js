/**
 * Preparação do Dia — UI acolhedora de autocuidado e constância.
 * Não concede XP; não destaca regras técnicas no topo.
 */
import { $, toast, escapeHtml, openModal, closeModal } from './helpers.js';
import { SFX } from '../core/audio.js';
import { icon, semanticIcon } from './icons.js?v=66';
import {
  getTodayWellbeingState,
  incrementHabit,
  toggleHabit,
  completeMicroPractice,
  HABIT_COLORS,
} from '../core/wellbeing.js';
import {
  EDUCATION_CARDS,
  PRODUCTIVE_RITUAL,
  HARD_DAY_RITUAL,
  HABIT_PRESENTATION,
  greetingForNow,
  messageForNow,
  progressHumanLabel,
  DAY_MESSAGES,
  pickMessage,
} from '../core/wellbeingMessages.js';
import { getPlayer } from '../core/seed.js';
import { mountPageContainer, sectionHeader } from './appShell.js';

const PRIORITY_ORDER = ['wb_meditacao', 'wb_agua', 'wb_exercicio', 'wb_alimentacao', 'wb_sono'];

export async function renderWellbeing(root, navigate) {
  let mood = null; // 'productive' | 'hard' | null

  async function paint() {
    const state = await getTodayWellbeingState();
    const player = await getPlayer().catch(() => null);
    const name = player?.name || '';
    const greeting = greetingForNow(new Date(), name);
    const heroMsg = mood === 'hard'
      ? pickMessage(DAY_MESSAGES.baixa_energia, Date.now())
      : messageForNow(new Date());
    const { cards, doneCount, total, allDone, vigor } = state;
    const ringPct = total ? Math.round((doneCount / total) * 100) : 0;
    const humanProgress = progressHumanLabel(doneCount, total);

    const ordered = [...cards].sort((a, b) => {
      const ia = PRIORITY_ORDER.indexOf(a.habit.id);
      const ib = PRIORITY_ORDER.indexOf(b.habit.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const priority = ordered.slice(0, 5);

    root.innerHTML = `
      <div class="pd-screen" data-wellbeing-v2="preparacao-do-dia">
        <!-- A. TOPO MOTIVADOR -->
        <header class="pd-hero" aria-label="Preparação do dia">
          <div class="pd-hero__glow" aria-hidden="true"></div>
          <div class="pd-hero__art" aria-hidden="true">
            <span class="pd-orb pd-orb--a"></span>
            <span class="pd-orb pd-orb--b">✨</span>
            <span class="pd-orb pd-orb--c"></span>
          </div>
          <p class="pd-kicker">Preparação do Dia</p>
          <h2 class="pd-greeting">${escapeHtml(greeting)}</h2>
          <p class="pd-message" id="pd-day-msg">${escapeHtml(heroMsg)}</p>
          <p class="pd-sub">Como posso me preparar melhor para estudar hoje?</p>
          <button type="button" class="btn btn-primary pd-cta" id="pd-start-small">
            Começar pequeno · 1 minuto
          </button>
        </header>

        <!-- Modos -->
        <section class="pd-modes" aria-label="Modos do dia">
          <button type="button" class="pd-mode pd-mode--go ${mood === 'productive' ? 'is-on' : ''}" id="pd-mode-prod">
            <span class="pd-mode__ico" aria-hidden="true">${icon('bolt')}</span>
            <span><strong>Quero entrar no modo produtivo</strong><small>Ritual leve para começar a estudar</small></span>
          </button>
          <button type="button" class="pd-mode pd-mode--soft ${mood === 'hard' ? 'is-on' : ''}" id="pd-mode-hard">
            <span class="pd-mode__ico" aria-hidden="true">${semanticIcon('plan')}</span>
            <span><strong>Hoje estou sem energia</strong><small>Versão mínima, sem culpa</small></span>
          </button>
        </section>
        <div id="pd-mode-panel" class="pd-mode-panel" hidden></div>

        <!-- B. HÁBITOS PRIORITÁRIOS -->
        <section class="pd-block pd-block--habits" aria-labelledby="pd-habits-title">
          <div class="pd-block__head">
            <div>
              <h3 id="pd-habits-title">Práticas de preparação</h3>
              <p class="pd-human-progress">${escapeHtml(humanProgress)}</p>
            </div>
            <div class="pd-ring" style="--p:${ringPct}" role="img" aria-label="Progresso do dia ${ringPct}%">
              <strong>${doneCount}</strong>
              <small>de ${total}</small>
            </div>
          </div>
          <div class="pd-habits">
            ${priority.map((c) => renderHabitCard(c)).join('')}
          </div>
        </section>

        <!-- C. ISSO AJUDA SEU ESTUDO -->
        <section class="pd-block pd-block--edu" aria-labelledby="pd-edu-title">
          <h3 id="pd-edu-title">Isso ajuda seu estudo</h3>
          <div class="pd-edu-grid">
            ${EDUCATION_CARDS.slice(0, 4).map((card) => `
              <article class="pd-edu-card">
                <span class="pd-edu-ico" aria-hidden="true">${semanticIcon(card.icon)}</span>
                <strong>${escapeHtml(card.title)}</strong>
                <p>${escapeHtml(card.text)}</p>
              </article>
            `).join('')}
          </div>
        </section>

        <!-- D. AÇÕES RÁPIDAS -->
        <section class="pd-block pd-block--quick" aria-label="Ações rápidas">
          <h3>Ações rápidas</h3>
          <div class="pd-quick">
            <button type="button" class="btn pd-qbtn" data-quick="breathe">Preparar minha mente</button>
            <button type="button" class="btn pd-qbtn" data-quick="light">Quero um começo leve</button>
            <button type="button" class="btn pd-qbtn" data-quick="pause">Fazer uma pausa consciente</button>
            <button type="button" class="btn btn-primary pd-qbtn" data-quick="study">Ir estudar (Edital)</button>
          </div>
        </section>

        <!-- E. PROGRESSO VISUAL LEVE + vigor discreto -->
        <section class="pd-block pd-block--constancy pd-constancy" aria-label="Constância">
          <h3>Sua base de constância</h3>
          <p class="muted">Pequenas ações repetidas, sem cobrança e sem competir com o estudo.</p>
          <div class="pd-constancy__bar" aria-hidden="true">
            <span style="width:${Math.max(8, ringPct)}%"></span>
          </div>
          <p class="pd-constancy__caption">
            ${allDone
              ? 'Hoje você cuidou da base. Bom ritmo para o estudo.'
              : 'Cada prática deixa o próximo passo um pouco mais fácil.'}
          </p>
          <p class="pd-vigor-hint" title="Indicador de constância da preparação diária">
            Constância do dia: ${doneCount}/${total}${vigor ? ` · Vigor acumulado: ${vigor}` : ''}
          </p>
        </section>

        <button type="button" class="btn btn-block mt-12" id="pd-home">← Voltar ao Início</button>
      </div>
    `;

    mountPageContainer(root, {
      variant: 'wellbeing',
      header: sectionHeader({
        eyebrow: 'Cuidado estratégico',
        title: 'Preparação do Dia',
        subtitle: 'Energia, clareza e constância para estudar melhor.',
      }),
    });

    bind(priority);
    if (mood) showModePanel(mood);
  }

  function renderHabitCard({ habit, pct, completed, done, target }) {
    const pres = HABIT_PRESENTATION[habit.id] || {
      title: habit.name,
      blurb: 'Este hábito ajuda você a sustentar sua preparação.',
      actionLabel: 'Registrar',
    };
    const color = HABIT_COLORS[habit.category] || HABIT_COLORS.outro;
    return `
      <article class="pd-habit ${completed ? 'is-done' : ''}" data-hid="${habit.id}">
        <div class="pd-habit__ico" style="--c:${color}" aria-hidden="true">${habit.icon}</div>
        <div class="pd-habit__body">
          <strong>${escapeHtml(pres.title)}</strong>
          <p>${escapeHtml(pres.blurb)}</p>
          <div class="pd-habit__track"><span style="width:${pct}%;background:${color}"></span></div>
          <small class="muted">${completed ? 'Feito por hoje' : `${done}/${target} ${escapeHtml(habit.unit)}`}</small>
        </div>
        <button type="button" class="btn btn-primary pd-habit__act" data-act="micro" data-hid="${habit.id}"
          ${completed && habit.input_type === 'toggle' ? '' : ''}>
          ${completed && habit.input_type === 'toggle' ? 'Desmarcar' : escapeHtml(pres.actionLabel)}
        </button>
      </article>`;
  }

  function showModePanel(mode) {
    const panel = $('#pd-mode-panel', root);
    if (!panel) return;
    const ritual = mode === 'hard' ? HARD_DAY_RITUAL : PRODUCTIVE_RITUAL;
    const title = mode === 'hard' ? 'Dia com pouca energia' : 'Modo produtivo — ritual leve';
    const lead = mode === 'hard'
      ? 'Hoje não precisa ser perfeito. Precisa ser possível.'
      : 'Comece pequeno. O importante é entrar em movimento.';
    panel.hidden = false;
    panel.innerHTML = `
      <div class="pd-ritual">
        <h4>${escapeHtml(title)}</h4>
        <p class="muted">${escapeHtml(lead)}</p>
        <ol>${ritual.map((s) => `<li>${escapeHtml(s.text)}</li>`).join('')}</ol>
        <div class="pd-ritual__actions">
          <button type="button" class="btn btn-primary" id="pd-ritual-go">
            ${mode === 'hard' ? 'Fazer só o mínimo agora' : 'Começar o ritual'}
          </button>
          <button type="button" class="btn btn-ghost" id="pd-ritual-close">Fechar</button>
        </div>
      </div>`;
    $('#pd-ritual-close', panel)?.addEventListener('click', () => {
      panel.hidden = true;
      mood = null;
      paint();
    });
    $('#pd-ritual-go', panel)?.addEventListener('click', async () => {
      SFX.click();
      if (mode === 'hard') {
        // micro: 1 min meditação se existir
        try { await completeMicroPractice('wb_meditacao', 1); } catch { /* ignore */ }
        toast('Mínimo registrado. Você está cuidando da constância.');
      } else {
        try { await completeMicroPractice('wb_meditacao', 1); } catch { /* ignore */ }
        try { await completeMicroPractice('wb_agua', 1); } catch { /* ignore */ }
        toast('Ritual iniciado. Agora escolha a primeira tarefa do edital.');
      }
      await paint();
    });
  }

  function bind(priorityCards) {
    $('#pd-home', root)?.addEventListener('click', () => { SFX.click(); navigate('home'); });

    $('#pd-start-small', root)?.addEventListener('click', async () => {
      SFX.click();
      try {
        await completeMicroPractice('wb_meditacao', 1);
        toast('1 minuto de pausa registrado. Bom começo.');
      } catch {
        toast('Comece com uma respiração — você já entrou em movimento.');
      }
      await paint();
    });

    $('#pd-mode-prod', root)?.addEventListener('click', () => {
      SFX.click();
      mood = 'productive';
      paint();
    });
    $('#pd-mode-hard', root)?.addEventListener('click', () => {
      SFX.click();
      mood = 'hard';
      paint();
    });

    root.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        SFX.click();
        const q = btn.dataset.quick;
        if (q === 'study') {
          navigate('edital');
          return;
        }
        if (q === 'breathe' || q === 'pause') {
          try { await completeMicroPractice('wb_meditacao', 1); } catch { /* ignore */ }
          openModal(
            q === 'pause' ? 'Pausa consciente' : 'Preparar a mente',
            `<p class="muted mb-8">Respire devagar por cerca de 1 minuto. Sem cobrança — só presença.</p>
             <ol class="pd-breathe-steps">
               <li>Inspire pelo nariz contando até 4</li>
               <li>Segure suavemente até 2</li>
               <li>Expire pela boca contando até 6</li>
               <li>Repita algumas vezes</li>
             </ol>`,
            `<button type="button" class="btn btn-primary" id="pd-breathe-ok">Pronto</button>`,
          );
          document.getElementById('pd-breathe-ok')?.addEventListener('click', () => {
            closeModal();
            toast('Pausa feita. Você pode começar leve.');
          });
          await paint();
          return;
        }
        if (q === 'light') {
          mood = 'hard';
          await paint();
          toast('Modo leve: faça só o que for possível hoje.');
        }
      });
    });

    root.querySelectorAll('[data-act="micro"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        SFX.click();
        const hid = btn.dataset.hid;
        const card = priorityCards.find((c) => c.habit.id === hid);
        try {
          let result;
          if (card?.habit.input_type === 'toggle') {
            result = await toggleHabit(hid);
          } else if (card?.habit.input_type === 'hours') {
            result = await incrementHabit(hid, 1);
          } else {
            result = await completeMicroPractice(hid);
          }
          if (result?.granted && result.vigor) {
            toast('Dia de base completa. Constância reconhecida.');
          } else if (card && !card.completed) {
            toast('Prática registrada. Bom ritmo.');
          }
          await paint();
        } catch (e) {
          toast(e.message || 'Não foi possível registrar.');
        }
      });
    });
  }

  await paint();
}
