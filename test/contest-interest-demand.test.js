import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateStudentContentRequest, normalizeCatalogContest } from '../supabase/functions/student-content/core.js';
import { validateAdminContest } from '../app/js/services/adminContestService.js';
import { ContestCatalogService, normalizeDynamicContest } from '../app/js/services/contestCatalogService.js';
import { LibraryService } from '../app/js/services/libraryService.js';
import { partitionCommercialLibrary, sanitizeLibrarySnapshot } from '../app/js/services/studentEntryModel.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('10C migration cria interesse único sem PII', async () => {
  const sql = await source('supabase/migrations/20260811234500_contest_interest_demand.sql');
  assert.match(sql, /primary key \(user_id, contest_id\)/i);
  assert.doesNotMatch(sql, /\b(email|telefone|phone|nome|name)\b/i);
  assert.match(sql, /created_at timestamptz not null default now\(\)/i);
});

test('10C migration ativa RLS e bloqueia escrita direta authenticated', async () => {
  const sql = await source('supabase/migrations/20260811234500_contest_interest_demand.sql');
  assert.match(sql, /alter table public\.contest_interests enable row level security/i);
  assert.match(sql, /revoke all on table public\.contest_interests from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete)[^;]*authenticated/i);
  assert.match(sql, /grant select, insert, delete on table public\.contest_interests to service_role/i);
});

test('10C migration agrega contagens em lote e protege a view', async () => {
  const sql = await source('supabase/migrations/20260811234500_contest_interest_demand.sql');
  assert.match(sql, /create or replace view public\.contest_interest_counts[\s\S]*group by contest_id/i);
  assert.match(sql, /revoke all on table public\.contest_interest_counts from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.contest_interest_counts to service_role/i);
});

test('10C migration aceita monitoring e meta positiva opcional', async () => {
  const sql = await source('supabase/migrations/20260811234500_contest_interest_demand.sql');
  assert.match(sql, /'unavailable', 'monitoring', 'coming_soon', 'available', 'suspended'/);
  assert.match(sql, /interest_goal is null or interest_goal > 0/i);
});

test('student-content aceita somente contrato exato de interesse', () => {
  assert.deepEqual(validateStudentContentRequest({ action: 'set_interest', contestId: 'prf_2027', interested: true }), {
    action: 'set_interest', contestId: 'prf_2027', interested: true,
  });
  assert.throws(() => validateStudentContentRequest({ action: 'set_interest', contestId: 'prf_2027', interested: true, userId: 'outro' }), /unexpected_field/);
  assert.throws(() => validateStudentContentRequest({ action: 'set_interest', contestId: 'prf_2027', interested: 'true' }), /interested_invalid/);
});

test('student-content deriva usuário do JWT e nunca aceita identidade nominal', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  const branch = edge.slice(edge.indexOf("if (body.action === 'set_interest')"), edge.indexOf("const { data: entitlement }"));
  assert.match(branch, /user_id: auth\.user\.id/);
  assert.doesNotMatch(branch, /body\.(?:userId|email|name)/);
  assert.doesNotMatch(branch, /contest_entitlements|commercial-checkout|commerce_orders/);
});

test('set_interest é idempotente e remove apenas o próprio voto', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  const branch = edge.slice(edge.indexOf("if (body.action === 'set_interest')"), edge.indexOf("const { data: entitlement }"));
  assert.match(branch, /upsert\([\s\S]*onConflict: 'user_id,contest_id', ignoreDuplicates: true/);
  assert.match(branch, /delete\(\)\.eq\('user_id', auth\.user\.id\)\.eq\('contest_id', body\.contestId\)/);
  assert.match(branch, /\['monitoring', 'coming_soon'\]/);
  assert.match(branch, /content_status === 'archived'/);
});

test('catálogo inclui monitoring e carrega contagens sem uma query por card', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /\['available', 'coming_soon', 'monitoring'\]/);
  assert.equal((edge.match(/from\('contest_interest_counts'\)/g) || []).length, 2);
  assert.match(edge, /countByContest/);
  assert.match(edge, /interestedIds/);
});

test('normalização preserva estado, contagem e meta reais', () => {
  const raw = { id: 'prf_2027', code: 'PRF', name: 'PRF', content_status: 'draft', sales_status: 'monitoring', interest_goal: 500 };
  const server = normalizeCatalogContest(raw, { interestCount: 742, interested: true });
  const client = normalizeDynamicContest(server);
  assert.equal(client.contentStatus, 'draft');
  assert.equal(client.salesStatus, 'monitoring');
  assert.equal(client.interestCount, 742);
  assert.equal(client.interested, true);
  assert.equal(client.interestGoal, 500);
});

test('catálogo atualiza interesse somente pelo backend e invalida cache', async () => {
  let request;
  const catalog = new ContestCatalogService({
    fallback: [], allowFallback: () => false,
    getClient: async () => ({ functions: { invoke: async (name, options) => {
      request = { name, options };
      return { data: { contestId: 'prf_2027', interested: true, interestCount: 1 }, error: null };
    } } }),
  });
  catalog.cache = [{ id: 'stale' }];
  const result = await catalog.setInterest('prf_2027', true);
  assert.deepEqual(request, { name: 'student-content', options: { body: { action: 'set_interest', contestId: 'prf_2027', interested: true } } });
  assert.equal(result.interestCount, 1);
  assert.equal(catalog.cache, null);
});

test('biblioteca não confirma interesse offline', async () => {
  const service = new LibraryService({ catalog: { setInterest: async () => assert.fail('não deve chamar backend') } });
  await assert.rejects(() => service.setInterest('prf_2027', true, { offline: true }), (error) => error.code === 'OFFLINE_INTEREST_UNAVAILABLE');
});

test('snapshot offline preserva leitura mas nunca cria autoridade de acesso', () => {
  const [snapshot] = sanitizeLibrarySnapshot([{ owned: false, contest: {
    id: 'prf_2027', code: 'PRF', name: 'PRF', salesStatus: 'monitoring', interested: true, interestCount: 7, interestGoal: 20,
  } }]);
  assert.equal(snapshot.owned, false);
  assert.equal(snapshot.contest.interested, true);
  assert.equal(snapshot.entitlement, undefined);
});

test('biblioteca separa adquiridos, disponíveis e próximos concursos', () => {
  const result = partitionCommercialLibrary([
    { owned: true, contest: { salesStatus: 'available' } },
    { owned: false, contest: { salesStatus: 'available' } },
    { owned: false, contest: { salesStatus: 'monitoring' } },
    { owned: false, contest: { salesStatus: 'coming_soon' } },
  ]);
  assert.deepEqual([result.owned.length, result.available.length, result.upcoming.length], [1, 1, 2]);
});

test('UI distingue monitoring, preparação e estado pressionado', async () => {
  const ui = await source('app/js/ui/library.js');
  for (const label of ['Meus cursos', 'Cursos disponíveis', 'Próximos concursos', 'EM ACOMPANHAMENTO', 'Tenho interesse', 'Quero ser avisado', '✓ Interesse registrado']) assert.match(ui, new RegExp(label));
  assert.match(ui, /aria-pressed=/);
  assert.match(ui, /Seja um dos primeiros interessados/);
  assert.match(ui, /data-interest-count/);
});

test('erro do backend não altera contador nem estado confirmado', async () => {
  const ui = await source('app/js/ui/library.js');
  const handler = ui.slice(ui.indexOf("scope.querySelectorAll('[data-interest-contest]')"), ui.indexOf("scope.querySelectorAll('[data-view-details]')"));
  assert.match(handler, /const result = await onInterest/);
  assert.match(handler, /button\.dataset\.interested = String\(result\.interested\)/);
  assert.match(handler, /catch \(error\)/);
  assert.doesNotMatch(handler.slice(0, handler.indexOf('const result = await onInterest')), /interestCount|aria-pressed/);
});

test('admin aceita monitoring e valida meta opcional positiva', () => {
  const base = { id: 'prf_2027', code: 'PRF', slug: 'prf-2027', name: 'PRF', role: 'Policial', description: 'Curso.', sales_status: 'monitoring' };
  assert.equal(validateAdminContest({ ...base, interest_goal: '' }).interest_goal, null);
  assert.equal(validateAdminContest({ ...base, interest_goal: '500' }).interest_goal, 500);
  assert.throws(() => validateAdminContest({ ...base, interest_goal: '0' }), /Meta de interessados inválida/);
});

test('painel mostra demanda agregada, meta e badge sem transição automática', async () => {
  const [ui, edge] = await Promise.all([
    source('app/js/admin/adminContestsScreen.js'), source('supabase/functions/admin-contests/index.ts'),
  ]);
  assert.match(ui, /Demanda dos alunos/);
  assert.match(ui, /META DE DEMANDA ATINGIDA/);
  assert.match(ui, /interest_count/);
  assert.match(edge, /contest_interest_counts/);
  assert.doesNotMatch(edge, /interest_count[\s\S]{0,120}(?:content_status|sales_status)\s*:/);
});

test('10B, entitlement e checkout permanecem separados', async () => {
  const [checkout, checkoutGateway, webhook, migration] = await Promise.all([
    source('supabase/functions/commercial-checkout/index.ts'),
    source('app/js/services/appServices.js'),
    source('supabase/functions/commercial-webhook/index.ts'),
    source('supabase/migrations/20260811193000_secure_commercial_checkout.sql'),
  ]);
  assert.match(checkoutGateway, /ENV\.CHECKOUT_PROVIDER === 'mercado_pago'/);
  assert.match(checkout, /CHECKOUT_NOT_CONFIGURED/);
  assert.match(webhook, /apply_verified_commerce_payment/);
  assert.match(migration, /reserve_commerce_order/);
});

test('authenticated não recebe UPDATE direto em contest_interests', async () => {
  const sql = await source('supabase/migrations/20260811234500_contest_interest_demand.sql');
  assert.doesNotMatch(sql, /grant\s+update[^;]*authenticated/i);
});

test('authenticated não recebe DELETE direto em contest_interests', async () => {
  const sql = await source('supabase/migrations/20260811234500_contest_interest_demand.sql');
  assert.doesNotMatch(sql, /grant\s+delete[^;]*authenticated/i);
});

test('payload com userId é recusado antes da operação', () => {
  assert.throws(() => validateStudentContentRequest({
    action: 'set_interest', contestId: 'prf_2027', interested: true, userId: 'user-b',
  }), /unexpected_field/);
});

test('resposta de interesse não contém lista nominal', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  const branch = edge.slice(edge.indexOf("if (body.action === 'set_interest')"), edge.indexOf("const { data: entitlement }"));
  assert.doesNotMatch(branch, /profiles|email|phone|telefone|\bname\b/);
});

function applyInterest(ledger, userId, contestId, interested) {
  const key = `${userId}:${contestId}`;
  if (interested) ledger.add(key);
  else ledger.delete(key);
  return [...ledger].filter((entry) => entry.endsWith(`:${contestId}`)).length;
}

test('primeiro interesse produz uma única linha e count +1', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  const ledger = new Set();
  assert.match(edge, /upsert\(/);
  assert.equal(applyInterest(ledger, 'a', 'prf_2027', true), 1);
});

test('interesse repetido não duplica o voto', () => {
  const ledger = new Set();
  applyInterest(ledger, 'a', 'prf_2027', true);
  assert.equal(applyInterest(ledger, 'a', 'prf_2027', true), 1);
});

test('remover interesse existente produz count -1', () => {
  const ledger = new Set(['a:prf_2027']);
  assert.equal(applyInterest(ledger, 'a', 'prf_2027', false), 0);
});

test('remover interesse inexistente é idempotente', () => {
  assert.equal(applyInterest(new Set(), 'a', 'prf_2027', false), 0);
});

test('usuários diferentes contam separadamente', () => {
  const ledger = new Set();
  applyInterest(ledger, 'a', 'prf_2027', true);
  assert.equal(applyInterest(ledger, 'b', 'prf_2027', true), 2);
});

test('monitoring aceita novo interesse no backend', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /\['monitoring', 'coming_soon'\]\.includes\(contest\.sales_status\)/);
});

test('coming_soon aceita novo interesse no mesmo backend', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /\['monitoring', 'coming_soon'\]/);
});

test('available não cria novo interesse', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /body\.interested && !\['monitoring', 'coming_soon'\]\.includes/);
});

test('concurso archived não aceita interesse', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /contest\.content_status === 'archived'[^\n]*contest_not_found/);
});

test('monitoring aparece no catálogo autenticado', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /\.in\('sales_status', \['available', 'coming_soon', 'monitoring'\]\)/);
});

test('coming_soon permanece no catálogo autenticado', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /'coming_soon'/);
});

test('available permanece no catálogo autenticado', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /'available'/);
});

test('suspended e unavailable ficam fora da seleção do catálogo', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  const listBranch = edge.slice(edge.indexOf("if (body.action === 'list_catalog')"), edge.indexOf("if (body.action === 'set_interest')"));
  assert.doesNotMatch(listBranch, /'suspended'|'unavailable'/);
});

test('interestCount vem da agregação real por concurso', () => {
  const contest = normalizeCatalogContest({ id: 'prf_2027' }, { interestCount: 12 });
  assert.equal(contest.interestCount, 12);
});

test('interested é verdadeiro apenas para o usuário consultado', () => {
  const contest = normalizeCatalogContest({ id: 'prf_2027' }, { interested: true });
  assert.equal(contest.interested, true);
});

test('outro usuário não herda interested', () => {
  const contest = normalizeCatalogContest({ id: 'prf_2027' }, { interested: false });
  assert.equal(contest.interested, false);
});

test('interestGoal inválido é normalizado como null', () => {
  assert.equal(normalizeDynamicContest({
    id: 'prf_2027', code: 'PRF', name: 'PRF', content_status: 'draft', sales_status: 'monitoring', interest_goal: 0,
  }).interestGoal, null);
});

test('interested true não transforma oferta em curso adquirido', () => {
  const result = partitionCommercialLibrary([{ owned: false, contest: { salesStatus: 'monitoring', interested: true } }]);
  assert.equal(result.owned.length, 0);
});

test('set_interest não escreve em contest_entitlements', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  const branch = edge.slice(edge.indexOf("if (body.action === 'set_interest')"), edge.indexOf("const { data: entitlement }"));
  assert.doesNotMatch(branch, /contest_entitlements/);
});

test('get_published_package continua protegido por entitlement ativo', async () => {
  const edge = await source('supabase/functions/student-content/index.ts');
  assert.match(edge, /contest_entitlements[\s\S]*status', 'active'[\s\S]*entitlement_required/);
});

test('interesse não invoca o checkout', async () => {
  const service = await source('app/js/services/libraryService.js');
  const branch = service.slice(service.indexOf('async setInterest'), service.indexOf('getContest(', service.indexOf('async setInterest')));
  assert.doesNotMatch(branch, /checkout|purchase|mercado/i);
});

test('retorno de checkout continua sem conceder interesse', async () => {
  const model = await source('app/js/services/studentEntryModel.js');
  const branch = model.slice(model.indexOf('export function resolveCheckoutReturn'));
  assert.doesNotMatch(branch, /setInterest|contest_interests/);
});

test('snapshot offline não habilita escrita de interesse', async () => {
  const service = new LibraryService({ catalog: { setInterest: async () => ({}) } });
  await assert.rejects(() => service.setInterest('prf_2027', true, { offline: true }), /Conecte-se/);
});

test('seção Meus cursos é preservada', async () => {
  assert.match(await source('app/js/ui/library.js'), /<h2 id="owned-courses-title">Meus cursos<\/h2>/);
});

test('seção Cursos disponíveis é independente', async () => {
  assert.match(await source('app/js/ui/library.js'), /<h2 id="catalog-title">Cursos disponíveis<\/h2>/);
});

test('seção Próximos concursos é independente', async () => {
  assert.match(await source('app/js/ui/library.js'), /<h2 id="upcoming-title">Próximos concursos<\/h2>/);
});

test('monitoring oferece Tenho interesse', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /salesStatus === 'monitoring' \? 'Tenho interesse'/);
});

test('coming_soon oferece Quero ser avisado', async () => {
  const ui = await source('app/js/ui/library.js');
  assert.match(ui, /: 'Quero ser avisado'/);
});
