import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createCourseOperatorHandler,
  sha256,
  validateCourseBundle,
  validateCourseOperatorPayload,
} from '../supabase/functions/detona-course-provisioner/core.js';

function transparentPngBase64() {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(1, 16);
  bytes.writeUInt32BE(1, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes.toString('base64');
}

function bundle(overrides = {}) {
  const base = {
    schema_version: 1,
    operation_id: 'operator-test-001',
    contest: {
      id: 'curso_operador_2027',
      code: 'OP TESTE',
      slug: 'curso-operador-2027',
      name: 'Curso fictício de teste local',
      role: 'Cargo fictício',
      description: 'Fixture usada somente em testes locais automatizados.',
      content_status: 'preparing',
      sales_status: 'unavailable',
      price_cents: 0,
      currency: 'BRL',
      exam_date: null,
      color: '#7c6af5',
      accent: '#ff8a1f',
    },
    curriculum: {
      schema_version: 1,
      contest_id: 'curso_operador_2027',
      nodes: [
        { source_id: 'cargo_teste', parent_source_id: null, type: 'role', name: 'Cargo', description: null, order_index: 0 },
        { source_id: 'disciplina_teste', parent_source_id: 'cargo_teste', type: 'discipline', name: 'Disciplina', description: null, order_index: 0 },
        { source_id: 'topico_teste', parent_source_id: 'disciplina_teste', type: 'topic', name: 'Tópico', description: null, order_index: 0 },
        { source_id: 'subtopico_teste', parent_source_id: 'topico_teste', type: 'subtopic', name: 'Subtópico', description: null, order_index: 0 },
      ],
    },
    question_batches: [{
      name: 'lote_001',
      questions: [{
        id: 'questao_operador_001',
        contest_id: 'curso_operador_2027',
        subtopic_id: 'subtopico_teste',
        statement: 'O provisionamento é isolado do motor acadêmico.',
        options: ['Certo', 'Errado'],
        correct_answer: true,
        explanation: 'A ferramenta utiliza uma fronteira administrativa própria.',
      }],
    }],
    assets: [{
      slot: 'battle_avatar',
      name: 'battle-avatar.png',
      mime_type: 'image/png',
      content_base64: transparentPngBase64(),
    }],
  };
  return structuredClone(Object.assign(base, overrides));
}

function fakeDependencies({
  role = 'developer',
  inspect = { exact: false, conflicts: [], warnings: [], contest: { exists: false } },
  operation = null,
  claim = true,
  applyResult = { exact: true, conflicts: [], steps: { verified: true } },
} = {}) {
  const calls = [];
  let stored = operation;
  return {
    calls,
    repository: {
      consumeRateLimit: async () => true,
      getOperation: async () => stored,
      saveValidation: async (input) => {
        calls.push(['saveValidation', input.bundle.bundle_hash]);
        stored = {
          operation_id: input.bundle.operation_id,
          contest_id: input.bundle.contest.id,
          bundle_hash: input.bundle.bundle_hash,
          status: 'validated',
          summary: input.bundle.summary,
          report: input.report,
          steps: {},
          created_at: '2026-07-27T00:00:00Z',
          updated_at: '2026-07-27T00:00:00Z',
        };
      },
      claimOperation: async (input) => {
        calls.push(['claimOperation', input.confirmationTokenHash]);
        return claim;
      },
      updateProgress: async () => calls.push(['progress']),
      completeOperation: async (operationId) => {
        stored = { ...stored, operation_id: operationId, status: 'completed', completed_at: '2026-07-27T00:01:00Z' };
        return stored;
      },
      failOperation: async () => calls.push(['failed']),
    },
    orchestrator: {
      inspect: async () => {
        calls.push(['inspect']);
        return inspect;
      },
      apply: async (_bundle, _identity, progress) => {
        calls.push(['apply']);
        await progress({ contest_created: true });
        return applyResult;
      },
    },
    resolveIdentity: async () => ({ userId: '00000000-0000-4000-8000-000000000001', role, token: 'redacted' }),
  };
}

async function request(handler, payload, token = 'session-value') {
  return handler(new Request('https://example.test/functions/v1/detona-course-provisioner', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

test('student é bloqueado antes de qualquer operação', async () => {
  const deps = fakeDependencies({ role: 'student' });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, { action: 'verify_course_bundle', environment: 'staging', bundle: bundle() });
  assert.equal(response.status, 403);
  assert.deepEqual(deps.calls, []);
});

test('developer valida bundle e recebe confirmação temporária', async () => {
  const deps = fakeDependencies();
  const handler = createCourseOperatorHandler({ ...deps, tokenFactory: () => 'temporary-confirmation-token' });
  const response = await request(handler, { action: 'validate_course_bundle', environment: 'staging', bundle: bundle() });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.result, 'COURSE_PROVISION_VALID');
  assert.equal(body.required_confirmation, 'CONFIRMAR CRIAÇÃO OP TESTE NO STAGING');
  assert.equal(body.confirmation_token, 'temporary-confirmation-token');
});

test('validate não chama apply nem cria conteúdo de curso', async () => {
  const deps = fakeDependencies();
  const handler = createCourseOperatorHandler(deps);
  await request(handler, { action: 'validate_course_bundle', environment: 'staging', bundle: bundle() });
  assert.ok(deps.calls.some(([name]) => name === 'inspect'));
  assert.ok(deps.calls.some(([name]) => name === 'saveValidation'));
  assert.ok(!deps.calls.some(([name]) => name === 'apply'));
});

test('apply sem confirmação explícita é bloqueado', async () => {
  const normalized = await validateCourseBundle(bundle());
  const deps = fakeDependencies({ operation: {
    operation_id: normalized.operation_id,
    contest_id: normalized.contest.id,
    bundle_hash: normalized.bundle_hash,
    status: 'validated',
  } });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, {
    action: 'apply_course_bundle',
    environment: 'staging',
    operation_id: normalized.operation_id,
    bundle: bundle(),
    confirmation_token: 'token',
    confirmation: 'sim',
  });
  assert.equal(response.status, 409);
  assert.ok(!deps.calls.some(([name]) => name === 'apply'));
});

test('token expirado ou utilizado é bloqueado pelo claim atômico', async () => {
  const normalized = await validateCourseBundle(bundle());
  const deps = fakeDependencies({
    claim: false,
    operation: {
      operation_id: normalized.operation_id,
      contest_id: normalized.contest.id,
      bundle_hash: normalized.bundle_hash,
      status: 'validated',
    },
  });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, {
    action: 'apply_course_bundle',
    environment: 'staging',
    operation_id: normalized.operation_id,
    bundle: bundle(),
    confirmation_token: 'expired-token',
    confirmation: 'CONFIRMAR CRIAÇÃO OP TESTE NO STAGING',
  });
  assert.equal(response.status, 409);
  assert.ok(!deps.calls.some(([name]) => name === 'apply'));
});

test('token de outro bundle é bloqueado antes do claim', async () => {
  const normalized = await validateCourseBundle(bundle());
  const deps = fakeDependencies({ operation: {
    operation_id: normalized.operation_id,
    contest_id: normalized.contest.id,
    bundle_hash: '0'.repeat(64),
    status: 'validated',
  } });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, {
    action: 'apply_course_bundle',
    environment: 'staging',
    operation_id: normalized.operation_id,
    bundle: bundle(),
    confirmation_token: 'wrong-bundle-token',
    confirmation: 'CONFIRMAR CRIAÇÃO OP TESTE NO STAGING',
  });
  assert.equal(response.status, 409);
  assert.ok(!deps.calls.some(([name]) => name === 'claimOperation'));
});

test('operação concluída é idempotente', async () => {
  const normalized = await validateCourseBundle(bundle());
  const deps = fakeDependencies({ operation: {
    operation_id: normalized.operation_id,
    contest_id: normalized.contest.id,
    bundle_hash: normalized.bundle_hash,
    status: 'completed',
  } });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, {
    action: 'apply_course_bundle',
    environment: 'staging',
    operation_id: normalized.operation_id,
    bundle: bundle(),
    confirmation_token: 'already-used',
    confirmation: 'CONFIRMAR CRIAÇÃO OP TESTE NO STAGING',
  });
  assert.equal((await response.json()).result, 'COURSE_PROVISION_ALREADY_APPLIED');
  assert.ok(!deps.calls.some(([name]) => name === 'apply'));
});

test('conflito de concurso impede emissão do token', async () => {
  const deps = fakeDependencies({ inspect: { exact: false, conflicts: ['contest_metadata_differs'] } });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, { action: 'validate_course_bundle', environment: 'staging', bundle: bundle() });
  assert.equal(response.status, 409);
  assert.ok(!deps.calls.some(([name]) => name === 'saveValidation'));
});

test('conflito de currículo impede emissão do token', async () => {
  const deps = fakeDependencies({ inspect: { exact: false, conflicts: ['curriculum_differs'] } });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, { action: 'validate_course_bundle', environment: 'staging', bundle: bundle() });
  assert.equal(response.status, 409);
});

test('questão em subtópico errado é rejeitada localmente', async () => {
  const invalid = bundle();
  invalid.question_batches[0].questions[0].subtopic_id = 'subtopico_de_outro_curso';
  await assert.rejects(validateCourseBundle(invalid), (error) => error.code === 'QUESTION_SUBTOPIC_INVALID');
});

test('asset inválido é rejeitado pela assinatura real', async () => {
  const invalid = bundle();
  invalid.assets[0].content_base64 = Buffer.from('não é png').toString('base64');
  await assert.rejects(validateCourseBundle(invalid), (error) => error.code === 'ASSET_INVALID');
});

test('produção e campos inesperados são bloqueados', () => {
  assert.throws(() => validateCourseOperatorPayload({
    action: 'verify_course_bundle',
    environment: 'production',
    bundle: bundle(),
  }));
  assert.throws(() => validateCourseOperatorPayload({
    action: 'verify_course_bundle',
    environment: 'staging',
    bundle: bundle(),
    sql: 'select 1',
  }));
});

test('apply confirmado conclui sem endpoint de publicação ou entitlement', async () => {
  const normalized = await validateCourseBundle(bundle());
  const deps = fakeDependencies({ operation: {
    operation_id: normalized.operation_id,
    contest_id: normalized.contest.id,
    bundle_hash: normalized.bundle_hash,
    status: 'validated',
    summary: normalized.summary,
  } });
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, {
    action: 'apply_course_bundle',
    environment: 'staging',
    operation_id: normalized.operation_id,
    bundle: bundle(),
    confirmation_token: 'valid-token',
    confirmation: 'CONFIRMAR CRIAÇÃO OP TESTE NO STAGING',
  });
  assert.equal((await response.json()).result, 'COURSE_PROVISION_READY');
  assert.ok(deps.calls.some(([name]) => name === 'apply'));
});

test('função não implementa publicação, entitlement, SQL arbitrário ou produção', async () => {
  const source = await readFile(new URL('../supabase/functions/detona-course-provisioner/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /publish_content_package|publish_snapshot|grant_access|contest_entitlements/);
  assert.doesNotMatch(source, /\.from\(['"](?:admin_contests|admin_curriculum_nodes|editorial_questions|media_assets)['"]\)\.(?:insert|update|delete)/);
  assert.match(source, /save_contest_visual/);
  assert.match(source, /admin_audit_log/);
});

test('migration mantém journal privado, claim atômico e auditoria identificável', async () => {
  const sql = await readFile(new URL('../supabase/migrations/018_private_course_provision_operations.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all[\s\S]+anon, authenticated/i);
  assert.match(sql, /claim_course_provision_operation/i);
  assert.match(sql, /confirmation_used_at is null/i);
  assert.match(sql, /confirmation_expires_at > now\(\)/i);
});

test('motor acadêmico permanece fora das dependências do agente', async () => {
  const core = await readFile(new URL('../supabase/functions/detona-course-provisioner/core.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../supabase/functions/detona-course-provisioner/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(`${core}\n${index}`, /from\s+['"][^'"]*app\/js|xpService|masteryService|progressRepository/i);
});

test('erros inesperados são sanitizados sem token ou detalhe interno', async () => {
  const deps = fakeDependencies();
  deps.orchestrator.inspect = async () => { throw new Error('password=secret-token SQL 42P01'); };
  const handler = createCourseOperatorHandler(deps);
  const response = await request(handler, { action: 'verify_course_bundle', environment: 'staging', bundle: bundle() });
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.error.code, 'COURSE_PROVISION_FAILED');
  assert.doesNotMatch(JSON.stringify(body), /secret|42P01|password/i);
});

test('hash do token não preserva o token original', async () => {
  const token = 'temporary-confirmation-token';
  const hash = await sha256(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(hash, new RegExp(token));
});

test('OpenAPI expõe somente as quatro ações e autenticação Bearer', async () => {
  const schema = await readFile(new URL('../docs/detona-course-provisioner-openapi.yaml', import.meta.url), 'utf8');
  for (const action of [
    'validate_course_bundle', 'apply_course_bundle', 'verify_course_bundle', 'get_course_operation',
  ]) assert.match(schema, new RegExp(action));
  assert.match(schema, /scheme: bearer/);
  assert.match(schema, /x-openai-isConsequential: true/);
  assert.doesNotMatch(schema, /service_role|delete_course|publish_content|grant_access/);
  assert.equal((schema.match(/^\s{2}\/detona-course-provisioner:/gm) || []).length, 1);
});

test('instruções e conhecimento proíbem produção, publicação e dados inventados', async () => {
  const instructions = await readFile(new URL('../docs/detona-course-operator-gpt-instructions.md', import.meta.url), 'utf8');
  assert.match(instructions, /Nunca use produção/);
  assert.match(instructions, /Nunca invente preço/);
  assert.match(instructions, /frase exata/);
  assert.match(instructions, /PP RN[\s\S]+nunca `apply`/);
});
