import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return readFile(path.join(appDir, relativePath), 'utf8');
}

test('workspace do plano oferece missões, revisões e todas as áreas existentes', async () => {
  const expedition = await source('js/ui/expedition.js');
  for (const id of ['hoje', 'semana', 'mes', 'revisao', 'vida', 'jornada', 'foco', 'progresso']) {
    assert.match(expedition, new RegExp(`id: '${id}'`));
  }
  assert.match(expedition, /label: 'Missões'/);
  assert.match(expedition, /label: 'Revisões'/);
  assert.match(expedition, /plan-workspace-nav/);
  assert.match(expedition, /Evi organiza sua próxima missão/);
  assert.match(expedition, /assets\/mentors\/evi-plan-strategist\.webp/);
});

test('contexto vindo da Home abre diretamente o plano solicitado', async () => {
  const expedition = await source('js/ui/expedition.js');
  assert.match(expedition, /ctx\?\.planSection/);
  assert.match(expedition, /TABS\.some\(\(item\) => item\.id === requestedTab\)/);
  assert.match(expedition, /delete ctx\.planSection/);
  assert.match(expedition, /id="plan-open-review"/);
  assert.match(expedition, /navigate\('review'\)/);
});

test('workspace mantém acessibilidade e tratamento responsivo no celular', async () => {
  const [expedition, css] = await Promise.all([
    source('js/ui/expedition.js'),
    source('css/plan-edital.css'),
  ]);
  assert.match(expedition, /aria-label="Áreas do plano"/);
  assert.match(expedition, /aria-current=/);
  assert.match(expedition, /alt="Evi organizando o plano de missões"/);
  assert.match(css, /\.plan-banner__hero[\s\S]*animation:\s*none/);
  assert.match(css, /\.plan-workspace-nav__rail[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.plan-review-entry \.btn[\s\S]*width:\s*100%/);
});
test('geração semanal bloqueia repetição e comunica o plano existente', async () => {
  const [expedition, service] = await Promise.all([
    source('js/ui/expedition.js'),
    source('js/services/routineService.js'),
  ]);
  assert.match(expedition, /planGenerationInFlight/);
  assert.match(expedition, /Plano desta semana já gerado/);
  assert.match(expedition, /aria-busy/);
  assert.match(service, /weekPlanGeneration/);
  assert.match(service, /reason: 'already_exists'/);
  assert.match(service, /repairGeneratedPlanDuplicates/);
});
