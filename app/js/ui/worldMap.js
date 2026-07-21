import { $, starsHtml, formatStars, openModal, closeModal, toast, escapeHtml } from './helpers.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { MIN_QUESTIONS_BATTLE, getQuestionCounts } from '../core/ssot.js';
import { tempLabel, effectiveStars, computeMemoryTemperature } from '../core/memory.js';
import { createBattleSession } from '../core/battle.js?v=68';
import { SFX } from '../core/audio.js';
import { enemyImgHtml } from './enemyAssets.js';
import { icon, semanticIcon } from './icons.js?v=66';
import { averageSubtopicMastery } from '../core/mastery.js';
import { isDeveloperUser } from '../auth/authService.js';

export async function renderWorldMap(root, navigate, ctx) {
  const developer = isDeveloperUser(ctx?.user);
  const [disciplines, subtopics] = await Promise.all([
    progressRepository.getAll(STORES.disciplines),
    progressRepository.getAll(STORES.subtopics),
  ]);
  const counts = await getQuestionCounts();
  disciplines.sort((a, b) => a.order - b.order);

  // O mapa sempre começa na visão geral; a disciplina só abre por escolha do aluno.
  let openId = null;

  root.innerHTML = `
    <div class="ro-window mb-8 map-screen">
      <div class="ro-title">${icon('map', 'ico--inline')} Mapa do edital</div>
      <div class="ro-body">
        <p class="muted mb-8">Escolha uma disciplina para abrir sua trilha. Cada ponto mostra domínio, memória e prontidão para praticar.</p>
        <div id="map-biomes"></div>
      </div>
    </div>
  `;

  const container = $('#map-biomes', root);

  function paint() {
    container.innerHTML = disciplines.map((d) => {
      const subs = subtopics
        .filter((s) => s.discipline_id === d.id)
        .sort((a, b) => String(a.edital_numbering).localeCompare(String(b.edital_numbering), undefined, { numeric: true }));
      const done = subs.filter((s) => effectiveStars(s) >= 3).length;
      const mastery = Math.round(averageSubtopicMastery(subs) * 100) / 100;
      const isOpen = openId === d.id;
      return `
        <div class="biome ro-window ${isOpen ? 'open' : ''}" data-id="${d.id}" style="margin-bottom:10px">
          <div class="biome-header">
            <span class="biome-header__icon" aria-hidden="true">${semanticIcon('discipline', 'ico--inline')}</span>
            <h3>${escapeHtml(d.name)}</h3>
            <span class="badge">${mastery}% · ${done}/${subs.length}</span>
            <span class="biome-header__chevron" aria-hidden="true">${icon(isOpen ? 'chevronDown' : 'chevronRight', 'ico--control')}</span>
          </div>
          <div class="trail">
            ${subs.map((s) => {
              const temp = s.memory_temperature || computeMemoryTemperature(s.last_studied_at);
              const st = effectiveStars(s);
              const nq = counts[s.id] || 0;
              return `
                <div class="trail-node ${temp}" data-sid="${s.id}">
                  <div class="enemy-ico enemy-ico--art">${enemyImgHtml(s.enemy_sprite, { size: 'sm' })}</div>
                  <div class="meta">
                    <strong>${s.edital_numbering} · ${shortName(s.name)}</strong>
                    <small>${starsHtml(st)} · ${tempLabel(temp)} · ${nq}q</small>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.biome-header').forEach((h) => {
      h.addEventListener('click', () => {
        SFX.click();
        const id = h.closest('.biome').dataset.id;
        openId = openId === id ? null : id;
        paint();
      });
    });

    container.querySelectorAll('.trail-node').forEach((node) => {
      node.addEventListener('click', () => {
        SFX.click();
        openPrep(node.dataset.sid);
      });
    });
  }

  async function openPrep(sid) {
    const sub = subtopics.find((s) => s.id === sid);
    if (!sub) return;
    const nq = counts[sid] || 0;
    const armed = nq >= MIN_QUESTIONS_BATTLE;
    const temp = sub.memory_temperature || computeMemoryTemperature(sub.last_studied_at);
    const st = effectiveStars(sub);

    openModal(
      'Preparação para questões',
      `
        <div class="prep-enemy">${enemyImgHtml(sub.enemy_sprite, { size: 'lg' })}</div>
        <p class="text-center prep-enemy-name">${escapeHtml(sub.name)}</p>
        <p class="muted text-center mb-8">Desafio: ${escapeHtml(sub.enemy_name)}</p>
        <div class="bar-label"><span>Melhor acurácia</span><span>${sub.best_accuracy || 0}%</span></div>
        <div class="bar-track mb-8"><div class="bar-fill xp" style="width:${sub.best_accuracy || 0}%"></div></div>
        <div class="mastery-stars-result">
          <strong>Melhor resultado</strong>
          ${starsHtml(st)}
          <small>${formatStars(st)} / 5 estrelas · ${tempLabel(temp)}</small>
        </div>
        <p class="muted text-center mt-8">Tentativas: ${sub.attempts_count || 0} · Questões: ${nq}</p>
        ${!armed ? `<p class="text-center mt-8" style="color:var(--warn)">${developer
          ? `Precisa de ${MIN_QUESTIONS_BATTLE} questões. Abra a Central de questões para completar o banco.`
          : 'Conteúdo em preparação — novas questões serão liberadas pela equipe.'}</p>` : ''}
      `,
      `
        <button type="button" class="btn btn-ghost" id="m-close">Fechar</button>
        ${armed
          ? `<button type="button" class="btn btn-primary" id="m-fight">${semanticIcon('focus', 'ico--inline')} Iniciar questões</button>`
          : developer
            ? `<button type="button" class="btn btn-primary" id="m-forge">Central de questões</button>`
            : ''}
      `
    );

    $('#m-close')?.addEventListener('click', () => { SFX.click(); closeModal(); });
    $('#m-forge')?.addEventListener('click', () => { SFX.click(); closeModal(); navigate('forge'); });
    $('#m-fight')?.addEventListener('click', async () => {
      SFX.click();
      try {
        const session = await createBattleSession(sid);
        ctx.battleSession = session;
        closeModal();
        navigate('battle');
      } catch (e) {
        toast(e.message);
      }
    });
  }

  paint();
}

function shortName(n) {
  return n.length > 36 ? n.slice(0, 34) + '…' : n;
}
