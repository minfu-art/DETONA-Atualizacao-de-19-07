import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CAREER_AREAS,
  CAREER_AREA_ORDER,
  contestPrimaryAction,
  filterLibraryItems,
  getCareerSubareaLabel,
  groupLibraryItems,
  normalizeCareerArea,
  selectActiveJourney,
} from '../js/services/careerLibraryService.js';
import { normalizeDynamicContest } from '../js/services/contestCatalogService.js';

const item = ({
  id,
  code = id,
  name = id,
  role = 'Agente',
  organization = name,
  careerArea,
  careerSubarea,
  owned = false,
  contentStatus = 'ready',
  summary = null,
}) => ({
  contest: { id, code, name, role, organization, careerArea, careerSubarea, contentStatus },
  owned,
  summary,
});

const pcAl = item({
  id: 'pc_al_2026',
  code: 'PC AL',
  name: 'Polícia Civil de Alagoas',
  organization: 'Polícia Civil',
  role: 'Agente e Escrivão',
  careerArea: 'police_security',
  careerSubarea: 'civil_police',
  owned: true,
  summary: { editalCompletionPct: 24, lastAccessAt: '2026-07-28T12:00:00Z' },
});
const ppPe = item({
  id: 'pp_pe_2027',
  code: 'PP PE',
  name: 'Polícia Penal de Pernambuco',
  organization: 'Polícia Penal',
  role: 'Policial Penal',
  careerArea: 'police_security',
  careerSubarea: 'prison_police',
});
const fiscal = item({
  id: 'sefaz_2027',
  code: 'SEFAZ',
  name: 'Secretaria da Fazenda',
  organization: 'Sefaz',
  role: 'Auditor fiscal',
  careerArea: 'fiscal_control',
  careerSubarea: 'state_revenue',
});
const unclassified = item({ id: 'future', careerArea: null, contentStatus: 'preparing' });
const ITEMS = [pcAl, ppPe, fiscal, unclassified];

test('filtros oficiais retornam somente concursos da área escolhida', () => {
  assert.deepEqual(filterLibraryItems(ITEMS, { area: 'police_security' }).map(({ contest }) => contest.id), ['pc_al_2026', 'pp_pe_2027']);
  assert.equal(CAREER_AREA_ORDER.length, 6);
});

test('concurso ativo explícito permanece no topo sem alterar a coleção', () => {
  const before = structuredClone(ITEMS);
  assert.equal(selectActiveJourney(ITEMS, 'pc_al_2026')?.contest.id, 'pc_al_2026');
  assert.deepEqual(ITEMS, before);
});

test('PC AL e PP PE usam as subáreas editoriais corretas', () => {
  assert.equal(getCareerSubareaLabel(pcAl.contest.careerArea, pcAl.contest.careerSubarea), 'Polícia Civil');
  assert.equal(getCareerSubareaLabel(ppPe.contest.careerArea, ppPe.contest.careerSubarea), 'Polícia Penal');
});

test('busca funciona por órgão, cargo, área e subárea junto ao filtro', () => {
  assert.equal(filterLibraryItems(ITEMS, { search: 'Polícia Civil' })[0].contest.id, 'pc_al_2026');
  assert.equal(filterLibraryItems(ITEMS, { search: 'auditor fiscal' })[0].contest.id, 'sefaz_2027');
  assert.equal(filterLibraryItems(ITEMS, { area: 'police_security', search: 'penal' })[0].contest.id, 'pp_pe_2027');
  assert.equal(filterLibraryItems(ITEMS, { search: 'controle' })[0].contest.id, 'sefaz_2027');
});

test('campo ausente usa other sem inferência pelo nome', () => {
  assert.equal(normalizeCareerArea(null), 'other');
  assert.equal(groupLibraryItems(ITEMS).get('other')[0].contest.id, 'future');
});

test('categoria vazia permanece representável', () => {
  assert.deepEqual(filterLibraryItems(ITEMS, { area: 'armed_forces' }), []);
  assert.equal(CAREER_AREAS.armed_forces.name, 'Área Militar — Forças Armadas');
});

test('prioridade do botão respeita propriedade, prontidão e progresso', () => {
  assert.equal(contestPrimaryAction(pcAl).label, 'Continuar jornada');
  assert.equal(contestPrimaryAction({ ...pcAl, summary: null }).label, 'Começar jornada');
  assert.equal(contestPrimaryAction(ppPe).label, 'Ver detalhes');
  assert.equal(contestPrimaryAction(unclassified).label, 'Em breve');
});

test('filtragem não concede acesso nem altera entitlement ou progresso', () => {
  const snapshot = structuredClone(ITEMS);
  filterLibraryItems(ITEMS, { area: 'fiscal_control', search: 'sefaz' });
  assert.deepEqual(ITEMS, snapshot);
  assert.equal(ppPe.owned, false);
});

test('interface mantém filtros acessíveis e rolagem horizontal no celular', async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL('../js/ui/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/design-system.css', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /aria-label="Filtrar concursos por área"/);
  assert.match(ui, /aria-pressed/);
  assert.match(css, /\.career-filters\s*\{[^}]*overflow-x:auto/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.career-filters/s);
  assert.match(css, /white-space:nowrap/);
});

test('migration é incremental, restrita ao catálogo e classifica PC AL e PP PE', async () => {
  const sql = await readFile(
    new URL('../../supabase/migrations/20260729105711_add_contest_career_areas.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /alter table public\.admin_contests[\s\S]+add column if not exists career_area/i);
  assert.match(sql, /where id = 'pc_al_2026'/i);
  assert.match(sql, /career_subarea = 'civil_police'/i);
  assert.match(sql, /where id = 'pp_pe_2027'/i);
  assert.match(sql, /career_subarea = 'prison_police'/i);
  assert.doesNotMatch(sql, /contest_entitlements|progress_records|drop table|delete from/i);
});

test('PC AL preserva as contagens oficiais do catálogo legado', () => {
  const contest = normalizeDynamicContest({
    id: 'pc_al_2026',
    code: 'PC AL',
    name: 'Polícia Civil de Alagoas',
  });
  assert.equal(contest.subtopicCount, 137);
  assert.equal(contest.questionCount, 6480);
});
