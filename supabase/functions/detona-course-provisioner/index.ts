import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  CourseOperatorError,
  createCourseOperatorHandler,
  stableJson,
} from './core.js';
import {
  corsHeaders,
  createAllowedOrigins,
  handleCorsPreflight,
  isAllowedOrigin,
  jsonResponse,
} from '../_shared/cors.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigins = createAllowedOrigins(Deno.env.get('ADMIN_ALLOWED_ORIGINS'));
const internalOrigin = Deno.env.get('COURSE_PROVISIONER_INTERNAL_ORIGIN')
  || 'https://detona-staging-git-fix-p0-foundation-min-fu-projetos.vercel.app';

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Configuração segura da Edge Function incompleta.');
}

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rateWindows = new Map<string, number[]>();

function comparableContest(contest: Record<string, unknown> = {}) {
  const fields = [
    'id', 'code', 'slug', 'name', 'role', 'description', 'price_cents', 'currency',
    'color', 'accent', 'icon', 'cover_asset', 'exam_date',
  ];
  return Object.fromEntries(fields.map((field) => [field, contest[field] ?? null]));
}

function curriculumComparable(nodes: Record<string, unknown>[] = []) {
  const sourceById = new Map(nodes.filter((node) => node.id).map((node) => [node.id, node.source_id]));
  return nodes.map((node) => ({
    source_id: node.source_id,
    parent_source_id: node.parent_source_id || (node.parent_id ? sourceById.get(node.parent_id) : null) || null,
    type: node.type,
    name: node.name,
    description: node.description || null,
    order_index: Number(node.order_index),
  })).sort((left, right) => String(left.source_id).localeCompare(String(right.source_id)));
}

function normalizedQuestion(value: Record<string, any> = {}) {
  const payload = value.payload && typeof value.payload === 'object' ? value.payload : value;
  return {
    id: String(payload.id || payload.question_id || value.source_question_id || value.id || ''),
    contest_id: String(payload.contest_id || value.contest_id || ''),
    subtopic_id: String(payload.subtopic_id || payload.topicoEditalId || ''),
    statement: String(payload.statement || payload.enunciado || value.statement || ''),
    options: payload.options || payload.alternativas || value.options || [],
    correct_answer: payload.correct_answer ?? payload.respostaCorreta ?? value.correct_answer,
    explanation: String(payload.explanation || payload.explicacao || value.explanation || ''),
    difficulty: payload.difficulty ?? payload.dificuldade ?? value.difficulty ?? null,
    source: payload.source ?? value.source ?? null,
    is_trick: Boolean(payload.is_trick ?? value.is_trick),
  };
}

async function callAdmin(functionName: string, action: string, payload: Record<string, unknown>, token: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey!,
      authorization: `Bearer ${token}`,
      origin: internalOrigin,
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-client-info': 'detona-course-operator/1',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    const code = String(result?.error?.code || result?.error || 'protected_operation_failed')
      .replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    throw new CourseOperatorError(response.status >= 400 && response.status < 500 ? 409 : 500, code || 'PROTECTED_OPERATION_FAILED', 'Operação administrativa protegida recusada.');
  }
  return result;
}

async function listQuestions(contestId: string, token: string) {
  const questions: Record<string, any>[] = [];
  for (let page = 1; page <= 10_000; page += 1) {
    const result = await callAdmin('admin-editorial', 'list_questions', {
      contestId, search: '', status: null, page, pageSize: 50,
    }, token);
    questions.push(...(result.questions || []));
    if (questions.length >= Number(result.total || 0) || (result.questions || []).length < 50) break;
  }
  return questions;
}

async function findContest(contestId: string, token: string) {
  const listed = await callAdmin('admin-contests', 'list_contests', { search: contestId }, token);
  const found = (listed.contests || []).find((contest: { id: string }) => contest.id === contestId);
  if (!found) return null;
  return (await callAdmin('admin-contests', 'get_contest', { contestId }, token)).contest;
}

async function readRemote(bundle: any, token: string) {
  const contest = await findContest(bundle.contest.id, token);
  if (!contest) {
    return {
      exists: false, contest: null, curriculum: [], questions: [], assets: [], visual: null,
      batches: [], versions: [], packages: [], publication: null,
    };
  }
  const [curriculum, questions, media, batches, versions, packages, publication] = await Promise.all([
    callAdmin('admin-contests', 'get_curriculum_tree', { contestId: bundle.contest.id }, token),
    listQuestions(bundle.contest.id, token),
    callAdmin('admin-media', 'list_contest_assets', { contestId: bundle.contest.id }, token),
    callAdmin('admin-editorial', 'list_batches', { contestId: bundle.contest.id }, token),
    callAdmin('admin-editorial', 'list_versions', { contestId: bundle.contest.id }, token),
    callAdmin('admin-contests', 'list_content_packages', { contestId: bundle.contest.id }, token),
    callAdmin('admin-contests', 'validate_publication', { contestId: bundle.contest.id }, token),
  ]);
  return {
    exists: true,
    contest,
    curriculum: curriculum.nodes || [],
    questions,
    assets: media.assets || [],
    visual: media.visual || {},
    batches: batches.batches || [],
    versions: versions.versions || [],
    packages: packages.packages || [],
    publication,
  };
}

function compare(bundle: any, remote: any) {
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const contestMatches = remote.exists
    && stableJson(comparableContest(bundle.contest)) === stableJson(comparableContest(remote.contest));
  if (remote.exists && !contestMatches) conflicts.push('contest_metadata_differs');
  const localCurriculum = curriculumComparable(bundle.curriculum.nodes);
  const remoteCurriculum = curriculumComparable(remote.curriculum);
  const curriculumMatches = remote.exists && stableJson(localCurriculum) === stableJson(remoteCurriculum);
  if (remoteCurriculum.length && !curriculumMatches) conflicts.push('curriculum_differs');

  const remoteQuestions = new Map(remote.questions.map((question: any) => [
    String(question.source_question_id || question.id), question,
  ]));
  let matching = 0;
  let missing = 0;
  let differing = 0;
  const localIds = new Set<string>();
  for (const batch of bundle.question_batches) {
    for (const question of batch.questions) {
      localIds.add(question.id);
      const existing = remoteQuestions.get(question.id);
      if (!existing) missing += 1;
      else if (stableJson(normalizedQuestion(question)) === stableJson(normalizedQuestion(existing))) matching += 1;
      else differing += 1;
    }
  }
  const extra = [...remoteQuestions.keys()].filter((id) => !localIds.has(String(id))).length;
  if (differing) conflicts.push('questions_differ');
  if (extra) conflicts.push('questions_extra_remote');

  const remoteAssetsByHash = new Map(remote.assets.map((asset: any) => [asset.content_hash, asset]));
  const visualColumns: Record<string, string> = {
    battle_avatar: 'battle_avatar_asset_id',
    success: 'success_asset_id',
    error: 'error_asset_id',
    attention: 'attention_asset_id',
    cover: 'cover_media_asset_id',
  };
  const assets = Object.fromEntries(bundle.assets.map((asset: any) => {
    const existing: any = remoteAssetsByHash.get(asset.hash);
    return [asset.slot, {
      exists: Boolean(existing),
      selected: Boolean(existing && remote.visual?.[visualColumns[asset.slot]] === existing.id),
      hash: asset.hash,
    }];
  }));
  const assetsMatch = Object.values(assets).every((state: any) => state.exists && state.selected);
  const publishedPackages = remote.packages.filter((item: any) => item.status === 'published').length;
  if (publishedPackages) warnings.push('published_package_preserved');
  if (remote.visual?.visual_status === 'published') warnings.push('published_appearance_preserved');
  if (publishedPackages && (!curriculumMatches || missing || differing || extra || !assetsMatch)) {
    conflicts.push('published_course_locked');
  }
  if (remote.visual?.visual_status === 'published' && !assetsMatch) {
    conflicts.push('published_appearance_locked');
  }
  return {
    exact: contestMatches && curriculumMatches && missing === 0 && differing === 0 && extra === 0 && assetsMatch,
    conflicts,
    warnings,
    contest: { exists: remote.exists, matches: contestMatches },
    curriculum: { local: localCurriculum.length, remote: remoteCurriculum.length, matches: curriculumMatches },
    questions: { bundle: localIds.size, remote: remote.questions.length, matching, missing, differing, extra },
    assets,
    appearance_status: remote.visual?.visual_status || null,
    packages: { total: remote.packages.length, published: publishedPackages },
    versions: { total: remote.versions.length, published: remote.versions.filter((item: any) => item.status === 'published').length },
    publication_ready: Boolean(remote.publication?.ready),
  };
}

const orchestrator = {
  async inspect(bundle: any, identity: { token: string }) {
    await callAdmin('admin-contests', 'validate_curriculum_import', {
      contestId: bundle.contest.id,
      schemaVersion: 1,
      nodes: bundle.curriculum.nodes,
    }, identity.token);
    return compare(bundle, await readRemote(bundle, identity.token));
  },

  async apply(bundle: any, identity: { userId: string; token: string }, progress: (steps: Record<string, boolean>) => Promise<void>) {
    const steps = {
      contest_created: false,
      curriculum_imported: false,
      assets_registered: false,
      questions_imported: false,
      verified: false,
    };
    let remote = await readRemote(bundle, identity.token);
    let comparison = compare(bundle, remote);
    if (comparison.conflicts.length) throw new CourseOperatorError(409, 'COURSE_PROVISION_CONFLICT', 'O estado remoto diverge do bundle validado.');

    if (!remote.exists) {
      await callAdmin('admin-contests', 'create_contest', { contest: bundle.contest }, identity.token);
    }
    steps.contest_created = true;
    await progress(steps);

    remote = await readRemote(bundle, identity.token);
    comparison = compare(bundle, remote);
    if (!comparison.curriculum.matches) {
      if (comparison.curriculum.remote) throw new CourseOperatorError(409, 'CURRICULUM_CONFLICT', 'Currículo remoto divergente.');
      await callAdmin('admin-contests', 'validate_curriculum_import', {
        contestId: bundle.contest.id, schemaVersion: 1, nodes: bundle.curriculum.nodes,
      }, identity.token);
      await callAdmin('admin-contests', 'import_curriculum_draft', {
        contestId: bundle.contest.id, schemaVersion: 1, nodes: bundle.curriculum.nodes,
      }, identity.token);
    }
    steps.curriculum_imported = true;
    await progress(steps);

    const media = await callAdmin('admin-media', 'list_contest_assets', { contestId: bundle.contest.id }, identity.token);
    const byHash = new Map((media.assets || []).map((asset: any) => [asset.content_hash, asset]));
    const visualColumns: Record<string, string> = {
      battle_avatar: 'battle_avatar_asset_id',
      success: 'success_asset_id',
      error: 'error_asset_id',
      attention: 'attention_asset_id',
      cover: 'cover_media_asset_id',
    };
    const visual: Record<string, string | null> = Object.fromEntries(
      Object.entries(visualColumns).map(([slot, column]) => [slot, media.visual?.[column] || null]),
    );
    for (const asset of bundle.assets) {
      let registered: any = byHash.get(asset.hash);
      if (!registered) {
        const signed = await callAdmin('admin-media', 'create_signed_upload', {
          contestId: bundle.contest.id,
          file: { name: asset.name, mimeType: asset.mime_type, size: asset.size },
        }, identity.token);
        const encodedPath = String(signed.path).split('/').map(encodeURIComponent).join('/');
        const upload = await fetch(
          `${supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(signed.bucket)}/${encodedPath}?token=${encodeURIComponent(signed.token)}`,
          {
            method: 'PUT',
            headers: {
              apikey: supabaseAnonKey!,
              authorization: `Bearer ${identity.token}`,
              'content-type': asset.mime_type,
              'cache-control': 'no-store',
              'x-upsert': 'false',
            },
            body: asset.bytes,
          },
        );
        if (!upload.ok) {
          await callAdmin('admin-media', 'cancel_pending_upload', {
            contestId: bundle.contest.id, storagePath: signed.path,
          }, identity.token).catch(() => {});
          throw new CourseOperatorError(500, 'SIGNED_UPLOAD_FAILED', 'Falha no upload assinado.');
        }
        const result = await callAdmin('admin-media', 'register_asset', {
          contestId: bundle.contest.id,
          asset: {
            storagePath: signed.path,
            assetType: asset.slot,
            requireTransparency: asset.slot !== 'cover',
          },
        }, identity.token);
        registered = result.asset;
      }
      visual[asset.slot] = registered.id;
    }
    const visualChanged = Object.entries(visualColumns)
      .some(([slot, column]) => (visual[slot] || null) !== (media.visual?.[column] || null));
    if (visualChanged) {
      await callAdmin('admin-media', 'save_contest_visual', {
        contestId: bundle.contest.id, visual,
      }, identity.token);
    }
    steps.assets_registered = true;
    await progress(steps);

    const existing = new Map((await listQuestions(bundle.contest.id, identity.token))
      .map((question: any) => [String(question.source_question_id || question.id), question]));
    for (const batch of bundle.question_batches) {
      const missing = [];
      for (const question of batch.questions) {
        const current: any = existing.get(question.id);
        if (!current) missing.push(question);
        else if (stableJson(normalizedQuestion(question)) !== stableJson(normalizedQuestion(current))) {
          throw new CourseOperatorError(409, 'QUESTION_CONFLICT', 'Questão remota divergente.');
        }
      }
      if (!missing.length) continue;
      const validation = await callAdmin('admin-editorial', 'validate_batch', {
        contestId: bundle.contest.id, batchName: batch.name, questions: missing,
      }, identity.token);
      if (!validation.valid) throw new CourseOperatorError(409, 'QUESTION_BATCH_INVALID', 'Lote remoto rejeitado.');
      await callAdmin('admin-editorial', 'import_draft', {
        contestId: bundle.contest.id, batchName: batch.name, questions: missing,
      }, identity.token);
    }
    steps.questions_imported = true;
    await progress(steps);

    const report = compare(bundle, await readRemote(bundle, identity.token));
    if (!report.exact || report.conflicts.length) {
      throw new CourseOperatorError(500, 'COURSE_PROVISION_PARTIAL', 'Persistência parcial detectada.');
    }
    steps.verified = true;
    await progress(steps);
    const { error: auditError } = await admin.from('admin_audit_log').insert({
      actor_user_id: identity.userId,
      contest_id: bundle.contest.id,
      module: 'course_provisioner',
      action: 'apply_course_bundle',
      target_type: 'contest',
      target_id: bundle.contest.id,
      metadata: {
        operation_id: bundle.operation_id,
        bundle_hash: bundle.bundle_hash,
        questions: bundle.summary.questions,
        curriculum_nodes: bundle.summary.curriculum_nodes,
      },
    });
    if (auditError) throw new CourseOperatorError(500, 'AUDIT_FAILED', 'Falha ao registrar auditoria.');
    return { ...report, steps, entitlements_created: 0, packages_published: 0 };
  },
};

async function resolveIdentity(token: string) {
  const identity = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await identity.auth.getUser(token);
  if (error || !data.user) throw new CourseOperatorError(401, 'UNAUTHORIZED', 'Sessão ausente ou inválida.');
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (profileError) throw new CourseOperatorError(401, 'UNAUTHORIZED', 'Sessão ausente ou inválida.');
  return { userId: data.user.id, role: profile?.role || null, token };
}

const repository = {
  async consumeRateLimit(userId: string) {
    const now = Date.now();
    const recent = (rateWindows.get(userId) || []).filter((timestamp) => timestamp > now - 60_000);
    if (recent.length >= 20) return false;
    recent.push(now);
    rateWindows.set(userId, recent);
    return true;
  },

  async getOperation(operationId: string, actorUserId: string) {
    const { data, error } = await admin.from('course_provision_operations').select('*')
      .eq('operation_id', operationId).eq('actor_user_id', actorUserId).maybeSingle();
    if (error) throw new Error('operation_lookup_failed');
    return data;
  },

  async saveValidation({ actorUserId, bundle, report, confirmationTokenHash, expiresAt }: any) {
    const existing = await this.getOperation(bundle.operation_id, actorUserId);
    if (existing && existing.bundle_hash !== bundle.bundle_hash) {
      throw new CourseOperatorError(409, 'OPERATION_CONFLICT', 'operation_id já pertence a outro bundle.');
    }
    if (existing?.status === 'completed') {
      throw new CourseOperatorError(409, 'OPERATION_COMPLETED', 'A operação já foi concluída.');
    }
    const row = {
      operation_id: bundle.operation_id,
      actor_user_id: actorUserId,
      contest_id: bundle.contest.id,
      bundle_hash: bundle.bundle_hash,
      status: 'validated',
      confirmation_token_hash: confirmationTokenHash,
      confirmation_expires_at: expiresAt,
      confirmation_used_at: null,
      summary: bundle.summary,
      report,
      steps: existing?.steps || {},
      error_code: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await admin.from('course_provision_operations').update(row).eq('id', existing.id)
      : await admin.from('course_provision_operations').insert(row);
    if (error) throw new Error('operation_save_failed');
  },

  async claimOperation({ operationId, actorUserId, bundleHash, confirmationTokenHash }: any) {
    const { data, error } = await admin.rpc('claim_course_provision_operation', {
      p_operation_id: operationId,
      p_actor_user_id: actorUserId,
      p_bundle_hash: bundleHash,
      p_confirmation_token_hash: confirmationTokenHash,
    });
    if (error) throw new Error('operation_claim_failed');
    return data === true;
  },

  async updateProgress(operationId: string, actorUserId: string, steps: Record<string, boolean>) {
    const { error } = await admin.from('course_provision_operations')
      .update({ steps, updated_at: new Date().toISOString() })
      .eq('operation_id', operationId).eq('actor_user_id', actorUserId);
    if (error) throw new Error('operation_progress_failed');
  },

  async completeOperation(operationId: string, actorUserId: string, report: unknown) {
    const now = new Date().toISOString();
    const { data, error } = await admin.from('course_provision_operations')
      .update({ status: 'completed', report, completed_at: now, updated_at: now, error_code: null })
      .eq('operation_id', operationId).eq('actor_user_id', actorUserId).select('*').single();
    if (error) throw new Error('operation_complete_failed');
    return data;
  },

  async failOperation(operationId: string, actorUserId: string, errorCode: string) {
    await admin.from('course_provision_operations')
      .update({
        status: 'failed',
        error_code: String(errorCode).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100) || 'COURSE_PROVISION_PARTIAL',
        updated_at: new Date().toISOString(),
      })
      .eq('operation_id', operationId).eq('actor_user_id', actorUserId);
  },
};

Deno.serve((request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return handleCorsPreflight(request, allowedOrigins);
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return jsonResponse(403, {
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origem não autorizada.' },
    }, origin, allowedOrigins);
  }
  const headers = origin ? corsHeaders(origin, allowedOrigins) : { vary: 'Origin' };
  if (Number(request.headers.get('content-length') || 0) > 50_000_000) {
    return jsonResponse(413, {
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Bundle excede o limite permitido.' },
    }, origin, allowedOrigins);
  }
  return createCourseOperatorHandler({
    resolveIdentity,
    repository,
    orchestrator,
    corsHeaders: headers,
  })(request);
});
