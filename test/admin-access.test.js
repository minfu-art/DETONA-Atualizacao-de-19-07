import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAdminAccessHandler,
  validateAdminPayload,
} from '../supabase/functions/admin-access/core.js';
import {
  AdminAccessService,
  AdminAccessServiceError,
} from '../app/js/services/adminAccessService.js';
import { LibraryService } from '../app/js/services/libraryService.js';

const DEV_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const CONTEST_ID = 'pc_al_2026';
const forgeSource = readFileSync(new URL('../app/js/ui/forge.js', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('../app/js/services/adminAccessService.js', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/migrations/006_admin_access_audit.sql', import.meta.url), 'utf8');
const functionSource = readFileSync(new URL('../supabase/functions/admin-access/index.ts', import.meta.url), 'utf8');
const dataAccessSource = readFileSync(new URL('../supabase/migrations/003_explicit_data_api_access.sql', import.meta.url), 'utf8');
const supabaseConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

function makeSystem() {
  const profiles = [
    {
      id: DEV_ID,
      name: 'Equipe Detona',
      email: 'dev@example.test',
      role: 'developer',
      created_at: '2026-07-20T12:00:00.000Z',
      password_hash: 'must-not-leak',
      refresh_token: 'must-not-leak',
    },
    {
      id: STUDENT_ID,
      name: 'Aluno Alfa',
      email: 'alfa@example.test',
      role: 'student',
      created_at: '2026-07-21T12:00:00.000Z',
    },
    {
      id: SECOND_STUDENT_ID,
      name: 'Aluno Beta',
      email: 'beta@example.test',
      role: 'student',
      created_at: '2026-07-22T12:00:00.000Z',
    },
  ];
  const entitlements = new Map();
  const audit = [];
  const academic = new Map([
    [STUDENT_ID, { xp: 875, mastery: 34, insignias: ['jornada-1'], reviews: 7 }],
  ]);

  const repository = {
    async listUsers({ search, page, pageSize }) {
      const term = search.toLocaleLowerCase('pt-BR');
      const filtered = profiles.filter((profile) => (
        !term
        || profile.name.toLocaleLowerCase('pt-BR').includes(term)
        || profile.email.toLocaleLowerCase('pt-BR').includes(term)
      ));
      const start = (page - 1) * pageSize;
      return {
        users: filtered.slice(start, start + pageSize).map((profile) => ({
          ...profile,
          entitlement: entitlements.get(`${profile.id}:${CONTEST_ID}`) || null,
        })),
        total: filtered.length,
      };
    },
    async userExists(userId) {
      return profiles.some((profile) => profile.id === userId);
    },
    async entitlementExists(userId, contestId) {
      return entitlements.has(`${userId}:${contestId}`);
    },
    async changeAccess({ actorUserId, targetUserId, contestId, action }) {
      const key = `${targetUserId}:${contestId}`;
      const current = entitlements.get(key) || null;
      const status = action === 'revoke_access' ? 'revoked' : 'active';
      const timestamp = '2026-07-24T15:00:00.000Z';
      const row = {
        id: current?.id || `manual_admin:${key}`,
        user_id: targetUserId,
        contest_id: contestId,
        status,
        source: action === 'revoke_access' ? (current?.source || 'manual_admin') : 'manual_admin',
        granted_at: current?.granted_at || timestamp,
        updated_at: timestamp,
      };
      entitlements.set(key, row);
      audit.push({
        actor_user_id: actorUserId,
        target_user_id: targetUserId,
        contest_id: contestId,
        action,
        previous_status: current?.status || null,
        new_status: status,
      });
      return row;
    },
  };

  const handler = createAdminAccessHandler({
    async resolveIdentity(token) {
      if (token === 'developer-token') return { userId: DEV_ID, role: 'developer' };
      if (token === 'student-token') return { userId: STUDENT_ID, role: 'student' };
      throw new Error('invalid');
    },
    repository,
  });
  return { handler, profiles, entitlements, audit, academic };
}

async function call(handler, { token, body = { action: 'list_users' }, rawBody } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await handler(new Request('https://example.test/admin-access', {
    method: 'POST',
    headers,
    body: rawBody ?? JSON.stringify(body),
  }));
  return { response, payload: await response.json() };
}

async function change(system, action) {
  return call(system.handler, {
    token: 'developer-token',
    body: { action, targetUserId: STUDENT_ID, contestId: CONTEST_ID },
  });
}

function readTree(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? readTree(path) : [path];
  });
}

test('1. anon recebe 401', async () => {
  const { response } = await call(makeSystem().handler);
  assert.equal(response.status, 401);
});

test('2. student recebe 403', async () => {
  const { response } = await call(makeSystem().handler, { token: 'student-token' });
  assert.equal(response.status, 403);
});

test('3. developer pode listar usuários', async () => {
  const { response, payload } = await call(makeSystem().handler, { token: 'developer-token' });
  assert.equal(response.status, 200);
  assert.equal(payload.users.length, 3);
});

test('4. resposta não contém tokens ou hashes', async () => {
  const { payload } = await call(makeSystem().handler, { token: 'developer-token' });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /password|hash|refresh_token|must-not-leak/i);
});

test('5. pesquisa por nome funciona', async () => {
  const { payload } = await call(makeSystem().handler, {
    token: 'developer-token',
    body: { action: 'list_users', search: 'Alfa' },
  });
  assert.deepEqual(payload.users.map((user) => user.userId), [STUDENT_ID]);
});

test('6. pesquisa por e-mail funciona', async () => {
  const { payload } = await call(makeSystem().handler, {
    token: 'developer-token',
    body: { action: 'list_users', search: 'beta@example.test' },
  });
  assert.deepEqual(payload.users.map((user) => user.userId), [SECOND_STUDENT_ID]);
});

test('7. paginação é limitada a cinquenta itens', () => {
  assert.equal(validateAdminPayload({ action: 'list_users', pageSize: 50 }).pageSize, 50);
  assert.throws(
    () => validateAdminPayload({ action: 'list_users', pageSize: 51 }),
    (error) => error.status === 400,
  );
});

test('8. contest desconhecido é rejeitado', async () => {
  const { response } = await call(makeSystem().handler, {
    token: 'developer-token',
    body: { action: 'grant_access', targetUserId: STUDENT_ID, contestId: 'outro_concurso' },
  });
  assert.equal(response.status, 400);
});

test('9. grant cria acesso ativo', async () => {
  const system = makeSystem();
  const { response, payload } = await change(system, 'grant_access');
  assert.equal(response.status, 200);
  assert.equal(payload.access.status, 'active');
  assert.equal(payload.access.source, 'manual_admin');
});

test('10. grant repetido não duplica', async () => {
  const system = makeSystem();
  await change(system, 'grant_access');
  await change(system, 'grant_access');
  assert.equal(system.entitlements.size, 1);
});

test('11. revoke mantém registro com status revoked', async () => {
  const system = makeSystem();
  await change(system, 'grant_access');
  await change(system, 'revoke_access');
  assert.equal(system.entitlements.size, 1);
  assert.equal(system.entitlements.get(`${STUDENT_ID}:${CONTEST_ID}`).status, 'revoked');
});

test('12. reactivate retorna status active', async () => {
  const system = makeSystem();
  await change(system, 'grant_access');
  await change(system, 'revoke_access');
  const { payload } = await change(system, 'reactivate_access');
  assert.equal(payload.access.status, 'active');
});

test('13. revogação não apaga progresso', async () => {
  const system = makeSystem();
  const before = structuredClone(system.academic.get(STUDENT_ID));
  await change(system, 'grant_access');
  await change(system, 'revoke_access');
  assert.deepEqual(system.academic.get(STUDENT_ID), before);
});

test('14. reativação restaura acesso ao mesmo progresso', async () => {
  const system = makeSystem();
  const before = structuredClone(system.academic.get(STUDENT_ID));
  await change(system, 'grant_access');
  await change(system, 'revoke_access');
  await change(system, 'reactivate_access');
  assert.deepEqual(system.academic.get(STUDENT_ID), before);
});

test('15. frontend nunca escreve diretamente em contest_entitlements', () => {
  assert.doesNotMatch(serviceSource, /\.from\(['"]contest_entitlements['"]\)/);
  assert.match(serviceSource, /functions\.invoke\('admin-access'/);
});

test('16. service_role não existe no bundle do app', () => {
  const appJsDirectory = fileURLToPath(new URL('../app/js', import.meta.url));
  const appJs = readTree(appJsDirectory).map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(appJs, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('17. aba administrativa é protegida contra student', () => {
  assert.match(forgeSource, /if \(!isDeveloperUser\(ctx\.user\)\)/);
  assert.match(forgeSource, /data-t="access">Alunos e acessos/);
});

test('18. revogação exige confirmação acessível e explícita', () => {
  assert.match(forgeSource, /confirmAccessRevocation/);
  assert.match(forgeSource, /Confirmar revogação/);
  assert.match(forgeSource, /progresso acadêmico será preservado/i);
  assert.match(forgeSource, /openModal\(/);
});

test('19. erros da Edge Function são apresentados de forma segura', async () => {
  const service = new AdminAccessService({
    clientProvider: async () => ({
      auth: { getSession: async () => ({ data: { session: { access_token: 'opaque' } }, error: null }) },
      functions: {
        invoke: async () => ({
          data: null,
          error: { context: { status: 403 }, message: 'internal database details' },
        }),
      },
    }),
  });
  await assert.rejects(
    () => service.listUsers(),
    (error) => error instanceof AdminAccessServiceError
      && error.status === 403
      && !error.message.includes('database'),
  );
});

test('20. auditoria registra ator, alvo, concurso e mudança', async () => {
  const system = makeSystem();
  await change(system, 'grant_access');
  assert.deepEqual(system.audit[0], {
    actor_user_id: DEV_ID,
    target_user_id: STUDENT_ID,
    contest_id: CONTEST_ID,
    action: 'grant_access',
    previous_status: null,
    new_status: 'active',
  });
  assert.match(migrationSource, /admin_access_audit/);
});

test('21. auditoria não contém credenciais', () => {
  assert.doesNotMatch(migrationSource, /password|jwt|refresh_token|provider_token/i);
  assert.match(migrationSource, /revoke all privileges[\s\S]*from public, anon, authenticated, service_role/i);
});

test('22. nenhuma operação altera domínio, XP ou insígnias', async () => {
  const system = makeSystem();
  const before = structuredClone(system.academic);
  await change(system, 'grant_access');
  await change(system, 'revoke_access');
  await change(system, 'reactivate_access');
  assert.deepEqual(system.academic, before);
});

test('23. aluno sem acesso continua bloqueado', async () => {
  const entitlements = { async find() { return null; } };
  const library = new LibraryService({ entitlements, checkout: {}, summaries: {} });
  assert.equal(await library.canAccess(STUDENT_ID, CONTEST_ID), false);
});

test('24. aluno ativo acessa somente o concurso autorizado', async () => {
  const entitlements = {
    async find(userId, contestId) {
      if (userId === STUDENT_ID && contestId === CONTEST_ID) return { status: 'active' };
      return null;
    },
  };
  const library = new LibraryService({ entitlements, checkout: {}, summaries: {} });
  assert.equal(await library.canAccess(STUDENT_ID, CONTEST_ID), true);
  assert.equal(await library.canAccess(STUDENT_ID, 'outro_concurso'), false);
});

test('payload malformado recebe 400 sem detalhes internos', async () => {
  const { response, payload } = await call(makeSystem().handler, {
    token: 'developer-token',
    rawBody: '{invalid-json',
  });
  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'INVALID_JSON');
  assert.doesNotMatch(JSON.stringify(payload), /stack|token|syntaxerror/i);
});

test('campos administrativos enviados pelo cliente são rejeitados', () => {
  assert.throws(
    () => validateAdminPayload({ action: 'grant_access', targetUserId: STUDENT_ID, contestId: CONTEST_ID, role: 'developer' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => validateAdminPayload({ action: 'list_users', table: 'profiles' }),
    (error) => error.status === 400,
  );
});

test('aluno inexistente recebe 404', async () => {
  const { response } = await call(makeSystem().handler, {
    token: 'developer-token',
    body: {
      action: 'grant_access',
      targetUserId: '44444444-4444-4444-8444-444444444444',
      contestId: CONTEST_ID,
    },
  });
  assert.equal(response.status, 404);
});

test('Edge Function valida JWT e role pelo profile sem confiar no payload', () => {
  assert.match(functionSource, /auth\.getUser\(token\)/);
  assert.match(functionSource, /\.from\('profiles'\)[\s\S]*\.select\('id,role'\)/);
  assert.doesNotMatch(functionSource, /input\.role|payload\.role|body\.role/);
  assert.match(supabaseConfig, /\[functions\.admin-access\][\s\S]*verify_jwt = false/);
});

test('migration mantém auditoria inacessível ao frontend', () => {
  assert.match(migrationSource, /alter table public\.admin_access_audit enable row level security/i);
  assert.match(migrationSource, /revoke all privileges on table public\.admin_access_audit[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migrationSource, /grant select, insert on table public\.admin_access_audit to service_role/i);
  assert.doesNotMatch(migrationSource, /grant\s+\w+(?:\s*,\s*\w+)*\s+on table public\.admin_access_audit to authenticated/i);
});

test('mudança de acesso e auditoria são atômicas e exclusivas do backend', () => {
  assert.match(migrationSource, /create or replace function public\.admin_set_contest_access/);
  assert.match(migrationSource, /insert into public\.contest_entitlements[\s\S]*insert into public\.admin_access_audit/);
  assert.match(migrationSource, /revoke all privileges on function public\.admin_set_contest_access[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migrationSource, /grant execute on function public\.admin_set_contest_access[\s\S]*to service_role/i);
  assert.match(dataAccessSource, /grant select on table public\.contest_entitlements to authenticated/i);
  assert.doesNotMatch(dataAccessSource, /grant\s+(?:insert|update|delete)[^;]*contest_entitlements[^;]*authenticated/i);
});
