import { $, closeModal, drawRadar, escapeHtml, openModal, toast } from './helpers.js';
import { getPlayer } from '../core/seed.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { getRadarStats } from '../core/ssot.js';
import { daysUntilExam } from '../core/progression.js';
import { saveToKafra, loadFromKafra } from '../core/kafra.js';
import { setMuted, SFX } from '../core/audio.js';
import { EXAM_META } from '../data/editalSeed.js';
import { getHeroTiers, resolveHeroIdentity } from './heroAssets.js';
import { installButtonHtml, bindInstallButtons } from '../core/pwaInstall.js';
import { refreshEmblems } from '../services/emblemService.js';
import { emblemArt } from './emblems/emblemArt.js';
import { buildProfileEvolutionModel, formatUnlockedDate } from './profileEvolutionModel.js';

const number = (value) => Number(value || 0).toLocaleString('pt-BR');
const percent = (value) => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

function stageTrailHtml(model, { modal = false } = {}) {
  return `
    <div class="profile-stage-grid${modal ? ' profile-stage-grid--modal' : ''}" role="list" aria-label="Dez estágios de evolução">
      ${model.trail.map((stage) => `
        <article class="profile-stage-card is-${stage.state}" role="listitem" ${stage.isCurrent ? 'aria-current="step"' : ''}>
          <div class="profile-stage-card__art">
            <img
              src="${stage.src}"
              alt=""
              width="1024"
              height="1024"
              loading="lazy"
              decoding="async"
              draggable="false"
              data-avatar-frame="trail"
              data-profile-stage-image="${stage.stageNumber}"
            />
          </div>
          <div class="profile-stage-card__copy">
            <span>Estágio ${String(stage.stageNumber).padStart(2, '0')}</span>
            <h3>${escapeHtml(stage.title)}</h3>
            <p>${escapeHtml(stage.rangeLabel)}</p>
            <strong>${stage.isCurrent ? 'FORMA ATUAL' : stage.isAchieved ? 'ALCANÇADO' : 'BLOQUEADO'}</strong>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function achievementsHtml(model) {
  if (!model.achievements.length) {
    return '<p class="profile-empty">Sua coleção começa com suas primeiras conquistas.</p>';
  }
  return `
    <div class="profile-achievement-lines">
      ${model.achievements.map((category) => {
        const earned = category.tiers.filter((tier) => tier.achieved).length;
        return `
          <details class="profile-achievement-line" ${earned ? 'open' : ''}>
            <summary>
              <span><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(category.description)}</small></span>
              <b>${earned}/${category.tiers.length}</b>
            </summary>
            <div class="profile-achievement-grid insignia-line__track">
              ${category.tiers.map((tier) => `
                <article class="profile-achievement-card ${tier.achieved ? 'is-earned' : 'is-locked'}">
                  ${emblemArt(tier, { size: 'medium', state: tier.achieved ? 'earned' : 'locked' })}
                  <div>
                    <span>${tier.achieved ? 'CONQUISTADO' : 'BLOQUEADO'}</span>
                    <h3>${escapeHtml(tier.name)}</h3>
                    <p>${escapeHtml(tier.description)}</p>
                    <small>${escapeHtml(tier.criterion)}</small>
                    ${tier.unlockedDate ? `<time datetime="${escapeHtml(tier.unlockedDate)}">${escapeHtml(formatUnlockedDate(tier.unlockedDate))}</time>` : ''}
                  </div>
                </article>
              `).join('')}
            </div>
          </details>
        `;
      }).join('')}
    </div>
  `;
}

function currentHeroHtml(model) {
  return `
    <div class="profile-hero-art" aria-label="Forma atual do personagem">
      <div class="profile-hero-art__halo" aria-hidden="true"></div>
      <div class="profile-hero-art__pedestal" aria-hidden="true"></div>
      <img
        class="profile-hero-art__image"
        src="${model.current.src}"
        alt="${escapeHtml(model.current.alt)}"
        width="1024"
        height="1024"
        loading="eager"
        fetchpriority="high"
        decoding="async"
        draggable="false"
        data-avatar-frame="profile"
        data-profile-current-hero
        data-hero-sprite="${model.identity.sprite}"
        data-hero-stage="${model.current.stageNumber}"
      />
    </div>
  `;
}

function statCard(label, value, note = '') {
  return `<article class="profile-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
}

export async function renderProfile(root, navigate, ctx) {
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = `
    <div class="profile-evolution-page">
      <div class="profile-loading" role="status" aria-live="polite">
        <span aria-hidden="true"></span>
        <p>Preparando sua central de evolução…</p>
      </div>
    </div>
  `;

  const player = await getPlayer();
  const [cards, radar, emblemState] = await Promise.all([
    progressRepository.getAll(STORES.mvpCards),
    getRadarStats(),
    refreshEmblems({ daysUntilExam: daysUntilExam(player.exam_date) ?? 120 }),
  ]);
  const model = buildProfileEvolutionModel({ player, user: ctx.user, contest: ctx.contest, emblemState });
  const weak = [...radar].sort((a, b) => a.proficiency - b.proficiency).slice(0, 3);
  const strong = [...radar].sort((a, b) => b.proficiency - a.proficiency).slice(0, 3);

  root.innerHTML = `
    <div class="profile-evolution-page">
    <header class="profile-page-heading">
      <div>
        <span class="profile-eyebrow">CENTRAL DO CANDIDATO</span>
        <h1>Minha evolução</h1>
        <p>Identidade, progresso e conquistas da sua preparação.</p>
      </div>
      <button type="button" class="ds-button ds-button--secondary" id="pf-library">Minha biblioteca</button>
    </header>

    <section class="profile-identity" aria-labelledby="profile-identity-title">
      <div class="profile-identity__copy">
        <span class="profile-kicker">IDENTIDADE DO ALUNO</span>
        <h2 id="profile-identity-title">${escapeHtml(model.identity.name)}</h2>
        <p class="profile-identity__journey">${escapeHtml(model.identity.contest)}</p>
        ${model.identity.role ? `<p class="profile-identity__role">${escapeHtml(model.identity.role)}</p>` : ''}

        <div class="profile-current-form" aria-label="Forma atual">
          <span>FORMA ATUAL</span>
          <strong>${escapeHtml(model.current.title)}</strong>
          <p>Estágio ${String(model.current.stageNumber).padStart(2, '0')} / ${model.current.stageCount} · Nível acadêmico ${model.current.rawLevel}</p>
        </div>

        <div class="profile-next-form">
          ${model.current.next ? `
            <div><span>PRÓXIMA EVOLUÇÃO</span><strong>Estágio ${String(model.current.next.stageNumber).padStart(2, '0')}</strong></div>
            <progress value="${model.current.next.current}" max="${model.current.next.threshold}" aria-label="Progresso para o próximo estágio"></progress>
            <p>${model.current.next.current} / ${model.current.next.threshold} em nível acadêmico</p>
          ` : `
            <div><span>FORMA MÁXIMA ATUAL</span><strong>Estágio 10</strong></div>
            <progress value="100" max="100" aria-label="Forma máxima alcançada"></progress>
            <p>Você alcançou o estágio máximo de evolução disponível.</p>
          `}
        </div>

        <fieldset class="profile-gender" aria-label="Aparência do personagem">
          <legend>APARÊNCIA DO PERSONAGEM</legend>
          <button type="button" data-profile-gender="male" aria-pressed="${model.identity.sprite === 'male'}">Masculino</button>
          <button type="button" data-profile-gender="female" aria-pressed="${model.identity.sprite === 'female'}">Feminino</button>
          <p id="profile-gender-status" role="status" aria-live="polite">Troca apenas a aparência; seu progresso é preservado.</p>
        </fieldset>
      </div>
      ${currentHeroHtml(model)}
    </section>

    <section class="profile-section profile-progress" aria-labelledby="profile-progress-title">
      <div class="profile-section-heading">
        <div><span class="profile-kicker">PROGRESSÃO</span><h2 id="profile-progress-title">Seu avanço real</h2></div>
        <span class="profile-rank">Rank ${escapeHtml(model.identity.rank)}</span>
      </div>
      <div class="profile-xp-card">
        <div><span>XP TOTAL</span><strong>${number(model.xp.total)} XP</strong></div>
        <div class="profile-xp-card__level"><span>NÍVEL DE XP ${model.xp.level}</span><strong>${number(model.xp.current)} / ${number(model.xp.next)} XP</strong></div>
        <progress value="${model.xp.current}" max="${model.xp.next}" aria-label="Progresso de XP para o próximo nível"></progress>
      </div>
      <div class="profile-stats" aria-label="Estatísticas reais do perfil">
        ${statCard('Domínio', percent(model.stats.mastery), 'Métrica acadêmica')}
        ${statCard('Conclusão do edital', percent(model.stats.completion), 'Conteúdo concluído')}
        ${statCard('Sequência atual', `${number(model.stats.streak)} dias`)}
        ${statCard('Melhor sequência', `${number(model.stats.bestStreak)} dias`)}
        ${statCard('Estrelas', number(model.stats.stars), 'Desempenho por subtópico')}
        ${statCard('Batalhas', number(model.stats.battles), 'Oficiais concluídas')}
      </div>
    </section>

    <section class="profile-section profile-evolution" aria-labelledby="profile-evolution-title">
      <div class="profile-section-heading">
        <div><span class="profile-kicker">10 FORMAS OFICIAIS</span><h2 id="profile-evolution-title">Sua evolução</h2></div>
        <p>As formas anteriores registram sua trajetória; as próximas mostram o caminho.</p>
      </div>
      <div class="profile-evolution__desktop">${stageTrailHtml(model)}</div>
      <div class="profile-evolution__mobile">
        <div class="profile-mobile-stage-pair">
          ${stageTrailHtml({ ...model, trail: model.trail.filter((stage) => stage.isCurrent || stage.stageNumber === model.current.stageNumber + 1) })}
        </div>
        <button type="button" class="ds-button ds-button--primary" id="profile-open-evolution" aria-haspopup="dialog">Ver toda evolução</button>
      </div>
    </section>

    <section class="profile-section profile-achievements" id="profile-emblems" aria-labelledby="profile-achievements-title">
      <div class="profile-section-heading">
        <div><span class="profile-kicker">CONQUISTAS</span><h2 id="profile-achievements-title">Insígnias da jornada</h2></div>
        <p>${model.earnedCount} de ${model.achievementCount} conquistadas</p>
      </div>
      ${model.earnedCount === 0 ? '<p class="profile-empty">Sua coleção começa com suas primeiras conquistas.</p>' : ''}
      ${achievementsHtml(model)}
      <div class="profile-mvp">
        <h3>Cartas MVP</h3>
        ${cards.length ? `<div class="profile-mvp__grid">${cards.map((card) => `
          <article><span>${escapeHtml(card.rarity)}</span><strong>${escapeHtml(card.enemy_name)}</strong></article>
        `).join('')}</div>` : '<p class="profile-empty">Conquiste 5 estrelas em um subtópico para desbloquear uma carta de conquista.</p>'}
      </div>
    </section>

    <section class="profile-section profile-insight" aria-labelledby="profile-insight-title">
      <div class="profile-section-heading">
        <div><span class="profile-kicker">LEITURA DA JORNADA</span><h2 id="profile-insight-title">Forças e pontos de atenção</h2></div>
        <p>Resumo do estado acadêmico; análises detalhadas continuam em Desempenho.</p>
      </div>
      <div class="profile-insight__grid">
        <div class="profile-insight__list">
          <article><span>MAIORES DOMÍNIOS</span><p>${strong.length ? strong.map((item) => `${item.icon} ${item.proficiency}%`).join(' · ') : 'Ainda sem dados suficientes.'}</p></article>
          <article><span>PONTOS DE ATENÇÃO</span><p>${weak.length ? weak.map((item) => `${item.icon} ${item.proficiency}%`).join(' · ') : 'Ainda sem dados suficientes.'}</p></article>
        </div>
        <div class="profile-radar"><canvas id="prof-radar" aria-label="Radar resumido de domínio por disciplina"></canvas></div>
      </div>
    </section>

    <section class="profile-section profile-settings" aria-labelledby="profile-settings-title">
      <div class="profile-section-heading">
        <div><span class="profile-kicker">CONTA E PREFERÊNCIAS</span><h2 id="profile-settings-title">Configurações e backup</h2></div>
        <p>Dados da conta e segurança ficam separados da sua evolução.</p>
      </div>
      <div class="profile-settings__account">
        <span class="profile-account-letter" aria-hidden="true">${escapeHtml(model.identity.name.charAt(0).toUpperCase())}</span>
        <div><strong>${escapeHtml(model.identity.name)}</strong><span>${escapeHtml(ctx.user?.email || 'Perfil local')}</span></div>
      </div>
      <div class="profile-settings__grid">
        <div class="field"><label for="pf-exam">Data da prova</label><input type="date" id="pf-exam" value="${escapeHtml(player.exam_date || EXAM_META.default_exam_date)}" /></div>
        <label class="profile-sound"><input type="checkbox" id="pf-sound" ${player.sound_enabled !== false ? 'checked' : ''} /><span>Efeitos sonoros</span></label>
      </div>
      <div class="profile-settings__actions">
        <button type="button" class="ds-button ds-button--primary" id="pf-save-cfg">Salvar preferências</button>
        <button type="button" class="ds-button ds-button--secondary" id="pf-kafra-save">Baixar backup</button>
        <label class="ds-button ds-button--secondary profile-file-button">Restaurar backup<input type="file" id="pf-kafra-load" accept=".rpgsave,.json" /></label>
        ${installButtonHtml({ id: 'btn-install-profile', variant: 'primary', label: 'Instalar aplicativo' })}
        <button type="button" class="ds-button profile-logout" id="pf-logout">Sair desta conta</button>
      </div>
    </section>
    </div>
  `;
  root.setAttribute('aria-busy', 'false');

  requestAnimationFrame(() => drawRadar($('#prof-radar', root), radar));
  bindInstallButtons(root);
  if (ctx.profileSection === 'emblems') {
    requestAnimationFrame(() => $('#profile-emblems', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    ctx.profileSection = null;
  }

  $('#pf-library', root)?.addEventListener('click', () => navigate('library'));
  $('#profile-open-evolution', root)?.addEventListener('click', () => {
    const modal = openModal('Sua evolução', stageTrailHtml(model, { modal: true }), '', { variant: 'default' });
    modal.querySelector('.ds-modal')?.classList.add('profile-evolution-modal');
  });

  root.querySelectorAll('[data-profile-gender]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextSprite = button.dataset.profileGender === 'female' ? 'female' : 'male';
      if (nextSprite === player.avatar_sprite) return;
      const previousSprite = player.avatar_sprite;
      const status = $('#profile-gender-status', root);
      root.querySelectorAll('[data-profile-gender]').forEach((item) => {
        item.disabled = true;
        item.setAttribute('aria-pressed', String(item.dataset.profileGender === nextSprite));
      });
      const applyVisual = (sprite) => {
        const current = resolveHeroIdentity(player.level, sprite);
        const mainImage = $('[data-profile-current-hero]', root);
        if (mainImage) {
          mainImage.src = current.src;
          mainImage.dataset.heroSprite = current.gender;
        }
        const tiers = getHeroTiers(sprite);
        root.querySelectorAll('[data-profile-stage-image]').forEach((image) => {
          const tier = tiers[Number(image.dataset.profileStageImage) - 1];
          if (tier) image.src = resolveHeroIdentity(tier.min, sprite).src;
        });
      };
      player.avatar_sprite = nextSprite;
      applyVisual(nextSprite);
      if (status) status.textContent = 'Salvando aparência…';
      try {
        await progressRepository.put(STORES.player, player);
        if (status) status.textContent = 'Aparência atualizada. Todo o progresso foi preservado.';
      } catch (error) {
        player.avatar_sprite = previousSprite;
        applyVisual(previousSprite);
        root.querySelectorAll('[data-profile-gender]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.profileGender === previousSprite)));
        if (status) status.textContent = 'Não foi possível salvar a aparência.';
        toast('Falha ao atualizar a aparência');
      } finally {
        root.querySelectorAll('[data-profile-gender]').forEach((item) => { item.disabled = false; });
      }
    });
  });

  $('#pf-save-cfg', root)?.addEventListener('click', async () => {
    SFX.click();
    player.exam_date = $('#pf-exam', root).value;
    player.sound_enabled = $('#pf-sound', root).checked;
    setMuted(!player.sound_enabled);
    await progressRepository.put(STORES.player, player);
    toast('Preferências salvas');
  });

  $('#pf-kafra-save', root)?.addEventListener('click', async () => {
    SFX.click();
    await saveToKafra();
    toast('Backup exportado');
  });

  $('#pf-kafra-load', root)?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await loadFromKafra(file);
      SFX.levelUp();
      toast('Progresso restaurado pelo backup.');
      closeModal();
      navigate('home');
    } catch (error) {
      toast(error.message || 'Falha ao carregar');
    }
  });

  $('#pf-logout', root)?.addEventListener('click', async () => ctx.logout?.());
}
