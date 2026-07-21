/**
 * Árvore de subtópicos de uma disciplina (tópico principal).
 * O jogador avança nó a nó conquistando estrelas.
 */
import { $, starsHtml, formatStars, openModal, closeModal, toast, escapeHtml } from './helpers.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { MIN_QUESTIONS_BATTLE, getQuestionCounts } from '../core/ssot.js';
import { tempLabel, effectiveStars, computeMemoryTemperature } from '../core/memory.js';
import { createBattleSession } from '../core/battle.js?v=69';
import { SFX } from '../core/audio.js';
import { enemyImgHtml } from './enemyAssets.js';
import { icon, discIcon } from './icons.js?v=67';
import { KNOWLEDGE_BLOCKS } from '../data/editalSeed.js?v=68';
import { averageSubtopicMastery } from '../core/mastery.js';
import { isDeveloperUser } from '../auth/authService.js';

/** Estrelas mínimas no nó anterior para desbloquear o próximo */
const STARS_TO_UNLOCK_NEXT = 1;

function shortLabel(id) {
  return (
    KNOWLEDGE_BLOCKS.gerais.labels[id]
    || KNOWLEDGE_BLOCKS.especificos.labels[id]
    || null
  );
}

/**
 * @param {HTMLElement} root
 * @param {(s:string)=>void} navigate
 * @param {{ disciplineId?: string, battleSession?: any }} ctx
 */
export async function renderTopicTree(root, navigate, ctx) {
  const developer = isDeveloperUser(ctx?.user);
  const discId = ctx.disciplineId;
  if (!discId) {
    navigate('home');
    return;
  }

  const [discipline, allSubs, counts] = await Promise.all([
    progressRepository.getById(STORES.disciplines, discId),
    progressRepository.getAll(STORES.subtopics),
    getQuestionCounts(),
  ]);

  if (!discipline) {
    toast('Disciplina não encontrada');
    navigate('home');
    return;
  }

  const subs = allSubs
    .filter((s) => s.discipline_id === discId)
    .sort((a, b) =>
      String(a.edital_numbering).localeCompare(String(b.edital_numbering), undefined, { numeric: true })
    );

  // Progressão linear: nó i desbloqueado se i===0 ou nó i-1 tem estrelas >= STARS_TO_UNLOCK_NEXT
  const nodes = subs.map((s, i) => {
    const prev = i > 0 ? subs[i - 1] : null;
    const prevStars = prev ? effectiveStars(prev) : STARS_TO_UNLOCK_NEXT;
    const unlocked = i === 0 || prevStars >= STARS_TO_UNLOCK_NEXT;
    const stars = effectiveStars(s);
    const nq = counts[s.id] || 0;
    const armed = nq >= MIN_QUESTIONS_BATTLE;
    const temp = s.memory_temperature || computeMemoryTemperature(s.last_studied_at);
    const mastered = stars >= 3;
    return { sub: s, unlocked, stars, nq, armed, temp, mastered, index: i };
  });

  const cleared = nodes.filter((n) => n.mastered).length;
  const totalStars = nodes.reduce((a, n) => a + n.stars, 0);
  const maxStars = nodes.length * 5;
  const title = shortLabel(discId) || discipline.name;
  const pct = Math.round(averageSubtopicMastery(subs) * 100) / 100;

  root.innerHTML = `
    <div class="tree-screen">
      <div class="ro-window mb-8">
        <div class="ro-title">${discIcon(discId, 'ico--inline')} ${escapeHtml(title)}</div>
        <div class="ro-body">
          <p class="muted mb-8">${escapeHtml(discipline.biome || discipline.name)} · avance na trilha conquistando estrelas</p>
          <div class="tree-stats">
            <div>
              <small>Nós dominados (3★+)</small>
              <strong>${cleared}/${nodes.length}</strong>
            </div>
            <div>
              <small>Estrelas</small>
              <strong>★ ${totalStars}/${maxStars}</strong>
            </div>
            <div>
              <small>Progresso</small>
              <strong>${pct}%</strong>
            </div>
          </div>
          <div class="dash-bar-track dash-bar-track--tall mt-8">
            <div class="dash-bar-fill dash-bar-fill--xp" style="width:${pct}%"></div>
          </div>
        </div>
      </div>

      <div class="tree-path">
        ${nodes.map((n, i) => {
          const next = nodes[i + 1];
          const lineDone = n.mastered;
          return `
            <div class="tree-step ${n.unlocked ? 'is-unlocked' : 'is-locked'} ${n.mastered ? 'is-mastered' : ''} ${n.temp}" data-sid="${n.sub.id}">
              ${i > 0 ? `<div class="tree-connector ${lineDone || (nodes[i - 1]?.mastered) ? 'is-lit' : ''}"></div>` : ''}
              <button type="button" class="tree-node ${n.unlocked ? '' : 'locked'}" data-sid="${n.sub.id}" ${n.unlocked ? '' : 'disabled'}>
                <div class="tree-node-art">
                  ${n.unlocked
                    ? enemyImgHtml(n.sub.enemy_sprite, { size: 'md' })
                    : `<span class="tree-lock">${icon('lock', 'ico--control')}</span>`}
                  ${n.mastered ? '<span class="tree-badge-ok">✓</span>' : ''}
                </div>
                <div class="tree-node-body">
                  <span class="tree-num">${escapeHtml(n.sub.edital_numbering)}</span>
                  <strong class="tree-name">${escapeHtml(shortName(n.sub.name))}</strong>
                  <div class="tree-stars">${n.unlocked ? starsHtml(n.stars) : '★★★★★'.replace(/★/g, '☆')}</div>
                  <small class="muted">
                    ${n.unlocked
                      ? `${tempLabel(n.temp)} · ${n.nq}q ${n.armed ? '' : '· desarmado'}`
                      : `Precisa de ${STARS_TO_UNLOCK_NEXT}★ no nó anterior`}
                  </small>
                </div>
                <span class="tree-chevron">${n.unlocked ? semanticIcon('focus', 'ico--inline') : ''}</span>
              </button>
              ${next ? '' : '<div class="tree-end">🏁 Fim da trilha</div>'}
            </div>
          `;
        }).join('') || '<p class="muted text-center">Nenhum subtópico nesta disciplina.</p>'}
      </div>

      <div class="row gap-8 mt-12">
        <button type="button" class="btn btn-block" id="tree-back">← Edital</button>
        <button type="button" class="btn btn-block" id="tree-map">Mapa geral</button>
      </div>
    </div>
  `;

  $('#tree-back', root)?.addEventListener('click', () => {
    SFX.click();
    navigate('home');
  });
  $('#tree-map', root)?.addEventListener('click', () => {
    SFX.click();
    navigate('map');
  });

  root.querySelectorAll('.tree-node:not(.locked)').forEach((btn) => {
    btn.addEventListener('click', () => {
      SFX.click();
      openPrep(btn.dataset.sid);
    });
  });

  async function openPrep(sid) {
    const node = nodes.find((n) => n.sub.id === sid);
    if (!node || !node.unlocked) {
      toast('Nó bloqueado — conquiste estrelas no anterior');
      return;
    }
    const sub = node.sub;
    openModal(
      'Preparação para questões',
      `
        <div class="prep-enemy">${enemyImgHtml(sub.enemy_sprite, { size: 'lg' })}</div>
        <p class="text-center prep-enemy-name">${escapeHtml(sub.enemy_name)}</p>
        <p class="muted text-center mb-8">${escapeHtml(sub.name)}</p>
        <div class="mastery-stars-result">
          <strong>Melhor resultado</strong>
          ${starsHtml(node.stars)}
          <small>${formatStars(node.stars)} / 5 estrelas · ${sub.best_accuracy || 0}%</small>
        </div>
        <p class="muted text-center mt-8">Tentativas: ${sub.attempts_count || 0} · Questões: ${node.nq}</p>
        ${!node.armed ? `<p class="text-center mt-8" style="color:var(--warn)">${developer
          ? `Precisa de ${MIN_QUESTIONS_BATTLE} questões. Abra a Central de questões para completar o banco.`
          : 'Conteúdo em preparação — novas questões serão liberadas pela equipe.'}</p>` : ''}
        ${node.mastered ? '<p class="text-center mt-8" style="color:var(--ok)">Subtópico dominado (3★+) — continue praticando para consolidar</p>' : ''}
      `,
      `
        <button type="button" class="btn btn-ghost" id="m-close">Fechar</button>
        ${node.armed
          ? `<button type="button" class="btn btn-primary" id="m-fight">${semanticIcon('focus', 'ico--inline')} Iniciar questões</button>`
          : developer
            ? `<button type="button" class="btn btn-primary" id="m-forge">Central de questões</button>`
            : ''}
      `
    );

    $('#m-close')?.addEventListener('click', () => { SFX.click(); closeModal(); });
    $('#m-forge')?.addEventListener('click', () => {
      SFX.click();
      closeModal();
      navigate('forge');
    });
    $('#m-fight')?.addEventListener('click', async () => {
      SFX.click();
      const btn = $('#m-fight');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Carregando questões…';
      }
      try {
        const session = await createBattleSession(sid);
        if (!session?.questions?.length) {
          throw new Error('Não foi possível montar o desafio com questões deste subtópico.');
        }
        ctx.battleSession = session;
        ctx.returnToTree = discId;
        closeModal();
        navigate('battle');
      } catch (e) {
        toast(e.message || 'Falha ao iniciar as questões.');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `${semanticIcon('focus', 'ico--inline')} Iniciar questões`;
        }
      }
    });
  }
}

function shortName(n) {
  return n.length > 42 ? n.slice(0, 40) + '…' : n;
}
