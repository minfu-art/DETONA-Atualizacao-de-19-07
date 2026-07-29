import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  createRankedEventHandler,
  effectiveEventStatus,
} from './core.js';
import {
  corsHeaders,
  createAllowedOrigins,
  handleCorsPreflight,
  isAllowedOrigin,
  jsonResponse,
} from '../_shared/cors.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigins = createAllowedOrigins(Deno.env.get('ADMIN_ALLOWED_ORIGINS'));

if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Configuração segura incompleta.');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function contentHash(value: unknown) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
    .then((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
}

function questionExplanation(payload: Record<string, unknown>) {
  return payload.explanation || payload.explicacao || payload.comentario || payload.justification || null;
}

function questionSubtopic(payload: Record<string, unknown>) {
  return payload.subtopic_id || payload.subtopicId || payload.subtopico_id
    || payload.topicoEditalId || payload.curriculum_node_id || null;
}

function shuffleKey(eventId: string, userId: string, questionId: string) {
  let hash = 2166136261;
  for (const character of `${eventId}|${userId}|${questionId}`) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function audit(actorId: string, event: any, action: string) {
  const { error } = await admin.from('admin_audit_log').insert({
    actor_user_id: actorId,
    contest_id: event.contest_id,
    module: 'ranked_events',
    action,
    target_type: 'ranked_event',
    target_id: event.id,
    metadata: { status: event.status, question_count: event.question_count },
  });
  if (error) throw error;
}

const repository = {
  async hasEntitlement(userId: string, contestId: string) {
    const { data, error } = await admin.from('contest_entitlements').select('id')
      .eq('user_id', userId).eq('contest_id', contestId).eq('status', 'active').maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },
  async listEvents(contestId: string, { includeDrafts = false } = {}) {
    let query = admin.from('ranked_study_events').select('*')
      .eq('contest_id', contestId).order('starts_at');
    if (!includeDrafts) query = query.neq('status', 'draft');
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
  async getEvent(eventId: string) {
    const { data, error } = await admin.from('ranked_study_events').select('*').eq('id', eventId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async saveDraft(event: any, actorId: string) {
    const payload = { ...event, status: 'draft', created_by: actorId };
    delete payload.id;
    if (event.id) delete payload.created_by;
    const query = event.id
      ? admin.from('ranked_study_events').update(payload).eq('id', event.id).eq('status', 'draft')
      : admin.from('ranked_study_events').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    await audit(actorId, data, event.id ? 'update_ranked_event' : 'create_ranked_event');
    return data;
  },
  async publishEvent(eventId: string, actorId: string, now: Date) {
    const event = await this.getEvent(eventId);
    if (!event || event.status !== 'draft') throw new Error('event_not_draft');
    const { data: version, error: versionError } = await admin.from('question_publication_versions')
      .select('id').eq('contest_id', event.contest_id).eq('status', 'published')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (versionError) throw versionError;
    if (!version) throw new Error('published_questions_required');
    const { data: items, error: itemsError } = await admin.from('question_publication_items')
      .select('source_question_id,payload,order_index').eq('version_id', version.id)
      .eq('contest_id', event.contest_id).order('order_index').limit(event.question_count);
    if (itemsError) throw itemsError;
    if (!items || items.length !== event.question_count) throw new Error('insufficient_questions');
    for (const item of items) {
      if (!questionExplanation(item.payload) || !questionSubtopic(item.payload)) {
        throw new Error('question_without_explanation_or_subtopic');
      }
    }
    const snapshots = await Promise.all(items.map(async (item, index) => ({
      event_id: event.id,
      contest_id: event.contest_id,
      question_id: item.source_question_id,
      order_index: index,
      payload: item.payload,
      content_hash: await contentHash(item.payload),
    })));
    const { count: existingCount, error: countError } = await admin.from('ranked_event_questions')
      .select('id', { count: 'exact', head: true }).eq('event_id', event.id);
    if (countError) throw countError;
    if (existingCount && existingCount !== snapshots.length) throw new Error('incomplete_event_snapshot');
    if (!existingCount) {
      const { error: snapshotError } = await admin.from('ranked_event_questions').insert(snapshots);
      if (snapshotError) throw snapshotError;
    }
    const status = effectiveEventStatus({ ...event, status: 'scheduled' }, now);
    const { data, error } = await admin.from('ranked_study_events').update({
      status,
      published_at: now.toISOString(),
    }).eq('id', event.id).eq('status', 'draft').select('*').single();
    if (error) throw error;
    await audit(actorId, data, 'publish_ranked_event');
    return data;
  },
  async cancelEvent(eventId: string, actorId: string, now: Date) {
    const { data, error } = await admin.from('ranked_study_events').update({
      status: 'cancelled',
      cancelled_at: now.toISOString(),
    }).eq('id', eventId).neq('status', 'finished').select('*').single();
    if (error) throw error;
    await audit(actorId, data, 'cancel_ranked_event');
    return data;
  },
  async register(event: any, identity: any) {
    const displayName = String(identity.name || 'Participante').slice(0, 80);
    const { data: existing } = await admin.from('ranked_event_attempts').select('*')
      .eq('event_id', event.id).eq('user_id', identity.userId).maybeSingle();
    if (existing) return existing;
    const { data, error } = await admin.from('ranked_event_attempts').insert({
      event_id: event.id,
      user_id: identity.userId,
      display_name: displayName,
      avatar: identity.avatar || null,
      status: 'registered',
    }).select('*').single();
    if (error) throw error;
    return data;
  },
  async start(event: any, userId: string, now: Date) {
    const existing = await this.getAttempt(event.id, userId);
    if (existing?.status === 'started') return existing;
    if (existing?.status !== 'registered') throw new Error('attempt_not_registered');
    const { data, error } = await admin.from('ranked_event_attempts').update({
      status: 'started',
      started_at: now.toISOString(),
    }).eq('event_id', event.id).eq('user_id', userId).eq('status', 'registered').select('*').single();
    if (error) throw error;
    return data;
  },
  async getAttempt(eventId: string, userId: string) {
    const { data, error } = await admin.from('ranked_event_attempts').select('*')
      .eq('event_id', eventId).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async getQuestions(eventId: string, userId: string) {
    const { data, error } = await admin.from('ranked_event_questions').select('*').eq('event_id', eventId);
    if (error) throw error;
    return (data || []).sort((a, b) => (
      shuffleKey(eventId, userId, a.question_id) - shuffleKey(eventId, userId, b.question_id)
    ));
  },
  async submit(event: any, userId: string, result: any) {
    const { data, error } = await admin.from('ranked_event_attempts').update({
      status: result.status,
      submitted_at: result.submittedAt,
      elapsed_seconds: result.elapsedSeconds,
      correct_count: result.correctCount,
      incorrect_count: result.incorrectCount,
      blank_count: result.blankCount,
      score: result.score,
      accuracy: result.accuracy,
      answers: result.answers,
    }).eq('event_id', event.id).eq('user_id', userId).eq('status', 'started').select('*').single();
    if (error) throw error;
    return data;
  },
  async listParticipants(eventId: string) {
    const { data, error } = await admin.from('ranked_event_attempts').select(
      'display_name,avatar,status,started_at,submitted_at,elapsed_seconds,correct_count,incorrect_count,blank_count,score,accuracy',
    ).eq('event_id', eventId);
    if (error) throw error;
    return data || [];
  },
};

async function resolveIdentity(token: string) {
  const userClient = createClient(supabaseUrl!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error } = await userClient.auth.getUser(token);
  if (error || !auth.user) return null;
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id,name,role,preferences').eq('id', auth.user.id).single();
  if (profileError) throw profileError;
  return {
    userId: auth.user.id,
    name: profile.name,
    role: profile.role,
    avatar: profile.preferences?.avatar || null,
  };
}

Deno.serve((request) => {
  const origin = request.headers.get('origin') || '';
  const preflight = handleCorsPreflight(request, allowedOrigins);
  if (preflight) return preflight;
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return jsonResponse(403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origem não autorizada.' } }, origin, allowedOrigins);
  }
  return createRankedEventHandler({
    resolveIdentity,
    repository,
    corsHeaders: corsHeaders(origin, allowedOrigins),
  })(request);
});
