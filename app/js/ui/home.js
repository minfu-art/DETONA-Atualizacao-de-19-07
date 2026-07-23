/**
 * Dashboard Home — identidade artística da mockup JRPG
 * Layout: top HUD · herói + radar · atalhos · edital · status/missão · assuntos
 */
import {
  $, closeModal, editalBarClass, toast, todayStr, escapeHtml, openModal,
} from './helpers.js';
import { getPlayer } from '../core/seed.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { getRadarStats } from '../core/ssot.js';
import { getTitle, daysUntilExam, xpForNextLevel } from '../core/progression.js';
import { randomPhrase } from '../data/phrases.js?v=68';
import { SFX } from '../core/audio.js';
import { createBattleSession } from '../core/battle.js?v=69';
import {
  heroImgHtml, lifetimeXp, rankLabel, DISC_BAR_COLORS,
} from './heroAssets.js';
import { levelBadgeHtml, enemyImgHtml } from './enemyAssets.js';
import { icon, semanticIcon, discIcon, discEnemySprite } from './icons.js?v=67';
import { KNOWLEDGE_BLOCKS } from '../data/editalSeed.js?v=68';
import { mountPageContainer, sectionHeader } from './appShell.js';
import { getTodayRoutine, metaProgress, metaPreviewText, goalTypeLabel } from '../core/dailyMeta.js';
import { ensureWellbeingHabits, getTodayWellbeingState, toggleHabit } from '../core/wellbeing.js';
import { createReviewSession, getReviewDashboardData } from '../services/reviewService.js';
import { installButtonHtml, bindInstallButtons } from '../core/pwaInstall.js';
import {
  ANNOUNCEMENT_ROUTES,
  announcementService,
  canDismissAnnouncement,
} from '../services/announcementService.js';
import { getMentorMessage } from '../services/mentorMessageService.js';
import {
  announcementModalDetailsHtml,
  automaticMentorHtml,
  officialMentorHtml,
} from './mentorCommunication.js';

export { automaticMentorHtml, officialMentorHtml } from './mentorCommunication.js';

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
        icon: discIcon(id, 'ico--inline'),
        pct: d?.pct || 0,
        color: d?.color || DISC_BAR_COLORS[i % DISC_BAR_COLORS.length],
      };
    });
  }

  const topicsGerais = mainTopics('gerais');
  const topicsEspecificos = mainTopics('especificos');
  // Foco do dia = matéria mais fraca (inimigo a enfrentar)
  const focusDisc = [...discBars].sort((a, b) => a.pct - b.pct)[0];
  const missionFocus = focusDisc
    ? (KNOWLEDGE_BLOCKS.gerais.labels[focusDisc.id]
      || KNOWLEDGE_BLOCKS.especificos.labels[focusDisc.id]
      || focusDisc.name)
    : 'Revisão Geral';
  const dailyEnemySprite = focusDisc ? discEnemySprite(focusDisc.id) : 'enemy-1';
  const dailyEnemyDiscId = focusDisc?.id || null;

  // radar com labels curtos (só nomes principais)
  const shortNames = {
    ...KNOWLEDGE_BLOCKS.gerais.labels,
    ...KNOWLEDGE_BLOCKS.especificos.labels,
  };
  const radarDisplay = radar.map((r) => ({
    ...r,
    name: shortNames[r.id] || shortLabel(r.name, 12),
  }));

  const avgAccuracy = discBars.length
    ? Math.round(discBars.reduce((s, d) => s + (Number(d.pct) || 0), 0) / discBars.length)
    : 0;

  await renderTodayCommandCenter(root, navigate, ctx, {
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
    dailyEnemySprite,
    dailyEnemyDiscId,
    discBars,
    reviewData,
    phrase,
    log,
    avgAccuracy,
    wbState,
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
          <span class="dash-qico dash-qico--svg">${icon('chartSteps')}</span>
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

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function openAnnouncementModal(announcement, {
  player = {},
  userId,
  navigate,
  onRead = () => {},
  onDismiss = () => {},
} = {}) {
  if (!announcement) return null;
  const internalRoute = announcement.cta_type === 'internal_route'
    && ANNOUNCEMENT_ROUTES.includes(announcement.cta_value)
    ? announcement.cta_value
    : null;
  const externalUrl = announcement.cta_type === 'external_url'
    ? safeHttpsUrl(announcement.cta_value)
    : null;
  const body = announcementModalDetailsHtml(player, announcement);
  const cta = internalRoute
    ? `<button type="button" class="btn btn-primary" id="announcement-cta">${escapeHtml(announcement.cta_label || 'Abrir')}</button>`
    : externalUrl
      ? `<a class="btn btn-primary" id="announcement-external-cta" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(announcement.cta_label || 'Abrir')}</a>`
      : '';
  const dismiss = canDismissAnnouncement(announcement)
    ? '<button type="button" class="btn" id="announcement-dismiss">Não mostrar novamente</button>'
    : '';
  const modal = openModal(
    announcement.title,
    body,
    `<button type="button" class="btn btn-secondary" id="announcement-close">Fechar</button>${dismiss}${cta}`,
  );
  $('#announcement-close', modal)?.addEventListener('click', closeModal);
  $('#announcement-cta', modal)?.addEventListener('click', () => {
    closeModal();
    navigate?.(internalRoute);
  });
  let readPromise = Promise.resolve();
  $('#announcement-dismiss', modal)?.addEventListener('click', async () => {
    if (!userId || !globalThis.confirm('Não mostrar esta mensagem novamente?')) return;
    try {
      await readPromise;
      await announcementService.dismissAnnouncement(userId, announcement.id);
      closeModal();
      await onDismiss();
    } catch (error) {
      console.warn('[home] falha ao dispensar aviso', error?.message || error);
      toast('Não foi possível dispensar a mensagem agora.');
    }
  });

  if (userId) {
    if (!announcement.read?.read_at) onRead();
    readPromise = announcementService.markAnnouncementRead(userId, announcement.id)
      .then((read) => {
        announcement.read = read;
      })
      .catch((error) => console.warn('[home] falha ao registrar leitura do aviso', error?.message || error));
  }
  return modal;
}

async function renderTodayCommandCenter(root, navigate, ctx, data) {
  const {
    player, stage, rank, totalXp, xpNeed, xpPct, editalPct, days,
    routine, meta, planned, doneToday, missionLeft, missionFocus,
    dailyEnemySprite, dailyEnemyDiscId, discBars, reviewData,
    phrase = '', log = null, avgAccuracy = 0, wbState = null,
  } = data;
  const firstName = String(player.name || 'Guerreiro').trim().split(/\s+/)[0];

  let mission = {
    type: 'edital',
    icon: 'book',
    title: missionFocus
      ? `Avançar no edital de ${missionFocus}`
      : 'Escolher o próximo ponto do edital',
    reason: 'Sua meta e revisões estão em dia. Avance no ponto com menor domínio.',
    label: 'Começar missão',
    amount: 10,
  };
  if (reviewData.due > 0) {
    const fragileName = reviewData.fragile?.[0]?.name;
    const focusLabel = missionFocus || shortLabel(fragileName, 28) || 'conteúdos críticos';
    mission = {
      type: 'review',
      icon: 'book',
      title: `Revisar ${reviewData.due} ${reviewData.due === 1 ? 'questão' : 'questões'} de ${focusLabel}`,
      reason: fragileName
        ? `Você precisa reforçar “${shortLabel(fragileName, 42)}” antes que a memória esfrie.`
        : 'Conteúdos vencidos estão perdendo força na memória. Revise agora.',
      label: 'Começar missão',
      amount: reviewData.due,
    };
  } else if (!meta.complete && !meta.idle && routine?.enabled !== false) {
    const left = missionLeft > 0 ? missionLeft : (planned || 10);
    mission = {
      type: 'battle',
      icon: 'swordsCrossed',
      title: missionFocus
        ? `Resolver ${left} ${goalTypeLabel(routine?.goal_type) || 'questões'} de ${missionFocus}`
        : `Completar ${left} da meta de hoje`,
      reason: missionFocus
        ? `${missionFocus} é o foco mais fraco agora — pressione essa matéria hoje.`
        : 'Cumprir a meta mantém sua sequência e gera XP real no edital.',
      label: 'Começar missão',
      amount: left,
    };
  } else if (reviewData.pending > 0) {
    mission = {
      type: 'review',
      icon: 'refresh',
      title: `Consolidar ${reviewData.pending} revisões pendentes`,
      reason: 'Meta diária resolvida. Use o próximo bloco para fixar o que já estudou.',
      label: 'Começar missão',
      amount: reviewData.pending,
    };
  }

  const estMin = Math.max(8, Math.min(45, Math.round((mission.amount || 10) * 1.2)));
  const xpReward = Math.max(40, Math.round((planned || 10) * 8));
  const ringPct = meta.idle ? 0 : Math.min(100, Number(meta.pct) || 0);
  const ringCirc = 2 * Math.PI * 42;
  const ringOffset = ringCirc - (ringPct / 100) * ringCirc;

  const examBlock = days === null
    ? { value: '—', label: 'Defina a data', action: true }
    : days > 0
      ? { value: String(days), label: days === 1 ? 'DIA PARA SUA PROVA' : 'DIAS PARA SUA PROVA', action: false }
      : days === 0
        ? { value: 'HOJE', label: 'DIA DA PROVA', action: false }
        : { value: '✓', label: 'PROVA REALIZADA', action: false };

  const reviewRows = (reviewData.fragile || []).slice(0, 3).map((item, i) => {
    const tones = ['warn', 'time', 'cal'];
    const tone = tones[i % tones.length];
    return `
      <button type="button" class="dj-review-row dj-review-row--${tone}" data-review-go="1">
        <span class="dj-review-row__ico">${icon(i === 0 ? 'alert' : i === 1 ? 'focus' : 'calendar', 'ico--sm')}</span>
        <span class="dj-review-row__name">${escapeHtml(shortLabel(item.name, 28))}</span>
        <span class="dj-review-row__count">${item.pending || 0} ${item.pending === 1 ? 'item' : 'itens'}</span>
        <span class="dj-review-row__chev" aria-hidden="true">${icon('chevronRight', 'ico--sm')}</span>
      </button>`;
  }).join('') || `
    <div class="dj-empty-inline">
      <span>${icon('checkCircle', 'ico--sm')}</span>
      <p>Nenhuma revisão crítica no momento.</p>
    </div>`;

  const battlesToday = log?.domain_challenges_completed || 0;
  const dayLabel = goalTypeLabel(routine?.goal_type) || 'questões';

  const PREP_ORDER = ['wb_meditacao', 'wb_agua', 'wb_exercicio', 'wb_alimentacao', 'wb_sono'];
  const prepCards = [...(wbState?.cards || [])].sort((a, b) => {
    const ia = PREP_ORDER.indexOf(a.habit.id);
    const ib = PREP_ORDER.indexOf(b.habit.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).slice(0, 5);
  const prepDone = wbState?.doneCount || 0;
  const prepTotal = wbState?.total || prepCards.length || 0;
  const prepPct = prepTotal ? Math.round((prepDone / prepTotal) * 100) : 0;
  const prepAllDone = prepTotal > 0 && prepDone >= prepTotal;
  const prepRows = prepCards.map((c) => `
    <button type="button"
      class="dj-prep-chip ${c.completed ? 'is-done' : ''}"
      data-prep-habit="${escapeHtml(c.habit.id)}"
      aria-pressed="${c.completed ? 'true' : 'false'}"
      title="${escapeHtml(c.habit.name)}">
      <span class="dj-prep-chip__check" aria-hidden="true">${c.completed ? icon('check', 'ico--sm') : icon('circle', 'ico--sm')}</span>
      <span class="dj-prep-chip__emoji" aria-hidden="true">${escapeHtml(c.habit.icon || '✦')}</span>
      <span class="dj-prep-chip__label">${escapeHtml(c.habit.name)}</span>
    </button>
  `).join('');

  const automaticMentor = getMentorMessage({
    player,
    meta,
    routine,
    reviewData,
    wellbeingState: wbState,
    daysUntilExam: days,
    missionFocus: dailyEnemyDiscId ? { id: dailyEnemyDiscId, name: missionFocus } : null,
    missionLeft,
    lastStudyDate: player.last_study_date,
    studiedToday: player.last_study_date === todayStr()
      || Number(log?.completed_amount) > 0
      || Number(log?.domain_challenges_completed) > 0,
    currentDate: todayStr(),
  });
  let officialAnnouncement = null;
  try {
    if (ctx.user?.id && ctx.contest?.id) {
      officialAnnouncement = await announcementService.getCurrentHomeAnnouncement({
        userId: ctx.user.id,
        contestId: ctx.contest.id,
      });
    }
  } catch (error) {
    console.warn('[home] avisos indisponíveis; usando conselho automático', error?.message || error);
  }
  const mentorHtml = officialAnnouncement
    ? officialMentorHtml(player, officialAnnouncement)
    : automaticMentorHtml(player, automaticMentor);

  root.innerHTML = `
    <div class="dj">
      <header class="dj-top">
        <div class="dj-top__hello">
          <h1>Fala, <span>${escapeHtml(firstName)}</span>!</h1>
          <p>${escapeHtml(phrase || 'Cada passo te aproxima da aprovação.')}</p>
        </div>
        <button type="button" class="dj-exam" id="today-exam-date" aria-label="Data da prova">
          <small>FALTAM</small>
          <strong>${escapeHtml(examBlock.value)}</strong>
          <span>${escapeHtml(examBlock.label)}</span>
          <i class="dj-exam__ico" aria-hidden="true">${icon('calendar', 'ico--sm')}</i>
        </button>
      </header>

      <div class="dj-hud" aria-label="Status do guerreiro">
        <div class="dj-hud__pill dj-hud__pill--fire">
          <span class="dj-hud__ico">${icon('flame')}</span>
          <div><small>Sequência</small><strong>${player.streak_days || 0} <em>dias</em></strong></div>
        </div>
        <div class="dj-hud__pill dj-hud__pill--xp">
          <span class="dj-hud__ico">${icon('gem')}</span>
          <div><small>XP total</small><strong>${formatNum(totalXp)}</strong></div>
        </div>
        <div class="dj-hud__pill dj-hud__pill--lv">
          <span class="dj-hud__ico dj-hud__ico--lv">${player.level}</span>
          <div><small>Nível</small><strong>${player.level}</strong></div>
        </div>
      </div>

      <section class="dj-mission dj-mission--${mission.type}" aria-labelledby="today-mission-title">
        <div class="dj-mission__fx" aria-hidden="true"></div>
        <div class="dj-mission__body">
          <span class="dj-kicker">Sua próxima missão</span>
          <div class="dj-mission__title-row">
            <span class="dj-mission__badge" aria-hidden="true">${icon(mission.icon, 'ico--lg')}</span>
            <h2 id="today-mission-title">${escapeHtml(mission.title)}</h2>
          </div>
          <p class="dj-mission__reason">${escapeHtml(mission.reason)}</p>
          <div class="dj-mission__meta">
            <span>${icon('focus', 'ico--sm')} Duração estimada <strong>${estMin} minutos</strong></span>
            ${dailyEnemyDiscId ? `<span class="dj-mission__enemy-tag">${discIcon(dailyEnemyDiscId, 'ico--sm')} ${escapeHtml(missionFocus || '')}</span>` : ''}
          </div>
          <button type="button" class="dj-cta" id="today-primary">
            Começar missão ${icon('bolt', 'ico--sm')}
          </button>
        </div>
        <div class="dj-mission__art" aria-hidden="true">
          <div class="dj-mission__orb"></div>
          ${heroImgHtml({ className: 'hero-img dj-mission__hero', level: player.level, sprite: player.avatar_sprite })}
          <div class="dj-mission__foe">
            ${enemyImgHtml(dailyEnemySprite || 'enemy-1', { className: 'enemy-img dj-mission__enemy', size: 'sm' })}
          </div>
        </div>
      </section>

      <div class="dj-split">
        <section class="dj-card dj-card--reviews" aria-labelledby="dj-reviews-title">
          <div class="dj-card__head">
            <span class="dj-card__ico">${icon('layers')}</span>
            <h2 id="dj-reviews-title">Revisões pendentes</h2>
            <strong class="dj-card__badge">${reviewData.pending || 0}</strong>
          </div>
          <div class="dj-review-list">${reviewRows}</div>
          <button type="button" class="dj-link" id="today-review">Ver todas ${icon('chevronRight', 'ico--sm')}</button>
        </section>

        <section class="dj-card dj-card--goal" aria-labelledby="dj-goal-title">
          <div class="dj-card__head">
            <span class="dj-card__ico">${icon('target')}</span>
            <h2 id="dj-goal-title">Meta diária</h2>
          </div>
          <div class="dj-ring-wrap">
            <svg class="dj-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle class="dj-ring__bg" cx="50" cy="50" r="42"/>
              <circle class="dj-ring__fg" cx="50" cy="50" r="42"
                stroke-dasharray="${ringCirc.toFixed(2)}"
                stroke-dashoffset="${ringOffset.toFixed(2)}"/>
            </svg>
            <div class="dj-ring__center">
              <strong>${meta.idle ? '—' : `${ringPct}%`}</strong>
            </div>
          </div>
          <div class="dj-goal-copy">
            <strong>${meta.idle ? 'Folga' : `${doneToday} / ${planned || 0}`}</strong>
            <small>${meta.idle ? 'Sem meta hoje' : `${dayLabel} concluídas`}</small>
            <em>+${xpReward} XP</em>
          </div>
          <button type="button" class="dj-link" id="today-routine">Ver minhas metas ${icon('chevronRight', 'ico--sm')}</button>
        </section>
      </div>

      <section class="dj-prep ${prepAllDone ? 'is-complete' : ''}" aria-labelledby="dj-prep-title">
        <div class="dj-prep__head">
          <div>
            <span class="dj-kicker">Rumo à aprovação</span>
            <h2 id="dj-prep-title">Cuide do corpo e da mente</h2>
            <p>Antes de estudar, marque o que já fez. Corpo e mente preparados sustentam a jornada.</p>
          </div>
          <div class="dj-prep__ring" style="--p:${prepPct}" aria-label="Preparação ${prepDone} de ${prepTotal}">
            <strong>${prepDone}</strong>
            <small>de ${prepTotal}</small>
          </div>
        </div>
        <div class="dj-prep__list" role="group" aria-label="Hábitos de preparação de hoje">
          ${prepRows || '<p class="dj-empty-inline">Nenhum hábito configurado ainda.</p>'}
        </div>
        <div class="dj-prep__foot">
          <span class="dj-prep__status">${prepAllDone
            ? 'Preparação do dia concluída — bom estudo!'
            : prepDone > 0
              ? `Você já cuidou de ${prepDone} prática(s). Continue.`
              : 'Toque para marcar cada preparação antes de estudar.'}</span>
          <button type="button" class="dj-link" id="today-wellbeing">Abrir preparação ${icon('seedling', 'ico--sm')}</button>
        </div>
      </section>

      <section class="dj-card dj-card--day" aria-labelledby="dj-day-title">
        <div class="dj-card__head">
          <span class="dj-card__ico">${icon('flag')}</span>
          <h2 id="dj-day-title">Progresso do dia</h2>
          <strong class="dj-card__badge dj-card__badge--soft">${ringPct}%</strong>
        </div>
        <div class="dj-day-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ringPct}">
          <span style="width:${ringPct}%"></span>
          <i style="left:${ringPct}%"></i>
        </div>
        <div class="dj-day-scale" aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
        <div class="dj-day-stats">
          <div><small>${icon('focus', 'ico--sm')} Batalhas</small><strong>${battlesToday}</strong></div>
          <div><small>${icon('question', 'ico--sm')} Feitas</small><strong>${doneToday}</strong></div>
          <div><small>${icon('chartSteps', 'ico--sm')} Domínio médio</small><strong>${avgAccuracy}%</strong></div>
        </div>
      </section>

      ${mentorHtml}
    </div>`;

  mountPageContainer(root, { variant: 'today' });

  const startReview = async () => {
    try {
      ctx.reviewSession = null;
      navigate('review');
    } catch (error) { toast(error.message || 'Não foi possível iniciar a revisão.'); }
  };
  const startBattle = async () => {
    try {
      if (dailyEnemyDiscId) ctx.disciplineId = dailyEnemyDiscId;
      ctx.battleSession = await createBattleSession(null, { daily: true, endgame: !!player.endgame_mode });
      navigate('battle');
    } catch (error) { toast(error.message || 'Ainda não há questões disponíveis para esta missão.'); }
  };

  const startPrimaryMission = () => {
    SFX.click();
    if (mission.type === 'review') startReview();
    else if (mission.type === 'battle') startBattle();
    else {
      if (dailyEnemyDiscId) {
        ctx.disciplineId = dailyEnemyDiscId;
        navigate('topicTree');
      } else navigate('edital');
    }
  };
  $('#today-primary', root)?.addEventListener('click', startPrimaryMission);
  $('#today-review', root)?.addEventListener('click', () => { SFX.click(); startReview(); });
  root.querySelectorAll('[data-review-go]').forEach((btn) => {
    btn.addEventListener('click', () => { SFX.click(); startReview(); });
  });
  $('#today-routine', root)?.addEventListener('click', () => { SFX.click(); navigate('expedition'); });
  $('#today-exam-date', root)?.addEventListener('click', () => { SFX.click(); navigate('profile'); });
  $('#today-wellbeing', root)?.addEventListener('click', () => { SFX.click(); navigate('wellbeing'); });
  $('#mentor-action', root)?.addEventListener('click', () => {
    SFX.click();
    if (automaticMentor.actionType === 'start_daily_mission') startPrimaryMission();
    else if (automaticMentor.actionType === 'review') navigate('review');
    else if (automaticMentor.actionType === 'performance') navigate('performance');
    else if (automaticMentor.actionType === 'wellbeing') navigate('wellbeing');
    else if (automaticMentor.actionType === 'weak_discipline') {
      ctx.disciplineId = automaticMentor.actionValue || dailyEnemyDiscId;
      navigate('topicTree');
    }
  });
  $('#mentor-read-announcement', root)?.addEventListener('click', () => {
    openAnnouncementModal(officialAnnouncement, {
      player,
      userId: ctx.user?.id,
      navigate,
      onRead: () => $('#mentor-new-indicator', root)?.remove(),
      onDismiss: () => renderHome(root, navigate, ctx),
    });
  });
  root.querySelectorAll('[data-prep-habit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      SFX.click();
      const id = btn.getAttribute('data-prep-habit');
      if (!id) return;
      try {
        await toggleHabit(id);
        // re-render home to refresh prep state
        await renderHome(root, navigate, ctx);
      } catch (error) {
        toast(error.message || 'Não foi possível atualizar o hábito.');
      }
    });
  });

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
