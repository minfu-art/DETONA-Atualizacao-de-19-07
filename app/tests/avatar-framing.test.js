import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAvatarAssets } from '../scripts/audit-avatar-framing.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('os 20 avatares possuem canvas RGBA vÃ¡lido e pixels visÃ­veis em Ã¡rea segura', async () => {
  const report = await auditAvatarAssets(appRoot);
  assert.equal(report.length, 20);
  assert.deepEqual([...new Set(report.map((entry) => entry.gender))], ['male', 'female']);
  for (const entry of report) {
    assert.equal(entry.width, 1024, entry.file);
    assert.equal(entry.height, 1024, entry.file);
    assert.equal(entry.bitDepth, 8, entry.file);
    assert.equal(entry.colorType, 6, entry.file);
    assert.equal(entry.hasAlpha, true, entry.file);
    assert.ok(entry.nonTransparentPixels > 0, entry.file);
    assert.equal(entry.touchesEdge, false, entry.file);
    assert.ok(Math.min(...Object.values(entry.margins)) >= 32, entry.file);
  }
});

test('a coleÃ§Ã£o compartilha altura visual e baseline tÃ©cnica consistentes', async () => {
  const report = await auditAvatarAssets(appRoot);
  assert.deepEqual([...new Set(report.map((entry) => entry.bbox.top))], [82]);
  assert.deepEqual([...new Set(report.map((entry) => entry.bbox.bottom))], [982]);
  for (const entry of report) {
    assert.ok(entry.visualHeightRatio >= 0.87 && entry.visualHeightRatio <= 0.9, entry.file);
  }
});

test('Perfil usa canvas quadrado, base ancorada e frame consistente na trilha', async () => {
  const [ui, css] = await Promise.all([
    readFile(path.join(appRoot, 'js/ui/profile.js'), 'utf8'),
    readFile(path.join(appRoot, 'css/profile-evolution.css'), 'utf8'),
  ]);
  assert.match(ui, /width="1024"\s+height="1024"/);
  assert.match(ui, /data-avatar-frame="profile"/);
  assert.match(ui, /data-avatar-frame="trail"/);
  assert.match(css, /\.profile-hero-art__image\s*\{[^}]*bottom:\s*-23px;[^}]*height:\s*560px;[^}]*max-width:\s*none;/s);
  assert.match(css, /\.profile-stage-card__art\s*\{[^}]*height:\s*250px;[^}]*position:\s*relative;/s);
  assert.match(css, /\.profile-stage-card__art img\s*\{[^}]*bottom:\s*-9px;[^}]*height:\s*225px;[^}]*max-width:\s*none;/s);
  assert.match(css, /opacity:\s*\.62/);
});

test('Home e Arena usam frames quadrados sem limitar o canvas pela largura do slot', async () => {
  const [homeUi, arenaUi, mainCss, homeCss, arenaCss] = await Promise.all([
    readFile(path.join(appRoot, 'js/ui/home.js'), 'utf8'),
    readFile(path.join(appRoot, 'js/ui/battleArena.js'), 'utf8'),
    readFile(path.join(appRoot, 'css/main.css'), 'utf8'),
    readFile(path.join(appRoot, 'css/dashboard-jrpg.css'), 'utf8'),
    readFile(path.join(appRoot, 'css/design-system.css'), 'utf8'),
  ]);
  assert.match(homeUi, /hero-img hero-img--home/);
  assert.match(homeUi, /hero-img dj-mission__hero/);
  assert.match(arenaUi, /hero-img battle-duel__image/);
  assert.match(mainCss, /\.hero-img--home\s*\{[^}]*height:\s*286px;[^}]*max-width:\s*none;[^}]*width:\s*286px;/s);
  assert.match(homeCss, /\.dj-mission__hero\s*\{[^}]*width:\s*220px;[^}]*max-width:\s*none;[^}]*height:\s*220px;/s);
  assert.match(arenaCss, /\.battle-duel__fighter--hero \.battle-duel__image\s*\{[^}]*height:\s*150px;[^}]*max-width:none;[^}]*width:150px;/s);
});
