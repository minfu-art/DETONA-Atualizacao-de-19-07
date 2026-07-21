import { $ } from './helpers.js';
import { EXAM_META } from '../data/editalSeed.js';
import { getPlayer } from '../core/seed.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { SFX } from '../core/audio.js';
import { heroImgHtml, HERO_SRC, HERO_SRC_FEMALE } from './heroAssets.js';

/**
 * @param {(screen: string) => void} navigate
 */
export async function renderOnboarding(root, navigate) {
  let gender = 'male';
  let name = '';
  let examDate = EXAM_META.default_exam_date;

  function previewHero(sprite) {
    return heroImgHtml({ className: 'hero-img hero-img--onboard', level: 1, sprite });
  }

  root.innerHTML = `
    <div class="onboard">
      <div class="onboard-hero" id="ob-hero-preview">
        ${previewHero('male')}
      </div>
      <h1>DETONA<br>CONCURSOS</h1>
      <p class="sub">${EXAM_META.name}<br>${EXAM_META.cargo}</p>

      <div class="ro-window">
        <div class="ro-title">Criação de Personagem</div>
        <div class="ro-body">
          <div class="field">
            <label>Nome do Aventureiro</label>
            <input type="text" id="ob-name" maxlength="24" placeholder="Ex: Agente Silva" />
          </div>
          <div class="field">
            <label>Avatar (Sprite)</label>
            <div class="avatar-pick">
              <div class="avatar-opt selected" data-g="male" role="button" tabindex="0" aria-pressed="true">
                <img class="hero-thumb" src="${HERO_SRC}" alt="Masculino" />
                <div class="muted">Guerreiro</div>
              </div>
              <div class="avatar-opt" data-g="female" role="button" tabindex="0" aria-pressed="false">
                <img class="hero-thumb" src="${HERO_SRC_FEMALE}" alt="Feminino" />
                <div class="muted">Guerreira</div>
              </div>
            </div>
          </div>
          <div class="field">
            <label>Data da prova</label>
            <input type="date" id="ob-date" value="${examDate}" />
          </div>
          <p class="muted mb-8">Classe inicial: <strong style="color:var(--neon-hi)">Aprendiz (Novice)</strong> — evolui só estudando.</p>
          <button type="button" class="btn btn-primary btn-block" id="ob-start">Começar preparação</button>
        </div>
      </div>
    </div>
  `;

  const setGender = (g) => {
    gender = g === 'female' ? 'female' : 'male';
    root.querySelectorAll('.avatar-opt').forEach((o) => {
      const on = o.dataset.g === gender;
      o.classList.toggle('selected', on);
      o.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const box = $('#ob-hero-preview', root);
    if (box) box.innerHTML = previewHero(gender);
  };

  root.querySelectorAll('.avatar-opt').forEach((opt) => {
    const activate = () => {
      SFX.click();
      setGender(opt.dataset.g);
    };
    opt.addEventListener('click', activate);
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  $('#ob-start', root).addEventListener('click', async () => {
    SFX.click();
    name = ($('#ob-name', root).value || '').trim();
    examDate = $('#ob-date', root).value || EXAM_META.default_exam_date;
    if (!name || name.length < 2) {
      $('#ob-name', root).focus();
      return;
    }
    const player = await getPlayer();
    player.name = name;
    player.avatar_sprite = gender;
    player.exam_date = examDate;
    player.onboarded = true;
    await progressRepository.put(STORES.player, player);
    SFX.levelUp();
    navigate('home');
  });
}
