/**
 * Dashboard Home — identidade artística da mockup JRPG
 * Layout: top HUD · herói + radar · atalhos · edital · status/missão · assuntos
 */
import { $, editalBarClass, toast, todayStr, escapeHtml } from './helpers.js';
import { getPlayer } from '../core/seed.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { getRadarStats } from '../core/ssot.js';
import { getTitle, daysUntilExam, xpForNextLevel } from '../core/progression.js';
import { randomPhrase } from '../data/phrases.js?v=68';
import { SFX } from '../core/audio.js';
import { createBattleSession } from '../core/battle.js?v=68';
import {
  heroImgHtml, lifetimeXp, rankLabel, DISC_BAR_COLORS,
} from './heroAssets.js';
import { levelBadgeHtml } from './enemyAssets.js';
import { icon, semanticIcon } from './icons.js?v=66';
import { KNOWLEDGE_BLOCKS } from '../data/editalSeed.js?v=68';
import { mountPageContainer, sectionHeader } from './appShell.js';
import { getTodayRoutine, metaProgress, metaPreviewText, goalTypeLabel } from '../core/dailyMeta.js';
import { ensureWellbeingHabits, getTodayWellbeingState } from '../core/wellbeing.js';
import { createReviewSession, getReviewDashboardData } from '../services/reviewService.js';
import { installButtonHtml, bindInstallButtons } from '../core/pwaInstall.js';

export async function renderHome(root, navigate, ctx) {
  const player = await getPlayer();
  if (!player?.onboarded) {
    navigate('onboarding');
    return;
  }

  await ensureWellbeingHabits();

  const [radar, disciplines, cards, routines, wbState, reviewData] = await Promise.all([
    getRadarStats(),
    progressRepository.getAll(STORES.disciplines),
    progressRepository.getAll(STORES.mvpCards),
    progressRepository.getAll(STORES.routines),
    getTodayWellbeingState(),
    getReviewDashboardData(),
  ]);

  const today = todayStr();
  const log = await progressRepository.getById(STORES.dailyLogs, today);
  const routine = await getTodayRoutine();
  const planned = routine?.enabled === false ? 0 : (routine?.goal_amount || 30);
  const doneToday = log?.completed_amount || 0;
  const missionLeft = Math.max(0, planned - doneToday);
  const meta = metaProgress(log, routine);
  const metaPreview = metaPreviewText(routine, log);
  const wbDone = wbState.cards.filter((c) => c.completed).length;
  const wbTotal = wbState.cards.length;
  const totalXp = lifetimeXp(player);
  const xpNeed = player.xp_next_level || xpForNextLevel(player.xp_level || 1);
  const xpPct = Math.min(100, Math.round(((player.xp || 0) / xpNeed) * 100));
  const editalPct = player.edital_completion_pct || 0;
  const days = daysUntilExam(player.exam_date);
  const stage = getTitle(player.level);
  const phrase = randomPhrase(!!player.endgame_mode);
  const rank = rankLabel(player.level, editalPct);
  const seal = editalPct >= 100
    ? `<span class="seal-edital">${semanticIcon('achievement', 'ico--inline')} EDITAL DOMINADO</span>`
    : '';

  disciplines.sort((a, b) => a.order - b.order);
  const discBars = disciplines.map((d, i) => {
    const r = radar.find((x) => x.id === d.id);
    const pct = r?.proficiency || 0;
    return { ...d, pct, color: DISC_BAR_COLORS[i % DISC_BAR_COLORS.length] };
  });
  const discById = Object.fromEntries(discBars.map((d) => [d.id, d]));

  /** Só tópicos principais de um bloco (Gerais / Específicos) */
  function mainTopics(blockKey) {
    const block = KNOWLEDGE_BLOCKS[blockKey];
    if (!block) return [];
    return block.disciplineIds.map((id, i) => {
      const d = discById[id];
      const label = block.labels[id] || d?.name || id;
      return {
        id,
        label,
        icon: semanticIcon('discipline', 'ico--inline'),
        pct: d?.pct || 0,
        color: d?.color || DISC_BAR_COLORS[i % DISC_BAR_COLORS.length],
      };
    });
  }

  const topicsGerais = mainTopics('gerais');
  const topicsEspecificos = mainTopics('especificos');
  const topDisc = [...discBars].sort((a, b) => b.pct - a.pct)[0];
  const missionFocus = topDisc
    ? (KNOWLEDGE_BLOCKS.gerais.labels[topDisc.id]
      || KNOWLEDGE_BLOCKS.especificos.labels[topDisc.id]
      || topDisc.name)
    : 'Revisão Geral';

  // radar com labels curtos (só nomes principais)
  const shortNames = {
    ...KNOWLEDGE_BLOCKS.gerais.labels,
    ...KNOWLEDGE_BLOCKS.especificos.labels,
  };
  const radarDisplay = radar.map((r) => ({
    ...r,
    name: shortNames[r.id] || shortLabel(r.name, 12),
  }));

  renderTodayCommandCenter(root, navigate, ctx, {
    player,
    stage,
    rank,
    totalXp,
    xpNeed,
    xpPct,
    editalPct,
    days,
    routine,
    meta,
    planned,
    doneToday,
    missionLeft,
    missionFocus,
    reviewData,
  });
  return;

  root.innerHTML = `
    <div class="dash">
      <!-- TOP HUD -->
      <header class="dash-top">
        <button type="button" class="dash-icon-btn" id="btn-menu" title="Voltar para biblioteca" aria-label="Voltar para biblioteca">${icon('menu')}</button>
        <div class="dash-pill dash-pill--fire">
          <span class="dash-pill-ico dash-pill-ico--svg">${icon('flame')}</span>
          <div>
            <small>Sequência</small>
            <strong>${player.streak_days || 0} dias</strong>
          </div>
        </div>
        <button type="button" class="dash-pill dash-pill--meta ${meta.complete ? 'is-complete' : ''}" id="btn-meta-hud" title="Abrir Metas de hoje">
          <span class="meta-ring" style="--p:${meta.pct}">
            <span class="meta-ring__center">${icon(meta.complete ? 'check' : 'checkCircle', 'ico--sm')}</span>
          </span>
          <div>
            <small>Meta Diária</small>
            <strong>${meta.idle ? 'Folga' : `${meta.done}/${meta.planned}`}</strong>
          </div>
        </button>
        <div class="dash-pill dash-pill--xp">
          <span class="dash-pill-ico dash-pill-ico--svg">${icon('gem')}</span>
          <div>
            <small>XP</small>
            <strong>${formatNum(totalXp)}</strong>
          </div>
        </div>
        <div class="dash-pill dash-pill--trophy" id="btn-conquistas">
          <span class="dash-pill-ico dash-pill-ico--svg">${icon('trophy')}</span>
          <div>
            <small>Conquistas</small>
            <strong>${cards.length}</strong>
          </div>
          ${cards.length ? '<span class="dash-badge-dot"></span>' : ''}
        </div>
      </header>

      <!-- HERO + RADAR -->
      <section class="dash-hero-row dash-hero-row--solo">
        <div class="dash-hero-stage">
          <div class="magic-circle" aria-hidden="true"></div>
          <div class="dash-level-badge dash-level-badge--art">
            ${levelBadgeHtml(player.level, 'level-badge-img')}
            <div class="dash-level-text">
              <small>NÍVEL</small>
              <strong>${player.level}</strong>
            </div>
          </div>
          <div class="dash-hero-figure ${player.level >= 90 ? 'is-legend' : ''}">
            ${heroImgHtml({ className: 'hero-img hero-img--home', level: player.level, sprite: player.avatar_sprite })}
          </div>
          <div class="dash-hero-name">
            <strong>${escapeHtml(player.name)}</strong>${seal}
            <span>${stage}</span>
          </div>
        </div>
      </section>

      <!-- INSTALAR APP -->
      <section class="dash-install" aria-label="Instalar aplicativo">
        ${installButtonHtml({ id: 'btn-install-home', variant: 'card' })}
      </section>

      <!-- QUICK ACTIONS (14.2 / 14.3) -->
      <section class="dash-quick">
        <button type="button" class="dash-qbtn" data-go="expedition" id="btn-metas-card">
          <span class="dash-qico dash-qico--svg">${icon('clipboard')}</span>
          <strong>METAS</strong>
          <small>${escapeHtml(metaPreview.length > 42 ? metaPreview.slice(0, 40) + '…' : metaPreview)}</small>
        </button>
        <button type="button" class="dash-qbtn" data-go="wellbeing">
          <span class="dash-qico dash-qico--svg">${icon('seedling')}</span>
          <strong>BEM-ESTAR</strong>
          <small>${wbDone}/${wbTotal} hábitos hoje</small>
        </button>
        <button type="button" class="dash-qbtn" data-go="profile">
          <span class="dash-qico dash-qico--svg">${icon('medal')}</span>
          <strong>CONQUISTAS</strong>
          <small>Veja suas badges</small>
        </button>
        <button type="button" class="dash-qbtn" data-go="performance">
          <span class="dash-qico dash-qico--svg">${icon('chart')}</span>
          <strong>DESEMPENHO</strong>
          <small>Acompanhe tudo</small>
        </button>
      </section>

      <!-- STATUS + MISSÃO (lado a lado, mesmo tamanho) -->
      <section class="dash-duo">
        <div class="dash-card dash-duo-card">
          <div class="dash-card-title">${icon('user', 'ico--inline')} STATUS DO ESTUDANTE</div>
          <div class="dash-status-grid">
            <div class="dash-stat">
              <small>NÍVEL</small>
              <strong class="dash-stat-lvl">${player.level}</strong>
            </div>
            <div class="dash-stat">
              <small>EXPERIÊNCIA</small>
              <strong class="dash-stat-xp">${formatNum(totalXp)} XP</strong>
            </div>
          </div>
          <div class="dash-xp-block">
            <div class="dash-bar-track dash-bar-track--tall">
              <div class="dash-bar-fill dash-bar-fill--xp" style="width:${xpPct}%"></div>
            </div>
            <small>Próximo nível de XP: ${formatNum(xpNeed)} XP · ${player.xp}/${xpNeed}</small>
          </div>
          <div class="dash-status-footer">
            <div class="dash-rank">
              <span>👑</span>
              <div>
                <small>RANK</small>
                <strong>${rank}</strong>
              </div>
            </div>
            <div class="dash-rank">
              <span>${semanticIcon('fire', 'ico--inline')}</span>
              <div>
                <small>SEQUÊNCIA</small>
                <strong>${player.streak_days || 0} DIAS</strong>
              </div>
            </div>
          </div>
          <div class="dash-edital-mini">
            <div class="dash-bar-label"><span>EDITAL</span><span>${editalPct.toFixed(1)}%</span></div>
            <div class="dash-bar-track dash-bar-track--tall">
              <div class="bar-fill ${editalBarClass(editalPct)}" style="width:${Math.min(100, editalPct)}%;height:100%"></div>
            </div>
          </div>
        </div>

        <div class="dash-card dash-duo-card dash-mission">
          <div class="dash-card-title">${icon('sword', 'ico--inline')} DESAFIO DO DIA</div>
          <div class="dash-mission-body dash-mission-body--grow">
            <div>
              <span class="dash-mission-tag">QUESTÕES DO DIA</span>
              <p>${routine?.enabled === false
                ? 'Hoje é <strong>dia de descanso</strong> na rotina.'
                : `Meta: <strong>${planned} ${goalTypeLabel(routine?.goal_type)}</strong>${missionFocus ? ` · foco em <strong>${escapeHtml(missionFocus)}</strong>` : ''}`}</p>
              <small class="muted">${doneToday}/${planned || '—'} hoje${missionLeft > 0 ? ` · faltam ${missionLeft}` : meta.complete ? ' · meta cumprida' : ''}</small>
            </div>
            <div class="dash-chest" aria-hidden="true">${icon('chest', 'ico--lg')}</div>
          </div>
          <button type="button" class="dash-cta" id="btn-daily">INICIAR QUESTÕES</button>
        </div>
      </section>

      <section class="dash-card review-dashboard">
        <div class="dash-card-head"><span class="dash-card-title">REVISÃO INTELIGENTE</span><span class="review-risk">Memória em risco: ${reviewData.atRisk}</span></div>
        <div class="review-dashboard__stats">
          <div><small>Pendentes</small><strong>${reviewData.pending}</strong></div>
          <div><small>Vencidas</small><strong>${reviewData.due}</strong></div>
          <div><small>Próxima revisão</small><strong>${formatReviewDate(reviewData.nextReviewAt)}</strong></div>
        </div>
        <div class="review-fragile"><small>Subtópicos mais frágeis</small><p>${reviewData.fragile.length
          ? reviewData.fragile.map((item) => `${escapeHtml(item.name)} (${item.mastery.toFixed(0)}%)`).join(' · ')
          : 'Nenhum subtópico em risco neste momento.'}</p></div>
        <button type="button" class="dash-cta" id="btn-review" ${reviewData.pending ? '' : 'disabled'}>INICIAR REVISÃO</button>
      </section>

      <!-- COUNTDOWN -->
      <div class="dash-countdown">
        ${days === null ? 'Defina a data da prova no Perfil' :
          days > 0 ? `${semanticIcon('exam', 'ico--inline')} Faltam <strong>${days}</strong> dias para a prova` :
          days === 0 ? `${icon('bolt', 'ico--inline')} HOJE É O DIA DA PROVA!` :
          `${semanticIcon('study', 'ico--inline')} Prova realizada — modo de manutenção`}
      </div>

      <!-- EDITAL: Gerais + Específicos com barras -->
      <section class="dash-card dash-edital-card" hidden aria-hidden="true">
        <div class="dash-card-head">
          <span class="dash-card-title">${icon('book', 'ico--inline')} EDITAL</span>
          <button type="button" class="dash-link" id="btn-all-disc">→</button>
        </div>

        <div class="dash-edital-block">
          <h4 class="dash-edital-block-title">Conhecimentos Gerais</h4>
          <div class="dash-disc-list">
            ${topicsGerais.map((t) => `
              <button type="button" class="dash-disc-row dash-disc-row--btn" data-tree="${t.id}">
                <span class="dash-disc-ico">${t.icon}</span>
                <div class="dash-disc-meta">
                  <span class="dash-disc-name">${escapeHtml(t.label)}</span>
                  <div class="dash-bar-track">
                    <div class="dash-bar-fill" style="width:${t.pct}%;background:${t.color}"></div>
                  </div>
                </div>
                <span class="dash-disc-pct" style="color:${t.color}">${t.pct}%</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="dash-edital-block">
          <h4 class="dash-edital-block-title">Conhecimentos Específicos</h4>
          <div class="dash-disc-list">
            ${topicsEspecificos.map((t) => `
              <button type="button" class="dash-disc-row dash-disc-row--btn" data-tree="${t.id}">
                <span class="dash-disc-ico">${t.icon}</span>
                <div class="dash-disc-meta">
                  <span class="dash-disc-name">${escapeHtml(t.label)}</span>
                  <div class="dash-bar-track">
                    <div class="dash-bar-fill" style="width:${t.pct}%;background:${t.color}"></div>
                  </div>
                </div>
                <span class="dash-disc-pct" style="color:${t.color}">${t.pct}%</span>
              </button>
            `).join('')}
          </div>
        </div>

        <button type="button" class="dash-ghost-btn" id="btn-all-disc-2">Abrir edital completo →</button>
      </section>
      <!-- Speech / motivação (ocultável) -->
      <div class="dash-speech" id="speech-box">
        💬 ${escapeHtml(phrase)}
      </div>
    </div>
  `;

  mountPageContainer(root, {
    variant: 'home',
    header: sectionHeader({
      eyebrow: 'Painel de estudos',
      title: 'Início',
      subtitle: 'Sua jornada rumo à PC/AL em um só lugar.',
    }),
  });

  bindInstallButtons(root);

  // events
  $('#btn-daily', root)?.addEventListener('click', async () => {
    SFX.click();
    try {
      const session = await createBattleSession(null, {
        daily: true,
        endgame: !!player.endgame_mode,
      });
      ctx.battleSession = session;
      navigate('battle');
    } catch (e) {
      toast(e.message || 'Ainda não há questões disponíveis para este subtópico.');
    }
  });
  $('#btn-review', root)?.removeAttribute('disabled');
  $('#btn-review', root)?.addEventListener('click', async () => {
    try {
      ctx.reviewSession = null;
      navigate('review');
    } catch (e) { toast(e.message || 'Não foi possível iniciar a revisão.'); }
  });

  const go = (screen) => { SFX.click(); navigate(screen); };
  $('#btn-all-disc', root)?.addEventListener('click', () => go('performance'));
  $('#btn-all-disc-2', root)?.addEventListener('click', () => go('performance'));
  $('#btn-conquistas', root)?.addEventListener('click', () => go('profile'));
  $('#btn-meta-hud', root)?.addEventListener('click', () => go('expedition'));
  $('#btn-menu', root)?.addEventListener('click', () => {
    SFX.click();
    navigate('library');
  });

  root.querySelectorAll('.dash-qbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.go;
      go(t);
    });
  });

  root.querySelectorAll('[data-tree]').forEach((el) => {
    el.addEventListener('click', () => {
      SFX.click();
      ctx.disciplineId = el.dataset.tree;
      navigate('topicTree');
    });
  });

  if (player._pending_celebration && !player.celebration_shown) {
    setTimeout(() => navigate('celebration'), 0);
  }
}

function renderTodayCommandCenter(root, navigate, ctx, data) {
  const {
    player, stage, rank, totalXp, xpNeed, xpPct, editalPct, days,
    routine, meta, planned, doneToday, missionLeft, missionFocus, reviewData,
  } = data;
  const firstName = String(player.name || 'Estudante').trim().split(/\s+/)[0];
  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  }).format(new Date());

  let mission = {
    type: 'edital',
    kicker: 'Próximo avanço',
    title: 'Escolha o próximo ponto do edital',
    reason: 'Sua meta e suas revisões estão em dia. Avance em um subtópico com menor domínio.',
    label: 'Abrir edital',
    icon: 'book',
  };
  if (reviewData.due > 0) {
    mission = {
      type: 'review',
      kicker: 'Prioridade de memória',
      title: `Recupere ${reviewData.due} ${reviewData.due === 1 ? 'revisão vencida' : 'revisões vencidas'}`,
      reason: 'Esses conteúdos estão perdendo força na memória. Revisá-los agora protege o que você já conquistou.',
      label: 'Iniciar revisão',
      icon: 'target',
    };
  } else if (!meta.complete && !meta.idle && routine?.enabled !== false) {
    mission = {
      type: 'battle',
      kicker: 'Missão recomendada',
      title: missionLeft > 0 ? `Complete os ${missionLeft} restantes de hoje` : 'Cumpra sua meta de hoje',
      reason: missionFocus
        ? `${missionFocus} é o foco recomendado para manter sua preparação equilibrada.`
        : 'Esta ação mantém sua rotina ativa e produz progresso mensurável no edital.',
      label: 'Começar agora',
      icon: 'bolt',
    };
  } else if (reviewData.pending > 0) {
    mission = {
      type: 'review',
      kicker: 'Consolidação',
      title: `Conclua ${reviewData.pending} ${reviewData.pending === 1 ? 'revisão pendente' : 'revisões pendentes'}`,
      reason: 'Sua meta diária está resolvida. Use o próximo bloco para consolidar conteúdos estudados.',
      label: 'Revisar agora',
      icon: 'target',
    };
  }

  const countdown = days === null
    ? { value: '—', label: 'Defina a data da prova', action: true }
    : days > 0
      ? { value: String(days), label: days === 1 ? 'dia para a prova' : 'dias para a prova', action: false }
      : days === 0
        ? { value: 'HOJE', label: 'Dia da prova', action: false }
        : { value: '✓', label: 'Prova realizada', action: false };
  const reviewHint = reviewData.fragile?.length
    ? reviewData.fragile.slice(0, 2).map((item) => escapeHtml(item.name)).join(' · ')
    : 'Nenhum conteúdo em risco agora.';

  root.innerHTML = `
    <div class="today-command">
      <header class="today-welcome">
        <div>
          <span class="today-welcome__date">${escapeHtml(todayLabel)}</span>
          <h1>Vamos avançar, ${escapeHtml(firstName)}.</h1>
          <p>Uma ação bem executada hoje aproxima você da aprovação.</p>
        </div>
        <div class="today-welcome__streak" aria-label="Sequência de ${player.streak_days || 0} dias">
          ${icon('flame', 'ico--sm')}
          <span><strong>${player.streak_days || 0}</strong><small>dias de constância</small></span>
        </div>
      </header>

      <section class="today-mission today-mission--${mission.type}" aria-labelledby="today-mission-title">
        <div class="today-mission__energy" aria-hidden="true"></div>
        <div class="today-mission__icon" aria-hidden="true">${icon(mission.icon, 'ico--lg')}</div>
        <div class="today-mission__content">
          <span class="today-kicker">${escapeHtml(mission.kicker)}</span>
          <h2 id="today-mission-title">${escapeHtml(mission.title)}</h2>
          <div class="today-mission__reason">
            <strong>Por que agora?</strong>
            <p>${escapeHtml(mission.reason)}</p>
          </div>
          <div class="today-mission__actions">
            <button type="button" class="today-primary" id="today-primary">${escapeHtml(mission.label)} ${icon('bolt', 'ico--sm')}</button>
            <button type="button" class="today-secondary" id="today-plan">Ver plano do dia</button>
          </div>
        </div>
        <div class="today-mission__snapshot" aria-label="Resumo da missão">
          <span><small>Meta de hoje</small><strong>${meta.idle ? 'Folga' : `${doneToday}/${planned || 0}`}</strong></span>
          <span><small>Revisões vencidas</small><strong>${reviewData.due}</strong></span>
          <span><small>Edital concluído</small><strong>${Number(editalPct).toFixed(1)}%</strong></span>
        </div>
      </section>

      <div class="today-grid">
        <section class="today-card today-card--progress" aria-labelledby="today-progress-title">
          <div class="today-card__head">
            <span class="today-card__icon">${icon('target')}</span>
            <div><small>Progresso do dia</small><h2 id="today-progress-title">Meta diária</h2></div>
            <strong class="today-card__value">${meta.idle ? 'Folga' : `${meta.pct}%`}</strong>
          </div>
          <div class="today-progress" role="progressbar" aria-label="Progresso da meta diária" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${meta.pct}"><span style="width:${meta.pct}%"></span></div>
          <p>${meta.complete ? 'Meta concluída. O compromisso de hoje está cumprido.' : missionLeft > 0 ? `Faltam ${missionLeft} para concluir o objetivo de hoje.` : 'Comece pelo primeiro bloco planejado.'}</p>
          <button type="button" class="today-card__link" id="today-routine">Ajustar plano</button>
        </section>

        <section class="today-card today-card--reviews" aria-labelledby="today-reviews-title">
          <div class="today-card__head">
            <span class="today-card__icon">${icon('question')}</span>
            <div><small>Memória</small><h2 id="today-reviews-title">Revisões</h2></div>
            <strong class="today-card__value ${reviewData.due ? 'is-alert' : ''}">${reviewData.pending}</strong>
          </div>
          <div class="today-review-stats">
            <span><strong>${reviewData.due}</strong><small>vencidas</small></span>
            <span><strong>${reviewData.atRisk}</strong><small>em risco</small></span>
          </div>
          <p>${reviewHint}</p>
          <button type="button" class="today-card__link" id="today-review" ${reviewData.pending ? '' : 'disabled'}>Abrir revisões</button>
        </section>

        <section class="today-card today-card--deadline" aria-labelledby="today-deadline-title">
          <div class="today-card__head">
            <span class="today-card__icon">${icon('calendar')}</span>
            <div><small>Contagem regressiva</small><h2 id="today-deadline-title">Prova</h2></div>
          </div>
          <div class="today-countdown"><strong>${escapeHtml(countdown.value)}</strong><span>${escapeHtml(countdown.label)}</span></div>
          <p>Constância atual: <strong>${player.streak_days || 0} dias</strong>. Continue construindo vantagem.</p>
          ${countdown.action ? '<button type="button" class="today-card__link" id="today-exam-date">Definir data</button>' : ''}
        </section>
      </div>

      <section class="today-evolution" aria-labelledby="today-evolution-title">
        <div class="today-evolution__avatar" aria-hidden="true">
          ${heroImgHtml({ className: 'hero-img today-evolution__image', level: player.level, sprite: player.avatar_sprite })}
        </div>
        <div class="today-evolution__content">
          <span class="today-kicker">Sua evolução</span>
          <h2 id="today-evolution-title">${escapeHtml(stage)} · Rank ${escapeHtml(rank)}</h2>
          <p>Seu progresso nasce do estudo concluído, não de ações aleatórias.</p>
          <div class="today-evolution__metrics">
            <span><small>Nível</small><strong>${player.level}</strong></span>
            <span><small>XP total</small><strong>${formatNum(totalXp)}</strong></span>
            <span><small>Edital</small><strong>${Number(editalPct).toFixed(1)}%</strong></span>
          </div>
          <div class="today-xp"><div><span>Próximo nível</span><strong>${player.xp}/${xpNeed} XP</strong></div><div class="today-progress"><span style="width:${xpPct}%"></span></div></div>
          <button type="button" class="today-card__link" id="today-performance">Ver evolução completa</button>
        </div>
      </section>
    </div>`;

  mountPageContainer(root, { variant: 'today' });

  $('#today-review', root)?.removeAttribute('disabled');

  const startReview = async () => {
    try {
      ctx.reviewSession = null;
      navigate('review');
    } catch (error) { toast(error.message || 'Não foi possível iniciar a revisão.'); }
  };
  const startBattle = async () => {
    try {
      ctx.battleSession = await createBattleSession(null, { daily: true, endgame: !!player.endgame_mode });
      navigate('battle');
    } catch (error) { toast(error.message || 'Ainda não há questões disponíveis para esta missão.'); }
  };

  $('#today-primary', root)?.addEventListener('click', () => {
    SFX.click();
    if (mission.type === 'review') startReview();
    else if (mission.type === 'battle') startBattle();
    else navigate('edital');
  });
  $('#today-review', root)?.addEventListener('click', () => { SFX.click(); startReview(); });
  $('#today-plan', root)?.addEventListener('click', () => { SFX.click(); navigate('expedition'); });
  $('#today-routine', root)?.addEventListener('click', () => { SFX.click(); navigate('expedition'); });
  $('#today-exam-date', root)?.addEventListener('click', () => { SFX.click(); navigate('profile'); });
  $('#today-performance', root)?.addEventListener('click', () => { SFX.click(); navigate('performance'); });

  if (player._pending_celebration && !player.celebration_shown) {
    setTimeout(() => navigate('celebration'), 0);
  }
}

/** Radar neon estilo mockup */
export function drawRadarNeon(canvas, stats) {
  if (!canvas || !stats?.length) return;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(280, (canvas.parentElement?.clientWidth || 240));
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = size * 0.32;
  const n = Math.min(stats.length, 8);
  const data = stats.slice(0, n);

  ctx.clearRect(0, 0, size, size);

  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + Math.cos(a) * r * (ring / 4);
      const y = cy + Math.sin(a) * r * (ring / 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(99, 120, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.strokeStyle = 'rgba(99, 120, 255, 0.18)';
    ctx.stroke();
  }

  ctx.beginPath();
  data.forEach((s, i) => {
    const val = Math.min(100, s.proficiency || 0) / 100;
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + Math.cos(a) * r * val;
    const y = cy + Math.sin(a) * r * val;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(120, 80, 255, 0.55)');
  grad.addColorStop(1, 'rgba(80, 120, 255, 0.15)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#8b7cff';
  ctx.lineWidth = 2;
  ctx.stroke();

  data.forEach((s, i) => {
    const val = Math.min(100, s.proficiency || 0) / 100;
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + Math.cos(a) * r * val;
    const y = cy + Math.sin(a) * r * val;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#c4b5fd';
    ctx.fill();
  });

  ctx.fillStyle = '#9aa6c8';
  ctx.font = '600 9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  data.forEach((s, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + Math.cos(a) * (r + 16);
    const y = cy + Math.sin(a) * (r + 16);
    const label = (s.name || '').slice(0, 10);
    ctx.fillText(label, x, y);
    ctx.fillStyle = '#a78bfa';
    ctx.font = '700 9px Inter, system-ui, sans-serif';
    ctx.fillText(String(s.proficiency || 0), x, y + 11);
    ctx.fillStyle = '#9aa6c8';
    ctx.font = '600 9px Inter, system-ui, sans-serif';
  });
}

function formatNum(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}

function shortLabel(s, max = 16) {
  const t = String(s || '');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function formatReviewDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
