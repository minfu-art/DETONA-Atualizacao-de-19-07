import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProfileEvolutionModel } from '../js/ui/profileEvolutionModel.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(appRoot, '..');

function player(overrides = {}) {
  return {
    name: 'Min Fu', avatar_sprite: 'male', level: 1, mastery_pct: 1,
    edital_completion_pct: 2, xp_level: 3, xp: 40, xp_next_level: 300,
    total_stars: 8, streak_days: 4, best_streak: 12,
    ...overrides,
  };
}

function emblems() {
  return {
    metrics: { missions: 7 },
    emblems: [{ category: 'missions', threshold: 1, earned: true, unlocked_at: '2026-08-01T12:00:00.000Z' }],
    insignias: [{
      category: 'missions', name: 'Missões', description: 'Batalhas oficiais.',
      tiers: [
        { id: 'missions_tier_1', category: 'missions', tier: 1, threshold: 1, name: 'Primeiro Golpe', description: 'Primeira batalha.', criterion: '1 batalha', asset: 'assets/insignias/missions-tier-01.webp', achieved: true },
        { id: 'missions_tier_2', category: 'missions', tier: 2, threshold: 10, name: 'Combatente', description: 'Dez batalhas.', criterion: '10 batalhas', asset: 'assets/insignias/missions-tier-02.webp', achieved: false },
      ],
    }],
  };
}

test('estado inicial usa a primeira forma oficial sem inventar progresso', () => {
  const model = buildProfileEvolutionModel({ player: player({ level: 0, xp: 0, xp_level: 1, mastery_pct: 0 }), emblemState: {} });
  assert.equal(model.current.stageNumber, 1);
  assert.equal(model.current.rawLevel, 0);
  assert.match(model.current.src, /male\/stage-01\.png/);
  assert.equal(model.stats.mastery, 0);
  assert.equal(model.trail.filter((item) => item.isCurrent).length, 1);
});

test('estado intermediário preserva nível, XP, domínio, estrelas e streak independentes', () => {
  const model = buildProfileEvolutionModel({ player: player({ level: 47, mastery_pct: 43, edital_completion_pct: 31 }), emblemState: emblems() });
  assert.equal(model.current.stageNumber, 5);
  assert.equal(model.current.next.threshold, 50);
  assert.equal(model.current.next.current, 47);
  assert.equal(model.xp.level, 3);
  assert.equal(model.xp.total, 340);
  assert.equal(model.stats.mastery, 43);
  assert.equal(model.stats.completion, 31);
  assert.equal(model.stats.stars, 8);
  assert.equal(model.stats.streak, 4);
  assert.equal(model.stats.bestStreak, 12);
  assert.equal(model.stats.battles, 7);
});

test('estado máximo não promete estágio onze', () => {
  const model = buildProfileEvolutionModel({ player: player({ level: 100 }), emblemState: emblems() });
  assert.equal(model.current.stageNumber, 10);
  assert.equal(model.current.next, null);
  assert.equal(model.trail.at(-1).isCurrent, true);
  assert.equal(model.trail.some((item) => item.stageNumber > 10), false);
});

test('trilha masculina e feminina possuem dez artes, estados e mesmo estágio', () => {
  for (const gender of ['male', 'female']) {
    const model = buildProfileEvolutionModel({ player: player({ level: 55, avatar_sprite: gender }) });
    assert.equal(model.trail.length, 10);
    assert.equal(model.current.stageNumber, 6);
    assert.equal(model.trail.filter((item) => item.state === 'achieved').length, 5);
    assert.equal(model.trail.filter((item) => item.state === 'current').length, 1);
    assert.equal(model.trail.filter((item) => item.state === 'locked').length, 4);
    assert.ok(model.trail.every((item) => item.src.includes(`/tiers-v2/${gender}/`)));
  }
});

test('conquistas usam catálogo real, status e data disponível', () => {
  const model = buildProfileEvolutionModel({ player: player(), emblemState: emblems() });
  assert.equal(model.earnedCount, 1);
  assert.equal(model.achievementCount, 2);
  assert.equal(model.achievements[0].tiers[0].status, 'CONQUISTADO');
  assert.equal(model.achievements[0].tiers[1].status, 'BLOQUEADO');
  assert.equal(model.achievements[0].tiers[0].unlockedDate, '2026-08-01T12:00:00.000Z');
});

test('ausências são tratadas sem NaN e nome longo permanece integral', () => {
  const longName = 'Candidata com nome extremamente longo para testar quebra responsiva';
  const model = buildProfileEvolutionModel({ player: {}, user: { name: longName }, contest: { name: 'Concurso '.repeat(15), role: 'Cargo '.repeat(15) } });
  assert.equal(model.identity.name, longName);
  assert.equal(model.stats.level, 0);
  assert.equal(model.stats.mastery, 0);
  assert.equal(Number.isNaN(model.xp.total), false);
});

test('Perfil possui um h1, loading estável, modal acessível e CSS mobile-first', async () => {
  const [ui, css] = await Promise.all([
    readFile(path.join(appRoot, 'js/ui/profile.js'), 'utf8'),
    readFile(path.join(appRoot, 'css/profile-evolution.css'), 'utf8'),
  ]);
  assert.equal((ui.match(/<h1\b/g) || []).length, 1);
  assert.match(ui, /aria-busy/);
  assert.match(ui, /loading="eager"/);
  assert.match(ui, /fetchpriority="high"/);
  assert.match(ui, /loading="lazy"/);
  assert.match(ui, /openModal\('Sua evolução'/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 370px\)/);
  assert.match(css, /overflow-wrap:\s*break-word/);
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(ui, /style=/);
  const fontSizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(fontSizes.some((size) => size < 12), false);
});

test('Perfil, Home e Arena usam a única fonte canônica de avatar', async () => {
  const [profileUi, homeUi, arenaUi] = await Promise.all([
    readFile(path.join(appRoot, 'js/ui/profile.js'), 'utf8'),
    readFile(path.join(appRoot, 'js/ui/home.js'), 'utf8'),
    readFile(path.join(appRoot, 'js/ui/battleArena.js'), 'utf8'),
  ]);
  assert.match(profileUi, /from '\.\/heroAssets\.js'/);
  assert.match(homeUi, /heroImgHtml/);
  assert.match(arenaUi, /heroImgHtml/);
  assert.doesNotMatch(homeUi, /const missionHero = customHero/);
  assert.doesNotMatch(arenaUi, /const battleHero = \(className\) => customHero/);
  assert.doesNotMatch(`${profileUi}${homeUi}${arenaUi}`, /profileStageResolver|homeStageResolver|battleStageResolver/);
});

test('motores acadêmicos e de recompensa permanecem byte-equivalentes', async () => {
  const protectedFiles = {
    'app/js/core/progression.js': '11a61631bdab4ce1e5caf9c75d5b38283449061943c6d12d55aad7069d046517',
    'app/js/core/mastery.js': '385efb23c0cf3f3cdc373209a84b7ef3272984c04ef9c3479f08a5a84759bf28',
    'app/js/core/ssot.js': '86c5065863374b2220de9781c9bde5b6ee16e2f89c3d72fc8cdc15089b7f4dea',
    'app/js/core/battle.js': '631a501ccae04a8d871f431981d04f0faf724d2f7e5207aa9f09b595f8b4eb4a',
    'app/js/services/academicProgressService.js': 'b7c55b15245698f02d1c110aeca067f1a9cb03b5a1489a7b9dd3a5e2bb5d85e2',
    'app/js/services/emblemService.js': 'b7881f6209c97c760c50351aec663db6ba192dd9b94ccb5805b5b7e2137ae103',
    'app/js/services/dailyGoalService.js': 'f4814596c99488daa5b38f44f38d945bac39785a514345fd80306b4e1192804e',
    'app/js/services/studyStreakService.js': '0136320cac36f39663fe849e1b62f1f04e7e8cfdb690715a9ac08de3a06b3dd0',
  };
  for (const [relative, expected] of Object.entries(protectedFiles)) {
    const source = (await readFile(path.join(repositoryRoot, relative), 'utf8')).replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, relative);
  }
});
