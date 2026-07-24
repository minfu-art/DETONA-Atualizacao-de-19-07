import { $, toast, drawRadar, escapeHtml } from './helpers.js';
import { getPlayer } from '../core/seed.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { getRadarStats } from '../core/ssot.js';
import { daysUntilExam, getStage, xpForNextLevel } from '../core/progression.js';
import { saveToKafra, loadFromKafra } from '../core/kafra.js';
import { setMuted, SFX } from '../core/audio.js';
import { EXAM_META } from '../data/editalSeed.js';
import { heroImgHtml, lifetimeXp, rankLabel, getHeroTiers } from './heroAssets.js';
import { EVOLUTION_STAGES } from '../core/progression.js';
import { mountPageContainer, sectionHeader, statsPanel } from './appShell.js';
import { installButtonHtml, bindInstallButtons } from '../core/pwaInstall.js';
import { semanticIcon } from './icons.js?v=66';
import { refreshEmblems } from '../services/emblemService.js';
import { emblemArt } from './emblems/emblemArt.js';

function insigniaProgressPct(progress) {
  const value = Number(progress.progressValue) || 0;
  const next = progress.nextThreshold;
  if (next === null) return 100;
  if (next === 'all') return progress.currentInsignia.achieved ? 100 : 0;
  const start = progress.currentInsignia.achieved
    ? Number(progress.currentInsignia.threshold) || 0
    : 0;
  return Math.max(0, Math.min(100, Math.round(
    ((value - start) / Math.max(1, Number(next) - start)) * 100,
  )));
}

export async function renderProfile(root, navigate, ctx) {
  const player = await getPlayer();
  const [cards, radar, emblemState] = await Promise.all([
    progressRepository.getAll(STORES.mvpCards),
    getRadarStats(),
    refreshEmblems({ daysUntilExam: daysUntilExam(player.exam_date) ?? 120 }),
  ]);
  const stage = getStage(player.level);
  const weak = [...radar].sort((a, b) => a.proficiency - b.proficiency).slice(0, 3);
  const strong = [...radar].sort((a, b) => b.proficiency - a.proficiency).slice(0, 3);
  const totalXp = lifetimeXp(player);
  const rank = rankLabel(player.level, player.edital_completion_pct || 0);

  root.innerHTML = `
    <section class="profile-account" aria-label="Conta global">
      <div class="profile-account__avatar" aria-hidden="true">${escapeHtml((ctx.user?.name || player.name || 'D').charAt(0).toUpperCase())}</div>
      <div><span>Conta DETONA</span><strong>${escapeHtml(ctx.user?.name || player.name)}</strong><small>${escapeHtml(ctx.user?.email || 'Perfil local')}</small></div>
      <button type="button" class="btn btn-ghost" id="pf-library">Minha biblioteca</button>
    </section>
    <div class="ro-window mb-8">
      <div class="ro-title">Evolução nesta jornada</div>
      <div class="ro-body">
        <div class="home-header">
          <div class="avatar-box avatar-box--art ${player.level >= 90 ? 'legend' : ''}">
            ${heroImgHtml({ className: 'hero-img hero-img--profile', level: player.level, sprite: player.avatar_sprite })}
          </div>
          <div class="home-info">
            <div class="home-name">
              ${escapeHtml(player.name)}
              ${player.edital_completion_pct >= 100 ? `<span class="seal-edital">${semanticIcon('achievement', 'ico--inline')} EDITAL DOMINADO</span>` : ''}
            </div>
            <div class="home-class">${stage.title} · Rank ${rank}</div>
            <div class="muted">Nv. ${player.level} · ${totalXp.toLocaleString('pt-BR')} XP total</div>
            <div class="muted mt-8">Edital: ${player.edital_completion_pct?.toFixed(1) || 0}% · ★ ${player.total_stars || 0}</div>
            <div class="muted">Barra de XP: ${player.xp}/${player.xp_next_level || xpForNextLevel(player.xp_level || 1)}</div>
            <div class="muted">Avatar: ${player.avatar_sprite === 'female' ? 'Feminino' : 'Masculino'}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="ro-window mb-8">
      <div class="ro-title">Evolução do Avatar</div>
      <div class="ro-body">
        <p class="muted mb-8">Cadeia ${player.avatar_sprite === 'female' ? 'feminina' : 'masculina'} — avança com o nível acadêmico (XP do edital/questões).</p>
        <div class="evo-gallery">
          ${getHeroTiers(player.avatar_sprite).map((t, i) => {
            const unlocked = player.level >= t.min;
            const active = player.level >= t.min && player.level <= t.max;
            const st = EVOLUTION_STAGES[Math.min(i, EVOLUTION_STAGES.length - 1)];
            const labelMax = t.max;
            return `
              <div class="evo-card ${unlocked ? 'is-unlocked' : 'is-locked'} ${active ? 'is-active' : ''}">
                <img src="${t.file}?v=v57-female-alpha" alt="Lv ${t.min}-${labelMax}" class="evo-thumb" draggable="false" />
                <small>Lv ${t.min}${t.min !== labelMax ? `–${labelMax}` : ''}</small>
                <span>${st ? st.title.split(' ')[0] : ''}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="ro-window mb-8">
      <div class="ro-title">Forças & Fraquezas</div>
      <div class="ro-body">
        <p class="muted mb-8"><strong style="color:var(--ok)">Top</strong>: ${strong.map((s) => s.icon + ' ' + s.proficiency + '%').join(' · ')}</p>
        <p class="muted"><strong style="color:var(--danger)">Foco</strong>: ${weak.map((s) => s.icon + ' ' + s.proficiency + '%').join(' · ')}</p>
        <div class="radar-wrap mt-12"><canvas id="prof-radar"></canvas></div>
      </div>
    </div>

    <div class="ro-window mb-8">
      <div class="ro-title">Galeria de Insígnias</div>
      <div class="ro-body" id="profile-emblems">
        <p class="muted mb-8">Sua evolução em cinco linhas: jornada, constância, missões, foco e domínio.</p>
        <div class="insignia-gallery">
          ${emblemState.insignias.map((progress) => `
            <section class="insignia-line" aria-labelledby="insignia-category-${progress.category}">
              <div class="insignia-line__current">
                ${emblemArt(progress.currentInsignia, { size: 'large', state: 'current' })}
                <div>
                  <small>${escapeHtml(progress.name)}</small>
                  <h3 id="insignia-category-${progress.category}">${escapeHtml(progress.currentInsignia.name)}</h3>
                  <p>${escapeHtml(progress.currentInsignia.description)}</p>
                  <strong>Estágio ${progress.currentTier}/${progress.tiers.length}</strong>
                </div>
              </div>
              <div class="insignia-line__track" aria-label="Linha de evolução de ${escapeHtml(progress.name)}">
                ${progress.tiers.map((tier) => `
                  <article class="insignia-tier is-${tier.state}" aria-current="${tier.state === 'current' ? 'step' : 'false'}">
                    ${emblemArt(tier, { size: 'medium', state: tier.state })}
                    <span>${escapeHtml(tier.name)}</span>
                    <small>${escapeHtml(tier.criterion)}</small>
                  </article>
                `).join('')}
              </div>
              <div class="insignia-line__progress">
                <div class="emblem-progress" aria-label="Progresso atual ${insigniaProgressPct(progress)}%">
                  <span style="width:${insigniaProgressPct(progress)}%"></span>
                </div>
                <small>${progress.nextThreshold === null
                  ? 'Linha concluída'
                  : progress.nextThreshold === 'all'
                    ? 'Próximo: completar todo o edital'
                    : `${Number(progress.progressValue).toLocaleString('pt-BR')} / ${Number(progress.nextThreshold).toLocaleString('pt-BR')}`}</small>
              </div>
            </section>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="ro-window mb-8">
      <div class="ro-title">🃏 Álbum de Cartas MVP</div>
      <div class="ro-body">
        ${cards.length ? `
          <div class="card-grid">
            ${cards.map((c) => `
              <div class="mvp-card">
                <div class="rarity">${c.rarity}</div>
                <div class="enemy">🃏</div>
                <div class="name">${escapeHtml(c.enemy_name)}</div>
              </div>
            `).join('')}
          </div>
        ` : '<p class="muted text-center">Conquiste 5★ em um subtópico para desbloquear uma carta de conquista.</p>'}
      </div>
    </div>

    <div class="ro-window mb-8">
      <div class="ro-title">Instalar aplicativo</div>
      <div class="ro-body">
        <p class="muted mb-8">Coloque o DETONA na tela inicial do celular, tablet ou PC. Ele abrirá como aplicativo.</p>
        ${installButtonHtml({ id: 'btn-install-profile', variant: 'card' })}
        <div class="mt-8">${installButtonHtml({ id: 'btn-install-profile-alt', variant: 'primary', label: 'Instalar no celular ou PC' })}</div>
      </div>
    </div>

    <div class="ro-window mb-8">
      <div class="ro-title">Configurações e backup</div>
      <div class="ro-body">
        <div class="field">
          <label>Data da Prova</label>
          <input type="date" id="pf-exam" value="${player.exam_date || EXAM_META.default_exam_date}" />
        </div>
        <div class="field">
          <label for="pf-sprite">Avatar (sexo visual)</label>
          <select id="pf-sprite">
            <option value="male" ${player.avatar_sprite !== 'female' ? 'selected' : ''}>Avatar masculino</option>
            <option value="female" ${player.avatar_sprite === 'female' ? 'selected' : ''}>Avatar feminino</option>
          </select>
          <small class="muted">A evolução do visual segue o nível acadêmico; não altera XP.</small>
        </div>
        <div class="field">
          <label>
            <input type="checkbox" id="pf-sound" ${player.sound_enabled !== false ? 'checked' : ''} />
            Efeitos sonoros
          </label>
        </div>
        <button type="button" class="btn btn-block mb-8" id="pf-save-cfg">Salvar configs</button>
        <button type="button" class="btn btn-primary btn-block mb-8" id="pf-kafra-save">Baixar backup do progresso</button>
        <label class="btn btn-block mb-8" style="cursor:pointer">
          Restaurar backup
          <input type="file" id="pf-kafra-load" accept=".rpgsave,.json" class="hidden" />
        </label>
        <button type="button" class="btn btn-danger btn-block mb-8" id="pf-logout">Sair desta conta</button>
        <p class="muted text-center">${EXAM_META.name}</p>
      </div>
    </div>
  `;

  mountPageContainer(root, {
    variant: 'profile',
    header: sectionHeader({
      eyebrow: 'Perfil',
      title: 'Perfil',
      subtitle: 'Evolução, desempenho e preferências da sua jornada.',
    }),
    stats: statsPanel([
      { label: 'Nível', value: player.level },
      { label: 'XP total', value: totalXp.toLocaleString('pt-BR') },
      { label: 'Edital', value: `${(player.edital_completion_pct || 0).toFixed(1)}%` },
    ]),
  });

  requestAnimationFrame(() => drawRadar($('#prof-radar', root), radar));

  bindInstallButtons(root);
  if (ctx.profileSection === 'emblems') {
    requestAnimationFrame(() => {
      $('#profile-emblems', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ctx.profileSection = null;
    });
  }

  $('#pf-library', root)?.addEventListener('click', () => navigate('library'));

  $('#pf-save-cfg', root).addEventListener('click', async () => {
    SFX.click();
    player.exam_date = $('#pf-exam', root).value;
    player.sound_enabled = $('#pf-sound', root).checked;
    const sprite = $('#pf-sprite', root)?.value === 'female' ? 'female' : 'male';
    player.avatar_sprite = sprite;
    setMuted(!player.sound_enabled);
    await progressRepository.put(STORES.player, player);
    toast('Configurações salvas');
    navigate('profile');
  });

  $('#pf-kafra-save', root).addEventListener('click', async () => {
    SFX.click();
    await saveToKafra();
    toast('Arquivo .rpgsave exportado!');
  });

  $('#pf-kafra-load', root).addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await loadFromKafra(f);
      SFX.levelUp();
      toast('Progresso restaurado pelo backup.');
      navigate('home');
    } catch (err) {
      toast(err.message || 'Falha ao carregar');
    }
  });

  $('#pf-logout', root).addEventListener('click', async () => {
    await ctx.logout?.();
  });
}
