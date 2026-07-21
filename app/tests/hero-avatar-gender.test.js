/**
 * Avatar principal: cadeia masculina e feminina por nível (sem flip).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getHeroTier,
  getHeroTiers,
  heroSrcForLevel,
  heroImgHtml,
  HERO_TIERS_MALE,
  HERO_TIERS_FEMALE,
  normalizeSprite,
} from '../js/ui/heroAssets.js';

test('normalizeSprite só aceita male/female', () => {
  assert.equal(normalizeSprite('female'), 'female');
  assert.equal(normalizeSprite('male'), 'male');
  assert.equal(normalizeSprite(undefined), 'male');
  assert.equal(normalizeSprite('other'), 'male');
});

test('cadeia feminina cobre 1–100 sem buracos e usa pasta female/', () => {
  const tiers = getHeroTiers('female');
  assert.equal(tiers, HERO_TIERS_FEMALE);
  assert.ok(tiers.length >= 9);
  for (let lv = 1; lv <= 100; lv++) {
    const t = getHeroTier(lv, 'female');
    assert.ok(t, `nível ${lv}`);
    assert.ok(lv >= t.min && lv <= t.max);
    assert.ok(t.file.includes('/female/'), t.file);
  }
});

test('cadeia masculina permanece na pasta tiers/', () => {
  for (let lv = 1; lv <= 100; lv++) {
    const t = getHeroTier(lv, 'male');
    assert.ok(t.file.includes('assets/hero/tiers/'));
    assert.ok(!t.file.includes('/female/'));
  }
  assert.equal(getHeroTiers('male'), HERO_TIERS_MALE);
});

test('faixas femininas: 70–89 unificado e 100 exclusivo', () => {
  const t70 = getHeroTier(70, 'female');
  const t85 = getHeroTier(85, 'female');
  const t99 = getHeroTier(99, 'female');
  const t100 = getHeroTier(100, 'female');
  assert.equal(t70.key, 'f-70-89');
  assert.equal(t85.key, 'f-70-89');
  assert.equal(t70.file, t85.file);
  assert.equal(t99.key, 'f-90-99');
  assert.equal(t100.key, 'f-100');
  assert.ok(t100.file.endsWith('tier-100.png'));
  assert.notEqual(t99.file, t100.file);
});

test('masculino 70–79 e 80–89 são artes distintas', () => {
  const a = getHeroTier(75, 'male');
  const b = getHeroTier(85, 'male');
  assert.notEqual(a.file, b.file);
});

test('heroSrcForLevel e heroImgHtml usam sprite feminino sem flip', () => {
  const src = heroSrcForLevel(15, 'female');
  assert.ok(src.includes('female/tier-10-19.png'));
  const html = heroImgHtml({ level: 15, sprite: 'female' });
  assert.ok(html.includes('female/tier-10-19.png'));
  assert.ok(html.includes('data-hero-sprite="female"'));
  assert.ok(!html.includes('hero-flip'));
});

test('HTML masculino no nível 1 aponta tier 01-09', () => {
  const html = heroImgHtml({ level: 1, sprite: 'male' });
  assert.ok(html.includes('tier-01-09.png'));
  assert.ok(html.includes('data-hero-sprite="male"'));
});
