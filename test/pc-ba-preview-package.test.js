import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../app/pc-ba-review/', import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), 'utf8'));
}

test('Preview PC BA preserva o curso como indisponível e não publicado', async () => {
  const [{ contest }, engine] = await Promise.all([readJson('contest.json'), readJson('learning-engine.json')]);
  assert.equal(contest.id, 'pc_ba_2026');
  assert.equal(contest.role, 'Investigador de Polícia Civil');
  assert.equal(contest.content_status, 'preparing');
  assert.equal(contest.sales_status, 'unavailable');
  assert.equal(engine.runtime_ready, true);
  assert.equal(engine.production_publication_allowed, false);
  assert.equal(engine.publication_authorized, false);
  assert.equal(engine.entitlement_authorized, false);
});

test('Preview PC BA reúne as 1.247 questões elaboradas sem duplicação', async () => {
  const files = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith('ui-import-') && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  const payloads = await Promise.all(files.map(readJson));
  const questions = payloads.flatMap((payload) => payload.questions || []);
  const ids = new Set(questions.map((question) => question.id));
  const byDiscipline = Object.groupBy(questions, (question) => question.discipline_id);

  assert.equal(files.length, 6);
  assert.equal(questions.length, 1247);
  assert.equal(ids.size, questions.length);
  assert.equal(byDiscipline.pc_ba_2026_investigador_policia_civil_discipline_lingua_portuguesa.length, 849);
  assert.equal(byDiscipline.pc_ba_2026_investigador_policia_civil_discipline_raciocinio_logico.length, 378);
  assert.equal(byDiscipline.pc_ba_2026_investigador_policia_civil_discipline_nocoes_de_direito_administrativo.length, 20);
  questions.forEach((question) => {
    assert.equal(question.status, 'draft');
    assert.equal(question.authoring_status, 'rascunho_revisar');
    assert.equal(question.options.length, 5);
    assert.ok(question.options.some((option) => option.label === question.correct_answer));
    assert.ok(question.explanation.length >= 80);
  });
});

test('revisão é identificada como Preview sem gravação remota', async () => {
  const [html, script, admin] = await Promise.all([
    readFile(new URL('preview.html', root), 'utf8'),
    readFile(new URL('preview.js', root), 'utf8'),
    readFile(new URL('../app/js/admin/adminQuestionsScreen.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /VERCEL PREVIEW/);
  assert.match(html, /CURSO NÃO PUBLICADO/);
  assert.match(html, /nenhuma resposta altera o progresso/i);
  assert.doesNotMatch(script, /supabase|localStorage|indexedDB/i);
  assert.match(admin, /pc-ba-review\/preview\.html/);
  assert.match(admin, /build\.environment === 'preview'/);
});
