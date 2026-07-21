import { $, escapeHtml } from './helpers.js';
import { getPlayer } from '../core/seed.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { SFX } from '../core/audio.js';
import { applyXp } from '../core/progression.js';
import { heroImgHtml } from './heroAssets.js';
import { semanticIcon } from './icons.js?v=66';

export async function renderCelebration(root, navigate) {
  const player = await getPlayer();
  SFX.levelUp();
  setTimeout(() => SFX.win(), 400);

  root.innerHTML = `
    <div class="celebration" id="celeb">
      <div class="fireworks" id="fw"></div>
      <div class="big-avatar" style="height:160px;display:flex;align-items:flex-end;justify-content:center">
        ${heroImgHtml({ className: 'hero-img hero-aura-legend', level: 100, sprite: player?.avatar_sprite })}
      </div>
      <h1>EDITAL DOMINADO</h1>
      <p style="font-family:var(--pixel);font-size:10px;color:#fff;line-height:1.8;margin-bottom:12px">
        EDITAL 100% DOMINADO
      </p>
      <p style="color:var(--gold-bright);font-size:14px;margin-bottom:8px">
        ${escapeHtml(player?.name || 'Estudante')}
      </p>
      <p style="font-family:var(--pixel);font-size:9px;color:var(--gold);line-height:1.7">
        PREPARAÇÃO CONCLUÍDA
      </p>
      <p class="muted" style="margin:16px 24px;max-width:320px;line-height:1.5">
        O app entra em <strong>modo de manutenção</strong>.
        As questões diárias passam a priorizar conteúdos com memória morna ou fria.
      </p>
      <span class="seal-edital" style="font-size:9px;padding:6px 10px">${semanticIcon('achievement', 'ico--inline')} EDITAL DOMINADO</span>
      <button type="button" class="btn btn-primary mt-12" id="celeb-ok" style="margin-top:24px">Continuar estudando</button>
    </div>
  `;

  // fireworks particles
  const fw = $('#fw', root);
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'fw';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 60 + 10 + '%';
    p.style.background = ['#f0c040', '#ff6688', '#66ccff', '#88ff88', '#fff'][i % 5];
    p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    p.style.setProperty('--dy', (Math.random() * -100 - 20) + 'px');
    p.style.animationDelay = (Math.random() * 1.2) + 's';
    fw.appendChild(p);
  }

  player.celebration_shown = true;
  player._pending_celebration = false;
  player.endgame_mode = true;
  player.edital_completion_pct = 100;
  // Libera trava da Lenda: consome XP acumulado no Nv 90
  applyXp(player, 0);
    await progressRepository.put(STORES.player, player);

  $('#celeb-ok', root).addEventListener('click', () => {
    SFX.click();
    navigate('home');
  });
}
