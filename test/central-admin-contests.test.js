import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AdminContestService, validateAdminContest } from '../app/js/services/adminContestService.js';
import { AdminCurriculumService, validateCurriculumNode } from '../app/js/services/adminCurriculumService.js';
import {
  assertAdminContestAction,
  sanitizedAuditMetadata,
  validateAdminContestRequest,
} from '../supabase/functions/admin-contests/core.js';
import { READ_ONLY_CAPABILITIES, hasWriteCapability } from '../app/js/services/adminCapabilities.js';

test('catálogo administrativo usa fallback sem alterar catálogo acadêmico', async () => {
  const service = new AdminContestService({ getClient: async () => null });
  const result = await service.listContests({ search: 'PC AL' });
  assert.equal(result.source, 'static_catalog');
  assert.equal(result.writable, false);
  assert.equal(result.rows[0].id, 'pc_al_2026');
});

test('catálogo vazio mantém fallback e sinaliza bootstrap', async () => {
  const client = {
    functions: {
      invoke: async () => ({
        data: { contests: [], capabilities: READ_ONLY_CAPABILITIES },
        error: null,
      }),
    },
  };
  const service = new AdminContestService({ getClient: async () => client });
  const result = await service.listContests();
  assert.equal(result.source, 'static_catalog');
  assert.equal(result.bootstrapRequired, true);
  assert.equal(result.writable, false);
  assert.equal(result.rows.length, 3);
});

test('catálogo administrativo populado substitui fallback sem inventar escrita', async () => {
  const rows = [{ id: 'novo_concurso_2027', name: 'Novo concurso' }];
  const client = {
    functions: {
      invoke: async () => ({
        data: { contests: rows, capabilities: READ_ONLY_CAPABILITIES },
        error: null,
      }),
    },
  };
  const service = new AdminContestService({ getClient: async () => client });
  const result = await service.listContests();
  assert.deepEqual(result.rows, rows);
  assert.equal(result.source, 'administrative_table');
  assert.equal(result.bootstrapRequired, false);
  assert.equal(result.writable, false);
});

test('capabilities somente-leitura bloqueiam escrita e resposta 409 não vira sucesso', async () => {
  assert.equal(hasWriteCapability(READ_ONLY_CAPABILITIES), false);
  const client = {
    functions: {
      invoke: async () => ({ data: { error: 'mutation_not_enabled' }, error: null }),
    },
  };
  const service = new AdminContestService({ getClient: async () => client });
  await assert.rejects(() => service.saveContest({
    id: 'pc_al_2026',
    code: 'PC AL',
    slug: 'pc-al-2026',
    name: 'Policia Civil de Alagoas',
    role: 'Agente e Escrivao',
    description: 'Descrição.',
  }), /ainda não publicado/);
});

test('serviço de currículo exige contestId explícito', async () => {
  const service = new AdminCurriculumService({ getClient: async () => null });
  await assert.rejects(() => service.listNodes(), /contestId/);
  const result = await service.listNodes('pc_al_2026');
  assert.equal(result.source, 'static_edital');
  assert.ok(result.rows.length > 10);
  assert.ok(result.rows.every((node) => node.contest_id === 'pc_al_2026'));
});

test('validações editoriais rejeitam estados e tipos desconhecidos', () => {
  assert.throws(() => validateAdminContest({ id: 'x', code: 'X', slug: 'x', name: 'X', role: 'R', description: 'D', content_status: 'live' }), /inválido/);
  assert.throws(() => validateCurriculumNode({ type: 'player', name: 'X' }, 'pc_al_2026'), /Tipo/);
  assert.equal(validateCurriculumNode({ type: 'discipline', name: 'Português' }, 'pc_al_2026').contest_id, 'pc_al_2026');
});

test('Edge Function usa allowlist de ações e sanitiza auditoria', () => {
  assert.equal(assertAdminContestAction('list_contests'), 'list_contests');
  assert.throws(() => assertAdminContestAction('delete_everything'), /not_allowed/);
  assert.deepEqual(sanitizedAuditMetadata({ status: 'ok', password: 'x', jwtToken: 'y' }), { status: 'ok' });
  assert.throws(
    () => validateAdminContestRequest({ action: 'list_contests', search: 'x),id.eq.secret' }),
    /search_invalid/,
  );
  assert.throws(
    () => validateAdminContestRequest({ action: 'list_contests', search: '', unexpected: true }),
    /unexpected_field/,
  );
});

test('migration administrativa mantém tabelas fora da Data API', async () => {
  const sql = await readFile(new URL('../supabase/migrations/007_central_admin_contests_curriculum.sql', import.meta.url), 'utf8');
  for (const table of ['admin_contests', 'admin_curriculum_nodes', 'admin_audit_log']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete).*\bauthenticated\b/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.admin_contests to service_role/i);
});
