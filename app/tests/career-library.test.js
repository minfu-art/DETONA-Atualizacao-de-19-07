import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CAREER_AREAS,
  CAREER_AREA_ORDER,
  countLibraryItemsByArea,
  contestPrimaryAction,
  filterLibraryItems,
  getCareerSubareaLabel,
  groupLibraryItems,
  normalizeCareerArea,
  resolveContestArea,
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

const EXPECTED_AREA_ORDER = [
  'police_security',
  'courts_legal',
  'administrative',
  'fiscal_control',
  'health_education',
  'armed_forces',
];

test('filtros oficiais retornam somente concursos da área escolhida', () => {
  assert.deepEqual(filterLibraryItems(ITEMS, { area: 'police_security' }).map(({ contest }) => contest.id), ['pc_al_2026', 'pp_pe_2027']);
  assert.deepEqual(CAREER_AREA_ORDER, EXPECTED_AREA_ORDER);
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

test('busca inclui banca quando o catálogo fornece esse campo e combina com área', () => {
  const pcBa = item({
    id: 'pc_ba_2027',
    code: 'PC BA',
    name: 'Polícia Civil da Bahia',
    organization: 'Polícia Civil da Bahia',
    careerArea: 'police_security',
    careerSubarea: 'civil_police',
  });
  pcBa.contest.examBoard = 'Cebraspe';
  assert.deepEqual(filterLibraryItems([pcBa, fiscal], { area: 'police_security', search: 'Bahia' }), [pcBa]);
  assert.deepEqual(filterLibraryItems([pcBa, fiscal], { area: 'police_security', search: 'Cebraspe' }), [pcBa]);
});

test('campo ausente usa other sem inferência pelo nome', () => {
  assert.equal(normalizeCareerArea(null), 'other');
  assert.equal(groupLibraryItems(ITEMS).get('other')[0].contest.id, 'future');
});

test('resolvedor central prioriza metadata explícita, depois mapeamento conhecido e então Outros', () => {
  assert.equal(resolveContestArea({ id: 'pc_al_2026', careerArea: null }), 'police_security');
  assert.equal(resolveContestArea({ id: 'pc_al_2026', metadata: { careerArea: 'courts_legal' }, careerArea: 'police_security' }), 'courts_legal');
  assert.equal(resolveContestArea({ id: 'sem_categoria' }), 'other');
});

test('contagem das áreas é calculada sem ocultar concursos sem categoria', () => {
  const counts = countLibraryItemsByArea(ITEMS);
  assert.equal(counts.police_security, 2);
  assert.equal(counts.fiscal_control, 1);
  assert.equal(counts.other, 1);
});

test('categoria vazia permanece representável', () => {
  assert.deepEqual(filterLibraryItems(ITEMS, { area: 'armed_forces' }), []);
  assert.equal(CAREER_AREAS.armed_forces.name, 'Militar e Defesa');
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

test('interface mantém seis filtros visuais acessíveis, limpeza e rolagem horizontal no celular', async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL('../js/ui/library.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/student-entry.css', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /BIBLIOTECA DE CONCURSOS/);
  assert.match(ui, /Pesquisar concurso, órgão, cargo ou banca/);
  assert.match(ui, /Explore por área/);
  assert.match(ui, /data-career-filter/);
  assert.match(ui, /aria-pressed/);
  assert.match(ui, /data-clear-search/);
  assert.match(ui, /data-clear-area/);
  assert.match(css, /\.student-library \.library-area-grid[\s\S]*grid-template-columns:\s*repeat\(3/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*scroll-snap-type:\s*x mandatory/s);
  assert.match(css, /\.student-library \.library-area-card:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
});

test('seis artes WebP oficiais existem, mantêm 1672x941 e estão otimizadas', async () => {
  for (const areaId of CAREER_AREA_ORDER) {
    const area = CAREER_AREAS[areaId];
    const bytes = await readFile(new URL(`../${area.art}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', area.art);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', area.art);
    assert.ok(bytes.length < 350_000, `${area.art} deve permanecer otimizada`);
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8 ', area.art);
    assert.equal(bytes.readUInt16LE(26) & 0x3fff, 1672, area.art);
    assert.equal(bytes.readUInt16LE(28) & 0x3fff, 941, area.art);
  }
});

test('Meus cursos permanece separado do catálogo e curso sem entitlement não recebe CTA de continuar', async () => {
  const ui = await readFile(new URL('../js/ui/library.js', import.meta.url), 'utf8');
  const areasPosition = ui.indexOf('<section class="library-areas"');
  const ownedPosition = ui.indexOf('<section class="library-section library-section--owned"');
  const catalogPosition = ui.indexOf('<section class="library-section library-section--catalog"');
  assert.ok(areasPosition < ownedPosition);
  assert.ok(ownedPosition < catalogPosition);
  assert.equal(contestPrimaryAction(ppPe).action, 'details');
  assert.doesNotMatch(contestPrimaryAction(ppPe).label, /continuar/i);
  assert.match(ui, /MEU CURSO/);
  assert.match(ui, /INDISPONÍVEL/);
  assert.match(ui, /EM PREPARAÇÃO/);
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
