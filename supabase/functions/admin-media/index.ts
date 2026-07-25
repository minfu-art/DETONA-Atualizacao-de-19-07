import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OPERATIONAL_CAPABILITIES } from '../_shared/adminValidation.js';
import { CONTEST_VISUAL_TYPES, inspectImageBytes, validateMediaRequest } from './core.js';

const BUCKET = 'admin-media';
const origins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean));
const response = (status: number, body: unknown, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': origins.has(origin) ? origin : '', vary: 'Origin' },
});

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function audit(admin: any, actorId: string, contestId: string, action: string, targetId: string, metadata = {}) {
  const { error } = await admin.from('admin_audit_log').insert({
    actor_user_id: actorId, contest_id: contestId, module: 'media',
    action, target_type: 'contest_visual', target_id: targetId, metadata,
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return origins.has(origin) ? response(204, {}, origin) : response(403, { error: 'origin_not_allowed' });
  try {
    if (!origins.has(origin) || request.method !== 'POST') return response(403, { error: 'request_not_allowed' }, origin);
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return response(401, { error: 'invalid_session' }, origin);
    if (Number(request.headers.get('content-length') || 0) > 100_000) return response(413, { error: 'payload_too_large' }, origin);
    const url = Deno.env.get('SUPABASE_URL')!;
    const identity = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: auth } = await identity.auth.getUser();
    const { data: profile } = auth.user ? await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle() : { data: null };
    if (!auth.user) return response(401, { error: 'invalid_session' }, origin);
    if (profile?.role !== 'developer') return response(403, { error: 'developer_required' }, origin);
    const body = validateMediaRequest(await request.json());
    const { action } = body;

    if (action === 'list_collections') {
      const { data, error } = await admin.from('avatar_collections').select('*').or(`contest_id.eq.${body.contestId},contest_id.is.null`);
      if (error) throw error;
      return response(200, { collections: data, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'list_contest_assets') {
      const [{ data: assets, error }, { data: contest }] = await Promise.all([
        admin.from('media_assets').select('*').eq('contest_id', body.contestId).neq('status', 'archived').order('created_at', { ascending: false }),
        admin.from('admin_contests').select('battle_avatar_asset_id,success_asset_id,error_asset_id,attention_asset_id,cover_media_asset_id,visual_status')
          .eq('id', body.contestId).single(),
      ]);
      if (error) throw error;
      const paths = (assets || []).map(({ storage_path }: { storage_path: string }) => storage_path);
      const { data: signed } = paths.length ? await admin.storage.from(BUCKET).createSignedUrls(paths, 900) : { data: [] };
      const urls = new Map((signed || []).map((item: { path: string; signedUrl: string }) => [item.path, item.signedUrl]));
      return response(200, { assets: assets.map((asset: any) => ({ ...asset, preview_url: urls.get(asset.storage_path) || null })), visual: contest, capabilities: OPERATIONAL_CAPABILITIES }, origin);
    }
    if (action === 'create_signed_upload') {
      const path = `${body.contestId}/${crypto.randomUUID()}.${body.file.extension}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      await audit(admin, auth.user.id, body.contestId, action, path, { mime_type: body.file.mimeType, byte_size: body.file.size });
      return response(200, { bucket: BUCKET, path: data.path, token: data.token }, origin);
    }
    if (action === 'register_asset') {
      if (!body.asset.storagePath.startsWith(`${body.contestId}/`)) return response(403, { error: 'asset_contest_mismatch' }, origin);
      const extension = body.asset.storagePath.split('.').pop();
      const mimeType = extension === 'png' ? 'image/png' : 'image/webp';
      const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(body.asset.storagePath);
      if (downloadError) throw downloadError;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const inspected = inspectImageBytes(bytes, mimeType);
      if (inspected.width > 8192 || inspected.height > 8192 || inspected.width * inspected.height > 16_777_216) {
        return response(422, { error: 'dimensions_invalid' }, origin);
      }
      if (body.asset.requireTransparency && !inspected.hasTransparency) return response(422, { error: 'transparency_required' }, origin);
      const { data, error } = await admin.from('media_assets').insert({
        contest_id: body.contestId,
        bucket: BUCKET,
        storage_path: body.asset.storagePath,
        mime_type: mimeType,
        byte_size: bytes.length,
        width: inspected.width,
        height: inspected.height,
        has_transparency: inspected.hasTransparency,
        content_hash: await sha256(bytes),
        status: 'draft',
        created_by: auth.user.id,
      }).select('*').single();
      if (error) throw error;
      await audit(admin, auth.user.id, body.contestId, action, data.id, { asset_type: body.asset.assetType, content_hash: data.content_hash });
      return response(201, { asset: { ...data, asset_type: body.asset.assetType } }, origin);
    }
    if (action === 'remove_draft_asset') {
      const { data: asset, error } = await admin.from('media_assets').update({ status: 'archived' })
        .eq('id', body.assetId).eq('contest_id', body.contestId).eq('status', 'draft').select('*').single();
      if (error) throw error;
      await admin.storage.from(BUCKET).remove([asset.storage_path]);
      await audit(admin, auth.user.id, body.contestId, action, body.assetId);
      return response(200, { removed: true }, origin);
    }
    if (action === 'save_contest_visual' || action === 'publish_contest_visual') {
      const ids = Object.values(body.visual).filter(Boolean);
      if (ids.length) {
        const { data: assets, error } = await admin.from('media_assets').select('id').eq('contest_id', body.contestId).in('id', ids);
        if (error || assets.length !== new Set(ids).size) return response(422, { error: 'visual_asset_contest_mismatch' }, origin);
      }
      const payload = {
        battle_avatar_asset_id: body.visual.battle_avatar,
        success_asset_id: body.visual.success,
        error_asset_id: body.visual.error,
        attention_asset_id: body.visual.attention,
        cover_media_asset_id: body.visual.cover,
        visual_status: action === 'publish_contest_visual' ? 'published' : 'draft',
      };
      const { data, error } = await admin.from('admin_contests').update(payload).eq('id', body.contestId).select('*').single();
      if (error) throw error;
      if (action === 'publish_contest_visual' && ids.length) {
        const { error: publishError } = await admin.from('media_assets').update({ status: 'published', published_at: new Date().toISOString() }).in('id', ids);
        if (publishError) throw publishError;
      }
      await audit(admin, auth.user.id, body.contestId, action, body.contestId, { configured_types: CONTEST_VISUAL_TYPES.filter((key) => body.visual[key]) });
      return response(200, { contest: data }, origin);
    }
    return response(409, { error: 'legacy_media_action_not_enabled' }, origin);
  } catch (error) {
    return response(400, { error: error instanceof Error ? error.message : 'invalid_request' }, origin);
  }
});
